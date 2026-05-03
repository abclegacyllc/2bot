/**
 * Tool-mention parser for the 2Bot agent chat input.
 *
 * Lets users force a specific tool by typing `#toolname` somewhere in their
 * message. Examples:
 *
 *   "#search_codebase find the rate limiter"
 *      → forceTool=search_codebase, cleanedMessage="find the rate limiter"
 *
 *   "where is sendRates called? #find_usages"
 *      → forceTool=find_usages, cleanedMessage="where is sendRates called?"
 *
 *   "#unknown_tool do something"
 *      → no force, message unchanged (unknown mentions are ignored silently)
 *
 * Only the FIRST valid mention wins. Subsequent ones are stripped from the
 * cleaned message but ignored as hints.
 *
 * @module modules/cursor/tool-mention-parser
 */

import { ALL_TOOL_NAMES } from "./cursor-worker-tools";

export interface ParsedToolMentions {
  /** Original message with all `#tool` tokens removed and whitespace tidied. */
  cleanedMessage: string;
  /** First valid tool the user mentioned, or `null`. */
  forceTool: string | null;
  /** All valid tool names mentioned (in order, deduped). */
  allMentioned: string[];
}

const VALID_TOOLS: ReadonlySet<string> = new Set(ALL_TOOL_NAMES);

// Match `#word_with_underscores` not inside code fences. We strip code fences
// before scanning so the agent's prior `#some_tool` examples don't trigger.
const MENTION_RE = /(?<![A-Za-z0-9_])#([a-z][a-z0-9_]+)/g;

export function parseToolMentions(message: string): ParsedToolMentions {
  if (!message || !message.includes("#")) {
    return { cleanedMessage: message, forceTool: null, allMentioned: [] };
  }

  // Carve out fenced code blocks and inline backticks so we don't pick up
  // example tool names from pasted code.
  const protectedRanges: Array<[number, number]> = [];
  const fence = /```[\s\S]*?```|`[^`]*`/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(message))) {
    protectedRanges.push([m.index, m.index + m[0].length]);
  }
  const isProtected = (idx: number) => protectedRanges.some(([a, b]) => idx >= a && idx < b);

  const allMentioned: string[] = [];
  let forceTool: string | null = null;
  // Replace mentions in the message; the regex's negative lookbehind keeps us
  // from matching `key#value` style noise.
  const cleaned = message.replace(MENTION_RE, (full, name: string, offset: number) => {
    if (isProtected(offset)) return full;
    if (!VALID_TOOLS.has(name)) return full; // unknown — leave it in for the LLM
    if (!allMentioned.includes(name)) allMentioned.push(name);
    if (!forceTool) forceTool = name;
    return ""; // strip the `#tool` token from the user-visible message
  });

  // Tidy up whitespace left by stripped tokens
  const tidied = cleaned.replace(/[ \t]+\n/g, "\n").replace(/  +/g, " ").trim();

  return {
    cleanedMessage: tidied,
    forceTool,
    allMentioned,
  };
}

/**
 * Build a short system-level directive instructing the AI to use the
 * user-requested tool. Inserted right after the system prompt.
 */
export function buildForceToolDirective(forceTool: string, allMentioned: string[]): string {
  const others = allMentioned.filter((t) => t !== forceTool);
  const otherList = others.length > 0
    ? ` They also mentioned: ${others.map((t) => `"${t}"`).join(", ")}.`
    : "";
  return (
    `## User Tool Hint\n` +
    `The user explicitly requested the **${forceTool}** tool by typing \`#${forceTool}\` in their message.${otherList}\n` +
    `Use \`${forceTool}\` for the FIRST relevant action of this turn unless it is clearly inapplicable. ` +
    `If \`${forceTool}\` returns nothing useful, you may fall back to other tools.`
  );
}
