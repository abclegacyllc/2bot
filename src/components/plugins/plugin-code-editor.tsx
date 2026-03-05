"use client";

/**
 * Plugin Code Editor Component (LEGACY — Create Flow Only)
 *
 * Monaco-based code editor used ONLY in the plugin creation page for
 * writing initial plugin code. All subsequent editing happens in the
 * workspace IDE (Phase 5+).
 *
 * This component is retained for the "Write code from scratch" flow
 * in the create page and for AI choreography automation.
 *
 * @deprecated For editing — use workspace IDE instead. Retained for create flow.
 * @module components/plugins/plugin-code-editor
 */

import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";

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

interface PluginCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  /** Called when user presses Ctrl+S / Cmd+S */
  onSave?: () => void;
}

export function PluginCodeEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "400px",
  onSave,
}: PluginCodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<unknown>(null);

  const lineCount = value.split("\n").length;

  const handleEditorChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? "");
    },
    [onChange]
  );

  const handleEditorMount = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any) => {
      editorRef.current = editor;

      // Register Ctrl+S / Cmd+S shortcut
      if (onSave) {
        editor.addCommand(
          // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyS
          2048 | 49, // CtrlCmd = 2048, KeyS = 49
          () => onSave()
        );
      }
    },
    [onSave]
  );

  return (
    <div
      className="border border-border rounded-lg overflow-hidden bg-[#1a1a2e]"
      data-ai-target="plugin-code-editor"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">JavaScript</span>
        <span className="text-xs text-muted-foreground">
          {lineCount} line{lineCount !== 1 ? "s" : ""} •{" "}
          {(value.length / 1024).toFixed(1)} KB
        </span>
      </div>

      {/* Monaco Editor */}
      <div style={{ minHeight }}>
        <MonacoEditor
          height={minHeight}
          language="javascript"
          value={value}
          theme={resolvedTheme === "light" ? "light" : "vs-dark"}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
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
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            folding: true,
            foldingHighlight: true,
            matchBrackets: "always",
          }}
        />
      </div>
    </div>
  );
}
