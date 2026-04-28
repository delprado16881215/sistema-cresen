ALTER TABLE "Credito"
ADD COLUMN "avalClienteId" TEXT;

CREATE INDEX "Credito_avalClienteId_idx" ON "Credito"("avalClienteId");

ALTER TABLE "Credito"
ADD CONSTRAINT "Credito_avalClienteId_fkey"
FOREIGN KEY ("avalClienteId") REFERENCES "Cliente"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
