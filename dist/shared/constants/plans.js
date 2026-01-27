"use strict";
/**
 * Plan Limits Configuration
 *
 * Defines resource limits for each subscription tier.
 * -1 means unlimited
 *
 * WORKSPACE NOTE:
 * - Plans reference workspace tiers from workspace-addons.ts
 * - Change INCLUDED_WORKSPACE_TIER to update which tier a plan includes
 * - Actual specs come from WORKSPACE_SPECS (single source of truth)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_PRICES = exports.STRIPE_PRICES = exports.PLAN_PRICING = exports.PLAN_LIMITS = exports.INCLUDED_WORKSPACE_TIER = exports.PLAN_ORDER = exports.PAID_PLAN_TYPES = exports.WORKSPACE_PLANS = exports.SERVERLESS_PLANS = exports.ALL_PLAN_TYPES = void 0;
exports.getIncludedWorkspace = getIncludedWorkspace;
exports.getExecutionMode = getExecutionMode;
exports.hasWorkspaceByDefault = hasWorkspaceByDefault;
exports.isHigherPlan = isHigherPlan;
exports.isAtLeastPlan = isAtLeastPlan;
exports.getPlanLimits = getPlanLimits;
exports.canDoAction = canDoAction;
exports.getRemainingQuota = getRemainingQuota;
exports.isUnlimited = isUnlimited;
exports.getPlanIsolationLevel = getPlanIsolationLevel;
exports.hasDedicatedDb = hasDedicatedDb;
exports.canUpgradeToIsolated = canUpgradeToIsolated;
exports.canChooseRegion = canChooseRegion;
exports.getPlanFeatures = getPlanFeatures;
exports.getAllPlansForDisplay = getAllPlansForDisplay;
exports.getUpgradePlansForDisplay = getUpgradePlansForDisplay;
exports.getPriceId = getPriceId;
exports.canUpgradeTo = canUpgradeTo;
exports.hasStripePrice = hasStripePrice;
exports.canDowngradeTo = canDowngradeTo;
exports.comparePlans = comparePlans;
exports.getUpgradeOptions = getUpgradeOptions;
exports.isPaidPlan = isPaidPlan;
// Import workspace specs - single source of truth for workspace resources
// This import creates a dependency, but it's intentional for DRY principle
const workspace_addons_1 = require("./workspace-addons");
// ===========================================
// Plan Type Arrays (for iteration/validation)
// ===========================================
exports.ALL_PLAN_TYPES = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
exports.SERVERLESS_PLANS = ['FREE', 'STARTER'];
exports.WORKSPACE_PLANS = ['PRO', 'BUSINESS', 'ENTERPRISE'];
exports.PAID_PLAN_TYPES = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
// ===========================================
// Plan Order/Hierarchy
// ===========================================
exports.PLAN_ORDER = {
    FREE: 0,
    STARTER: 1,
    PRO: 2,
    BUSINESS: 3,
    ENTERPRISE: 4,
};
// ===========================================
// Included Workspace Tier per Plan (Easy to Change!)
// ===========================================
// Maps which workspace tier is included with each plan.
// null = no workspace included (serverless mode)
// 'CUSTOM' for ENTERPRISE = custom negotiated resources
// 
// To change what workspace a plan includes, just update this mapping.
// Actual specs come from WORKSPACE_SPECS in workspace-addons.ts
exports.INCLUDED_WORKSPACE_TIER = {
    FREE: null, // Serverless only (can purchase add-ons)
    STARTER: null, // Serverless only (can purchase add-ons)
    PRO: 'SMALL', // Includes SMALL: 2GB RAM, 1 CPU, 20GB storage
    BUSINESS: 'LARGE', // Includes LARGE: 8GB RAM, 4 CPU, 80GB storage
    ENTERPRISE: 'CUSTOM', // Custom negotiated resources
};
/**
 * Get the workspace resources included with a plan
 * Returns null for serverless plans, WorkspaceResources for workspace plans
 */
