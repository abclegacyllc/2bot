# Workspace Hardening — Wave 3

Status: **active.** Last review: 2026-05-08.

This doc covers the workspace container security posture: what's
enforced today, the env-tunable knobs, and the deploy-time changes
needed to reach the production-grade configuration.

> **Background.** Each user gets their own Docker container running the
> bridge agent + a sandbox where their plugin code runs. That's the
> single biggest "one bug = total compromise" surface in 2bot — a
> container escape would expose every other tenant on the host. Wave 3
> tightens the blast radius end-to-end.

Quick links:

- Code: [src/modules/workspace/workspace-docker.service.ts](../../src/modules/workspace/workspace-docker.service.ts)
- Squid config: [docker/squid-proxy/squid.conf](../../docker/squid-proxy/squid.conf)
- Bridge rotation cron: [src/server/cron/bridge-token-rotation-cron.ts](../../src/server/cron/bridge-token-rotation-cron.ts)
- docker-socket-proxy compose service: [docker-compose.yml](../../docker-compose.yml) (under `profiles: ["hardened"]`)

---

## 1. Posture today (after Wave 3 code merge)

| Layer | Setting | Where |
|---|---|---|
| **Privileged** | `false` | always |
| **CapDrop** | `ALL` | always |
| **CapAdd** | `CHOWN, DAC_OVERRIDE, SETUID, SETGID` | env-tunable; see §3 |
| **SecurityOpt** | `no-new-privileges:true` | always |
| **Seccomp** | Docker default profile (not unconfined) | always |
| **Memory** | per plan tier (1–32 GB) | from `options.ramMb` |
| **NanoCpus** | per plan tier (0.5–16 cores) | from `options.cpuCores` |
| **PidsLimit** | `min(4096, max(256, 256·cpuCores))` | env: `WORKSPACE_PIDS_LIMIT` |
| **Ulimits — nofile** | 65536 | env: `WORKSPACE_ULIMIT_NOFILE` |
| **Ulimits — nproc** | 4096 | env: `WORKSPACE_ULIMIT_NPROC` |
| **OomScoreAdj** | `500` | env: `WORKSPACE_OOM_SCORE_ADJ` |
| **NetworkMode** | `2bot-workspace` (internal=false) | always |
| **NO_PROXY** | `localhost,127.0.0.1,<host-api-ip>` (no `.local` wildcard since 3.5) | always |
| **Egress** | Squid forward proxy on `2bot-proxy:3128` with allow-list | always |
| **Bridge auth token** | rotated daily under distributed lock | cron |
| **Bridge rotation alerting** | metric + log when any container fails 3 cycles in a row | Wave 3.6 |
| **Docker API access** | direct `/var/run/docker.sock` by default; opt-in proxy via `DOCKER_HOST=tcp://docker-proxy:2375` | Wave 3.3 |
| **Container runtime** | runc (default); gVisor migration is staged — see §6 | host config |

## 2. Resource caps tuning (Wave 3.1)

The defaults err on the safe-but-functional side. To tighten further,
set env vars on the API server before container creation:

| Env | Default | Effect |
|---|---|---|
| `WORKSPACE_PIDS_LIMIT` | `256·cpuCores`, clamped to [256, 4096] | hard cap on # of processes per container |
| `WORKSPACE_ULIMIT_NOFILE` | `65536` | per-process open-fd cap |
| `WORKSPACE_ULIMIT_NPROC` | `4096` | per-user process cap |
| `WORKSPACE_OOM_SCORE_ADJ` | `500` | kernel OOM killer preference (-1000..+1000) |

Each existing container keeps its current limits — only new containers
pick up changes. To re-create a fleet on a new policy, ship the env
change and let workspace lifecycle churn replace containers, or run
`make workspace-recreate-all` (when that exists).

## 3. Capability set tightening (Wave 3.2)

The pre-Wave-3 default added `CHOWN, DAC_OVERRIDE, SETUID, SETGID` on
top of `CapDrop=ALL`. The workspace base image (see
[docker/workspace/Dockerfile.workspace](../../docker/workspace/Dockerfile.workspace))
runs as `USER node` (uid 1000) and **never invokes setuid binaries
nor `chown` at runtime**, so this set is over-permissive. Kept as
default only for backwards compat during the Wave 3 rollout.

To tighten in production:

