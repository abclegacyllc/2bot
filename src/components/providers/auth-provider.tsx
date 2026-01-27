"use client";

/**
 * Auth Provider
 *
 * Provides authentication state and methods to the application.
 * Handles token storage, auto-refresh, and session management.
 * 
 * Phase 6.7: Simplified authentication
 * - Token only contains user identity (no context/orgs)
 * - Context is UI-only, determined by URL navigation
 * - Organizations fetched via /user/organizations
 *
 * Phase 6.9: Enterprise subdomain architecture
 * - Uses apiUrl() for direct API calls (no Next.js proxy)
 * - Dev: localhost:3001, Prod: api.2bot.org
 */

import { apiUrl } from "@/shared/config/urls";
import { useRouter } from "next/navigation";
import type {
    ReactNode
} from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

// User type (matches backend response)
interface User {
  id: string;
  email: string;
  name: string | null;
  role: "MEMBER" | "OWNER" | "DEVELOPER" | "SUPPORT" | "ADMIN" | "SUPER_ADMIN";
  plan: "FREE" | "PRO" | "ENTERPRISE";
  emailVerified: string | null;
  image: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Active context type (Phase 4)
interface ActiveContext {
  type: "personal" | "organization";
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  orgRole?: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";
  plan: "FREE" | "PRO" | "ENTERPRISE";
}

// Available organization for switching
interface AvailableOrg {
  id: string;
  name: string;
  slug: string;
  role: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // Context switching (Phase 4)
  context: ActiveContext;
  availableOrgs: AvailableOrg[];
  switchContext: (type: "personal" | "organization", orgId?: string) => Promise<void>;
  refreshAvailableOrgs: () => Promise<void>;
  // Auth methods
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Storage keys
const TOKEN_KEY = "token";

// Helper to get token from storage
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Helper to store token
function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

// Helper to clear token
function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

interface AuthProviderProps {
  children: ReactNode;
}

// Default personal context
const defaultContext: ActiveContext = {
  type: "personal",
  plan: "FREE",
};

// Helper to decode JWT payload (base64)
function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1]!);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// Phase 6.7: Extract user plan from token (context no longer in token)
function getUserPlanFromToken(token: string | null): "FREE" | "PRO" | "ENTERPRISE" {
  if (!token) return "FREE";
  const payload = decodeTokenPayload(token);
  if (!payload) return "FREE";
  return (payload.plan as "FREE" | "PRO" | "ENTERPRISE") || "FREE";
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [context, setContext] = useState<ActiveContext>(defaultContext);
  const [availableOrgs, setAvailableOrgs] = useState<AvailableOrg[]>([]);

  // Phase 6.7: Fetch available organizations from API
  const fetchAvailableOrgs = useCallback(async (): Promise<AvailableOrg[]> => {
    const token = getStoredToken();
    if (!token) return [];

    try {
      const response = await fetch(apiUrl("/user/organizations"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return [];
      }

      const result = await response.json();
      return result.data || [];
    } catch {
      return [];
    }
  }, []);

  // Fetch current user from API
  const fetchUser = useCallback(async (): Promise<User | null> => {
    const token = getStoredToken();
    if (!token) return null;

    try {
      const response = await fetch(apiUrl("/auth/me"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Token invalid or expired
        clearToken();
        return null;
      }

      const result = await response.json();
      // API returns { success: true, data: { ...user } } directly
      return result.data || null;
    } catch {
      clearToken();
      return null;
    }
  }, []);

  // Refresh user data
  const refreshUser = useCallback(async (): Promise<void> => {
    const userData = await fetchUser();
    setUser(userData);
    // Also refresh available orgs
    const orgs = await fetchAvailableOrgs();
    setAvailableOrgs(orgs);
  }, [fetchUser, fetchAvailableOrgs]);

  // Initialize auth state on mount
  useEffect(() => {
    async function initAuth() {
      setIsLoading(true);
      try {
        const token = getStoredToken();
        // Phase 6.7: Set default context with user's plan from token
        const userPlan = getUserPlanFromToken(token);
        setContext({ type: "personal", plan: userPlan });
        
        const userData = await fetchUser();
        setUser(userData);
        
        // Fetch available orgs from API (not from token)
        if (userData) {
          const orgs = await fetchAvailableOrgs();
          setAvailableOrgs(orgs);
        }
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, [fetchUser, fetchAvailableOrgs]);

  // Login function
  const login = useCallback(
    async (email: string, password: string, rememberMe = false): Promise<void> => {
      const response = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Login failed");
      }

      if (result.data?.token) {
        storeToken(result.data.token);
        // Phase 6.7: Set default personal context with user's plan
        const userPlan = getUserPlanFromToken(result.data.token);
        setContext({ type: "personal", plan: userPlan });
      }

      if (result.data?.user) {
        setUser(result.data.user);
        // Fetch available orgs from API after login
        const orgs = await fetchAvailableOrgs();
        setAvailableOrgs(orgs);
      }
    },
    [fetchAvailableOrgs]
  );

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    const token = getStoredToken();

    try {
      if (token) {
        await fetch(apiUrl("/auth/logout"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Ignore errors during logout
    } finally {
      clearToken();
      setUser(null);
      setContext(defaultContext);
      setAvailableOrgs([]);
      router.push("/login");
    }
  }, [router]);

  // Register function
  const register = useCallback(
    async (email: string, password: string, name?: string): Promise<void> => {
      const response = await fetch(apiUrl("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Registration failed");
      }

      if (result.data?.token) {
        storeToken(result.data.token);
        // Phase 6.7: Set default personal context with user's plan
        const userPlan = getUserPlanFromToken(result.data.token);
        setContext({ type: "personal", plan: userPlan });
      }

      if (result.data?.user) {
        setUser(result.data.user);
        // New users don't have orgs yet, but fetch anyway for consistency
        setAvailableOrgs([]);
      }
    },
    []
  );

  // Switch context (Phase 6.7 - UI-only navigation)
  // Context switching is now handled via URL navigation instead of token switching.
  // Personal resources: /dashboard/* uses /api/user/*
  // Organization resources: /organizations/:orgId/* uses /api/orgs/:orgId/*
  const switchContext = useCallback(
    async (type: "personal" | "organization", orgId?: string): Promise<void> => {
      const token = getStoredToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      // Phase 6.7: UI-only context switching via navigation
      // No need to fetch new token - just update local state and navigate
      if (type === "personal") {
        // Update local context to personal
        setContext({
          type: "personal",
          plan: user?.plan || "FREE",
        });
        // Navigate to personal dashboard
        router.push("/");
      } else if (type === "organization" && orgId) {
        // Find the org in available orgs
        const org = availableOrgs.find((o) => o.id === orgId);
        if (!org) {
          throw new Error("Organization not found");
        }
        // Update local context to organization
        setContext({
          type: "organization",
          organizationId: org.id,
          organizationSlug: org.slug,
          organizationName: org.name,
          orgRole: org.role,
          plan: "FREE", // Default, will be refreshed from org endpoint
        });
        // Navigate to organization dashboard using slug for clean URLs
        router.push(`/organizations/${org.slug}`);
      } else {
        throw new Error("Invalid context switch parameters");
      }
    },
    [router, user?.plan, availableOrgs]
  );

  // Refresh available organizations
  const refreshAvailableOrgs = useCallback(async (): Promise<void> => {
    const orgs = await fetchAvailableOrgs();
    setAvailableOrgs(orgs);
  }, [fetchAvailableOrgs]);

  const value: AuthContextType = {
    user,
    token: getStoredToken(),
    isLoading,
    isAuthenticated: !!user,
    context,
    availableOrgs,
    switchContext,
    refreshAvailableOrgs,
    login,
    logout,
    register,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth Hook
 *
 * Access auth context from any component.
 * Throws error if used outside AuthProvider.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