function getIncludedWorkspace(plan) {
    const tier = exports.INCLUDED_WORKSPACE_TIER[plan];
    if (tier === null) {
        return null; // Serverless plan, no included workspace
    }
    if (tier === 'CUSTOM') {
        // Enterprise gets custom/unlimited resources
        return { ramMb: -1, cpuCores: -1, storageMb: -1 };
    }
    // Get specs from WORKSPACE_SPECS (single source of truth)
    const specs = workspace_addons_1.WORKSPACE_SPECS[tier];
    return {
        ramMb: specs.ramMb,
        cpuCores: specs.cpuCores,
        storageMb: specs.storageMb,
    };
}
// ===========================================
// Execution Mode Helpers
// ===========================================
/**
 * Get execution mode for a user based on their plan and add-on status
 */
function getExecutionMode(plan, hasWorkspaceAddon = false) {
    if (exports.WORKSPACE_PLANS.includes(plan) || hasWorkspaceAddon) {
        return 'WORKSPACE';
    }
    return 'SERVERLESS';
}
/**
 * Check if a plan includes workspace execution by default
 */
function hasWorkspaceByDefault(plan) {
    return exports.WORKSPACE_PLANS.includes(plan);
}
/**
 * Check if one plan is higher/better than another
 */
function isHigherPlan(planA, planB) {
    return exports.PLAN_ORDER[planA] > exports.PLAN_ORDER[planB];
}
/**
 * Check if one plan is at least as good as another
 */
function isAtLeastPlan(userPlan, requiredPlan) {
    return exports.PLAN_ORDER[userPlan] >= exports.PLAN_ORDER[requiredPlan];
}
// ===========================================
// Plan Limits Configuration
// ===========================================
// NOTE: Workspace specs are derived from INCLUDED_WORKSPACE_TIER mapping above.
// The 'workspace' field uses getIncludedWorkspace() for the actual values.
// To change what workspace a plan includes, update INCLUDED_WORKSPACE_TIER.
exports.PLAN_LIMITS = {
    FREE: {
        executionMode: 'SERVERLESS',
        executionsPerMonth: 500,
        workspace: getIncludedWorkspace('FREE'), // null (serverless)
        gateways: 1,
        workflows: 3,
        workflowSteps: 5,
        plugins: 3,
        aiTokensPerMonth: 10000,
        historyDays: 7,
        maxDepartments: 1,
        maxMembers: 3,
        isolationLevel: 'SHARED',
        dedicatedDb: false,
        canUpgradeToIsolated: false,
        priceMonthly: 0,
        priceYearly: 0,
        displayName: 'Free',
        description: 'Get started with basic automation',
    },
    STARTER: {
        executionMode: 'SERVERLESS',
        executionsPerMonth: 5000,
        workspace: getIncludedWorkspace('STARTER'), // null (serverless)
        gateways: 3,
        workflows: 10,
        workflowSteps: 10,
        plugins: 10,
        aiTokensPerMonth: 100000,
        historyDays: 30,
        maxDepartments: 3,
        maxMembers: 5,
        isolationLevel: 'SHARED',
        dedicatedDb: false,
        canUpgradeToIsolated: false,
        priceMonthly: 900,
        priceYearly: 9000,
        displayName: 'Starter',
        description: 'For individuals getting serious',
    },
    PRO: {
        executionMode: 'WORKSPACE',
        executionsPerMonth: null, // UNLIMITED - workspace mode = unlimited executions
        workspace: getIncludedWorkspace('PRO'), // SMALL tier from WORKSPACE_SPECS
        gateways: 10,
        workflows: 50,
        workflowSteps: 15,
        plugins: 25,
        aiTokensPerMonth: 500000,
        historyDays: 90,
        maxDepartments: 5,
        maxMembers: 10,
        isolationLevel: 'SHARED',
        dedicatedDb: false,
        canUpgradeToIsolated: true,
        priceMonthly: 2900,
        priceYearly: 29000,
        displayName: 'Pro',
        description: 'For power users with advanced needs',
    },
    BUSINESS: {
        executionMode: 'WORKSPACE',
        executionsPerMonth: null, // UNLIMITED - workspace mode = unlimited executions
        workspace: getIncludedWorkspace('BUSINESS'), // LARGE tier from WORKSPACE_SPECS
        gateways: 25,
        workflows: 200,
        workflowSteps: 25,
        plugins: 100,
        aiTokensPerMonth: 2000000,
        historyDays: 365,
        maxDepartments: 20,
        maxMembers: 50,
        isolationLevel: 'SHARED',
        dedicatedDb: false,
        canUpgradeToIsolated: true,
        priceMonthly: 7900,
        priceYearly: 79000,
        displayName: 'Business',
        description: 'For teams that need more power',
    },
    ENTERPRISE: {
        executionMode: 'WORKSPACE',
        executionsPerMonth: null, // UNLIMITED
        workspace: getIncludedWorkspace('ENTERPRISE'), // CUSTOM (-1 = unlimited)
        gateways: -1,
        workflows: -1,
        workflowSteps: 30,
        plugins: -1,
        aiTokensPerMonth: -1,
        historyDays: 365,
        maxDepartments: -1,
        maxMembers: -1,
        isolationLevel: 'DEDICATED',
        dedicatedDb: true,
        canUpgradeToIsolated: true,
        customRegion: true,
        priceMonthly: null, // Custom
        priceYearly: null,
        displayName: 'Enterprise',
        description: 'Custom solutions for large organizations',
    },
};
// ===========================================
// Plan Limits Helpers
// ===========================================
/**
 * Get limits for a specific plan
 */
