/**
 * Workspace Embedding Service — Semantic Codebase Search
 *
 * Indexes workspace files as vector embeddings and provides semantic
 * similarity search. Embeddings are stored in the `workspace_embeddings`
 * table using pgvector (vector(1536) columns via raw SQL).
 *
 * Flow:
 *   write_file / edit_file  →  indexFile()   (fire-and-forget)
 *   delete_file             →  invalidateFile() (fire-and-forget)
 *   search_codebase tool    →  searchSimilar()
 *
 * Embedding model: text-embedding-3-small (OpenAI, 1536 dims)
 * Chunking: AST-based (function/method per chunk) for JS/TS/Python,
 *           fixed 40-line windows for other file types.
 *
 * @module modules/cursor/code-indexer/workspace-embedding.service
 */

import { createHash, randomUUID } from "crypto";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { chunkByFunction, detectLanguage } from "./ast-parser";

const log = logger.child({ module: "cursor:embeddings" });

// ─── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
/** Max chars per chunk sent to the embedding API */
const MAX_CHUNK_CHARS = 2000;
/** Max chunks per file — prevents runaway cost on giant files */
const MAX_CHUNKS_PER_FILE = 50;
/** Skip files larger than this (500 KB) */
const MAX_FILE_BYTES = 500_000;

// ─── Embedding API ────────────────────────────────────────────────────────────

/**
 * Fetch a 1536-dim embedding from OpenAI text-embedding-3-small.
 * Uses TWOBOT_OPENAI_API_KEY directly (no twoBotAIProvider overhead).
 */
async function fetchEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.TWOBOT_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("TWOBOT_OPENAI_API_KEY not configured — embeddings unavailable");
  }

  // Truncate to ~8000 chars (≈2000 tokens) to stay within model limits
  const input = text.length > 8000 ? text.slice(0, 8000) : text;

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embeddings API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMS}-dim embedding, got ${embedding?.length ?? 0}`
    );
  }
  return embedding;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

interface RawChunk {
  text: string;
  chunkIndex: number;
}

/**
 * Fixed-window fallback chunking (40 lines, 8-line overlap).
 * Used for non-JS/TS/Python files.
 */
function fixedChunks(content: string): RawChunk[] {
  const CHUNK_LINES = 40;
  const OVERLAP = 8;
  const lines = content.split("\n");
  const chunks: RawChunk[] = [];
  let i = 0;
  while (i < lines.length && chunks.length < MAX_CHUNKS_PER_FILE) {
    const chunk = lines.slice(i, i + CHUNK_LINES).join("\n");
    if (chunk.trim()) {
      chunks.push({ text: chunk.slice(0, MAX_CHUNK_CHARS), chunkIndex: chunks.length });
    }
    i += CHUNK_LINES - OVERLAP;
  }
  return chunks;
}

/**
 * Build chunks for a file.
 * For JS/TS/Python: one chunk per top-level function / class method (AST-based).
 * For other languages: fixed 40-line windows.
 */
function buildChunks(content: string, filePath: string): RawChunk[] {
  const lang = detectLanguage(filePath);
  if (!lang) return fixedChunks(content);

  try {
    const fnChunks = chunkByFunction(content, filePath);
    if (fnChunks.length === 0) return fixedChunks(content);
    return fnChunks.slice(0, MAX_CHUNKS_PER_FILE).map((c, i) => ({
      // Prefix with label so the LLM gets function context
      text: `// ${c.label}\n${c.text.slice(0, MAX_CHUNK_CHARS)}`,
      chunkIndex: i,
    }));
  } catch {
    return fixedChunks(content);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Index (or re-index) a file in the workspace.
 *
 * Fire-and-forget safe — all errors are caught and logged.
 * Skips the file if it's already indexed with the same content hash.
 */
export async function indexFile(
  workspaceId: string,
  filePath: string,
  content: string,
): Promise<void> {
  if (!content.trim() || content.length > MAX_FILE_BYTES) return;

  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);

  // Skip if already indexed with same hash (content unchanged)
  const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM workspace_embeddings
    WHERE workspace_id = ${workspaceId}
      AND file_path    = ${filePath}
      AND file_hash    = ${hash}
  `;
  if (existing[0] && Number(existing[0].count) > 0) return;

  const chunks = buildChunks(content, filePath);
  if (chunks.length === 0) return;

  // Remove stale chunks for this file before inserting new ones
  await prisma.$executeRaw`
    DELETE FROM workspace_embeddings
    WHERE workspace_id = ${workspaceId} AND file_path = ${filePath}
  `;

  // Embed and insert each chunk sequentially (avoids OpenAI rate-limit bursts)
  for (const chunk of chunks) {
    try {
      const embedding = await fetchEmbedding(chunk.text);
      const vecStr = `[${embedding.join(",")}]`;
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO workspace_embeddings
           (id, workspace_id, file_path, chunk_index, chunk_text, embedding, file_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, NOW())`,
        id,
        workspaceId,
        filePath,
        chunk.chunkIndex,
        chunk.text,
        vecStr,
        hash,
      );
    } catch (err) {
      log.warn(
        { workspaceId, filePath, chunk: chunk.chunkIndex, err },
        "Chunk embedding failed — skipping",
      );
    }
  }

  log.debug({ workspaceId, filePath, chunks: chunks.length }, "File indexed");
}

