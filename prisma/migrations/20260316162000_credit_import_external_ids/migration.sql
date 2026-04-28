-- Preparación del modelo para importación masiva de ventas/créditos
-- con identificadores externos operativos.

ALTER TABLE "Grupo"
ADD COLUMN "externalPromotoriaId" TEXT;

ALTER TABLE "Cliente"
ADD COLUMN "externalClientId" TEXT;

ALTER TABLE "Credito"
ADD COLUMN "saleId" TEXT,
ADD COLUMN "controlNumber" INTEGER,
ADD COLUMN "totalPayableAmount" DECIMAL(12, 2);

CREATE UNIQUE INDEX "Grupo_externalPromotoriaId_key"
ON "Grupo"("externalPromotoriaId");

CREATE UNIQUE INDEX "Cliente_externalClientId_key"
ON "Cliente"("externalClientId");

CREATE UNIQUE INDEX "Credito_saleId_key"
ON "Credito"("saleId");

CREATE INDEX "Credito_controlNumber_idx"
ON "Credito"("controlNumber");
