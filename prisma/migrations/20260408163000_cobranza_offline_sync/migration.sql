CREATE TYPE "CobranzaSyncLedgerType" AS ENUM ('INTERACTION', 'PROMESA', 'VISITA');

CREATE TABLE "CobranzaSyncLedger" (
  "eventId" TEXT NOT NULL,
  "type" "CobranzaSyncLedgerType" NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "syncedByUserId" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CobranzaSyncLedger_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "CobranzaSyncLedger_type_processedAt_idx" ON "CobranzaSyncLedger"("type", "processedAt");
CREATE INDEX "CobranzaSyncLedger_syncedByUserId_processedAt_idx" ON "CobranzaSyncLedger"("syncedByUserId", "processedAt");
