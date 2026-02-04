/**
 * Integration Test Setup
 * 
 * This file sets up the test database for integration tests.
 * It runs before each integration test to ensure a clean state.
 */

import { hashPassword } from '@/lib/password';
import type { Organization, User } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

// Test database client - URL must be set via DATABASE_URL env var
export const testDb = new PrismaClient();

// Test fixtures - known data for integration tests
export const TEST_FIXTURES = {
  users: {
    free: {
      email: 'free@integration.test',
      password: 'TestPassword123!',
      name: 'Free User',
      plan: 'FREE' as const,
    },
    pro: {
      email: 'pro@integration.test',
      password: 'TestPassword123!',
      name: 'Pro User',
      plan: 'PRO' as const,
    },
    business: {
      email: 'business@integration.test',
      password: 'TestPassword123!',
      name: 'Business User',
      plan: 'BUSINESS' as const,
    },
  },
  organizations: {
    starter: {
      name: 'Test Org Starter',
      slug: 'test-org-starter',
      plan: 'ORG_STARTER' as const,
    },
    pro: {
      name: 'Test Org Pro',
      slug: 'test-org-pro',
      plan: 'ORG_PRO' as const,
    },
  },
};

/**
 * Clean the test database
 * WARNING: This deletes ALL data in the test database!
 */
export async function cleanDatabase() {
  // Delete in correct order to respect foreign keys
  await testDb.session.deleteMany();
  await testDb.userPlugin.deleteMany();
  await testDb.gateway.deleteMany();
  await testDb.plugin.deleteMany();
  await testDb.departmentMember.deleteMany();
  await testDb.department.deleteMany();
  await testDb.membership.deleteMany();
  await testDb.orgInvite.deleteMany();
  await testDb.organization.deleteMany();
  await testDb.passwordResetToken.deleteMany();
  await testDb.auditLog.deleteMany();
  await testDb.user.deleteMany();
}

/**
 * Seed test users
 */
export async function seedTestUsers() {
  const users: Record<string, User> = {};

  for (const [key, userData] of Object.entries(TEST_FIXTURES.users)) {
    const passwordHash = await hashPassword(userData.password);
    
    users[key] = await testDb.user.create({
      data: {
        email: userData.email,
        name: userData.name,
        passwordHash,
        plan: userData.plan,
        role: 'MEMBER',
        isActive: true,
      },
    });
  }

  return users;
}

/**
 * Seed test organizations
 */
export async function seedTestOrganizations(ownerId: string) {
  const orgs: Record<string, Organization> = {};

  for (const [key, orgData] of Object.entries(TEST_FIXTURES.organizations)) {
    const org = await testDb.organization.create({
      data: {
        name: orgData.name,
        slug: orgData.slug,
        plan: orgData.plan,
        isActive: true,
        memberships: {
          create: {
            userId: ownerId,
            role: 'ORG_OWNER',
            status: 'ACTIVE',
          },
        },
      },
    });

    orgs[key] = org;
  }

  return orgs;
}

/**
 * Setup integration test environment
 * Call this in beforeAll() or beforeEach()
 */
export async function setupIntegrationTest() {
  // Ensure we're using test database
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set! Create .env.test file.');
  }

  if (process.env.TEST_DATABASE_URL.includes('production') || 
      process.env.TEST_DATABASE_URL.includes('2bot_dev')) {
    throw new Error('TEST_DATABASE_URL points to non-test database! This is dangerous!');
  }

  // Clean database before tests
  await cleanDatabase();

  // Seed base test data
  const users = await seedTestUsers();
  const orgs = await seedTestOrganizations(users.free?.id || 'unknown');

  return {
    testDb,
    users,
    orgs,
  };
}

/**
 * Teardown integration test environment
 * Call this in afterAll()
 */
export async function teardownIntegrationTest() {
  await testDb.$disconnect();
}

/**
 * Create a test context for services
 */
export function createIntegrationContext(userId: string, orgId?: string) {
  return {
    userId,
    organizationId: orgId || null,
    role: 'MEMBER' as const,
    plan: 'FREE' as const,
    effectivePlan: orgId ? ('ORG_FREE' as const) : ('FREE' as const),
    ipAddress: '127.0.0.1',
    userAgent: 'Integration Test',
  };
}
