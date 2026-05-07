"use client";

import React, { useState } from "react";

/**
 * Cursor Shared Message Block Components
 *
 * Shared UI components for rendering message blocks in both CursorPanel
 * and CursorStudioBar. Each component accepts a `compact` prop to switch
 * between Panel (larger) and StudioBar (smaller) sizing.
 *
 * @module components/cursor/cursor-shared-blocks
 */

import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, History, Loader2, RotateCcw, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Checkpoint } from "./cursor-checkpoints";
import type { ConversationSnapshot, SerializedMessage } from "./cursor-conversation-log";

import { sendTerminalApproval } from "./cursor-helpers";
import type { CursorChatMessage, MessageBlock } from "./types/cursor-chat.types";

// =============================================================================
// Size Variants
// =============================================================================

interface BlockSizes {
  dotSize: string;
  dotMt: string;
  timelineW: string;
  minLine: string;
  fontSize: string;
  termFontSize: string;
  termMaxH: string;
  termOutputLimit: number;
  cmdTruncate: number;
  svgSize: string;
  padding: string;
}

const PANEL_SIZES: BlockSizes = {
  dotSize: "w-[7px] h-[7px]",
  dotMt: "mt-[5px]",
  timelineW: "w-5",
  minLine: "min-h-[8px]",
  fontSize: "text-[12px]",
  termFontSize: "text-[11px]",
  termMaxH: "max-h-40",
  termOutputLimit: 2000,
  cmdTruncate: 120,
  svgSize: "h-3 w-3",
  padding: "px-2.5 py-1.5",
};

const COMPACT_SIZES: BlockSizes = {
  dotSize: "w-1.5 h-1.5",
  dotMt: "mt-[5px]",
  timelineW: "w-4",
  minLine: "min-h-[6px]",
  fontSize: "text-[11px]",
  termFontSize: "text-[10px]",
  termMaxH: "max-h-24",
  termOutputLimit: 1000,
  cmdTruncate: 80,
  svgSize: "h-2.5 w-2.5",
  padding: "px-2 py-1",
};

function getSizes(compact?: boolean): BlockSizes {
  return compact ? COMPACT_SIZES : PANEL_SIZES;
}

// =============================================================================
// Tool Block
// =============================================================================

interface ToolBlockProps {
  block: Extract<MessageBlock, { kind: "tool" }>;
  isLast: boolean;
  compact?: boolean;
}

