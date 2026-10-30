-- CreateEnum
CREATE TYPE "vip_period" AS ENUM ('WEEK', 'MONTH', 'YEAR');

-- AlterEnum
ALTER TYPE "ledger_entry_type" ADD VALUE 'MERGE';

-- AlterEnum
ALTER TYPE "subscription_status" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "linked_purchase_token" VARCHAR(512),
ADD COLUMN     "raw_payload" JSONB;

-- AlterTable
ALTER TABLE "unlocks" ADD COLUMN     "idempotency_key" VARCHAR(128);

-- CreateTable
CREATE TABLE "monetization_settings" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'default',
    "default_free_episodes" INTEGER NOT NULL DEFAULT 5,
    "default_coin_cost" INTEGER NOT NULL DEFAULT 10,
    "series_unlock_discount_percent" INTEGER NOT NULL DEFAULT 0,
    "ad_daily_cap" INTEGER NOT NULL DEFAULT 3,
    "auto_unlock_default" BOOLEAN NOT NULL DEFAULT false,
    "bonus_validity_days" INTEGER NOT NULL DEFAULT 30,
    "checkin_days" INTEGER[] DEFAULT ARRAY[5, 5, 10, 10, 15, 20, 30]::INTEGER[],
    "checkin_reset_on_miss" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monetization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_packs" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(120) NOT NULL,
    "coins" INTEGER NOT NULL,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "prices" JSONB NOT NULL,
    "badge" VARCHAR(40),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coin_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_plans" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(120) NOT NULL,
    "period" "vip_period" NOT NULL,
    "prices" JSONB NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "badge" VARCHAR(40),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vip_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_packs_sku_key" ON "coin_packs"("sku");

-- CreateIndex
CREATE INDEX "coin_packs_is_active_position_idx" ON "coin_packs"("is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "vip_plans_sku_key" ON "vip_plans"("sku");

-- CreateIndex
CREATE INDEX "vip_plans_is_active_position_idx" ON "vip_plans"("is_active", "position");
