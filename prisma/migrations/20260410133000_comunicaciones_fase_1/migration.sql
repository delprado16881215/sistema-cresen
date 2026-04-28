CREATE TYPE "MessageType" AS ENUM (
  'PAYMENT_REMINDER',
  'COLLECTION_FOLLOWUP',
  'LEGAL_NOTICE',
  'RENEWAL_OFFER',
  'MANUAL_MESSAGE'
);

CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELED');

CREATE TYPE "CommunicationSourceContext" AS ENUM ('CLIENTE', 'CREDITO', 'COBRANZA', 'JURIDICO');

CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "MessageType" NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationLog" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "creditoId" TEXT,
  "templateId" TEXT,
  "channel" "CommunicationChannel" NOT NULL,
  "type" "MessageType" NOT NULL,
  "sourceContext" "CommunicationSourceContext" NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "renderedContent" TEXT NOT NULL,
  "templateName" TEXT,
  "providerKey" TEXT,
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "createdByUserId" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTemplate_type_channel_name_key"
ON "MessageTemplate"("type", "channel", "name");

CREATE INDEX "MessageTemplate_type_channel_isActive_idx"
ON "MessageTemplate"("type", "channel", "isActive");

CREATE INDEX "MessageTemplate_isActive_updatedAt_idx"
ON "MessageTemplate"("isActive", "updatedAt");

CREATE INDEX "CommunicationLog_clienteId_attemptedAt_idx"
ON "CommunicationLog"("clienteId", "attemptedAt");

CREATE INDEX "CommunicationLog_creditoId_attemptedAt_idx"
ON "CommunicationLog"("creditoId", "attemptedAt");

CREATE INDEX "CommunicationLog_templateId_attemptedAt_idx"
ON "CommunicationLog"("templateId", "attemptedAt");

CREATE INDEX "CommunicationLog_status_attemptedAt_idx"
ON "CommunicationLog"("status", "attemptedAt");

CREATE INDEX "CommunicationLog_sourceContext_attemptedAt_idx"
ON "CommunicationLog"("sourceContext", "attemptedAt");

CREATE INDEX "CommunicationLog_channel_type_attemptedAt_idx"
ON "CommunicationLog"("channel", "type", "attemptedAt");

ALTER TABLE "MessageTemplate"
ADD CONSTRAINT "MessageTemplate_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageTemplate"
ADD CONSTRAINT "MessageTemplate_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationLog"
ADD CONSTRAINT "CommunicationLog_clienteId_fkey"
FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommunicationLog"
ADD CONSTRAINT "CommunicationLog_creditoId_fkey"
FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationLog"
ADD CONSTRAINT "CommunicationLog_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationLog"
ADD CONSTRAINT "CommunicationLog_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
