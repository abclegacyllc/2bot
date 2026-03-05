-- CreateEnum
CREATE TYPE "PluginAuthorType" AS ENUM ('SYSTEM', 'USER', 'AI');

-- AlterTable
ALTER TABLE "plugins" ADD COLUMN     "author_id" TEXT,
ADD COLUMN     "author_type" "PluginAuthorType" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;