```bash
# Step 1 — drop setuid / setgid first (safest reduction).
WORKSPACE_CAP_ADD="CHOWN,DAC_OVERRIDE"

# Step 2 — drop dac_override after watching the fleet for a week.
WORKSPACE_CAP_ADD="CHOWN"

# Step 3 — empty string = no add-caps at all (CapDrop=ALL only).
WORKSPACE_CAP_ADD=""
```

Watch for during each step:

- `bot_workspace_containers{status="error"}` ticking up after a deploy.
- Bridge healthchecks regressing — the bridge agent doesn't need any
  of these caps but a transitive dep might.
- `EACCES` or `EPERM` errors in workspace logs.

**Document which step you're at in the deploy log.** A regression while
on `""` should fall back to step 2, not back to the old default.

## 4. Egress hardening (Wave 3.5)

Squid is the only path to the public internet from a workspace
container. The allow-list lives in
[docker/squid-proxy/squid.conf](../../docker/squid-proxy/squid.conf)
and admin-blocked domains in `/etc/squid/config/admin-blocked-domains.txt`
(managed via the API).

Wave 3.5 changes:

- `NO_PROXY` no longer includes `.local`. That entry made it trivial
  to bypass the proxy for any user-controlled `.local` hostname; the
  effective NO_PROXY is now just `localhost,127.0.0.1,<host-api-ip>`.

Future hardening (not done):

- Per-org egress quota (bytes/day) — would require log parsing or a
  Squid plugin.
- Per-tenant allow-list overlay — partial: per-container ACLs already
  generated dynamically. Confirm coverage matches the user-facing
  "allowed domains" UI.

## 5. docker-socket-proxy migration (Wave 3.3)

Goal: replace direct `/var/run/docker.sock` access with a sidecar that
exposes only the Docker API verbs the API server actually uses.

### 5.1 Verify the API verb allow-list

Calls `dockerode` makes from this codebase, against the
[tecnativa/docker-socket-proxy] env vars:

| dockerode call | Required verb | Default env in compose |
|---|---|---|
| `docker.createContainer` / `start` / `stop` / `remove` | `CONTAINERS` | enabled |
| `container.exec` (terminal sessions) | `EXEC` | enabled |
| `docker.getNetwork` / `createNetwork` | `NETWORKS` | enabled |
| `docker.getVolume` (rare) | `VOLUMES` | enabled |
| `docker.listImages`, image lookup on create | `IMAGES` | enabled |
| `POST` requests in general | `POST` | enabled |
| Everything else | denied | denied |

If you add a new call (Swarm, Configs, Secrets, etc.) update the
compose env vars *before* the call site or it'll 403 silently.

### 5.2 Cut over

```bash
# 1. Bring up the sidecar (in the "hardened" profile so it never starts by accident).
docker compose --profile hardened up -d docker-proxy

# 2. Verify it answers /_ping.
docker exec 2bot-docker-proxy wget -qO- http://localhost:2375/_ping

# 3. Switch the API server's env. Choose ONE:
#    - Set DOCKER_HOST=tcp://2bot-docker-proxy:2375
#    - Unset DOCKER_SOCKET (it would override DOCKER_HOST otherwise)

# 4. Restart the API server.
make restart-api

# 5. Smoke-test: create a workspace, exec into it, delete it.
```

### 5.3 Rollback

If anything goes wrong:

```bash
unset DOCKER_HOST
# DOCKER_SOCKET defaults to /var/run/docker.sock
make restart-api
docker compose --profile hardened down docker-proxy
```

The `getDocker()` factory falls back to the unix socket whenever
`DOCKER_HOST` is unset.

## 6. gVisor runtime migration plan (Wave 3.4 — staged, not yet rolled out)

gVisor (`runsc`) runs each container in a userspace kernel that
intercepts every syscall. A container escape vulnerability in `runc`
(the default runtime) becomes a `runsc` userspace bug instead of a
host-kernel exploit — much narrower blast radius. The cost is ~10–30%
runtime overhead, depending on syscall pressure.

Migration is **staged** because moving every workspace at once is risky
and gVisor doesn't perfectly emulate every syscall — some node
workloads regress.

### 6.1 Host install (one-time per Docker host)

