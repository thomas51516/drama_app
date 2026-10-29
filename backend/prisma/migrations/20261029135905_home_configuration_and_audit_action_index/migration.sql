-- CreateEnum
CREATE TYPE "home_row_type" AS ENUM ('MANUAL', 'TRENDING', 'NEW', 'GENRE', 'CONTINUE_WATCHING');

-- CreateTable
CREATE TABLE "home_banners" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "image_url" TEXT,
    "title" VARCHAR(200),
    "subtitle" VARCHAR(300),
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "home_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_rows" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "type" "home_row_type" NOT NULL,
    "titles" JSONB NOT NULL,
    "genre" VARCHAR(40),
    "series_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "home_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_banners_is_active_position_idx" ON "home_banners"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "home_rows_key_key" ON "home_rows"("key");

-- CreateIndex
CREATE INDEX "home_rows_is_active_position_idx" ON "home_rows"("is_active", "position");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "home_banners" ADD CONSTRAINT "home_banners_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
