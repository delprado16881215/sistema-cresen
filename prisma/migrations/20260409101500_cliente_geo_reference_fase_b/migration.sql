-- CreateEnum
CREATE TYPE "ClienteGeoReferenceSource" AS ENUM ('VISIT_GPS', 'MANUAL', 'GEOCODE', 'NONE');

-- CreateTable
CREATE TABLE "ClienteGeoReference" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "creditoId" TEXT,
  "latitud" DECIMAL(10,7) NOT NULL,
  "longitud" DECIMAL(10,7) NOT NULL,
  "source" "ClienteGeoReferenceSource" NOT NULL,
  "isApproximate" BOOLEAN NOT NULL DEFAULT false,
  "confidence" INTEGER NOT NULL,
  "provider" TEXT,
  "placeId" TEXT,
  "normalizedAddressQuery" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClienteGeoReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteGeoReference_clienteId_updatedAt_idx" ON "ClienteGeoReference"("clienteId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClienteGeoReference_creditoId_updatedAt_idx" ON "ClienteGeoReference"("creditoId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClienteGeoReference_clienteId_creditoId_updatedAt_idx" ON "ClienteGeoReference"("clienteId", "creditoId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClienteGeoReference_source_confidence_updatedAt_idx" ON "ClienteGeoReference"("source", "confidence", "updatedAt");

-- AddForeignKey
ALTER TABLE "ClienteGeoReference"
  ADD CONSTRAINT "ClienteGeoReference_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteGeoReference"
  ADD CONSTRAINT "ClienteGeoReference_creditoId_fkey"
  FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
