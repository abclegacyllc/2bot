-- Plugin event routing & conflict detection fields
-- eventTypes: which events this plugin handles (e.g. telegram.message, telegram.callback)
-- eventRole: "responder" (sends replies, exclusive per event type) or "observer" (read-only, unlimited)
-- conflictsWith: slugs of plugins that cannot coexist on the same gateway

ALTER TABLE "plugins" ADD COLUMN "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "plugins" ADD COLUMN "event_role" TEXT NOT NULL DEFAULT 'responder';
ALTER TABLE "plugins" ADD COLUMN "conflicts_with" TEXT[] DEFAULT ARRAY[]::TEXT[];
