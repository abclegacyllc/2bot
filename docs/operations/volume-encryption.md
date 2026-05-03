# Workspace Volume Encryption (Phase 2.2)

The platform stores per-user workspace data on host volumes mounted into
container instances. Encrypt those volumes at rest to satisfy SOC2 / GDPR
data-at-rest requirements.

This is an **ops task** — there is no application code change.

## What needs encrypting

Anything under the workspace mount path on the host (Docker named volume or
bind-mount target):

- User workspace files (plugins, generated assets, attachments)
- Sqlite/level caches inside the container, if persisted
- Bridge agent state files
- pgdata (already encrypted by `postgres` image only when the underlying
  filesystem is encrypted)

## Option A — Cloud-managed disk encryption (recommended)

| Provider | Setting |
|---|---|
| AWS | EBS volume `Encrypted=true`, KMS CMK in same region |
| GCP | Persistent Disk `--disk-encryption-key=projects/.../cryptoKeys/...` |
| Hetzner | Set up LUKS during volume init (no built-in encryption) |
| Bare metal | Use Option B (LUKS) |

Pros: zero ops overhead, transparent to workloads, automatic key rotation by
the cloud KMS.

## Option B — LUKS on the host

Use this on bare metal or providers without managed disk encryption.

```bash
# 1. Identify the device backing the workspace volume
lsblk
# Suppose it is /dev/sdb

# 2. Initialize LUKS with a strong key (store passphrase in a vault, NOT git)
sudo cryptsetup luksFormat --type luks2 --cipher aes-xts-plain64 \
  --key-size 512 --hash sha256 /dev/sdb

# 3. Open and create filesystem
sudo cryptsetup open /dev/sdb workspace_data
sudo mkfs.ext4 /dev/mapper/workspace_data

# 4. Mount and persist
sudo mkdir -p /var/lib/2bot/workspaces
sudo mount /dev/mapper/workspace_data /var/lib/2bot/workspaces

# 5. Auto-unlock at boot via /etc/crypttab + key file (chmod 0400, root-only)
echo "workspace_data /dev/sdb /root/.workspace.key luks" | sudo tee -a /etc/crypttab
echo "/dev/mapper/workspace_data /var/lib/2bot/workspaces ext4 defaults 0 2" \
  | sudo tee -a /etc/fstab
```

## Key custody runbook

1. **Where is the master key?** Document the location (KMS CMK ARN, vault
   path, or LUKS passphrase store). Owner: ops lead.
2. **Who can rotate?** Restrict KMS CMK rotation / `cryptsetup luksAddKey`
   to two people minimum (M-of-N if KMS).
3. **Backup recovery.** The master key MUST be backed up offline (sealed
   envelope, hardware token, KMS replica region). Without it, encrypted
   backups are unrecoverable.
4. **Rotate cadence.** Rotate KMS CMK annually (cloud) or rotate LUKS slot
   keys quarterly. Old slots are removed only after verifying new slot
   unlocks.

## Application-side encryption

Application-level credential encryption (`src/lib/encryption.ts`) is
**separate** from volume-at-rest encryption. Both layers are required:

- Volume encryption → protects against disk theft / improper disposal.
- App encryption → protects against accidental DB dump leakage / read access
  to a backup.

See [Phase 2.3 key rotation flow](../../src/lib/encryption.ts) for the
application-layer story.
