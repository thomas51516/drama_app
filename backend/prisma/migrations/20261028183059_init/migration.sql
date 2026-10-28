-- CreateEnum
CREATE TYPE "user_type" AS ENUM ('GUEST', 'REGISTERED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "series_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "age_rating" AS ENUM ('ALL', 'PG12', 'PG16', 'R18');

-- CreateEnum
CREATE TYPE "transcode_status" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "coin_bucket" AS ENUM ('PURCHASED', 'BONUS');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('PURCHASE', 'BONUS', 'UNLOCK', 'ADJUSTMENT', 'EXPIRY', 'REFUND');

-- CreateEnum
CREATE TYPE "unlock_method" AS ENUM ('COINS', 'AD', 'VIP', 'FREE');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('GOOGLE_PLAY', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "purchase_status" AS ENUM ('PENDING', 'VERIFIED', 'CREDITED', 'ACKNOWLEDGED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'IN_GRACE', 'ON_HOLD', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('EDITOR', 'MONETIZATION', 'SUPPORT', 'ADMIN');

-- CreateEnum
CREATE TYPE "token_subject_type" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "type" "user_type" NOT NULL DEFAULT 'GUEST',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "google_sub" VARCHAR(255),
    "display_name" VARCHAR(80),
    "country" CHAR(2),
    "language" VARCHAR(8) NOT NULL DEFAULT 'fr',
    "device_id" VARCHAR(128),
    "is_vip" BOOLEAN NOT NULL DEFAULT false,
    "vip_expires_at" TIMESTAMPTZ(3),
    "auto_unlock" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "synopsis" TEXT NOT NULL,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "original_language" VARCHAR(8) NOT NULL DEFAULT 'fr',
    "poster_vertical_url" TEXT,
    "poster_horizontal_url" TEXT,
    "free_episode_count" INTEGER NOT NULL DEFAULT 5,
    "coin_cost_per_episode" INTEGER NOT NULL DEFAULT 10,
    "status" "series_status" NOT NULL DEFAULT 'DRAFT',
    "territories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age_rating" "age_rating" NOT NULL DEFAULT 'ALL',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(200),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "transcode_status" "transcode_status" NOT NULL DEFAULT 'PENDING',
    "source_key" TEXT,
    "hls_key" TEXT,
    "thumbnail_url" TEXT,
    "preview_key" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtitles" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtitles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" UUID NOT NULL,
    "purchased_balance" INTEGER NOT NULL DEFAULT 0,
    "bonus_balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "coin_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "bucket" "coin_bucket" NOT NULL,
    "type" "ledger_entry_type" NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" VARCHAR(128),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unlocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "method" "unlock_method" NOT NULL,
    "ledger_entry_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "product_id" VARCHAR(120) NOT NULL,
    "purchase_token" VARCHAR(512) NOT NULL,
    "order_id" VARCHAR(120),
    "amount_minor" INTEGER,
    "currency" CHAR(3),
    "coins" INTEGER NOT NULL DEFAULT 0,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "status" "purchase_status" NOT NULL DEFAULT 'PENDING',
    "raw_payload" JSONB,
    "verified_at" TIMESTAMPTZ(3),
    "credited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan" "subscription_plan" NOT NULL,
    "provider" "payment_provider" NOT NULL DEFAULT 'GOOGLE_PLAY',
    "product_id" VARCHAR(120) NOT NULL,
    "purchase_token" VARCHAR(512),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "status" "subscription_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "watch_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","series_id")
);

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "role" "admin_role" NOT NULL DEFAULT 'EDITOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret" TEXT,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "subject_type" "token_subject_type" NOT NULL,
    "user_id" UUID,
    "admin_id" UUID,
    "family" UUID NOT NULL,
    "device_id" VARCHAR(128),
    "user_agent" VARCHAR(512),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_label" VARCHAR(120),
    "action" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" VARCHAR(128),
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "users_device_id_idx" ON "users"("device_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_is_vip_vip_expires_at_idx" ON "users"("is_vip", "vip_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "series_slug_key" ON "series"("slug");

-- CreateIndex
CREATE INDEX "series_status_published_at_idx" ON "series"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "series_genres_idx" ON "series" USING GIN ("genres");

-- CreateIndex
CREATE INDEX "episodes_published_at_idx" ON "episodes"("published_at" DESC);

-- CreateIndex
CREATE INDEX "episodes_transcode_status_idx" ON "episodes"("transcode_status");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_series_id_number_key" ON "episodes"("series_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "subtitles_episode_id_language_key" ON "subtitles"("episode_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "coin_ledger_idempotency_key_key" ON "coin_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "coin_ledger_user_id_created_at_idx" ON "coin_ledger"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "coin_ledger_type_expires_at_idx" ON "coin_ledger"("type", "expires_at");

-- CreateIndex
CREATE INDEX "coin_ledger_reference_type_reference_id_idx" ON "coin_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "unlocks_ledger_entry_id_key" ON "unlocks"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "unlocks_episode_id_idx" ON "unlocks"("episode_id");

-- CreateIndex
CREATE UNIQUE INDEX "unlocks_user_id_episode_id_key" ON "unlocks"("user_id", "episode_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_purchase_token_key" ON "purchases"("purchase_token");

-- CreateIndex
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_purchase_token_key" ON "subscriptions"("purchase_token");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_ends_at_idx" ON "subscriptions"("ends_at");

-- CreateIndex
CREATE INDEX "watch_progress_user_id_updated_at_idx" ON "watch_progress"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "watch_progress_user_id_episode_id_key" ON "watch_progress"("user_id", "episode_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_accounts_email_key" ON "admin_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_admin_id_idx" ON "refresh_tokens"("admin_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitles" ADD CONSTRAINT "subtitles_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlocks" ADD CONSTRAINT "unlocks_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "coin_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
