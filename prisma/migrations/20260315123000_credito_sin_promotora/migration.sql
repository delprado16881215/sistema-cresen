-- El modelo operativo nuevo usa Promotoria; la columna legacy promotoraId queda opcional.
ALTER TABLE "Credito"
ALTER COLUMN "promotoraId" DROP NOT NULL;