```bash
# As root on each Docker host:
ARCH=$(uname -m)
URL=https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}
wget ${URL}/runsc ${URL}/runsc.sha512 \
     ${URL}/containerd-shim-runsc-v1 ${URL}/containerd-shim-runsc-v1.sha512
sha512sum -c runsc.sha512 containerd-shim-runsc-v1.sha512
sudo mv runsc containerd-shim-runsc-v1 /usr/local/bin
sudo chmod 755 /usr/local/bin/runsc /usr/local/bin/containerd-shim-runsc-v1
sudo runsc install
sudo systemctl restart docker
```

Verify: `docker info | grep -i runtime` — should list `runsc`.

### 6.2 Per-container opt-in

Add to `HostConfig`:

```ts
HostConfig: {
  Runtime: 'runsc',
  // ... existing fields
}
```

In code, gate this behind a tier check so we can roll gradually:

- Phase A: free-tier only.
- Phase B: starter + free.
- Phase C: all tiers except enterprise (which may have specific
  workload requirements).
- Phase D: everyone.

Concrete env-driven knob (planned, not yet implemented):

```ts
const useRunsc =
  process.env.WORKSPACE_USE_RUNSC === 'all' ||
  (process.env.WORKSPACE_USE_RUNSC === 'free' && options.plan === 'FREE');
if (useRunsc) (HostConfig as { Runtime?: string }).Runtime = 'runsc';
```

### 6.3 Compatibility issues to watch for

- Some Node.js native addons that probe `/proc` heavily can be slower
  or fail under gVisor. The bridge agent uses `better-sqlite3` and
  `tree-sitter` natives — both are fine in our testing but verify on
  staging before each phase rollout.
- `iptables` inside the container behaves differently — gVisor traps
  netfilter but supports a useful subset. The bridge's per-plugin
  iptables rules need a smoke test.
- Filesystem layer perf is meaningfully slower; large `npm install`
  feels noticeably slower.

### 6.4 Rollback

Per-container — drop the `Runtime: 'runsc'` setting on the next
recreation. The host runtime registration can stay; idle.

## 7. Bridge token rotation alerting (Wave 3.6)

The cron writes two Prometheus metrics per cycle (see
[src/lib/metrics.ts](../../src/lib/metrics.ts)):

- `bot_bridge_token_rotation_total{result}` (counter) — `rotated`,
  `skipped`, or `failed` per rotation attempt.
- `bot_bridge_token_rotation_max_consecutive_failures` (gauge) — the
  worst per-container streak observed in the most recent cycle.

Recommended alert (Prometheus-style):

```yaml
- alert: BridgeRotationStuck
  expr: bot_bridge_token_rotation_max_consecutive_failures >= 3
  for: 5m
  labels:
    severity: page
  annotations:
    summary: "Bridge token rotation has failed 3+ cycles for at least one container"
    runbook: "docs/operations/workspace-hardening.md#7-bridge-token-rotation-alerting"
```

When the alert fires, the cron has already logged at ERROR level with
the offending `containerDbId`. Triage:

1. `prisma.workspace_container.findUnique({where:{id:<id>}})` — is it
   actually still alive (`status: RUNNING`)?
2. `docker inspect <containerId>` — is the bridge port reachable?
3. `wscat -c ws://<host>:<port>/?token=<old>` — does the bridge
   respond? If yes, manually run a single rotation. If no, the bridge
   is wedged; the workspace lifecycle service will rebuild the
   container on next idle-stop tick.

## 8. Posture comparison (rough)

| Threat | Pre-Wave-3 | Post-Wave-3 (defaults) | Post-Wave-3 (hardened env + gVisor) |
|---|---|---|---|
| Fork bomb DoS | host process limit only | per-container PidsLimit | per-container PidsLimit |
| FD-exhaustion DoS | host nofile only | per-container 65k cap | per-container 65k cap |
| OOM kill priority | host kernel default | workspace preferred | workspace preferred |
| Container escape via runc CVE | host kernel exposed | host kernel exposed | userspace `runsc` exposed (much narrower) |
| Container escape via Docker socket abuse | full Docker API | full Docker API | restricted via socket-proxy |
| `.local` egress bypass | possible | blocked | blocked |
| Bridge token leak | annual rotation needed | daily rotation, alert at 3 fails | daily rotation, alert at 3 fails |

The "hardened env + gVisor" column requires deploy-time changes (set
`DOCKER_HOST`, install gVisor on the host, set `WORKSPACE_CAP_ADD=""`)
that the user makes after smoke testing.
