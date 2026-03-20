"use client";

/**
 * Collapsible JSON Tree View
 *
 * Renders JSON data as an interactive, collapsible tree with
 * syntax highlighting. Used in workflow run history to display
 * step input/output data.
 *
 * @module components/bot-studio/json-tree-view
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface JsonTreeViewProps {
  data: unknown;
  /** Max depth to auto-expand (default: 1) */
  defaultExpandDepth?: number;
  className?: string;
}

// ===========================================
// Value renderer
// ===========================================

function JsonValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-zinc-500">null</span>;
  if (value === undefined) return <span className="text-zinc-500">undefined</span>;
  if (typeof value === "boolean") return <span className="text-amber-500">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-sky-400">{String(value)}</span>;
  if (typeof value === "string") {
    // Truncate very long strings
    const display = value.length > 200 ? value.slice(0, 200) + "…" : value;
    return <span className="text-emerald-400">&quot;{display}&quot;</span>;
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

// ===========================================
// Tree node
// ===========================================

function JsonNode({
  keyName,
  value,
  depth,
  defaultExpandDepth,
}: {
  keyName?: string;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
}) {
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  if (!isExpandable) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 12 }}>
        {keyName !== undefined && (
          <span className="text-violet-400 shrink-0">{keyName}:</span>
        )}
        <JsonValue value={value} />
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const count = entries.length;
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-0.5 py-0.5 hover:bg-muted/50 rounded w-full text-left"
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        {keyName !== undefined && (
          <span className="text-violet-400">{keyName}:</span>
        )}
        <span className="text-muted-foreground">
          {bracketOpen}
          {!expanded && (
            <span className="text-muted-foreground/60">{` ${count} ${isArray ? "items" : "keys"} `}</span>
          )}
          {!expanded && bracketClose}
        </span>
      </button>
      {expanded ? (
        <>
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
          <div className="text-muted-foreground py-0.5" style={{ paddingLeft: depth * 12 + 16 }}>
            {bracketClose}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ===========================================
// Public component
// ===========================================

export function JsonTreeView({ data, defaultExpandDepth = 1, className }: JsonTreeViewProps) {
  const isPrimitive = data === null || typeof data !== "object";

  return (
    <div className={`text-[10px] font-mono overflow-x-auto max-h-48 ${className ?? ""}`}>
      {isPrimitive ? (
        <div className="px-2 py-1">
          <JsonValue value={data} />
        </div>
      ) : (
        <JsonNode
          value={data}
          depth={0}
          defaultExpandDepth={defaultExpandDepth}
        />
      )}
    </div>
  );
}
