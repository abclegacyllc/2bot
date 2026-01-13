"use client";

/**
 * Auth Provider
 *
 * Provides authentication state and methods to the application.
 * Handles token storage, auto-refresh, and session management.
 */

import { useRouter } from "next/navigation";
import {
    createContext,
    ReactNode,
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
  plan: "FREE" | "PRO";
  emailVerified: string | null;
  image: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Auth context interface
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
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

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      return result.data?.user || null;
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
        const userData = await fetchUser();
        setUser(userData);
      } finally {
        setIsLoading(false);
      }
    }
    initAuth();
  }, [fetchUser]);

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
      }

      if (result.data?.user) {
        setUser(result.data.user);
      }
    },
    []
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
      }

      if (result.data?.user) {
        setUser(result.data.user);
      }
    },
    []
  );

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
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
