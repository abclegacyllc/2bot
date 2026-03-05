#!/usr/bin/env npx tsx
/**
 * Provision Workspace Containers for All Users
 *
 * Migration script for Phase 0 of the workspace-native plugin system.
 * Creates a STOPPED WorkspaceContainer record for every user who doesn't
 * already have one, with plan-appropriate auto-stop settings.
 *
 * This does NOT create Docker containers — it only creates DB records.
 * Actual Docker containers are created on-demand when the user's workspace
 * is first started (via createWorkspace or plugin install flow).
 *
 * Usage:
 *   npx tsx scripts/provision-containers.ts
 *   npx tsx scripts/provision-containers.ts --dry-run
 *
 * @module scripts/provision-containers
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

/** Free/Starter plans get 24h auto-stop; paid plans get no auto-stop */
const FREE_TIER_AUTO_STOP_MINUTES = 1440;
const FREE_PLANS = ['FREE', 'STARTER'];

async function main() {
  console.log(`\n=== Workspace Container Provisioning ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  // 1. Find all users who do NOT have a personal workspace container (non-destroyed)
  const usersWithContainers = await prisma.workspaceContainer.findMany({
    where: {
      organizationId: null,
      status: { not: 'DESTROYED' },
    },
    select: { userId: true },
  });

  const usersWithContainerIds = new Set(usersWithContainers.map(c => c.userId));

  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      plan: true,
    },
  });

  const usersNeedingContainers = allUsers.filter(u => !usersWithContainerIds.has(u.id));

  console.log(`Total users: ${allUsers.length}`);
  console.log(`Users with containers: ${usersWithContainerIds.size}`);
  console.log(`Users needing containers: ${usersNeedingContainers.length}\n`);

  if (usersNeedingContainers.length === 0) {
    console.log('All users already have workspace containers. Nothing to do.');
    return;
  }

  // 2. Provision containers
  let created = 0;
  let failed = 0;

  for (const user of usersNeedingContainers) {
    const plan = (user.plan ?? 'FREE') as string;
    const isFreeTier = FREE_PLANS.includes(plan);
    const autoStopMinutes = isFreeTier ? FREE_TIER_AUTO_STOP_MINUTES : null;
    const containerName = `ws-${user.id}`;

    if (DRY_RUN) {
      console.log(`[DRY] Would create container for ${user.email} (plan: ${plan}, auto-stop: ${autoStopMinutes ?? 'OFF'})`);
      created++;
      continue;
    }

    try {
      // Clean up any destroyed records with same name (unique constraint)
      await prisma.workspaceContainer.deleteMany({
        where: { containerName, status: 'DESTROYED' },
      });

      await prisma.workspaceContainer.create({
        data: {
          userId: user.id,
          organizationId: null,
          ownerType: 'PERSONAL',
          containerName,
          imageName: '2bot-workspace:latest',
          status: 'STOPPED',
          ramMb: isFreeTier ? 1024 : 2048,
          cpuCores: isFreeTier ? 0.5 : 1,
          storageMb: isFreeTier ? 10240 : 20480,
          volumePath: `/var/lib/2bot/workspaces/${containerName}`,
          bridgePort: 9000,
          autoStopMinutes,
          autoRestart: true,
          maxRestarts: 5,
        },
      });

      console.log(`[OK] Created container for ${user.email} (plan: ${plan}, auto-stop: ${autoStopMinutes ?? 'OFF'})`);
      created++;
    } catch (err) {
      console.error(`[FAIL] ${user.email}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${created + failed}\n`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
