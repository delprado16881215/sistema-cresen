CREATE TYPE "LegalCreditStatus" AS ENUM ('NONE', 'PRELEGAL', 'LEGAL_REVIEW', 'IN_LAWSUIT', 'LEGAL_CLOSED');

CREATE TYPE "ClientePlacementStatus" AS ENUM ('ELIGIBLE', 'BLOCKED_LEGAL');

CREATE TYPE "LegalCreditEventType" AS ENUM ('SEND_TO_LEGAL', 'STATUS_CHANGE');

ALTER TABLE "Cliente"
ADD COLUMN "placementStatus" "ClientePlacementStatus" NOT NULL DEFAULT 'ELIGIBLE',
ADD COLUMN "placementBlockedAt" TIMESTAMP(3),
ADD COLUMN "placementBlockReason" TEXT,
ADD COLUMN "placementBlockSourceCreditoId" TEXT;

ALTER TABLE "Credito"
ADD COLUMN "legalStatus" "LegalCreditStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "legalStatusChangedAt" TIMESTAMP(3),
ADD COLUMN "sentToLegalAt" TIMESTAMP(3),
ADD COLUMN "legalStatusReason" TEXT,
ADD COLUMN "legalStatusNotes" TEXT,
ADD COLUMN "legalUpdatedByUserId" TEXT;

CREATE TABLE "CreditoLegalEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "eventType" "LegalCreditEventType" NOT NULL,
    "previousStatus" "LegalCreditStatus" NOT NULL,
    "nextStatus" "LegalCreditStatus" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "observaciones" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditoLegalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Cliente_placementStatus_idx" ON "Cliente"("placementStatus");
CREATE INDEX "Credito_legalStatus_idx" ON "Credito"("legalStatus");
CREATE INDEX "CreditoLegalEvent_creditoId_createdAt_idx" ON "CreditoLegalEvent"("creditoId", "createdAt");
CREATE INDEX "CreditoLegalEvent_clienteId_createdAt_idx" ON "CreditoLegalEvent"("clienteId", "createdAt");
CREATE INDEX "CreditoLegalEvent_eventType_createdAt_idx" ON "CreditoLegalEvent"("eventType", "createdAt");

ALTER TABLE "CreditoLegalEvent"
ADD CONSTRAINT "CreditoLegalEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditoLegalEvent"
ADD CONSTRAINT "CreditoLegalEvent_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditoLegalEvent"
ADD CONSTRAINT "CreditoLegalEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
