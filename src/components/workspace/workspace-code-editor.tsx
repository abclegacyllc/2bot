"use client";

/**
 * Workspace Code Editor
 *
 * Monaco-based code editor for editing files inside workspace containers.
 * Supports syntax highlighting, auto-save, and language detection.
 *
 * @module components/workspace/workspace-code-editor
 */

import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

// Dynamically import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading editor...
    </div>
  ),
});

// ===========================================
// Language Detection
// ===========================================

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    css: "css",
    scss: "scss",
    py: "python",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    xml: "xml",
    toml: "ini",
    env: "ini",
    dockerfile: "dockerfile",
  };
  // Check for Dockerfile without extension
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  return langMap[ext || ""] || "plaintext";
}

// ===========================================
// Props
// ===========================================

interface WorkspaceCodeEditorProps {
  /** File path being edited */
  filePath: string | null;
  /** File content */
  content: string;
  /** Save callback */
  onSave: (path: string, content: string) => Promise<void>;
  /** Called when dirty state changes (for tab indicators) */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called on every content change (for tab content cache) */
  onContentChange?: (content: string) => void;
  /** Whether content has been modified */
  readOnly?: boolean;
}

// ===========================================
// Component
// ===========================================

export function WorkspaceCodeEditor({
  filePath,
  content,
  onSave,
  onDirtyChange,
  onContentChange,
  readOnly = false,
}: WorkspaceCodeEditorProps) {
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);
  const editorValueRef = useRef(content);
  const { resolvedTheme } = useTheme();

  // Reset modified state when switching files (tabs)
  const prevFilePathRef = useRef(filePath);
  if (filePath !== prevFilePathRef.current) {
    prevFilePathRef.current = filePath;
    editorValueRef.current = content;
    setModified(false);
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    editorValueRef.current = value ?? "";
    setModified(true);
    onDirtyChange?.(true);
    onContentChange?.(value ?? "");
  }, [onDirtyChange, onContentChange]);

  const handleSave = useCallback(async () => {
    if (!filePath || readOnly) return;
    setSaving(true);
    try {
      await onSave(filePath, editorValueRef.current);
      setModified(false);
      onDirtyChange?.(false);
    } finally {
      setSaving(false);
    }
  }, [filePath, onSave, readOnly, onDirtyChange]);

  // Keyboard shortcut (Ctrl+S)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a file from the explorer to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground truncate max-w-[300px]">{filePath}</span>
          {modified ? (
            <span className="text-yellow-400 text-xs">(modified)</span>
          ) : null}
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSave}
            disabled={saving || !modified}
            className="h-7 text-xs"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={getLanguage(filePath)}
          value={content}
          theme={resolvedTheme === "light" ? "light" : "vs-dark"}
          onChange={handleEditorChange}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
