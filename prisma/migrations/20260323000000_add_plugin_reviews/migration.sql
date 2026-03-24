-- CreateTable
CREATE TABLE "plugin_reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(200),
    "content" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "verified_install" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plugin_reviews_plugin_id_rating_idx" ON "plugin_reviews"("plugin_id", "rating");

-- CreateIndex
CREATE INDEX "plugin_reviews_created_at_idx" ON "plugin_reviews"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_reviews_user_id_plugin_id_key" ON "plugin_reviews"("user_id", "plugin_id");

-- AddForeignKey
ALTER TABLE "plugin_reviews" ADD CONSTRAINT "plugin_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_reviews" ADD CONSTRAINT "plugin_reviews_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
