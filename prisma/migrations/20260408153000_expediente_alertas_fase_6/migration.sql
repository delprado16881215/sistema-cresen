-- CreateEnum
CREATE TYPE "ExpedienteAlertaTipo" AS ENUM (
  'SHARED_PHONE',
  'SHARED_ADDRESS',
  'SHARED_GUARANTOR',
  'CLIENT_GUARANTOR_SAME_PHONE',
  'EARLY_CONTACT_FAILURE',
  'ADDRESS_NOT_LOCATED_EARLY',
  'CLUSTERED_RISK_BY_PROMOTORIA',
  'EXPEDIENTE_DEBIL',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "ExpedienteAlertaSeveridad" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExpedienteAlertaStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED', 'CONFIRMED_PATTERN');

-- CreateTable
CREATE TABLE "ExpedienteAlerta" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "clienteId" TEXT,
  "creditoId" TEXT,
  "promotoriaId" TEXT,
  "tipoAlerta" "ExpedienteAlertaTipo" NOT NULL,
  "severidad" "ExpedienteAlertaSeveridad" NOT NULL,
  "descripcion" TEXT NOT NULL,
  "evidenciaJson" JSONB NOT NULL,
  "status" "ExpedienteAlertaStatus" NOT NULL DEFAULT 'OPEN',
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpedienteAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpedienteAlerta_fingerprint_key" ON "ExpedienteAlerta"("fingerprint");

-- CreateIndex
CREATE INDEX "ExpedienteAlerta_clienteId_status_isCurrent_idx" ON "ExpedienteAlerta"("clienteId", "status", "isCurrent");

-- CreateIndex
CREATE INDEX "ExpedienteAlerta_creditoId_status_isCurrent_idx" ON "ExpedienteAlerta"("creditoId", "status", "isCurrent");

-- CreateIndex
CREATE INDEX "ExpedienteAlerta_promotoriaId_status_isCurrent_idx" ON "ExpedienteAlerta"("promotoriaId", "status", "isCurrent");

-- CreateIndex
CREATE INDEX "ExpedienteAlerta_tipoAlerta_severidad_status_idx" ON "ExpedienteAlerta"("tipoAlerta", "severidad", "status");

-- CreateIndex
CREATE INDEX "ExpedienteAlerta_status_isCurrent_detectedAt_idx" ON "ExpedienteAlerta"("status", "isCurrent", "detectedAt");

-- AddForeignKey
ALTER TABLE "ExpedienteAlerta"
  ADD CONSTRAINT "ExpedienteAlerta_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteAlerta"
  ADD CONSTRAINT "ExpedienteAlerta_creditoId_fkey"
  FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteAlerta"
  ADD CONSTRAINT "ExpedienteAlerta_promotoriaId_fkey"
  FOREIGN KEY ("promotoriaId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteAlerta"
  ADD CONSTRAINT "ExpedienteAlerta_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
