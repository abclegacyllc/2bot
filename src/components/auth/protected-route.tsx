"use client";

/**
 * Protected Route Component
 *
 * Wraps pages that require authentication.
 * Redirects to login if user is not authenticated.
 * Shows loading spinner while checking auth state.
 */

import { useAuth } from "@/components/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Where to redirect if not authenticated
   * @default "/login"
   */
  redirectTo?: string;
  /**
   * Required plan for access (optional)
   */
  requiredPlan?: "FREE" | "PRO";
}

/**
 * Loading Spinner Component
 */
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Access Denied Component
 */
function AccessDenied({ requiredPlan }: { requiredPlan: string }) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center space-y-4">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold text-white">Access Denied</h1>
        <p className="text-slate-400">
          This page requires a {requiredPlan} plan.
        </p>
        <button
          onClick={() => router.push("/pricing")}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
        >
          Upgrade Plan
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  redirectTo = "/login",
  requiredPlan,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Wait until auth check is complete
    if (isLoading) return;

    // Redirect if not authenticated
    if (!isAuthenticated) {
      // Store intended destination for redirect after login
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        if (currentPath !== redirectTo) {
          sessionStorage.setItem("redirectAfterLogin", currentPath);
        }
      }
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  // Show loading while checking auth
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return <LoadingSpinner />;
  }

  // Check plan requirement
  if (requiredPlan && user) {
    const planHierarchy = { FREE: 0, PRO: 1 };
    const userPlanLevel = planHierarchy[user.plan];
    const requiredPlanLevel = planHierarchy[requiredPlan];

    if (userPlanLevel < requiredPlanLevel) {
      return <AccessDenied requiredPlan={requiredPlan} />;
    }
  }

  // Authenticated and authorized - render children
  return <>{children}</>;
}

/**
 * withProtectedRoute HOC
 *
 * Higher-order component version for class components
 * or when you prefer HOC pattern.
 */
export function withProtectedRoute<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { redirectTo?: string; requiredPlan?: "FREE" | "PRO" }
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute
        redirectTo={options?.redirectTo}
        requiredPlan={options?.requiredPlan}
      >
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}
