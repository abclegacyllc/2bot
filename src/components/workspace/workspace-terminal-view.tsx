"use client";

/**
 * Workspace Terminal View
 *
 * Embeds an xterm.js terminal that connects to the workspace container
 * via WebSocket. Provides a full PTY experience in the browser.
 *
 * @module components/workspace/workspace-terminal-view
 */

import { Button } from "@/components/ui/button";
import { useWorkspaceTerminal } from "@/hooks/use-workspace-terminal";
import { Maximize2, Minimize2, Terminal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================
// Props
// ===========================================

interface WorkspaceTerminalViewProps {
  containerId: string | null;
  /** Whether the terminal panel is visible */
  visible: boolean;
  onClose: () => void;
}

// ===========================================
// Component
// ===========================================

export function WorkspaceTerminalView({
  containerId,
  visible,
  onClose,
}: WorkspaceTerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleData = useCallback((data: string) => {
    xtermRef.current?.write(data);
  }, []);

  const handleExit = useCallback(() => {
    xtermRef.current?.writeln("\r\n\x1b[31m[Terminal session ended]\x1b[0m");
  }, []);

  const { connected, error, connect, disconnect, sendInput, resize } =
    useWorkspaceTerminal({
      containerId,
      onData: handleData,
      onExit: handleExit,
      autoConnect: false,
    });

  // Initialize xterm
  useEffect(() => {
    if (!visible || !terminalRef.current || xtermRef.current) return;

    let disposed = false;

    const initTerminal = async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      if (disposed) return;

      const term = new Terminal({
        cols: 80,
        rows: 24,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: "#1a1a2e",
          foreground: "#e0e0e0",
          cursor: "#a855f7",
          selectionBackground: "#7c3aed40",
        },
        allowTransparency: true,
        convertEol: true,
        scrollback: 1000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      if (terminalRef.current) {
        term.open(terminalRef.current);
        fitAddon.fit();
      }

      // Forward user input to WebSocket
      term.onData((data) => {
        sendInput(data);
      });

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect WebSocket after terminal is ready
      connect();
    };

    initTerminal();

    return () => {
      disposed = true;
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      disconnect();
    };
  }, [visible, connect, disconnect, sendInput]);

  // Handle resize
  useEffect(() => {
    if (!visible) return;

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        resize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    window.addEventListener("resize", handleResize);
    // Also fit when expanded changes
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, [visible, expanded, resize]);

  if (!visible) return null;

  return (
    <div
      className={`border-t border-border bg-[#1a1a2e] flex flex-col flex-shrink-0 ${
        expanded ? "fixed inset-0 z-50" : "h-64"
      }`}
    >
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card/80 border-b border-border">
        <div className="flex items-center gap-2 text-sm">
          <Terminal className="h-4 w-4 text-purple-400" />
          <span className="text-muted-foreground">Terminal</span>
          {connected ? (
            <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500" title="Disconnected" />
          )}
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {Boolean(!connected && containerId) && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={connect}>
              Reconnect
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            title="Close terminal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <div ref={terminalRef} className="flex-1 min-h-0 p-1" />
    </div>
  );
}
