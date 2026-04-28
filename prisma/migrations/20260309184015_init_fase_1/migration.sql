-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "InstallmentKind" AS ENUM ('REGULAR', 'EXTRA');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('CURRENT', 'RECOVERY', 'ADVANCE', 'EXTRA_WEEK', 'PENALTY');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ExtraWeekStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'EXEMPT', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReversalSourceType" AS ENUM ('PAYMENT_EVENT', 'PENALTY_CHARGE', 'ADVANCE_EVENT', 'RECOVERY_EVENT', 'EXTRA_WEEK_EVENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "userTypeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "UserType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTypeCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClientTypeCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditStatusCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreditStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyStatusCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PenaltyStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatusCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PaymentStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentStatusCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InstallmentStatusCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotora" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "zoneId" TEXT,
    "observations" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotoraGrupo" (
    "id" TEXT NOT NULL,
    "promotoraId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PromotoraGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "address" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "betweenStreets" TEXT,
    "referencesNotes" TEXT,
    "observations" TEXT,
    "clientTypeId" TEXT,
    "grupoId" TEXT NOT NULL,
    "searchableName" TEXT,
    "searchablePhone" TEXT,
    "searchableAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPlanRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "weeks" INTEGER NOT NULL,
    "weeklyFactor" DECIMAL(10,6),
    "formulaExpression" TEXT,
    "roundingRule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPlanRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credito" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "loanNumber" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "promotoraId" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "creditPlanRuleId" TEXT NOT NULL,
    "planCodeSnapshot" TEXT NOT NULL,
    "planVersionSnapshot" INTEGER NOT NULL,
    "planWeeksSnapshot" INTEGER NOT NULL,
    "planFactorSnapshot" DECIMAL(10,6),
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "weeklyAmount" DECIMAL(12,2) NOT NULL,
    "totalWeeks" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "creditStatusId" TEXT NOT NULL,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditSchedule" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "kind" "InstallmentKind" NOT NULL DEFAULT 'REGULAR',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installmentStatusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "paymentStatusId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amountReceived" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "capturedByUserId" TEXT NOT NULL,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentEventId" TEXT NOT NULL,
    "allocationType" "AllocationType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "scheduleId" TEXT,
    "defaultEventId" TEXT,
    "penaltyChargeId" TEXT,
    "extraWeekEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "amountMissed" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefaultEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenaltyCharge" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "defaultEventId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "penaltyStatusId" TEXT NOT NULL,
    "condonedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenaltyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "paymentEventId" TEXT NOT NULL,
    "defaultEventId" TEXT NOT NULL,
    "recoveredAmount" DECIMAL(12,2) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "paymentEventId" TEXT NOT NULL,
    "recordedOnInstallmentId" TEXT NOT NULL,
    "coversInstallmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "AdvanceStatus" NOT NULL,
    "isApplied" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraWeekEvent" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "extraWeekNumber" INTEGER NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ExtraWeekStatus" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "generatedByUserId" TEXT NOT NULL,
    "paymentEventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraWeekEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" "SettingValueType" NOT NULL,
    "valueString" TEXT,
    "valueNumber" DECIMAL(14,4),
    "valueBoolean" BOOLEAN,
    "valueJson" JSONB,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEventLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "creditoId" TEXT,
    "eventType" TEXT NOT NULL,
    "referenceTable" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previousHash" TEXT,
    "currentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReversal" (
    "id" TEXT NOT NULL,
    "sourceType" "ReversalSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "reversedByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "compensationPaymentEventId" TEXT,

    CONSTRAINT "FinancialReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserType_code_key" ON "UserType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTypeCatalog_code_key" ON "ClientTypeCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CreditStatusCatalog_code_key" ON "CreditStatusCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PenaltyStatusCatalog_code_key" ON "PenaltyStatusCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentStatusCatalog_code_key" ON "PaymentStatusCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentStatusCatalog_code_key" ON "InstallmentStatusCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Promotora_code_key" ON "Promotora"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_code_key" ON "Grupo"("code");

-- CreateIndex
CREATE INDEX "PromotoraGrupo_promotoraId_assignedAt_idx" ON "PromotoraGrupo"("promotoraId", "assignedAt");

-- CreateIndex
CREATE INDEX "PromotoraGrupo_grupoId_assignedAt_idx" ON "PromotoraGrupo"("grupoId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_code_key" ON "Cliente"("code");

-- CreateIndex
CREATE INDEX "Cliente_fullName_idx" ON "Cliente"("fullName");

-- CreateIndex
CREATE INDEX "Cliente_phone_idx" ON "Cliente"("phone");

-- CreateIndex
CREATE INDEX "Cliente_secondaryPhone_idx" ON "Cliente"("secondaryPhone");

-- CreateIndex
CREATE INDEX "Cliente_postalCode_idx" ON "Cliente"("postalCode");

-- CreateIndex
CREATE INDEX "Cliente_searchableName_idx" ON "Cliente"("searchableName");

-- CreateIndex
CREATE INDEX "Cliente_searchablePhone_idx" ON "Cliente"("searchablePhone");

-- CreateIndex
CREATE INDEX "Cliente_searchableAddress_idx" ON "Cliente"("searchableAddress");

-- CreateIndex
CREATE INDEX "Cliente_grupoId_idx" ON "Cliente"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPlanRule_code_version_key" ON "CreditPlanRule"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Credito_folio_key" ON "Credito"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Credito_loanNumber_key" ON "Credito"("loanNumber");

-- CreateIndex
CREATE INDEX "Credito_clienteId_idx" ON "Credito"("clienteId");

-- CreateIndex
CREATE INDEX "Credito_promotoraId_idx" ON "Credito"("promotoraId");

-- CreateIndex
CREATE INDEX "Credito_grupoId_idx" ON "Credito"("grupoId");

-- CreateIndex
CREATE INDEX "Credito_creditStatusId_idx" ON "Credito"("creditStatusId");

-- CreateIndex
CREATE INDEX "Credito_creditPlanRuleId_idx" ON "Credito"("creditPlanRuleId");

-- CreateIndex
CREATE INDEX "CreditSchedule_creditoId_dueDate_idx" ON "CreditSchedule"("creditoId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditSchedule_creditoId_installmentNumber_key" ON "CreditSchedule"("creditoId", "installmentNumber");

-- CreateIndex
CREATE INDEX "PaymentEvent_creditoId_receivedAt_idx" ON "PaymentEvent"("creditoId", "receivedAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentStatusId_idx" ON "PaymentEvent"("paymentStatusId");

-- CreateIndex
CREATE INDEX "PaymentEvent_isReversed_idx" ON "PaymentEvent"("isReversed");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentEventId_idx" ON "PaymentAllocation"("paymentEventId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_allocationType_idx" ON "PaymentAllocation"("allocationType");

-- CreateIndex
CREATE INDEX "PaymentAllocation_scheduleId_idx" ON "PaymentAllocation"("scheduleId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_defaultEventId_idx" ON "PaymentAllocation"("defaultEventId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_penaltyChargeId_idx" ON "PaymentAllocation"("penaltyChargeId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_extraWeekEventId_idx" ON "PaymentAllocation"("extraWeekEventId");

-- CreateIndex
CREATE INDEX "DefaultEvent_creditoId_createdAt_idx" ON "DefaultEvent"("creditoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultEvent_scheduleId_key" ON "DefaultEvent"("scheduleId");

-- CreateIndex
CREATE INDEX "PenaltyCharge_creditoId_idx" ON "PenaltyCharge"("creditoId");

-- CreateIndex
CREATE INDEX "PenaltyCharge_defaultEventId_idx" ON "PenaltyCharge"("defaultEventId");

-- CreateIndex
CREATE INDEX "PenaltyCharge_penaltyStatusId_idx" ON "PenaltyCharge"("penaltyStatusId");

-- CreateIndex
CREATE INDEX "RecoveryEvent_creditoId_createdAt_idx" ON "RecoveryEvent"("creditoId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveryEvent_defaultEventId_idx" ON "RecoveryEvent"("defaultEventId");

-- CreateIndex
CREATE INDEX "AdvanceEvent_creditoId_createdAt_idx" ON "AdvanceEvent"("creditoId", "createdAt");

-- CreateIndex
CREATE INDEX "AdvanceEvent_recordedOnInstallmentId_idx" ON "AdvanceEvent"("recordedOnInstallmentId");

-- CreateIndex
CREATE INDEX "AdvanceEvent_coversInstallmentId_idx" ON "AdvanceEvent"("coversInstallmentId");

-- CreateIndex
CREATE INDEX "AdvanceEvent_status_idx" ON "AdvanceEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraWeekEvent_creditoId_key" ON "ExtraWeekEvent"("creditoId");

-- CreateIndex
CREATE INDEX "ExtraWeekEvent_dueDate_idx" ON "ExtraWeekEvent"("dueDate");

-- CreateIndex
CREATE INDEX "ExtraWeekEvent_status_idx" ON "ExtraWeekEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRule_key_key" ON "BusinessRule"("key");

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "FinancialEventLog_creditoId_createdAt_idx" ON "FinancialEventLog"("creditoId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialEventLog_eventType_createdAt_idx" ON "FinancialEventLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialReversal_creditoId_reversedAt_idx" ON "FinancialReversal"("creditoId", "reversedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReversal_sourceType_sourceId_key" ON "FinancialReversal"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userTypeId_fkey" FOREIGN KEY ("userTypeId") REFERENCES "UserType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotora" ADD CONSTRAINT "Promotora_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grupo" ADD CONSTRAINT "Grupo_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotoraGrupo" ADD CONSTRAINT "PromotoraGrupo_promotoraId_fkey" FOREIGN KEY ("promotoraId") REFERENCES "Promotora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotoraGrupo" ADD CONSTRAINT "PromotoraGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_clientTypeId_fkey" FOREIGN KEY ("clientTypeId") REFERENCES "ClientTypeCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_creditPlanRuleId_fkey" FOREIGN KEY ("creditPlanRuleId") REFERENCES "CreditPlanRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_creditStatusId_fkey" FOREIGN KEY ("creditStatusId") REFERENCES "CreditStatusCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_promotoraId_fkey" FOREIGN KEY ("promotoraId") REFERENCES "Promotora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSchedule" ADD CONSTRAINT "CreditSchedule_installmentStatusId_fkey" FOREIGN KEY ("installmentStatusId") REFERENCES "InstallmentStatusCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSchedule" ADD CONSTRAINT "CreditSchedule_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentStatusId_fkey" FOREIGN KEY ("paymentStatusId") REFERENCES "PaymentStatusCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CreditSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_defaultEventId_fkey" FOREIGN KEY ("defaultEventId") REFERENCES "DefaultEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_penaltyChargeId_fkey" FOREIGN KEY ("penaltyChargeId") REFERENCES "PenaltyCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_extraWeekEventId_fkey" FOREIGN KEY ("extraWeekEventId") REFERENCES "ExtraWeekEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultEvent" ADD CONSTRAINT "DefaultEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultEvent" ADD CONSTRAINT "DefaultEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CreditSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyCharge" ADD CONSTRAINT "PenaltyCharge_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyCharge" ADD CONSTRAINT "PenaltyCharge_defaultEventId_fkey" FOREIGN KEY ("defaultEventId") REFERENCES "DefaultEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenaltyCharge" ADD CONSTRAINT "PenaltyCharge_penaltyStatusId_fkey" FOREIGN KEY ("penaltyStatusId") REFERENCES "PenaltyStatusCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEvent" ADD CONSTRAINT "RecoveryEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEvent" ADD CONSTRAINT "RecoveryEvent_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEvent" ADD CONSTRAINT "RecoveryEvent_defaultEventId_fkey" FOREIGN KEY ("defaultEventId") REFERENCES "DefaultEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEvent" ADD CONSTRAINT "AdvanceEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEvent" ADD CONSTRAINT "AdvanceEvent_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEvent" ADD CONSTRAINT "AdvanceEvent_recordedOnInstallmentId_fkey" FOREIGN KEY ("recordedOnInstallmentId") REFERENCES "CreditSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEvent" ADD CONSTRAINT "AdvanceEvent_coversInstallmentId_fkey" FOREIGN KEY ("coversInstallmentId") REFERENCES "CreditSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraWeekEvent" ADD CONSTRAINT "ExtraWeekEvent_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraWeekEvent" ADD CONSTRAINT "ExtraWeekEvent_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEventLog" ADD CONSTRAINT "FinancialEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEventLog" ADD CONSTRAINT "FinancialEventLog_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReversal" ADD CONSTRAINT "FinancialReversal_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReversal" ADD CONSTRAINT "FinancialReversal_compensationPaymentEventId_fkey" FOREIGN KEY ("compensationPaymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