function getPlanLimits(plan) {
    return exports.PLAN_LIMITS[plan];
}
/**
 * Check if a user can perform an action based on their plan limits
 * @param plan - The user's plan type
 * @param key - The limit key to check
 * @param currentUsage - Current usage count
 * @returns true if action is allowed, false if limit reached
 */
function canDoAction(plan, key, currentUsage) {
    const limits = exports.PLAN_LIMITS[plan];
    const limit = limits[key];
    if (limit === -1 || limit === null)
        return true; // unlimited
    return currentUsage < limit;
}
/**
 * Get remaining quota for a specific action
 * @returns -1 for unlimited, otherwise remaining count
 */
function getRemainingQuota(plan, key, currentUsage) {
    const limits = exports.PLAN_LIMITS[plan];
    const limit = limits[key];
    if (limit === -1 || limit === null)
        return -1; // unlimited
    return Math.max(0, limit - currentUsage);
}
/**
 * Check if a plan has unlimited access to a resource
 */
function isUnlimited(plan, key) {
    const value = exports.PLAN_LIMITS[plan][key];
    return value === -1 || value === null;
}
// ===========================================
// Database Isolation Helpers
// ===========================================
/**
 * Get isolation level for a plan
 */
function getPlanIsolationLevel(plan) {
    return exports.PLAN_LIMITS[plan].isolationLevel;
}
/**
 * Check if plan has dedicated database by default
 */
function hasDedicatedDb(plan) {
    return exports.PLAN_LIMITS[plan].dedicatedDb;
}
/**
 * Check if plan can upgrade to isolated database
 */
function canUpgradeToIsolated(plan) {
    return exports.PLAN_LIMITS[plan].canUpgradeToIsolated ?? false;
}
/**
 * Check if plan supports custom database region selection
 */
function canChooseRegion(plan) {
    const limits = exports.PLAN_LIMITS[plan];
    return 'customRegion' in limits && limits.customRegion === true;
}
/**
 * Plan pricing information (for display purposes)
 */
