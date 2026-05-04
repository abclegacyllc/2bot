/**
 * Project Version — file-bytes capture & restore (Wave 2)
 *
 * @module modules/project/project-version-files.service
 *
 * The base `project-version.service` snapshots the *DB rows* describing a
 * project (gateways, plugins, workflows). That alone is not enough to roll
 * back: plugin code lives on the bridge volume, and a rollback that only
 * flips DB pointers leaves users running stale or broken code.
 *
 * This module fills that gap with two helpers:
 *
 *   - `captureProjectPluginFiles(projectId, bridge)` — reads each
 *     UserPlugin's bundle directory through the bridge and returns a
 *     content-addressed map { [bundlePath]: { sha256, content } }.
 *
 *   - `restoreProjectPluginFiles(blobs, bridge)` — writes the captured
 *     bytes back via `bridge.fileWriteMulti` so the running container
 *     reflects the rolled-back state.
 *
 * Both helpers are *best-effort* and never throw past the boundary —
 * upstream callers log warnings and continue. Live wiring into
 * `captureManifest` / `rollbackToVersion` is staged behind an env flag
 * (`FEATURE_PROJECT_FILE_SNAPSHOT`) until we have enough storage budget
 * verified for the manifest blobs.
 */

import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { ProjectManifest } from "./project-version.types";

const fileLogger = logger.child({ module: "project-version-files" });

/** Cap per-file bytes captured into a manifest. Larger files are skipped. */
export const MAX_PLUGIN_FILE_BYTES = 256 * 1024;

/** Cap total bytes captured into a manifest blob. */
export const MAX_MANIFEST_FILE_BUDGET_BYTES = 4 * 1024 * 1024;

export interface CapturedPluginFile {
  /** Path on the bridge volume (absolute or relative to plugin root). */
  path: string;
  /** UTF-8 contents. Binary plugins are not yet supported. */
  content: string;
  /** SHA-256 of `content` (hex). */
  sha256: string;
}

export interface PluginFileSnapshot {
  userPluginId: string;
  bundlePath: string | null;
  files: CapturedPluginFile[];
  /** Reason capture was partial/skipped, or `null` if complete. */
  truncatedReason: string | null;
}

/**
 * Minimal bridge surface this module needs. Kept structural so tests can
 * inject a fake without pulling in the real bridge transport.
 */
export interface FileBridge {
  fileList: (
    path: string,
    recursive?: boolean,
  ) => Promise<Array<{ path: string; isDir: boolean; sizeBytes?: number }>>;
  fileRead: (path: string) => Promise<{ content: string }>;
  fileWriteMulti: (
    files: Array<{ path: string; content: string }>,
  ) => Promise<Array<{ path: string; sizeBytes: number }>>;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Reads each plugin's bundle directory from the bridge and returns the
 * raw bytes plus per-file hash. Skips directories larger than
 * `MAX_MANIFEST_FILE_BUDGET_BYTES` and individual files larger than
 * `MAX_PLUGIN_FILE_BYTES`.
 */
export async function captureProjectPluginFiles(
  projectId: string,
  bridge: FileBridge,
): Promise<PluginFileSnapshot[]> {
  const userPlugins = await prisma.userPlugin.findMany({
    where: { projectId },
    select: { id: true, entryFile: true },
  });

  const out: PluginFileSnapshot[] = [];
  let budgetRemaining = MAX_MANIFEST_FILE_BUDGET_BYTES;

  for (const up of userPlugins) {
    const root = up.entryFile;
    if (!root) {
      out.push({
        userPluginId: up.id,
        bundlePath: null,
        files: [],
        truncatedReason: "no-bundle-path",
      });
      continue;
    }

    let listing: Array<{ path: string; isDir: boolean; sizeBytes?: number }>;
    try {
      listing = await bridge.fileList(root, true);
    } catch (err) {
      fileLogger.warn({ err, userPluginId: up.id, root }, "fileList failed");
      out.push({
        userPluginId: up.id,
        bundlePath: root,
        files: [],
        truncatedReason: "list-failed",
      });
      continue;
    }

    const files: CapturedPluginFile[] = [];
    let truncated: string | null = null;

    for (const entry of listing) {
      if (entry.isDir) continue;
      const size = entry.sizeBytes ?? 0;
      if (size > MAX_PLUGIN_FILE_BYTES) {
        truncated = "file-too-large";
        continue;
      }
      if (size > budgetRemaining) {
        truncated = "manifest-budget-exhausted";
        break;
      }
      try {
        const { content } = await bridge.fileRead(entry.path);
        files.push({
          path: entry.path,
          content,
          sha256: sha256Hex(content),
        });
        budgetRemaining -= Buffer.byteLength(content, "utf8");
      } catch (err) {
        fileLogger.warn(
          { err, userPluginId: up.id, file: entry.path },
          "fileRead failed",
        );
        truncated = "read-failed";
      }
    }

    out.push({
      userPluginId: up.id,
      bundlePath: root,
      files,
      truncatedReason: truncated,
    });
  }

  return out;
}

/**
 * Writes captured plugin files back to the bridge in a single
 * `file.writeMulti` call per plugin. Returns the number of files written.
 *
 * This DOES NOT delete files that exist on disk but not in the manifest —
 * intentional, to avoid clobbering bridge-owned state. Add a cleanup pass
 * once we trust the snapshots to be exhaustive.
 */
export async function restoreProjectPluginFiles(
  snapshots: PluginFileSnapshot[],
  bridge: FileBridge,
): Promise<{ pluginsRestored: number; filesWritten: number; failures: number }> {
  let pluginsRestored = 0;
  let filesWritten = 0;
  let failures = 0;

  for (const snap of snapshots) {
    if (snap.files.length === 0) continue;
    try {
      const result = await bridge.fileWriteMulti(
        snap.files.map((f) => ({ path: f.path, content: f.content })),
      );
      pluginsRestored += 1;
      filesWritten += result.length;
    } catch (err) {
      fileLogger.warn(
        { err, userPluginId: snap.userPluginId, bundlePath: snap.bundlePath },
        "restoreProjectPluginFiles: fileWriteMulti failed",
      );
      failures += 1;
    }
  }

  return { pluginsRestored, filesWritten, failures };
}

/** Sentinel key under which Wave 2 stores the file snapshots in the manifest. */
export const PLUGIN_FILE_BLOBS_KEY = "__pluginFileBlobs" as const;

/**
 * Augmented manifest type — `project-version.types` keeps `ProjectManifest`
 * schema-stable; we attach blobs under a sentinel key so existing rollback
 * logic that walks the manifest is unaffected.
 */
export type ProjectManifestWithFiles = ProjectManifest & {
  [PLUGIN_FILE_BLOBS_KEY]?: PluginFileSnapshot[];
};

export function readPluginFileBlobs(
  manifest: unknown,
): PluginFileSnapshot[] | null {
  if (!manifest || typeof manifest !== "object") return null;
  const blobs = (manifest as Record<string, unknown>)[PLUGIN_FILE_BLOBS_KEY];
  if (!Array.isArray(blobs)) return null;
  return blobs as PluginFileSnapshot[];
}
