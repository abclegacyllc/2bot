"use client";

/**
 * Workspace Log Viewer
 *
 * Displays container logs with filtering by level and source.
 * Auto-scrolls to bottom for new entries.
 *
 * @module components/workspace/workspace-log-viewer
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { WorkspaceLogEntry, WorkspaceLogQuery } from "@/shared/types/workspace";
import { AlertTriangle, Download, FileText, Info, RefreshCw, Search, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================
// Props
// ===========================================

interface WorkspaceLogViewerProps {
  logs: WorkspaceLogEntry[];
  onFetch: (query?: WorkspaceLogQuery) => Promise<void>;
  loading?: boolean;
}

// ===========================================
// Log Level Badge
// ===========================================

const LEVEL_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  debug: { icon: FileText, className: "text-gray-400" },
  info: { icon: Info, className: "text-blue-400" },
  warn: { icon: AlertTriangle, className: "text-yellow-400" },
  error: { icon: XCircle, className: "text-red-400" },
  fatal: { icon: XCircle, className: "text-red-600 font-bold" },
};

const SOURCE_COLORS: Record<string, string> = {
  system: "text-gray-400",
  bridge: "text-purple-400",
  plugin: "text-green-400",
  terminal: "text-blue-400",
  git: "text-orange-400",
  npm: "text-red-400",
};

// ===========================================
// Log Entry Row
// ===========================================

function LogEntryRow({ entry }: { entry: WorkspaceLogEntry }) {
  const levelConfig = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.info;
  const resolvedLevel = levelConfig ?? { icon: Info, className: "text-blue-400" };
  const LevelIcon = resolvedLevel.icon;
  const sourceColor = SOURCE_COLORS[entry.source] || "text-muted-foreground";
  const time = new Date(entry.createdAt || (entry as unknown as Record<string, unknown>).timestamp as string).toLocaleTimeString();

  const ROW_BG: Record<string, string> = {
    error: "bg-red-950/20",
    fatal: "bg-red-950/30",
    warn: "bg-yellow-950/15",
  };
  const rowBg = ROW_BG[entry.level] ?? "";

  return (
    <div className={`flex items-start gap-2 py-0.5 px-2 hover:bg-muted/30 text-xs font-mono ${rowBg}`}>
      <span className="text-muted-foreground whitespace-nowrap">{time}</span>
      <LevelIcon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${resolvedLevel.className}`} />
      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${sourceColor} border-current/30`}>
        {entry.source}
      </Badge>
      <span className={`flex-1 break-all ${resolvedLevel.className}`}>
        {entry.message}
      </span>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkspaceLogViewer({ logs, onFetch, loading }: WorkspaceLogViewerProps) {
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const initialFetchDone = useRef(false);

  const doFetch = useCallback(() => {
    const query: WorkspaceLogQuery = {
      limit: 200,
      order: "desc",
    };
    if (levelFilter !== "all") query.level = levelFilter;
    if (sourceFilter !== "all") query.source = sourceFilter;
    if (searchText) query.search = searchText;
    onFetch(query);
  }, [levelFilter, sourceFilter, searchText, onFetch]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial fetch (once)
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      onFetch({ limit: 200, order: "desc" });
    }
  }, [onFetch]);

  // Re-fetch when dropdown filters change (but NOT for search text)
  useEffect(() => {
    if (!initialFetchDone.current) return;
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelFilter, sourceFilter]);

  // The logs prop is already server-filtered; alias for export button
  const filteredLogs = logs;

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="bridge">Bridge</SelectItem>
            <SelectItem value="plugin">Plugin</SelectItem>
            <SelectItem value="terminal">Terminal</SelectItem>
            <SelectItem value="git">Git</SelectItem>
            <SelectItem value="npm">NPM</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search logs..."
            className="h-7 text-xs pl-7"
            onKeyDown={(e) => e.key === "Enter" && doFetch()}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            const text = filteredLogs
              .map((e) => {
                const t = new Date(e.createdAt || (e as unknown as Record<string, unknown>).timestamp as string).toISOString();
                return `${t} [${e.level.toUpperCase()}] [${e.source}] ${e.message}`;
              })
              .join("\n");
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `workspace-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          disabled={filteredLogs.length === 0}
          title="Export logs"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={doFetch}
          disabled={loading}
          title="Refresh logs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Log entries */}
      <ScrollArea className="flex-1" viewportRef={scrollRef}>
        <div className="py-1">
          {logs.length === 0 ? (
            <p className="px-3 py-8 text-xs text-muted-foreground text-center">
              No logs available
            </p>
          ) : (
            logs.map((entry) => <LogEntryRow key={entry.id} entry={entry} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
