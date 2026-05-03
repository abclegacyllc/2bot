"use client";

/**
 * Studio Layout
 *
 * IDE-like layout for the 2Bot Studio experience:
 * - Slim top navigation bar (global context)
 * - Collapsible left bot sidebar (project list)
 * - Main studio area (bot tabs / canvas)
 *
 * @module app/studio/layout
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Cursor, CursorProvider } from "@/components/cursor";
import { CursorStudioBar } from "@/components/cursor/cursor-studio-bar";
import { StudioBarProvider } from "@/components/cursor/studio-bar-context";
import { useAuth } from "@/components/providers/auth-provider";
import { BotSidebar } from "@/components/studio/bot-sidebar";
import { StudioTopBar } from "@/components/studio/top-bar";
import type { GatewayOption } from "@/lib/api-client";
import { getOrgGateways, getUserGateways } from "@/lib/api-client";
import { apiUrl } from "@/shared/config/urls";
import type { UserPlugin } from "@/shared/types/plugin";
import { useParams, useRouter } from "next/navigation";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

// =============================================================================
// Studio Context — shared state for all studio children
// =============================================================================

interface StudioContextValue {
  /** All gateways (bots) for current user/org */
  gateways: GatewayOption[];
  /** All installed plugins for current user/org */
  plugins: UserPlugin[];
  /** Currently selected bot ID (gateway ID) */
  selectedBotId: string | null;
  /** Select a bot by gateway ID */
  selectBot: (id: string) => void;
  /** Re-fetch gateway and plugin data */
  refresh: () => void;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Toggle sidebar collapsed state */
  toggleSidebar: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioLayout");
  return ctx;
}

/** Safe version — returns null when outside StudioLayout instead of throwing */
export function useStudioSafe(): StudioContextValue | null {
  return useContext(StudioContext);
}

// =============================================================================
// Layout Content
// =============================================================================

function StudioLayoutContent({ children }: { children: ReactNode }) {
  const { token, context } = useAuth();
  const router = useRouter();
  const params = useParams();
  const organizationId =
    context.type === "organization" ? context.organizationId : undefined;

  // Sidebar state — default collapsed, persisted in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("studio-sidebar-collapsed");
    return saved !== null ? saved === "true" : true;
  });

  // Bot data
  const [gateways, setGateways] = useState<GatewayOption[]>([]);
  const [plugins, setPlugins] = useState<UserPlugin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected bot derived from URL params
  const botId = (params.botId as string) || null;

  // =========================================================================
  // Data Fetching
  // =========================================================================

  // Keep previous data refs for equality checks to avoid re-renders when unchanged
  const prevGatewaysRef = useRef<GatewayOption[]>([]);
  const prevPluginsRef = useRef<UserPlugin[]>([]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [gatewayResult, pluginsRes] = await Promise.all([
        organizationId
          ? getOrgGateways(organizationId, token)
          : getUserGateways(token),
        fetch(
          organizationId
            ? apiUrl(`/orgs/${organizationId}/plugins`)
            : apiUrl("/plugins/installed"),
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (gatewayResult.success && gatewayResult.data) {
        // Only update state when data actually changed to avoid cascading re-renders
        const next = gatewayResult.data;
        if (JSON.stringify(next) !== JSON.stringify(prevGatewaysRef.current)) {
          prevGatewaysRef.current = next;
          setGateways(next);
        }
      }

      if (pluginsRes.ok) {
        const json = await pluginsRes.json();
        const next: UserPlugin[] = json.data ?? [];
        if (JSON.stringify(next) !== JSON.stringify(prevPluginsRef.current)) {
          prevPluginsRef.current = next;
          setPlugins(next);
        }
      }
    } catch {
      // Best-effort
    } finally {
      setIsLoading(false);
    }
  }, [token, organizationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Event-driven refresh: triggered by Cursor AI when it creates/modifies plugins.
  // Replaces the old 30-second polling loop which caused constant layout re-renders
  // even when the user was idle (bad UX — visible flicker in sidebar/canvas).
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("studio:plugins-updated", handler);
    return () => window.removeEventListener("studio:plugins-updated", handler);
  }, [fetchData]);

  // =========================================================================
  // Bot Selection
  // =========================================================================

  const selectBot = useCallback(
    (id: string) => {
      router.push(`/studio/${id}`);
    },
    [router]
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("studio-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  // =========================================================================
  // Context value
  // =========================================================================

  const studioCtx: StudioContextValue = {
    gateways,
    plugins,
    selectedBotId: botId,
    selectBot,
    refresh: fetchData,
    isLoading,
    sidebarCollapsed,
    toggleSidebar,
  };

  return (
    <StudioContext.Provider value={studioCtx}>
      <div className="h-screen flex flex-col overflow-hidden bg-background relative">
        {/* Top Bar */}
        <StudioTopBar />

        {/* Body: Sidebar + Main */}
        <div className="flex flex-1 overflow-hidden">
          {/* Bot Sidebar */}
          <BotSidebar />

          {/* Main Studio Area */}
          <main
            className="flex-1 overflow-auto transition-[margin] duration-300 ease-in-out"
            style={{
              marginRight: "var(--cursor-bar-right, 0px)",
              marginLeft: "var(--cursor-bar-left, 0px)",
            }}
          >
            {children}
          </main>
        </div>

        {/* CursorStudioBar — persistent across all studio pages */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          <CursorStudioBar />
        </div>
      </div>
    </StudioContext.Provider>
  );
}

// =============================================================================
// Export
// =============================================================================

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <CursorProvider>
        <StudioBarProvider>
          <StudioLayoutContent>{children}</StudioLayoutContent>
        </StudioBarProvider>
        {/* CursorPanel hidden in studio — CursorStudioBar replaces it */}
        <Cursor />
      </CursorProvider>
    </ProtectedRoute>
  );
}