exports.PLAN_PRICING = {
    FREE: {
        price: 0,
        interval: 'month',
        name: 'Free',
        description: 'For trying out the platform',
    },
    STARTER: {
        price: 9,
        interval: 'month',
        name: 'Starter',
        description: 'For individuals getting started',
    },
    PRO: {
        price: 29,
        interval: 'month',
        name: 'Pro',
        description: 'For professionals and small teams',
    },
    BUSINESS: {
        price: 79,
        interval: 'month',
        name: 'Business',
        description: 'For growing businesses',
    },
    ENTERPRISE: {
        price: -1, // Custom pricing
        interval: 'month',
        name: 'Enterprise',
        description: 'Custom solutions for large organizations',
    },
};
// ===========================================
// Plan Display Features (for UI)
// ===========================================
/**
 * User-friendly feature strings for each plan (derived from PLAN_LIMITS)
 * Used by pricing pages, upgrade modals, etc.
 */
function getPlanFeatures(plan) {
    const limits = exports.PLAN_LIMITS[plan];
    const features = [];
    // Gateways
    if (limits.gateways === -1) {
        features.push('Unlimited gateways');
    }
    else {
        features.push(`${limits.gateways} gateway${limits.gateways > 1 ? 's' : ''}`);
    }
    // Plugins
    if (limits.plugins === -1) {
        features.push('Unlimited plugins');
    }
    else {
        features.push(`${limits.plugins} plugins`);
    }
    // Executions
    if (limits.executionsPerMonth === null) {
        features.push('Unlimited executions');
    }
    else {
        features.push(`${limits.executionsPerMonth.toLocaleString()} executions/month`);
    }
    // Workspace resources (for workspace plans)
    if (limits.workspace) {
        if (limits.workspace.ramMb === -1) {
            features.push('Custom RAM allocation');
        }
        else {
            const ram = limits.workspace.ramMb >= 1024
                ? `${(limits.workspace.ramMb / 1024).toFixed(0)}GB`
                : `${limits.workspace.ramMb}MB`;
            features.push(`${ram} RAM workspace`);
        }
    }
    // AI tokens
    if (limits.aiTokensPerMonth === -1) {
        features.push('Unlimited AI tokens');
    }
    else if (limits.aiTokensPerMonth >= 1000000) {
        features.push(`${(limits.aiTokensPerMonth / 1000000).toFixed(0)}M AI tokens/month`);
    }
    else {
        features.push(`${(limits.aiTokensPerMonth / 1000).toFixed(0)}K AI tokens/month`);
    }
    // History
    if (limits.historyDays >= 365) {
        features.push('1 year history retention');
    }
    else {
        features.push(`${limits.historyDays} days history`);
    }
    return features;
}
function getAllPlansForDisplay() {
    return [
        {
            id: 'FREE',
            name: exports.PLAN_PRICING.FREE.name,
            price: exports.PLAN_PRICING.FREE.price,
            description: exports.PLAN_PRICING.FREE.description,
            features: getPlanFeatures('FREE'),
            popular: false,
            cta: 'Get Started',
            href: '/register',
        },
        {
            id: 'STARTER',
            name: exports.PLAN_PRICING.STARTER.name,
            price: exports.PLAN_PRICING.STARTER.price,
            description: exports.PLAN_PRICING.STARTER.description,
            features: getPlanFeatures('STARTER'),
            popular: false,
            cta: 'Start Free Trial',
            href: '/register',
        },
        {
            id: 'PRO',
            name: exports.PLAN_PRICING.PRO.name,
            price: exports.PLAN_PRICING.PRO.price,
            description: exports.PLAN_PRICING.PRO.description,
            features: getPlanFeatures('PRO'),
            popular: true,
            cta: 'Start Free Trial',
            href: '/register',
        },
        {
            id: 'BUSINESS',
            name: exports.PLAN_PRICING.BUSINESS.name,
            price: exports.PLAN_PRICING.BUSINESS.price,
            description: exports.PLAN_PRICING.BUSINESS.description,
            features: getPlanFeatures('BUSINESS'),
            popular: false,
            cta: 'Contact Sales',
            href: '/register',
        },
        {
            id: 'ENTERPRISE',
            name: exports.PLAN_PRICING.ENTERPRISE.name,
            price: exports.PLAN_PRICING.ENTERPRISE.price,
            description: exports.PLAN_PRICING.ENTERPRISE.description,
            features: [
                ...getPlanFeatures('ENTERPRISE'),
                'Dedicated database',
                'Custom region',
                '24/7 support',
            ],
            popular: false,
            cta: 'Contact Sales',
            href: 'mailto:enterprise@2bot.org',
        },
    ];
}
/**
 * Get upgrade-eligible plans for display (excludes FREE and ENTERPRISE)
 */
