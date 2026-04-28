CREATE TABLE "SystemCounter" (
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemCounter_pkey" PRIMARY KEY ("key")
);