/**
 * Remove all embedding chunks for a deleted file.
 *
 * Fire-and-forget safe — errors are caught by the caller.
 */
export async function invalidateFile(
  workspaceId: string,
  filePath: string,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM workspace_embeddings
    WHERE workspace_id = ${workspaceId} AND file_path = ${filePath}
  `;
}

export interface EmbeddingSearchResult {
  filePath: string;
  chunkText: string;
  chunkIndex: number;
  /** Cosine similarity score 0-1 (higher = more relevant) */
  similarity: number;
}

/**
 * Search workspace code by semantic similarity.
 *
 * Embeds the query, then finds the nearest code chunks using
 * pgvector's cosine distance (<=> operator).
 */
export async function searchSimilar(
  workspaceId: string,
  query: string,
  topK = 5,
): Promise<EmbeddingSearchResult[]> {
  const embedding = await fetchEmbedding(query);
  const vecStr = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      file_path: string;
      chunk_text: string;
      chunk_index: number;
      similarity: number;
    }>
  >(
    `SELECT file_path,
            chunk_text,
            chunk_index,
            1 - (embedding <=> $1::vector) AS similarity
     FROM workspace_embeddings
     WHERE workspace_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vecStr,
    workspaceId,
    topK,
  );

  return rows.map((r) => ({
    filePath: r.file_path,
    chunkText: r.chunk_text,
    chunkIndex: Number(r.chunk_index),
    similarity: Number(r.similarity),
  }));
}

export interface IndexStatus {
  /** Distinct files indexed for this workspace. */
  fileCount: number;
  /** Total embedding chunks stored. */
  chunkCount: number;
  /** Most recent index timestamp (ISO) — null if nothing indexed yet. */
  lastIndexedAt: string | null;
  /** True if at least one embedding exists for this workspace. */
  ready: boolean;
}

/**
 * Lightweight index status for the studio UI indicator chip.
 * Single COUNT query, safe to call frequently.
 */
export async function getIndexStatus(workspaceId: string): Promise<IndexStatus> {
  const rows = await prisma.$queryRaw<
    Array<{ files: bigint; chunks: bigint; latest: Date | null }>
  >`
    SELECT COUNT(DISTINCT file_path)::bigint AS files,
           COUNT(*)::bigint                   AS chunks,
           MAX(created_at)                    AS latest
    FROM workspace_embeddings
    WHERE workspace_id = ${workspaceId}
  `;
  const row = rows[0];
  const fileCount = row ? Number(row.files) : 0;
  const chunkCount = row ? Number(row.chunks) : 0;
  const latest = row?.latest ?? null;
  return {
    fileCount,
    chunkCount,
    lastIndexedAt: latest ? latest.toISOString() : null,
    ready: chunkCount > 0,
  };
}
