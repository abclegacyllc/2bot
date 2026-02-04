/**
 * Legacy Quota Migration Script
 * 
 * Migrates data from legacy Department/DepartmentMember quota fields
 * to the new DeptAllocation/MemberAllocation tables.
 * 
 * NOTE: This script uses raw SQL to query legacy columns since they
 * have been removed from the Prisma schema. Run this BEFORE applying
 * the Prisma migration that drops the columns.
 * 
 * Usage: npx tsx scripts/migrate-legacy-quotas.ts
 * 
 * @module scripts/migrate-legacy-quotas
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { AllocationMode, PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { Pool } from 'pg';

// Create Prisma client with pg adapter (matching project's lib/prisma.ts)
const connectionString = process.env.DATABASE_URL || 
  "postgresql://postgres:postgres@localhost:5432/2bot_dev?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface LegacyDepartment {
  id: string;
  organization_id: string;
  name: string;
  max_workflows: number | null;
  max_plugins: number | null;
  max_workflow_runs: number | null;
  max_storage: number | null;
}

interface LegacyMember {
  id: string;
  user_id: string;
  department_id: string;
  organization_id: string;
  max_workflows: number | null;
  max_plugins: number | null;
}

async function migrateLegacyQuotas() {
  console.log('🔄 Starting legacy quota migration...\n');

  // Track stats
  let deptsMigrated = 0;
  let deptsSkipped = 0;
  let membersMigrated = 0;
  let membersSkipped = 0;

  try {
    // Check if legacy columns still exist
    const columnCheck = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'departments' AND column_name = 'max_workflows'
    `;
    
    if (columnCheck.length === 0) {
      console.log('⚠️  Legacy columns have already been removed from database.');
      console.log('   Migration script should be run BEFORE applying Prisma migration.');
      console.log('   Skipping data migration.\n');
      return;
    }

    // =========================================
    // 1. Migrate Department → DeptAllocation
    // =========================================
    console.log('📦 Migrating Department quotas to DeptAllocation...');

    const departments = await prisma.$queryRaw<LegacyDepartment[]>`
      SELECT id, organization_id, name, max_workflows, max_plugins, max_workflow_runs, max_storage
      FROM departments
    `;

    for (const dept of departments) {
      // Check if allocation already exists
      const existingAlloc = await prisma.deptAllocation.findUnique({
        where: { departmentId: dept.id },
      });

      if (existingAlloc) {
        console.log(`  ⏭️  Skipping ${dept.name} - allocation exists`);
        deptsSkipped++;
        continue;
      }

      // Check if department has any legacy quotas set
      const hasLegacyQuotas = 
        dept.max_workflows !== null ||
        dept.max_plugins !== null ||
        dept.max_workflow_runs !== null ||
        dept.max_storage !== null;

      if (!hasLegacyQuotas) {
        console.log(`  ⏭️  Skipping ${dept.name} - no legacy quotas`);
        deptsSkipped++;
        continue;
      }

      // Get org owner for setById
      const orgOwner = await prisma.membership.findFirst({
        where: {
          organizationId: dept.organization_id,
          role: 'ORG_OWNER',
        },
        select: { userId: true },
      });

      if (!orgOwner) {
        console.log(`  ⏭️  Skipping ${dept.name} - no org owner found`);
        deptsSkipped++;
        continue;
      }

      // Create allocation from legacy fields
      await prisma.deptAllocation.create({
        data: {
          departmentId: dept.id,
          // Automation pool
          maxWorkflows: dept.max_workflows,
          maxPlugins: dept.max_plugins,
          maxGateways: null, // New field, no legacy equivalent
          // Workspace pool - map storage to storageMb
          maxStorageMb: dept.max_storage,
          maxRamMb: null, // New field
          maxCpuCores: null, // New field
          // Budget pool
          creditBudget: null, // New field, no legacy equivalent
          // Mode
          allocMode: AllocationMode.SOFT_CAP,
          setById: orgOwner.userId,
        },
      });

      console.log(`  ✅ Migrated ${dept.name}: workflows=${dept.max_workflows}, plugins=${dept.max_plugins}, storage=${dept.max_storage}`);
      deptsMigrated++;
    }

    console.log(`\n📊 Department migration: ${deptsMigrated} migrated, ${deptsSkipped} skipped\n`);

    // =========================================
    // 2. Migrate DepartmentMember → MemberAllocation
    // =========================================
    console.log('👥 Migrating DepartmentMember quotas to MemberAllocation...');

    const members = await prisma.$queryRaw<LegacyMember[]>`
      SELECT dm.id, dm.user_id, dm.department_id, d.organization_id, dm.max_workflows, dm.max_plugins
      FROM department_members dm
      JOIN departments d ON dm.department_id = d.id
    `;

    for (const member of members) {
      // Check if allocation already exists
      const existingAlloc = await prisma.memberAllocation.findUnique({
        where: {
          userId_departmentId: {
            userId: member.user_id,
            departmentId: member.department_id,
          },
        },
      });

      if (existingAlloc) {
        console.log(`  ⏭️  Skipping member ${member.user_id} - allocation exists`);
        membersSkipped++;
        continue;
      }

      // Check if member has any legacy quotas set
      const hasLegacyQuotas = 
        member.max_workflows !== null ||
        member.max_plugins !== null;

      if (!hasLegacyQuotas) {
        membersSkipped++;
        continue;
      }

      // Get org admin/owner for setById
      const orgAdmin = await prisma.membership.findFirst({
        where: {
          organizationId: member.organization_id,
          role: { in: ['ORG_OWNER', 'ORG_ADMIN'] },
        },
        select: { userId: true },
      });

      if (!orgAdmin) {
        console.log(`  ⏭️  Skipping member ${member.user_id} - no org admin found`);
        membersSkipped++;
        continue;
      }

      // Create allocation from legacy fields
      await prisma.memberAllocation.create({
        data: {
          userId: member.user_id,
          departmentId: member.department_id,
          // Automation pool
          maxWorkflows: member.max_workflows,
          maxGateways: null, // New field
          // Note: maxPlugins not in MemberAllocation (plugins are org-level)
          // Workspace pool
          maxStorageMb: null, // New field
          maxRamMb: null, // New field
          maxCpuCores: null, // New field
          // Budget pool
          creditBudget: null, // New field
          // Mode
          allocMode: AllocationMode.SOFT_CAP,
          setById: orgAdmin.userId,
        },
      });

      console.log(`  ✅ Migrated member ${member.user_id}: workflows=${member.max_workflows}`);
      membersMigrated++;
    }

    console.log(`\n📊 Member migration: ${membersMigrated} migrated, ${membersSkipped} skipped\n`);

    // =========================================
    // Summary
    // =========================================
    console.log('=' .repeat(50));
    console.log('✅ MIGRATION COMPLETE');
    console.log('=' .repeat(50));
    console.log(`Departments: ${deptsMigrated} migrated, ${deptsSkipped} skipped`);
    console.log(`Members: ${membersMigrated} migrated, ${membersSkipped} skipped`);
    console.log('\n⚠️  NEXT STEPS:');
    console.log('1. Verify data in DeptAllocation and MemberAllocation tables');
    console.log('2. Apply Prisma migration to drop legacy columns');
    console.log('3. Deploy updated code');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateLegacyQuotas()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
