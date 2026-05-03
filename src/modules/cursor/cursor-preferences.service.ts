/**
 * Cursor User Preferences Service
 *
 * Stores and retrieves cross-session learned preferences for each user.
 * The AI extracts patterns after each successful session (coding style,
 * common plugin types, preferred libraries) and injects them into
 * future sessions.
 *
 * @module modules/cursor/cursor-preferences.service
 */

import { prisma } from "@/lib/prisma";

const MAX_PREFERENCES = 20;
const MAX_VALUE_LENGTH = 500;

// In-memory cache to avoid DB hits on every prompt injection
const preferencesCache = new Map<string, { data: string | null; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Keyword → plugin type mapping (data-driven instead of if-chain)
const KEYWORD_TYPE_MAP: Record<string, string[]> = {
  weather: ["weather"],
  "reminder/scheduler": ["reminder", "schedule"],
  moderation: ["moderat"],
  "game/quiz": ["game", "quiz"],
  "welcome/greeting": ["welcome", "greet"],
  translation: ["translat"],
  "polls/voting": ["poll", "vote"],
  "media/audio": ["music", "audio"],
  "e-commerce": ["shop", "store", "ecommerce"],
};

// Throttle experience level recalculation (expensive COUNT query)
const EXPERIENCE_RECHECK_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get all preferences for a user, formatted for prompt injection.
 * Uses an in-memory cache to reduce DB reads.
 */
export async function getUserPreferences(userId: string): Promise<string | null> {
  const cached = preferencesCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const prefs = await prisma.cursorUserPreference.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_PREFERENCES,
  });

  const result = prefs.length === 0
    ? null
    : prefs.map((p) => `- **${p.key}**: ${p.value}`).join("\n");

  preferencesCache.set(userId, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * Upsert a single preference and invalidate cache.
 */
export async function setPreference(userId: string, key: string, value: string): Promise<void> {
  await prisma.cursorUserPreference.upsert({
    where: { userId_key: { userId, key } },
    update: { value: value.slice(0, MAX_VALUE_LENGTH) },
    create: { userId, key, value: value.slice(0, MAX_VALUE_LENGTH) },
  });

  // Invalidate cache so next read picks up fresh data
  preferencesCache.delete(userId);
}

/**
 * Merge new values into an existing comma-separated preference
 * instead of overwriting it. Deduplicates entries.
 */
async function mergePreference(userId: string, key: string, newValues: string[]): Promise<void> {
  const existing = await prisma.cursorUserPreference.findUnique({
    where: { userId_key: { userId, key } },
  });

  const existingValues = existing?.value?.split(", ") ?? [];
  const merged = [...new Set([...existingValues, ...newValues])];
  await setPreference(userId, key, merged.join(", "));
}

/**
 * Extract preferences from a completed session's context.
 * Called after successful session completion.
 */
export async function extractPreferencesFromSession(
  userId: string,
  params: {
    prompt: string;
    filesWritten: string[];
    pluginSlug?: string;
    mode?: string;
  },
): Promise<void> {
  const { prompt, filesWritten, pluginSlug, mode } = params;

  // Track common plugin types — merge instead of overwrite to preserve history
  if (mode === "create" && pluginSlug) {
    const lower = prompt.toLowerCase();
    const detectedTypes: string[] = [];
    for (const [type, keywords] of Object.entries(KEYWORD_TYPE_MAP)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        detectedTypes.push(type);
      }
    }
    if (detectedTypes.length > 0) {
      await mergePreference(userId, "common_plugin_types", detectedTypes);
    }
  }

  // Track file count complexity preference
  if (filesWritten.length > 0) {
    const complexity = filesWritten.length >= 5 ? "multi-file complex plugins" : "single-file simple plugins";
    await setPreference(userId, "typical_complexity", complexity);
  }

  // Track if user uses database
  if (filesWritten.some((f) => f.includes("database") || f.includes("db") || f.includes("model"))) {
    await setPreference(userId, "uses_database", "yes — user frequently uses sdk.database for persistence");
  }

  // Track experience level — throttled to avoid expensive COUNT query every session
  const recentPref = await prisma.cursorUserPreference.findUnique({
    where: { userId_key: { userId, key: "experience_level" } },
  });

  const shouldRecheck =
    !recentPref ||
    Date.now() - recentPref.updatedAt.getTime() > EXPERIENCE_RECHECK_MS;

  if (shouldRecheck) {
    const sessionCount = await prisma.agentSession.count({
      where: { userId, status: "completed" },
    });
    if (sessionCount >= 10) {
      await setPreference(userId, "experience_level", `experienced — ${sessionCount} successful sessions`);
    } else if (sessionCount >= 3) {
      await setPreference(userId, "experience_level", `intermediate — ${sessionCount} sessions`);
    }
  }
}
