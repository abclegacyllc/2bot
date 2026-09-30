/**
 * Rebuild one workspace's Docker container, keeping the user's files.
 *
 * Why: a workspace's HTTP_PROXY and BRIDGE_AUTH_TOKEN are baked into its
 * container env at creation, and Docker can't change env in place. A container
 * created before the proxy address was pinned can point at a dead address (on
 * 2026-09-30, ws-cmlgj11hd0001jlky7n1rx2ci pointed at its own IP after the Sep 8
 * reboot moved the proxy). Recreating the container gives it the pinned proxy
 * address and the DB's current bridge token.
 *
 * What it does, for a workspace in ERROR or STOPPED whose container is stopped:
 *   1. renames the old container to <name>-pre-rebuild-<timestamp> (kept, not
 *      deleted, so its container-layer state is recoverable);
 *   2. creates a new one through dockerService.createContainer -- same name,
 *      labels, resources, HTTP-listener setting and /workspace bind mount;
 *   3. points the DB row at it and sets it STOPPED with the error cleared.
 * It does not start it: the owner starts it from the dashboard, through the
 * normal start path. Anything installed outside /workspace is not carried over.
 * If creating the new container fails, the old one is renamed back.
 *
 * Usage (loads the same env files as the API):
 *   set -a; . ./.env; . ./.env.production; . ./.env.local; set +a
 *   npx tsx scripts/rebuild-workspace-container.ts <workspaceContainerId>           # dry run
 *   APPLY=1 npx tsx scripts/rebuild-workspace-container.ts <workspaceContainerId>   # do it
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import Docker from "dockerode";
import { Pool } from "pg";

import { decryptIfEncrypted } from "../src/lib/encryption";
import { dockerService } from "../src/modules/workspace/workspace-docker.service";
import { WORKSPACE_IMAGE, WORKSPACE_NETWORK, WORKSPACE_PROXY_IP } from "../src/modules/workspace/workspace.constants";

const id = process.argv[2];
if (!id) throw new Error("usage: rebuild-workspace-container.ts <workspaceContainerId>");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required (load the env files first).");
const apply = process.env.APPLY === "1";

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock" });

const envOf = (env: string[] | undefined, name: string) =>
  (env ?? []).find((e) => e.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

async function main(): Promise<void> {
  const row = await prisma.workspaceContainer.findUnique({ where: { id } });
  if (!row) throw new Error(`No workspace ${id}`);
  if (row.status !== "ERROR" && row.status !== "STOPPED") {
    throw new Error(`Workspace is ${row.status}; only ERROR or STOPPED workspaces are rebuilt`);
  }
  if (!row.containerId || !row.bridgeAuthToken) throw new Error("Workspace has no container or bridge token");

  const old = await docker.getContainer(row.containerId).inspect();
  if (old.State.Running) throw new Error(`Container ${old.Name} is running; stop it first`);
  const mount = old.Mounts.find((m) => m.Destination === "/workspace");
  if (!mount || mount.Source !== row.volumePath) {
    throw new Error(`/workspace mount (${mount?.Source ?? "none"}) does not match the DB volume path (${row.volumePath})`);
  }
  const httpPort = envOf(old.Config.Env, "WORKSPACE_HTTP_PORT");
  const enableHttpListener = httpPort !== null && httpPort !== "0";
  const backupName = `${row.containerName}-pre-rebuild-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
  const newProxy = process.env.WORKSPACE_PROXY_URL || `http://${WORKSPACE_PROXY_IP}:${process.env.WORKSPACE_PROXY_PORT || "3128"}`;

  console.log(`Workspace ${row.id} (${row.containerName}), status ${row.status}`);
  console.log(`  error:        ${row.errorMessage ?? "-"}`);
  console.log(`  files:        ${row.volumePath} -> /workspace (kept)`);
  console.log(`  HTTP_PROXY:   ${envOf(old.Config.Env, "HTTP_PROXY")} -> ${newProxy}`);
  console.log(`  bridge token: ${envOf(old.Config.Env, "BRIDGE_AUTH_TOKEN") === decryptIfEncrypted(row.bridgeAuthToken) ? "matches DB" : "stale (DB has a rotated one)"} -> DB's current`);
  console.log(`  resources:    ${row.ramMb} MB RAM, ${row.cpuCores} CPU, ${row.storageMb} MB storage; HTTP listener ${enableHttpListener ? "on" : "off"}`);
  console.log(`  old container ${old.Id.slice(0, 12)} will be renamed to ${backupName}`);
  if (!apply) {
    console.log("\nDry run. Re-run with APPLY=1 to rebuild.");
    return;
  }

  await docker.getContainer(row.containerId).rename({ name: backupName });
  let newId: string;
  try {
    await dockerService.ensureNetwork();
    ({ containerId: newId } = await dockerService.createContainer({
      name: row.containerName,
      image: WORKSPACE_IMAGE,
      ramMb: row.ramMb,
      cpuCores: row.cpuCores,
      storageMb: row.storageMb,
      volumePath: row.volumePath,
      bridgeAuthToken: decryptIfEncrypted(row.bridgeAuthToken),
      networkName: WORKSPACE_NETWORK,
      labels: old.Config.Labels ?? {},
      env: {},
      enableHttpListener,
    }));
  } catch (err) {
    await docker.getContainer(row.containerId).rename({ name: row.containerName });
    throw new Error(`Create failed, old container restored as ${row.containerName}: ${(err as Error).message}`);
  }

  await prisma.workspaceContainer.update({
    where: { id: row.id },
    data: {
      containerId: newId,
      status: "STOPPED",
      errorMessage: null,
      healthCheckFails: 0,
      restartCount: 0,
      bridgePort: null,
      httpPort: null,
      ipAddress: null,
    },
  });
  console.log(`\nRebuilt: new container ${newId.slice(0, 12)}, workspace set to STOPPED. The owner can start it from the dashboard.`);
  console.log(`Old container kept as ${backupName}; remove it once the workspace works: docker rm ${backupName}`);
}

main()
  .catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
