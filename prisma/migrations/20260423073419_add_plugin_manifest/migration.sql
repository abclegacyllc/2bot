-- AlterTable: add catalog manifest JSONB for USER-authored plugins whose
-- code lives in the container, not in the business DB.
ALTER TABLE "plugins" ADD COLUMN "manifest" JSONB;
