ALTER TYPE "LegalCreditEventType" RENAME VALUE 'STATUS_CHANGE' TO 'CHANGE_LEGAL_STATUS';

ALTER TYPE "LegalCreditEventType" ADD VALUE IF NOT EXISTS 'LEGAL_NOTE';

CREATE TABLE "CreditoLegalMetadata" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "assignedAttorneyName" TEXT,
    "assignedLawOfficeName" TEXT,
    "judicialCaseNumber" TEXT,
    "settlementNotes" TEXT,
    "judicialRecoveryNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditoLegalMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditoLegalMetadata_creditoId_key" ON "CreditoLegalMetadata"("creditoId");

ALTER TABLE "CreditoLegalMetadata"
ADD CONSTRAINT "CreditoLegalMetadata_creditoId_fkey"
FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
