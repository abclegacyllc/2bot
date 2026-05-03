-- Phase 3: Workspace Embeddings (Semantic Codebase Search)
-- Requires pgvector extension (already enabled in Phase 3 infra step)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE workspace_embeddings (
  id            TEXT         NOT NULL PRIMARY KEY,
  workspace_id  TEXT         NOT NULL REFERENCES workspace_containers(id) ON DELETE CASCADE,
  file_path     TEXT         NOT NULL,
  chunk_index   INTEGER      NOT NULL,
  chunk_text    TEXT         NOT NULL,
  embedding     vector(1536) NOT NULL,
  file_hash     TEXT         NOT NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint: one row per (workspace, file, chunk position)
CREATE UNIQUE INDEX workspace_embeddings_uniq
  ON workspace_embeddings (workspace_id, file_path, chunk_index);

-- Fast lookup by workspace
CREATE INDEX workspace_embeddings_workspace_id_idx
  ON workspace_embeddings (workspace_id);

-- IVFFlat index for approximate nearest-neighbor cosine search.
-- lists=10 is appropriate for small collections (<100k rows).
-- Rebuild with higher lists if the index grows large: ALTER INDEX ... SET (lists = 100)
CREATE INDEX workspace_embeddings_embedding_idx
  ON workspace_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
