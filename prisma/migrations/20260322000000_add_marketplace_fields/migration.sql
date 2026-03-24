-- Add marketplace rating/review fields to plugins table
ALTER TABLE "plugins" ADD COLUMN "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "plugins" ADD COLUMN "review_count" INTEGER NOT NULL DEFAULT 0;
