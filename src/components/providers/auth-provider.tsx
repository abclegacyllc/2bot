"use client";

/**
 * Auth Provider
 *
 * Provides authentication state and methods to the application.
 * Handles token storage, auto-refresh, and session management.
 * Updated for Phase 4: Context switching support
 */

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

// Extract context from token
function getContextFromToken(token: string | null): {
  context: ActiveContext;
  availableOrgs: AvailableOrg[];
} {
  if (!token) {
    return { context: defaultContext, availableOrgs: [] };
  }

  const payload = decodeTokenPayload(token);
  if (!payload) {
    return { context: defaultContext, availableOrgs: [] };
  }

  const activeContext = payload.activeContext as ActiveContext | undefined;
  const availableOrgs = (payload.availableOrgs || []) as AvailableOrg[];

  return {
    context: activeContext || defaultContext,
    availableOrgs,
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [context, setContext] = useState<ActiveContext>(defaultContext);
  const [availableOrgs, setAvailableOrgs] = useState<AvailableOrg[]>([]);

  // Update context when token changes
  const updateContextFromToken = useCallback((token: string | null) => {
    const { context: newContext, availableOrgs: orgs } = getContextFromToken(token);
    setContext(newContext);
    setAvailableOrgs(orgs);
  }, []);

  // Fetch current user from API
  const fetchUser = useCallback(async (): Promise<User | null> => {
    const token = getStoredToken();
    if (!token) return null;

    try {
      const response = await fetch("/api/auth/me", {
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
  }, [fetchUser]);

  // Initialize auth state on mount
  useEffect(() => {
    async function initAuth() {
      setIsLoading(true);
      try {
        const token = getStoredToken();
        updateContextFromToken(token);
        const userData = await fetchUser();
        setUser(userData);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, [fetchUser, updateContextFromToken]);

  // Login function
  const login = useCallback(
    async (email: string, password: string, rememberMe = false): Promise<void> => {
      const response = await fetch("/api/auth/login", {
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
        updateContextFromToken(result.data.token);
      }

      if (result.data?.user) {
        setUser(result.data.user);
      }
    },
    [updateContextFromToken]
  );

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    const token = getStoredToken();

    try {
      if (token) {
        await fetch("/api/auth/logout", {
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
      const response = await fetch("/api/auth/register", {
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
        updateContextFromToken(result.data.token);
      }

      if (result.data?.user) {
        setUser(result.data.user);
      }
    },
    [updateContextFromToken]
  );

  // Switch context (Phase 4)
  const switchContext = useCallback(
    async (type: "personal" | "organization", orgId?: string): Promise<void> => {
      const token = getStoredToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("/api/auth/switch-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contextType: type,
          organizationId: orgId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to switch context");
      }

      if (result.data?.token) {
        storeToken(result.data.token);
        updateContextFromToken(result.data.token);
      }
    },
    [updateContextFromToken]
  );

  const value: AuthContextType = {
    user,
    token: getStoredToken(),
    isLoading,
    isAuthenticated: !!user,
    context,
    availableOrgs,
    switchContext,
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
