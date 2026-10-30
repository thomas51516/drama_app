-- CreateEnum
CREATE TYPE "reward_task_period" AS ENUM ('DAY', 'WEEK', 'ONCE');

-- CreateEnum
CREATE TYPE "ad_session_status" AS ENUM ('PENDING', 'REWARDED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "topup_order_status" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "monetization_settings" ADD COLUMN     "welcome_offer_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "welcome_offer_bonus_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "welcome_offer_hours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "welcome_offer_pack_sku" VARCHAR(120);

-- AlterTable
ALTER TABLE "series" ADD COLUMN     "ad_unlock_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "checkin_claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" CHAR(10) NOT NULL,
    "streak_day" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_tasks" (
    "key" VARCHAR(40) NOT NULL,
    "coins" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "period" "reward_task_period" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reward_tasks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "reward_task_claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_key" VARCHAR(40) NOT NULL,
    "period_key" VARCHAR(16) NOT NULL,
    "coins" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_task_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "status" "ad_session_status" NOT NULL DEFAULT 'PENDING',
    "transaction_id" VARCHAR(200),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rewarded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "coins" INTEGER NOT NULL,
    "max_uses" INTEGER,
    "per_user_uses" INTEGER NOT NULL DEFAULT 1,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL,
    "promo_code_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "coins" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limited_offers" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "pack_sku" VARCHAR(120) NOT NULL,
    "bonus_percent" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "limited_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topup_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pack_sku" VARCHAR(120) NOT NULL,
    "coins" INTEGER NOT NULL,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "country" CHAR(2) NOT NULL,
    "phone" VARCHAR(32),
    "provider" VARCHAR(16) NOT NULL,
    "provider_reference" VARCHAR(200),
    "status" "topup_order_status" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(128) NOT NULL,
    "payment_url" TEXT,
    "purchase_id" UUID,
    "raw_payload" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "credited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topup_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_claims_user_id_day_key" ON "checkin_claims"("user_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "reward_task_claims_user_id_task_key_period_key_key" ON "reward_task_claims"("user_id", "task_key", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "ad_sessions_transaction_id_key" ON "ad_sessions"("transaction_id");

-- CreateIndex
CREATE INDEX "ad_sessions_user_id_status_rewarded_at_idx" ON "ad_sessions"("user_id", "status", "rewarded_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_redemptions_promo_code_id_user_id_idx" ON "promo_redemptions"("promo_code_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_redemptions_user_id_idempotency_key_key" ON "promo_redemptions"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "limited_offers_is_active_starts_at_ends_at_idx" ON "limited_offers"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "topup_orders_provider_reference_key" ON "topup_orders"("provider_reference");

-- CreateIndex
CREATE INDEX "topup_orders_status_expires_at_idx" ON "topup_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "topup_orders_status_paid_at_idx" ON "topup_orders"("status", "paid_at");

-- CreateIndex
CREATE INDEX "topup_orders_user_id_created_at_idx" ON "topup_orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "topup_orders_user_id_idempotency_key_key" ON "topup_orders"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "checkin_claims" ADD CONSTRAINT "checkin_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_task_claims" ADD CONSTRAINT "reward_task_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_task_claims" ADD CONSTRAINT "reward_task_claims_task_key_fkey" FOREIGN KEY ("task_key") REFERENCES "reward_tasks"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_orders" ADD CONSTRAINT "topup_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