function getUpgradePlansForDisplay() {
    return getAllPlansForDisplay().filter(plan => plan.id !== 'FREE' && plan.id !== 'ENTERPRISE');
}
// ===========================================
// Stripe Price IDs (Phase 5: Billing)
// ===========================================
/**
 * Get Stripe Price IDs dynamically at runtime
 * This allows env vars to be loaded after module import
 * Set these in your .env file:
 * - STRIPE_PRICE_STARTER
 * - STRIPE_PRICE_PRO
 * - STRIPE_PRICE_BUSINESS
 */
function getStripePrices() {
    return {
        FREE: null, // No Stripe subscription for free tier
        STARTER: process.env.STRIPE_PRICE_STARTER ?? null,
        PRO: process.env.STRIPE_PRICE_PRO ?? null,
        BUSINESS: process.env.STRIPE_PRICE_BUSINESS ?? null,
        ENTERPRISE: null, // Custom pricing - handled manually
    };
}
/**
 * @deprecated Use getPriceId() instead for runtime evaluation
 */
exports.STRIPE_PRICES = {
    FREE: null,
    STARTER: null, // Will be null at import time - use getPriceId() instead
    PRO: null,
    BUSINESS: null,
    ENTERPRISE: null,
};
/**
 * Plan prices in USD (for display and validation)
 */
exports.PLAN_PRICES = {
    FREE: 0,
    STARTER: 9,
    PRO: 29,
    BUSINESS: 79,
    ENTERPRISE: null, // Custom pricing
};
// ===========================================
// Plan Upgrade Logic
// ===========================================
// Note: PLAN_ORDER (Record<PlanType, number>) is defined at the top of this file
/**
 * Get the Stripe Price ID for a plan
 * Evaluates at runtime to pick up env vars loaded by dotenv
 */
function getPriceId(plan) {
    return getStripePrices()[plan];
}
/**
 * Check if upgrade from currentPlan to targetPlan is valid
 */
function canUpgradeTo(currentPlan, targetPlan) {
    return exports.PLAN_ORDER[targetPlan] > exports.PLAN_ORDER[currentPlan];
}
/**
 * Check if a plan has a Stripe price (can be purchased via Stripe)
 * Evaluates at runtime to pick up env vars loaded by dotenv
 */
function hasStripePrice(plan) {
    return getStripePrices()[plan] !== null;
}
/**
 * Check if downgrade from currentPlan to targetPlan is valid
 */
function canDowngradeTo(currentPlan, targetPlan) {
    return exports.PLAN_ORDER[targetPlan] < exports.PLAN_ORDER[currentPlan];
}
/**
 * Compare two plans
 * @returns negative if planA < planB, 0 if equal, positive if planA > planB
 */
function comparePlans(planA, planB) {
    return exports.PLAN_ORDER[planA] - exports.PLAN_ORDER[planB];
}
/**
 * Get available upgrade options for a plan
 */
function getUpgradeOptions(currentPlan) {
    const currentOrder = exports.PLAN_ORDER[currentPlan];
    // Enterprise is contact sales only
    return exports.ALL_PLAN_TYPES.filter(plan => exports.PLAN_ORDER[plan] > currentOrder && plan !== 'ENTERPRISE');
}
/**
 * Check if a plan is a paid plan
 */
function isPaidPlan(plan) {
    return plan !== 'FREE';
}
//# sourceMappingURL=plans.js.map