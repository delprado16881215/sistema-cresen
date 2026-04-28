-- CreateEnum
CREATE TYPE "InteraccionTipo" AS ENUM ('CALL', 'WHATSAPP', 'SMS', 'VISIT', 'NOTE');

-- CreateEnum
CREATE TYPE "InteraccionCanal" AS ENUM ('PHONE', 'WHATSAPP', 'SMS', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "InteraccionResultado" AS ENUM (
  'NO_ANSWER',
  'CONTACTED',
  'PROMISE_REGISTERED',
  'PAID_REPORTED',
  'REFUSED',
  'WRONG_NUMBER',
  'NOT_AVAILABLE',
  'FOLLOW_UP_REQUIRED',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "PromesaPagoEstado" AS ENUM ('PENDING', 'FULFILLED', 'BROKEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitaCampoResultado" AS ENUM (
  'VISIT_SUCCESSFUL',
  'CLIENT_NOT_HOME',
  'ADDRESS_NOT_FOUND',
  'PAYMENT_COLLECTED_REPORTED',
  'FOLLOW_UP_REQUIRED',
  'REFUSED_CONTACT',
  'OTHER'
);

-- CreateTable
CREATE TABLE "Interaccion" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "creditoId" TEXT,
  "tipo" "InteraccionTipo" NOT NULL,
  "canal" "InteraccionCanal",
  "resultado" "InteraccionResultado" NOT NULL,
  "fechaHora" TIMESTAMP(3) NOT NULL,
  "duracionSegundos" INTEGER,
  "notas" TEXT,
  "telefonoUsado" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Interaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromesaPago" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "creditoId" TEXT,
  "interaccionId" TEXT,
  "fechaPromesa" TIMESTAMP(3) NOT NULL,
  "montoPrometido" DECIMAL(12,2),
  "estado" "PromesaPagoEstado" NOT NULL DEFAULT 'PENDING',
  "notas" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PromesaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitaCampo" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "creditoId" TEXT,
  "interaccionId" TEXT,
  "fechaHora" TIMESTAMP(3) NOT NULL,
  "resultado" "VisitaCampoResultado" NOT NULL,
  "notas" TEXT,
  "direccionTexto" TEXT,
  "referenciaLugar" TEXT,
  "latitud" DECIMAL(10,7),
  "longitud" DECIMAL(10,7),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VisitaCampo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interaccion_clienteId_fechaHora_idx" ON "Interaccion"("clienteId", "fechaHora");

-- CreateIndex
CREATE INDEX "Interaccion_creditoId_fechaHora_idx" ON "Interaccion"("creditoId", "fechaHora");

-- CreateIndex
CREATE INDEX "Interaccion_tipo_fechaHora_idx" ON "Interaccion"("tipo", "fechaHora");

-- CreateIndex
CREATE INDEX "Interaccion_resultado_fechaHora_idx" ON "Interaccion"("resultado", "fechaHora");

-- CreateIndex
CREATE INDEX "PromesaPago_clienteId_fechaPromesa_idx" ON "PromesaPago"("clienteId", "fechaPromesa");

-- CreateIndex
CREATE INDEX "PromesaPago_creditoId_fechaPromesa_idx" ON "PromesaPago"("creditoId", "fechaPromesa");

-- CreateIndex
CREATE INDEX "PromesaPago_interaccionId_idx" ON "PromesaPago"("interaccionId");

-- CreateIndex
CREATE INDEX "PromesaPago_estado_fechaPromesa_idx" ON "PromesaPago"("estado", "fechaPromesa");

-- CreateIndex
CREATE INDEX "VisitaCampo_clienteId_fechaHora_idx" ON "VisitaCampo"("clienteId", "fechaHora");

-- CreateIndex
CREATE INDEX "VisitaCampo_creditoId_fechaHora_idx" ON "VisitaCampo"("creditoId", "fechaHora");

-- CreateIndex
CREATE INDEX "VisitaCampo_interaccionId_idx" ON "VisitaCampo"("interaccionId");

-- CreateIndex
CREATE INDEX "VisitaCampo_resultado_fechaHora_idx" ON "VisitaCampo"("resultado", "fechaHora");

-- AddForeignKey
ALTER TABLE "Interaccion"
  ADD CONSTRAINT "Interaccion_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaccion"
  ADD CONSTRAINT "Interaccion_creditoId_fkey"
  FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaccion"
  ADD CONSTRAINT "Interaccion_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago"
  ADD CONSTRAINT "PromesaPago_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago"
  ADD CONSTRAINT "PromesaPago_creditoId_fkey"
  FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago"
  ADD CONSTRAINT "PromesaPago_interaccionId_fkey"
  FOREIGN KEY ("interaccionId") REFERENCES "Interaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromesaPago"
  ADD CONSTRAINT "PromesaPago_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitaCampo"
  ADD CONSTRAINT "VisitaCampo_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitaCampo"
  ADD CONSTRAINT "VisitaCampo_creditoId_fkey"
  FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitaCampo"
  ADD CONSTRAINT "VisitaCampo_interaccionId_fkey"
  FOREIGN KEY ("interaccionId") REFERENCES "Interaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitaCampo"
  ADD CONSTRAINT "VisitaCampo_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
