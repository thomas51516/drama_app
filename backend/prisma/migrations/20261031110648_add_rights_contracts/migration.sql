-- CreateTable
CREATE TABLE "rights_contracts" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "rights_holder" VARCHAR(200) NOT NULL,
    "territories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "license_starts_at" TIMESTAMPTZ(3) NOT NULL,
    "license_ends_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rights_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rights_contracts_series_id_key" ON "rights_contracts"("series_id");

-- CreateIndex
CREATE INDEX "rights_contracts_license_ends_at_idx" ON "rights_contracts"("license_ends_at");

-- AddForeignKey
ALTER TABLE "rights_contracts" ADD CONSTRAINT "rights_contracts_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