/** Split a description like "📖 Read `index.js`, 42 lines" into [prefix, filename, suffix] */
function splitDescriptionAtFilename(desc: string): [string, string, string] | null {
  const m = desc.match(/^(.*?)`([^`]+)`(.*)$/);
  if (!m) return null;
  return [m[1]!, m[2]!, m[3]!];
}

export function ToolBlock({ block, isLast, compact }: ToolBlockProps) {
  const [open, setOpen] = React.useState(false);
  const s = getSizes(compact);
  const hasPreview = !!(block.snippet || block.patch);
  const isDone = block.status === "done";
  const isRunning = block.status === "running";
  const isError = block.status === "error";

  const textClass = cn(
    "break-all py-0.5 leading-snug",
    isDone && "text-muted-foreground/60",
    isRunning && "text-foreground font-medium",
    isError && "text-destructive",
  );

  const parts = hasPreview ? splitDescriptionAtFilename(block.description) : null;

  return (
    <div className={cn("flex items-start relative", s.fontSize)}>
      <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
        <div className={cn(
          "rounded-full shrink-0 border",
          s.dotSize,
          s.dotMt,
          isRunning ? "border-primary bg-primary/30" :
          isError ? "border-destructive bg-destructive/30" :
          "border-muted-foreground/40 bg-muted-foreground/20",
        )} />
        {!isLast && <div className={cn("w-px flex-1 bg-border/40", s.minLine)} />}
      </div>

      <div className="flex-1 min-w-0">
        {parts ? (
          <span className={textClass}>
            {parts[0]}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              title={block.fullPath || parts[1]}
              className={cn(
                "font-mono rounded px-0.5 transition-colors",
                "underline underline-offset-2 decoration-dotted",
                open
                  ? "bg-primary/15 text-primary"
                  : "text-primary/80 hover:text-primary hover:bg-primary/10",
              )}
            >
              {parts[1]}
            </button>
            {parts[2]}
          </span>
        ) : (
          <span className={textClass}>{block.description}</span>
        )}

        {open && block.snippet && (
          <pre className={cn(
            "font-mono mt-1 rounded border border-border/30 bg-muted/20 overflow-auto whitespace-pre break-normal leading-relaxed",
            compact ? "text-[9px] px-2 py-1.5 max-h-40" : "text-[10px] px-2.5 py-2 max-h-52",
          )}>
            {block.snippet.slice(0, 3000)}
          </pre>
        )}

        {open && block.patch && (
          <div className={cn(
            "font-mono mt-1 rounded border border-border/30 overflow-auto leading-relaxed",
            compact ? "text-[9px] max-h-40" : "text-[10px] max-h-52",
          )}>
            {block.patch.split("\n").map((line, i) => (
              <div
                key={i}
                className={cn(
                  "px-2 py-px whitespace-pre break-normal",
                  line.startsWith("+") ? "bg-green-500/10 text-green-400" :
                  line.startsWith("-") ? "bg-red-500/10 text-red-400" :
                  line.startsWith("@@") ? "bg-blue-500/10 text-blue-400 font-medium" :
                  "text-muted-foreground/50",
                )}
              >
                {line || "\u00a0"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Terminal Block
// =============================================================================

interface TerminalBlockProps {
  block: Extract<MessageBlock, { kind: "terminal" }>;
  isLast: boolean;
  compact?: boolean;
}

export function TerminalBlock({ block, isLast, compact }: TerminalBlockProps) {
  const s = getSizes(compact);
  const isError = block.exitCode !== 0;
  const outputLines = block.output ? block.output.split("\n") : [];
  const previewLines = compact ? 6 : 10;
  const hasMoreOutput = outputLines.length > previewLines;

  return (
    <div className="flex items-start relative min-w-0">
      <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
        <div className={cn(
          "rounded-full shrink-0 border",
          s.dotSize,
          compact ? "mt-[7px]" : "mt-[9px]",
          isError
            ? "border-destructive bg-destructive/30"
            : "border-green-500 bg-green-500/30",
        )} />
        {!isLast && <div className={cn("w-px flex-1 bg-border/40", s.minLine)} />}
      </div>
      <div className={cn(
        "flex-1 min-w-0 my-0.5 rounded-lg border border-border/40 bg-black/5 dark:bg-white/5 overflow-hidden",
        s.fontSize,
      )}>
        {/* Command header — always visible */}
        <div className={cn(
          "flex items-center gap-1.5 min-w-0",
          s.padding,
        )}>
          <span className={s.termFontSize}>{isError ? "❌" : "✅"}</span>
          <span className={cn("text-muted-foreground/70 shrink-0", compact ? "text-[10px]" : "text-[11px]")}>
            {isError ? "Ran" : "Ran"}
          </span>
          <code className={cn("font-mono text-foreground/80 truncate min-w-0 flex-1", compact ? "text-[10px]" : "text-[11px]")}>
            {block.command.slice(0, s.cmdTruncate)}{block.command.length > s.cmdTruncate ? "…" : ""}
          </code>
        </div>
        {/* Full command (if long) */}
        {block.command.length > 60 && (
          <pre className={cn(
            "font-mono text-foreground/60 whitespace-pre-wrap break-all border-t border-border/10 mx-2 mt-0",
            compact ? "text-[9px] px-1.5 py-1" : "text-[10px] px-2 py-1.5",
          )}>
            {block.command.slice(0, 300)}{block.command.length > 300 ? "…" : ""}
          </pre>
        )}
        {/* Output — always show preview, expand for full */}
        {block.output ? (
          hasMoreOutput ? (
            <details className="group/termout" open={isError}>
              <summary className={cn(
                "flex items-center gap-1 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden border-t border-border/20 hover:bg-muted/10 transition-colors",
                compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
                "text-muted-foreground/50",
              )}>
                <svg className="h-2.5 w-2.5 shrink-0 transition-transform group-open/termout:rotate-90" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4" /></svg>
                <span>{outputLines.length} lines of output</span>
              </summary>
              <pre className={cn(
                "font-mono leading-relaxed text-foreground/80 overflow-y-auto whitespace-pre-wrap break-all",
                s.termFontSize,
                s.termMaxH,
                compact ? "px-2 py-1.5" : "px-2.5 py-2 bg-black/5 dark:bg-black/20",
              )}>
                {block.output.slice(0, s.termOutputLimit)}{block.output.length > s.termOutputLimit ? "\n…" : ""}
              </pre>
            </details>
          ) : (
            <pre className={cn(
              "font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all border-t border-border/20",
              s.termFontSize,
              compact ? "px-2 py-1.5" : "px-2.5 py-2 bg-black/5 dark:bg-black/20",
            )}>
              {block.output}
            </pre>
          )
        ) : (
          <div className={cn(
            "border-t border-border/20 flex items-center gap-1.5",
            s.termFontSize,
            compact ? "px-2 py-1" : "px-2.5 py-1.5",
            isError ? "text-destructive/70" : "text-emerald-600/70 dark:text-emerald-400/70",
          )}>
            <span>{isError ? "✗" : "✓"}</span>
            <span className="italic">
              {isError ? `Exited with code ${block.exitCode}` : "Completed (no output)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Markdown Content
// =============================================================================

// Context to detect <code> rendered inside a <pre> block vs inline
const CodeInPre = React.createContext(false);

/** Extracts plain text from React children for clipboard copy. */
function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

/** Copy-to-clipboard button shown on hover for code blocks. */
function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const text = getText();
        if (!text) return;
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/40 bg-background/80 text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground hover:bg-muted group-hover/pre:opacity-100 focus:opacity-100"
      title={copied ? "Copied" : "Copy code"}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function MdPre({ children }: React.ComponentProps<"pre">) {
  // Snapshot children once for the copy button so we can recover the raw text
  // even after react-markdown wraps it in a <code> element.
  const text = React.useMemo(() => extractText(children), [children]);
  return (
    <CodeInPre.Provider value={true}>
      <div className="group/pre relative my-2">
        <pre className="bg-muted/50 dark:bg-black/30 border border-border/40 rounded-md p-2.5 pr-9 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[0.85em] leading-relaxed">
          {children}
        </pre>
        <CopyButton getText={() => text} />
      </div>
    </CodeInPre.Provider>
  );
}

function MdCode({ children, className }: React.ComponentProps<"code">) {
  const inPre = React.useContext(CodeInPre);
  if (inPre) {
    return <code className={className}>{children}</code>;
  }
  return (
    <code className="font-mono text-[0.85em] bg-muted/60 px-1 py-0.5 rounded border border-border/30">
      {children}
    </code>
  );
}

const MD_COMPONENTS: React.ComponentProps<typeof Markdown>["components"] = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-muted-foreground/70 line-through">{children}</del>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 underline-offset-2 decoration-blue-400/40 hover:underline hover:text-blue-300 break-words"
    >
      {children}
    </a>
  ),
  // ── Lists: hanging-indent (list-outside) so wrapped lines align under text,
  //    not under the marker. Nested lists get proper left padding & spacing.
  ul: ({ children, className }) => {
    const isTaskList = className === "contains-task-list";
    return (
      <ul className={cn(
        "my-1.5 space-y-1 marker:text-muted-foreground/60",
        isTaskList ? "list-none pl-1" : "list-disc list-outside pl-5",
        "[&_ul]:mt-1 [&_ul]:mb-0 [&_ol]:mt-1 [&_ol]:mb-0",
      )}>{children}</ul>
    );
  },
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 my-1.5 space-y-1 marker:text-muted-foreground/60 marker:font-medium [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0">{children}</ol>
  ),
  li: ({ children, className }) => {
    const isTask = className === "task-list-item";
    return <li className={cn("leading-relaxed", isTask && "flex items-start gap-1.5 [&>input]:mt-1 [&>input]:cursor-default")}>{children}</li>;
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-500/40 bg-blue-500/5 pl-3 pr-2 py-1 my-2 text-foreground/80 italic rounded-r">{children}</blockquote>
  ),
  // ── Headings: real visual hierarchy (size / weight / spacing)
  h1: ({ children }) => (
    <h1 className="text-[1.25em] font-bold mt-3 mb-1.5 first:mt-0 pb-1 border-b border-border/40 leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[1.15em] font-bold mt-3 mb-1.5 first:mt-0 leading-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[1.05em] font-semibold mt-2 mb-1 first:mt-0 leading-snug">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="font-semibold mt-2 mb-0.5 first:mt-0">{children}</h4>,
  h5: ({ children }) => <p className="font-medium mt-1.5 mb-0.5">{children}</p>,
  h6: ({ children }) => <p className="font-medium mt-1.5 mb-0.5 text-muted-foreground">{children}</p>,
  hr: () => <hr className="my-3 border-0 border-t border-border/50" />,
  // ── Tables (GFM)
  table: ({ children }) => (
    <div className="my-2 -mx-1 overflow-x-auto">
      <table className="w-full text-[0.9em] border-collapse border border-border/50 rounded-md overflow-hidden">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&>tr:nth-child(even)]:bg-muted/20">{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/40 last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border/40 last:border-r-0 px-2 py-1.5 text-left font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border/40 last:border-r-0 px-2 py-1.5 align-top">{children}</td>
  ),
  pre: MdPre,
  code: MdCode,
};

const REMARK_PLUGINS = [remarkGfm];

export function MarkdownContent({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>{text}</Markdown>
    </div>
  );
}

// =============================================================================
// Text Block
// =============================================================================

interface TextBlockProps {
  text: string;
}

export function TextBlock({ text }: TextBlockProps) {
  return <MarkdownContent text={text} className="text-sm leading-relaxed py-1" />;
}

// =============================================================================
// Terminal Confirm Dialog
// =============================================================================

interface TerminalConfirmProps {
  sessionId: string;
  command: string;
  onDismiss: () => void;
  compact?: boolean;
}

export function TerminalConfirmDialog({ sessionId, command, onDismiss, compact }: TerminalConfirmProps) {
  return (
    <div className={cn(
      compact
        ? "mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200 pointer-events-auto"
        : "mx-3 mt-1 mb-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3 text-xs flex-shrink-0 animate-in fade-in slide-in-from-bottom-2",
    )}>
      <div className={cn(
        compact && "rounded-xl border-2 border-amber-500/50 bg-amber-500/10 backdrop-blur-md shadow-xl overflow-hidden p-3",
      )}>
        <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <span className="text-amber-500">▶</span> Run this command?
        </p>
        <pre className="mb-2 overflow-x-auto rounded bg-black/10 dark:bg-white/5 px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {command.slice(0, 300)}
        </pre>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onDismiss();
              sendTerminalApproval(sessionId, true);
            }}
            className="rounded px-3 py-1 text-white text-[11px] font-medium"
            style={{ background: "var(--cursor-primary, #3b82f6)" }}
          >
            Allow
          </button>
          <button
            onClick={() => {
              onDismiss();
              sendTerminalApproval(sessionId, false);
            }}
            className="rounded px-3 py-1 text-muted-foreground border text-[11px]"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Inline Confirm Block (Allow/Skip inside chat message)
// =============================================================================

interface InlineConfirmBlockProps {
  block: Extract<MessageBlock, { kind: "confirm" }>;
  onResolve?: (sessionId: string, approved: boolean) => void;
  compact?: boolean;
}

function InlineConfirmBlock({ block, onResolve, compact }: InlineConfirmBlockProps) {
  const s = getSizes(compact);

  const isDeleteAction = block.command.startsWith("Delete file:");

  if (block.resolved) {
    return (
      <div className="flex items-start relative">
        <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
          <div className={cn(
            "rounded-full shrink-0 border",
            s.dotSize,
            compact ? "mt-[7px]" : "mt-[9px]",
            block.resolved === "allowed"
              ? "border-green-500 bg-green-500/30"
              : "border-muted-foreground/40 bg-muted-foreground/20",
          )} />
        </div>
        <div className={cn("flex items-center gap-1.5 py-1", s.fontSize)}>
          <span>{block.resolved === "allowed" ? (isDeleteAction ? "🗑️" : "✅") : "⏭️"}</span>
          <span className="text-muted-foreground">
            {block.resolved === "allowed"
              ? (isDeleteAction ? "File deleted" : "Command allowed")
              : (isDeleteAction ? "File deletion skipped" : "Command skipped by user")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "my-1.5 rounded-lg border-2 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200",
      isDeleteAction
        ? "border-red-500/50 bg-red-500/10"
        : "border-amber-500/50 bg-amber-500/10",
    )}>
      <p className={cn("font-semibold text-foreground mb-2 flex items-center gap-1.5", compact ? "text-xs" : "text-sm")}>
        <span className={isDeleteAction ? "text-red-500" : "text-amber-500"}>
          {isDeleteAction ? "🗑️" : "▶"}
        </span>
        {isDeleteAction ? "Delete this file?" : "Run this command?"}
      </p>
      <pre className="mb-2 overflow-x-auto rounded bg-black/10 dark:bg-white/5 px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {isDeleteAction ? block.command.replace("Delete file: ", "") : block.command.slice(0, 300)}
      </pre>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            onResolve?.(block.sessionId, true);
            sendTerminalApproval(block.sessionId, true);
          }}
          className={cn(
            "rounded px-3 py-1 text-white text-[11px] font-medium transition-colors",
            isDeleteAction
              ? "bg-red-600 hover:bg-red-500"
              : "bg-emerald-600 hover:bg-emerald-500",
          )}
        >
          {isDeleteAction ? "Delete" : "Allow"}
        </button>
        <button
          onClick={() => {
            onResolve?.(block.sessionId, false);
            sendTerminalApproval(block.sessionId, false);
          }}
          className="rounded px-3 py-1 text-muted-foreground border text-[11px] hover:bg-muted/20 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Inline Ask Block — renders an ask_user question + option buttons inline
// in the chat timeline (so the prompt isn't stuck at the bottom of the panel).
// =============================================================================

interface InlineAskBlockProps {
  block: Extract<MessageBlock, { kind: "ask" }>;
  /** Called when the user picks an option. Parent submits the answer to the SSE session. */
  onSelect?: (sessionId: string, value: string, label: string) => void;
  compact?: boolean;
}

function InlineAskBlock({ block, onSelect, compact }: InlineAskBlockProps) {
  const s = getSizes(compact);

  // Already answered → render a compact "answered" badge.
  if (block.resolved) {
    return (
      <div className="flex items-start relative">
        <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
          <div className={cn(
            "rounded-full shrink-0 border border-green-500 bg-green-500/30",
            s.dotSize,
            compact ? "mt-[7px]" : "mt-[9px]",
          )} />
        </div>
        <div className={cn("flex items-center gap-1.5 py-1", s.fontSize)}>
          <span>✅</span>
          <span className="text-muted-foreground">
            Answered: <span className="text-foreground/80 font-medium">{block.resolved.label}</span>
          </span>
        </div>
      </div>
    );
  }

  // Sensitive (text input) — render guidance to use the bottom input field.
  if (block.sensitive) {
    return (
      <div className={cn(
        "my-1.5 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 p-3",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}>
        <p className={cn("font-semibold text-foreground mb-1 flex items-center gap-1.5", compact ? "text-xs" : "text-sm")}>
          <span className="text-amber-500">🔒</span> Sensitive answer needed
        </p>
        <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
          Type your answer in the input below — it will be masked.
        </p>
      </div>
    );
  }

  const options = block.options?.filter((o) => o.value !== "__freetext__") ?? [];

  return (
    <div className="flex items-start relative">
      {/* Timeline indicator — matches confirm/tool blocks so the ask reads as part of the chain */}
      <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
        <div className={cn(
          "rounded-full shrink-0 border border-amber-500/70 bg-amber-500/30 animate-pulse",
          s.dotSize,
          compact ? "mt-[14px]" : "mt-[18px]",
        )} />
      </div>
      <div className={cn(
        "flex-1 my-1.5 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 p-3",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}>
        <p className={cn("font-semibold text-foreground mb-2 flex items-center gap-1.5", compact ? "text-xs" : "text-sm")}>
          <span className="text-amber-500">❓</span> The agent is waiting on your answer
        </p>
        {block.question ? (
          <div className={cn("mb-2 text-foreground/80", compact ? "text-xs" : "text-sm")}>
            <MarkdownContent text={block.question} />
          </div>
        ) : null}
        {options.length > 0 ? (
          <div className="flex flex-col gap-1">
            {options.map((opt, i) => (
              <button
                key={`${opt.value}-${i}`}
                onClick={() => onSelect?.(block.sessionId, opt.value, opt.label)}
                className={cn(
                  "group flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-left transition-all",
                  compact ? "text-xs" : "text-sm",
                  "bg-background/60 hover:bg-primary/10 hover:text-primary text-foreground/90 border border-border/40",
                )}
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                  "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
                )}>
                  {i + 1}
                </span>
                <span className="font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            Type your answer in the input below.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// BuildSpec Block (Wave 2)
// =============================================================================

type BuildSpecBlockData = Extract<MessageBlock, { kind: "buildspec" }>;

interface InlineBuildSpecBlockProps {
  block: BuildSpecBlockData;
  onApply?: (block: BuildSpecBlockData) => void;
  compact?: boolean;
}

interface BuildSpecLike {
  project?: { name?: unknown; slug?: unknown; kind?: unknown; description?: unknown };
  gateways?: unknown[];
  plugins?: unknown[];
  workflows?: unknown[];
  resources?: unknown[];
  smokeTests?: unknown[];
}

interface ResourceDetailItem {
  /** Stable react key */
  key: string;
  /** Primary label shown to the user */
  label: string;
  /** Optional muted-foreground secondary line */
  meta?: string;
}

function describeBuildSpec(spec: unknown): {
  name: string;
  slug: string | null;
  kind: string | null;
  description: string | null;
  gateways: number;
  plugins: number;
  workflows: number;
  resources: number;
  smokeTests: number;
  details: {
    gateways: ResourceDetailItem[];
    workflows: ResourceDetailItem[];
    plugins: ResourceDetailItem[];
    resources: ResourceDetailItem[];
    smokeTests: ResourceDetailItem[];
  };
} {
  const s = (typeof spec === "object" && spec !== null ? spec : {}) as BuildSpecLike;
  const project = s.project ?? {};

  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const obj = (v: unknown): Record<string, unknown> =>
    (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;

  const gateways = Array.isArray(s.gateways) ? s.gateways : [];
  const workflows = Array.isArray(s.workflows) ? s.workflows : [];
  const plugins = Array.isArray(s.plugins) ? s.plugins : [];
  const resources = Array.isArray(s.resources) ? s.resources : [];
  const smokeTests = Array.isArray(s.smokeTests) ? s.smokeTests : [];

  return {
    name: typeof project.name === "string" ? project.name : "Untitled project",
    slug: typeof project.slug === "string" ? project.slug : null,
    kind: typeof project.kind === "string" ? project.kind : null,
    description: typeof project.description === "string" ? project.description : null,
    gateways: gateways.length,
    plugins: plugins.length,
    workflows: workflows.length,
    resources: resources.length,
    smokeTests: smokeTests.length,
    details: {
      gateways: gateways.map((g, i) => {
        const o = obj(g);
        const ref = str(o.ref) ?? `gw-${i}`;
        if (str(o.source) === "existing") {
          return { key: ref, label: str(o.id) ?? "(unknown id)", meta: "existing reference" };
        }
        return { key: ref, label: str(o.name) ?? ref, meta: str(o.type) };
      }),
      workflows: workflows.map((w, i) => {
        const o = obj(w);
        const ref = str(o.ref) ?? `wf-${i}`;
        const slug = str(o.slug);
        const trigger = str(o.triggerType);
        const meta = [slug ? `/${slug}` : null, trigger].filter(Boolean).join(" · ") || undefined;
        return { key: ref, label: str(o.name) ?? ref, meta };
      }),
      plugins: plugins.map((p, i) => {
        const o = obj(p);
        const ref = str(o.ref) ?? `pl-${i}`;
        if (str(o.source) === "generated") {
          return { key: ref, label: str(o.name) ?? ref, meta: "generated" };
        }
        return { key: ref, label: str(o.pluginSlug) ?? ref, meta: "marketplace" };
      }),
      resources: resources.map((r, i) => {
        const o = obj(r);
        const ref = str(o.ref) ?? `res-${i}`;
        const kind = str(o.kind);
        let meta: string | undefined = kind;
        if (kind === "HTTP_ROUTE") {
          const route = obj(o.httpRoute);
          const m = str(route.method);
          const path = str(route.path);
          if (m && path) meta = `${m} ${path}`;
        } else if (kind === "SCHEDULE") {
          const sch = obj(o.schedule);
          meta = str(sch.cron) ? `cron: ${str(sch.cron)}` : kind;
        } else if (kind === "SECRET") {
          const sec = obj(o.secret);
          meta = str(sec.key) ? `key: ${str(sec.key)}` : kind;
        }
        return { key: ref, label: str(o.name) ?? ref, meta };
      }),
      smokeTests: smokeTests.map((t, i) => {
        const o = obj(t);
        const ref = str(o.ref) ?? `st-${i}`;
        const kind = str(o.kind) ?? "preflight";
        const wfRef = str(o.workflowRef);
        return { key: ref, label: kind, meta: wfRef ? `→ ${wfRef}` : undefined };
      }),
    },
  };
}

function ResourceGroup({
  title,
  items,
  compact,
}: {
  title: string;
  items: ResourceDetailItem[];
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p
        className={cn(
          "font-semibold uppercase tracking-wide text-muted-foreground",
          compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        {title} ({items.length})
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((it) => (
          <li
            key={it.key}
            className={cn(
              "flex items-baseline gap-2",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            <span className="text-green-500">+</span>
            <span className="font-medium text-foreground">{it.label}</span>
            {it.meta ? (
              <span className="text-muted-foreground font-mono text-[10px]">{it.meta}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InlineBuildSpecBlock({ block, onApply, compact }: InlineBuildSpecBlockProps) {
  const s = getSizes(compact);
  const info = describeBuildSpec(block.spec);
  const [showDetails, setShowDetails] = useState(false);
  const totalDetail =
    info.details.gateways.length +
    info.details.workflows.length +
    info.details.plugins.length +
    info.details.resources.length +
    info.details.smokeTests.length;
  const isApplying = block.status === "applying";
  const isApplied = block.status === "applied";
  const isError = block.status === "error";
  const isRolledBack = block.status === "rolled-back";
  const disabled = isApplying || isApplied;

  let headerLabel = "Proposed project";
  let headerColor = "text-purple-400";
  let dotColor = "border-purple-500/70 bg-purple-500/30";
  if (isApplied) {
    headerLabel = "Project applied";
    headerColor = "text-green-500";
    dotColor = "border-green-500/70 bg-green-500/30";
  } else if (isRolledBack) {
    headerLabel = "Apply rolled back";
    headerColor = "text-amber-500";
    dotColor = "border-amber-500/70 bg-amber-500/30";
  } else if (isError) {
    headerLabel = "Apply failed";
    headerColor = "text-red-500";
    dotColor = "border-red-500/70 bg-red-500/30";
  }

  return (
    <div className="flex items-start relative">
      <div className={cn("flex flex-col items-center shrink-0 mr-1.5", s.timelineW)}>
        <div
          className={cn(
            "rounded-full shrink-0 border",
            dotColor,
            isApplying ? "animate-pulse" : null,
            s.dotSize,
            compact ? "mt-[14px]" : "mt-[18px]",
          )}
        />
      </div>
      <div
        className={cn(
          "flex-1 my-1.5 rounded-lg border-2 p-3",
          "animate-in fade-in slide-in-from-bottom-2 duration-200",
          isApplied
            ? "border-green-500/40 bg-green-500/5"
            : isRolledBack
              ? "border-amber-500/40 bg-amber-500/5"
              : isError
                ? "border-red-500/40 bg-red-500/5"
                : "border-purple-500/40 bg-purple-500/5",
        )}
      >
        <p
          className={cn(
            "font-semibold mb-1 flex items-center gap-1.5",
            headerColor,
            compact ? "text-xs" : "text-sm",
          )}
        >
          <span>🛠️</span>
          {headerLabel}
        </p>
        <p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-base")}>
          {info.name}
          {info.slug ? (
            <span className="ml-2 text-muted-foreground font-mono text-xs">/{info.slug}</span>
          ) : null}
          {info.kind ? (
            <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {info.kind}
            </span>
          ) : null}
        </p>
        {block.summary ? (
          <div className={cn("mt-1 text-foreground/80", compact ? "text-xs" : "text-sm")}>
            <MarkdownContent text={block.summary} />
          </div>
        ) : info.description ? (
          <p className={cn("mt-1 text-foreground/80", compact ? "text-xs" : "text-sm")}>
            {info.description}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded border border-border/40 bg-background/60 px-1.5 py-0.5">
            {info.gateways} gateway{info.gateways === 1 ? "" : "s"}
          </span>
          <span className="rounded border border-border/40 bg-background/60 px-1.5 py-0.5">
            {info.plugins} plugin{info.plugins === 1 ? "" : "s"}
          </span>
          <span className="rounded border border-border/40 bg-background/60 px-1.5 py-0.5">
            {info.workflows} canvas{info.workflows === 1 ? "" : "es"}
          </span>
          {info.smokeTests > 0 ? (
            <span className="rounded border border-border/40 bg-background/60 px-1.5 py-0.5">
              {info.smokeTests} smoke test{info.smokeTests === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {totalDetail > 0 ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors",
                compact ? "text-[11px]" : "text-xs",
              )}
              aria-expanded={showDetails}
            >
              {showDetails ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showDetails ? "Hide details" : "View details"}
            </button>
            {showDetails ? (
              <div className="mt-1 rounded border border-border/40 bg-background/40 px-2 py-1.5">
                <ResourceGroup title="Gateways" items={info.details.gateways} compact={compact} />
                <ResourceGroup title="Workflows" items={info.details.workflows} compact={compact} />
                <ResourceGroup title="Plugins" items={info.details.plugins} compact={compact} />
                <ResourceGroup title="Resources" items={info.details.resources} compact={compact} />
                <ResourceGroup title="Smoke tests" items={info.details.smokeTests} compact={compact} />
              </div>
            ) : null}
          </div>
        ) : null}

        {block.error ? (
          <p className={cn("mt-2 text-red-500", compact ? "text-[11px]" : "text-xs")}>
            {block.error}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onApply?.(block)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition",
              compact ? "text-xs" : "text-sm",
              disabled
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500",
            )}
          >
            {isApplying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isApplied ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {isApplied
              ? "Applied"
              : isApplying
                ? "Applying…"
                : isRolledBack || isError
                  ? "Retry apply"
                  : "Apply"}
          </button>
          {!isApplied && !isApplying ? (
            <span className="text-[11px] text-muted-foreground">
              Creates the project, gateways, plugins, and canvases atomically.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Message Blocks Renderer
// =============================================================================

interface MessageBlocksProps {
  blocks: MessageBlock[];
  isThinking?: boolean;
  content?: string;
  hasTextBlock?: boolean;
  compact?: boolean;
  /** Callback to resolve an inline terminal confirm block */
  onResolveConfirm?: (sessionId: string, approved: boolean) => void;
  /** Callback when a user selects an option in an inline ask block */
  onResolveAsk?: (sessionId: string, value: string, label: string) => void;
  /** callback when the user clicks Apply on a BuildSpec block */
  onApplyBuildSpec?: (block: Extract<MessageBlock, { kind: "buildspec" }>) => void;
}

/**
 * Renders an array of message blocks (tool timeline, terminal, text, confirm).
 * Used by both CursorPanel and CursorStudioBar.
 */
export function MessageBlocks({ blocks, isThinking, content, hasTextBlock, compact, onResolveConfirm, onResolveAsk, onApplyBuildSpec }: MessageBlocksProps) {
  const s = getSizes(compact);
  return (
    <div className="space-y-0.5">
      {blocks.map((block, i) => {
        if (block.kind === "text") {
          return <TextBlock key={i} text={block.text} />;
        }
        if (block.kind === "tool") {
          const isLast = !blocks.slice(i + 1).some(b => b.kind === "tool" || b.kind === "terminal");
          return <ToolBlock key={block.id} block={block} isLast={isLast} compact={compact} />;
        }
        if (block.kind === "terminal") {
          const isLast = !blocks.slice(i + 1).some(b => b.kind === "tool" || b.kind === "terminal");
          return <TerminalBlock key={i} block={block} isLast={isLast} compact={compact} />;
        }
        if (block.kind === "confirm") {
          return (
            <InlineConfirmBlock
              key={`confirm-${block.sessionId}-${i}`}
              block={block}
              onResolve={onResolveConfirm}
              compact={compact}
            />
          );
        }
        if (block.kind === "ask") {
          return (
            <InlineAskBlock
              key={`ask-${block.sessionId}-${i}`}
              block={block}
              onSelect={onResolveAsk}
              compact={compact}
            />
          );
        }
        if (block.kind === "buildspec") {
          return (
            <InlineBuildSpecBlock
              key={`buildspec-${block.id}`}
              block={block}
              onApply={onApplyBuildSpec}
              compact={compact}
            />
          );
        }
        if (block.kind === "status") {
          return null;
        }
        return null;
      })}
      {isThinking && (
        <div className={cn("flex items-center", compact ? "pl-4 ml-1.5" : "pl-5 ml-1.5")}>
          <Loader2 className={cn("animate-spin text-muted-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </div>
      )}
      {!isThinking && content && !hasTextBlock && (
        <div className="mt-2 pt-2 border-t border-border/20 text-foreground/80">
          <MarkdownContent text={content} className="text-sm leading-relaxed" />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Message Actions (Retry / Edit)
// =============================================================================

interface MessageActionsProps {
  messageId: string;
  role: "user" | "assistant" | "system";
  status?: string;
  isStreaming: boolean;
  onRetry?: (msgId: string) => void;
  compact?: boolean;
}

/**
 * Hover action buttons for messages — Retry on assistant messages.
 * Edit is triggered by clicking the user message directly (not via this component).
 */
export function MessageActions({ messageId, role, status, isStreaming, onRetry, compact }: MessageActionsProps) {
  if (isStreaming) return null;

  const showRetry = role === "assistant" && (status === "success" || status === "error");

  if (!showRetry) return null;

  const btnCn = cn(
    "flex items-center gap-1 rounded-md border bg-background/90 backdrop-blur-sm shadow-sm",
    "text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
    compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
  );

  return (
    <div className={cn(
      "absolute opacity-0 group-hover/msg:opacity-100 transition-opacity z-10",
      "flex items-center gap-1",
      "right-0 -bottom-1 translate-y-full",
    )}>
      {onRetry && (
        <button type="button" className={btnCn} onClick={() => onRetry(messageId)} title="Retry">
          <RotateCcw className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Editable User Message
// =============================================================================

interface EditableUserMessageProps {
  initialContent: string;
  onSubmit: (newContent: string) => void;
  onCancel: () => void;
  compact?: boolean;
  /** When true, shows a warning that file changes after this message will be lost */
  warnFileChanges?: boolean;
}

/**
 * Inline textarea for editing a user message before re-sending.
 * Replaces the user bubble when edit mode is active.
 */
export function EditableUserMessage({ initialContent, onSubmit, onCancel, compact, warnFileChanges }: EditableUserMessageProps) {
  const [value, setValue] = React.useState(initialContent);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.selectionStart = el.value.length;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, []);

  // Click outside → cancel and revert
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit(value.trim());
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div ref={containerRef} className={cn("w-full", compact ? "max-w-[85%] ml-auto" : "")}>
      {warnFileChanges && (
        <div className={cn(
          "flex items-center gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 mb-1.5",
          compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]",
        )}>
          <AlertTriangle className={cn("shrink-0 text-yellow-500", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          <span className="text-yellow-600 dark:text-yellow-400">
            File changes after this message will be lost
          </span>
        </div>
      )}
      <div className="rounded-xl border-2 border-primary/40 bg-background p-2 shadow-md">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full resize-none bg-transparent text-foreground outline-none",
            compact ? "text-xs" : "text-sm",
          )}
          rows={1}
        />
        <div className="flex items-center justify-end gap-1.5 mt-1.5 pt-1.5 border-t border-border/30">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "rounded-md border px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => value.trim() && onSubmit(value.trim())}
            disabled={!value.trim()}
            className={cn(
              "rounded-md px-2.5 py-1 text-white font-medium transition-colors disabled:opacity-40",
              compact ? "text-[10px]" : "text-[11px]",
            )}
            style={{ background: "var(--cursor-primary, #3b82f6)" }}
          >
            Send
          </button>
        </div>
      </div>
      <p className={cn("mt-1 text-muted-foreground/50", compact ? "text-[9px]" : "text-[10px]")}>
        Enter to send · Esc to cancel · Shift+Enter for new line
      </p>
    </div>
  );
}

// =============================================================================
// Checkpoint Restore Dropdown
// =============================================================================

interface CheckpointDropdownProps {
  checkpoints: Checkpoint[];
  onRestore: (checkpointIndex: number) => void;
  isStreaming: boolean;
  compact?: boolean;
}

/**
 * Dropdown button that shows available checkpoints and lets the user restore.
 * Renders as a small "Restore" button in the header area.
 */
export function CheckpointDropdown({ checkpoints, onRestore, isStreaming, compact }: CheckpointDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (checkpoints.length === 0 || isStreaming) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center gap-1 rounded-md border bg-background/80 text-muted-foreground",
          "hover:text-foreground hover:bg-muted/60 transition-colors",
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
        )}
        title="Restore checkpoint"
      >
        <History className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        <span>Restore</span>
        <span className="text-muted-foreground/50">({checkpoints.length})</span>
      </button>

      {open && (
        <div className={cn(
          "absolute right-0 top-full mt-1 z-50 min-w-[220px] max-h-[240px] overflow-y-auto",
          "rounded-lg border bg-background/95 backdrop-blur-md shadow-xl p-1",
        )}>
          <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Checkpoints
          </p>
          {[...checkpoints].reverse().map((cp) => (
            <button
              key={cp.index}
              type="button"
              onClick={() => {
                onRestore(cp.index);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors",
                "flex flex-col gap-0.5",
              )}
            >
              <span className={cn("truncate text-foreground", compact ? "text-[11px]" : "text-xs")}>
                {cp.label}
              </span>
              <span className="text-[9px] text-muted-foreground/50">
                {new Date(cp.createdAt).toLocaleTimeString()} · {cp.messageCount} msgs
                {cp.fileActionCount > 0 && ` · ${cp.fileActionCount} files`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Conversation History Viewer
// =============================================================================

interface ConversationHistoryProps {
  snapshots: ConversationSnapshot[];
  currentMessages: CursorChatMessage[];
  onClose: () => void;
  compact?: boolean;
}

/** Formats a serialized message for display */
function HistoryMessage({ msg, dimmed, compact }: { msg: SerializedMessage; dimmed?: boolean; compact?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn(
      "flex gap-2 py-1.5",
      dimmed && "opacity-50",
    )}>
      <div className={cn(
        "shrink-0 rounded-full font-medium flex items-center justify-center",
        compact ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]",
        isUser
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}>
        {isUser ? "U" : "AI"}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "whitespace-pre-wrap break-words text-foreground",
          compact ? "text-[11px]" : "text-xs",
        )}>
          {msg.content}
        </p>
        {msg.modelUsed && (
          <span className="text-[9px] text-muted-foreground/40">{msg.modelUsed}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Full conversation history overlay. Shows all previous snapshots
 * (discarded branches) followed by the current active conversation.
 * Read-only — no editing or AI interaction.
 */
export function ConversationHistory({ snapshots, currentMessages, onClose, compact }: ConversationHistoryProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Scroll to bottom on open
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const actionLabel = (action: string) => {
    switch (action) {
      case "retry": return "Retried";
      case "edit": return "Edited";
      case "restore": return "Restored";
      default: return action;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={cn(
        "relative flex flex-col bg-background border rounded-xl shadow-2xl",
        compact
          ? "w-[90vw] max-w-[420px] max-h-[70vh]"
          : "w-[90vw] max-w-[600px] max-h-[80vh]",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <History className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
              Full Conversation History
            </span>
            <span className="text-[10px] text-muted-foreground/50">read-only</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="cursor-scroll flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-1 min-w-0">
          {snapshots.length === 0 && currentMessages.length === 0 && (
            <p className="text-center text-muted-foreground/50 text-xs py-8">
              No conversation history yet
            </p>
          )}

          {/* Previous snapshots (discarded branches) */}
          {snapshots.map((snap, i) => (
            <SnapshotSection
              key={i}
              snapshot={snap}
              index={i + 1}
              total={snapshots.length}
              compact={compact}
              actionLabel={actionLabel}
            />
          ))}

          {/* Current conversation */}
          {currentMessages.length > 0 && (
            <div>
              {snapshots.length > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 border-t border-primary/30" />
                  <span className={cn(
                    "font-medium text-primary shrink-0",
                    compact ? "text-[10px]" : "text-[11px]",
                  )}>
                    Current Conversation
                  </span>
                  <div className="flex-1 border-t border-primary/30" />
                </div>
              )}
              {currentMessages.map((msg) => (
                <HistoryMessage
                  key={msg.id}
                  msg={{
                    id: msg.id,
                    role: msg.role,
                    content: msg.content,
                    reasoning: msg.reasoning,
                    modelUsed: msg.modelUsed,
                    status: msg.status,
                    timestamp: msg.timestamp instanceof Date
                      ? msg.timestamp.toISOString()
                      : String(msg.timestamp),
                  }}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Collapsible section for a single snapshot (discarded branch) */
function SnapshotSection({
  snapshot,
  index,
  total,
  compact,
  actionLabel,
}: {
  snapshot: ConversationSnapshot;
  index: number;
  total: number;
  compact?: boolean;
  actionLabel: (a: string) => string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border rounded-lg border-border/40 bg-muted/20 overflow-hidden">
      {/* Divider / collapse header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors",
        )}
      >
        <span className={cn(
          "text-muted-foreground/60",
          compact ? "text-[9px]" : "text-[10px]",
        )}>
          {expanded ? "▼" : "▶"}
        </span>
        <span className={cn(
          "flex-1 truncate text-muted-foreground",
          compact ? "text-[10px]" : "text-[11px]",
        )}>
          <span className="font-medium">{actionLabel(snapshot.action)}</span>
          {" — "}
          {snapshot.label}
        </span>
        <span className="text-[9px] text-muted-foreground/40 shrink-0">
          {new Date(snapshot.timestamp).toLocaleTimeString()}
          {" · "}
          {snapshot.messages.length} msgs
        </span>
      </button>

      {/* Expanded messages */}
      {expanded && (
        <div className="px-3 pb-2 border-t border-border/20">
          {snapshot.messages.map((msg) => (
            <HistoryMessage key={msg.id} msg={msg} dimmed compact={compact} />
          ))}
        </div>
      )}
    </div>
  );
}
