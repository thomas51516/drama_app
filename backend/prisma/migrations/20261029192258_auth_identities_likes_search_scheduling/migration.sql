/*
  Warnings:

  - You are about to drop the column `google_sub` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "identity_provider" AS ENUM ('GOOGLE', 'PHONE', 'EMAIL');

-- AlterEnum
ALTER TYPE "user_status" ADD VALUE 'MERGED';

-- DropIndex
DROP INDEX "users_google_sub_key";

-- AlterTable
ALTER TABLE "series" ADD COLUMN     "likes_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "search_vector" tsvector;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "google_sub",
ADD COLUMN     "deletion_scheduled_at" TIMESTAMPTZ(3),
ADD COLUMN     "merged_into_id" UUID,
ADD COLUMN     "notification_preferences" JSONB,
ADD COLUMN     "password_hash" TEXT;

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "subject" VARCHAR(320) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "user_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id","series_id")
);

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "user_identities"("provider", "subject");

-- CreateIndex
CREATE INDEX "likes_series_id_idx" ON "likes"("series_id");

-- CreateIndex
CREATE INDEX "series_search_vector_idx" ON "series" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "users_status_deletion_scheduled_at_idx" ON "users"("status", "deletion_scheduled_at");

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Recherche plein texte (S05-BE-06) : unaccent + tsvector maintenu par trigger
-- (`unaccent()` n'est que STABLE : impossible dans une colonne générée).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Enveloppe IMMUTABLE d'unaccent (dictionnaire par défaut), utilisable dans index et triggers.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE OR REPLACE FUNCTION series_search_vector_refresh() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('french', f_unaccent(coalesce(NEW.title, ''))), 'A')
   || setweight(to_tsvector('simple', f_unaccent(coalesce(NEW.title, ''))), 'A')
   || setweight(to_tsvector('simple', f_unaccent(array_to_string(coalesce(NEW.tags, '{}'), ' '))), 'B')
   || setweight(to_tsvector('simple', f_unaccent(array_to_string(coalesce(NEW.genres, '{}'), ' '))), 'B')
   || setweight(to_tsvector('french', f_unaccent(coalesce(NEW.synopsis, ''))), 'C');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS series_search_vector_refresh ON "series";
CREATE TRIGGER series_search_vector_refresh
  BEFORE INSERT OR UPDATE OF title, synopsis, tags, genres ON "series"
  FOR EACH ROW EXECUTE FUNCTION series_search_vector_refresh();

-- Remplissage des lignes existantes.
UPDATE "series" SET title = title;

-- Suggestions par préfixe de titre (sans accent, insensible à la casse).
CREATE INDEX "series_title_unaccent_idx" ON "series" (f_unaccent(lower(title)) text_pattern_ops);
