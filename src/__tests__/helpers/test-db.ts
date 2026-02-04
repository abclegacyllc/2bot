/**
 * Test Database Helpers
 *
 * Utilities for creating test users, organizations, and resources
 * for integration tests with real Prisma calls.
 *
 * @module __tests__/helpers/test-db
 */

import { prisma } from '@/lib/prisma';
import type { OrgPlanType } from '@/shared/constants/org-plans';
import type { PlanType } from '@/shared/constants/plans';
import type { Organization, OrgRole, User } from '@prisma/client';
import { randomBytes } from 'crypto';

/**
 * Generate unique test identifier
 */
function generateTestId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

/**
 * Create a test user with specified plan
 */
export async function createTestUser(options: {
  plan?: PlanType;
  email?: string;
  name?: string;
} = {}): Promise<User> {
  const email = options.email || `test-${generateTestId('user')}@example.com`;
  
  return await prisma.user.create({
    data: {
      email,
      name: options.name || 'Test User',
      plan: options.plan || 'FREE',
      passwordHash: 'test-hash', // Not used in tests
      emailVerified: new Date(), // DateTime field, not boolean
    },
  });
}

/**
 * Create a test organization with specified plan
 */
export async function createTestOrg(options: {
  plan?: OrgPlanType;
  name?: string;
  ownerId?: string;
} = {}): Promise<Organization> {
  // Create owner if not provided
  let ownerId = options.ownerId;
  if (!ownerId) {
    const owner = await createTestUser({ plan: 'FREE' });
    ownerId = owner.id;
  }

  const slug = generateTestId('org');
  
  const org = await prisma.organization.create({
    data: {
      name: options.name || 'Test Organization',
      slug,
      plan: options.plan || 'ORG_FREE',
    },
  });

  // Add owner as ADMIN member
  await prisma.membership.create({
    data: {
      userId: ownerId,
      organizationId: org.id,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
    },
  });

  return org;
}

/**
 * Add a member to an organization
 */
export async function addOrgMember(
  organizationId: string,
  userId: string,
  role: OrgRole = 'ORG_MEMBER'
): Promise<void> {
  await prisma.membership.create({
    data: {
      userId,
      organizationId,
      role,
      status: 'ACTIVE',
    },
  });
}

/**
 * Create a test gateway for a user
 */
export async function createTestGateway(
  userId: string,
  options: {
    organizationId?: string;
    name?: string;
    type?: string;
  } = {}
) {
  return await prisma.gateway.create({
    data: {
      userId,
      organizationId: options.organizationId || null,
      name: options.name || generateTestId('Gateway'),
      type: (options.type as any) || 'AI',
      status: 'DISCONNECTED',
      credentialsEnc: 'encrypted:test',
      config: {},
    },
  });
}

/**
 * Create a test plugin
 */
export async function createTestPlugin(options: {
  name?: string;
  category?: string;
} = {}) {
  return await prisma.plugin.create({
    data: {
      name: options.name || generateTestId('Plugin'),
      slug: generateTestId('plugin'),
      category: (options.category as any) || 'AI',
      version: '1.0.0',
      description: 'Test plugin',
      isActive: true,
      configSchema: {},
    },
  });
}

/**
 * Install a plugin for a user
 */
export async function installTestPlugin(
  userId: string,
  pluginId: string,
  options: {
    organizationId?: string;
  } = {}
) {
  return await prisma.userPlugin.create({
    data: {
      userId,
      pluginId,
      organizationId: options.organizationId || null,
      config: {},
      isEnabled: true,
    },
  });
}

/**
 * Clean up test data for a user
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  // Delete user's resources in correct order (respect foreign keys)
  await prisma.userPlugin.deleteMany({ where: { userId } });
  await prisma.gateway.deleteMany({ where: { userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

/**
 * Clean up test data for an organization
 */
export async function cleanupTestOrg(organizationId: string): Promise<void> {
  await prisma.userPlugin.deleteMany({ where: { organizationId } });
  await prisma.gateway.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
}

/**
 * Clean up multiple test users at once
 */
export async function cleanupTestUsers(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await cleanupTestUser(userId).catch(() => {
      // Ignore errors (user might already be deleted)
    });
  }
}

/**
 * Clean up multiple test orgs at once
 */
export async function cleanupTestOrgs(orgIds: string[]): Promise<void> {
  for (const orgId of orgIds) {
    await cleanupTestOrg(orgId).catch(() => {
      // Ignore errors (org might already be deleted)
    });
  }
}

/**
 * Get available plugins (for testing installation limits)
 */
export async function getAvailablePlugins(limit = 100) {
  let plugins = await prisma.plugin.findMany({
    where: { isActive: true },
    take: limit,
  });

  // Create some test plugins if none exist
  if (plugins.length < limit) {
    const needed = limit - plugins.length;
    for (let i = 0; i < needed; i++) {
      const plugin = await createTestPlugin({
        name: `Test Plugin ${i + 1}`,
      });
      plugins.push(plugin);
    }
  }

  return plugins;
}
