-- AlterTable
ALTER TABLE "admin_accounts" ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "transcode_error" TEXT,
ADD COLUMN     "transcode_external_id" VARCHAR(200);

-- CreateIndex
CREATE INDEX "episodes_transcode_external_id_idx" ON "episodes"("transcode_external_id");
