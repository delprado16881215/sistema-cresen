-- Permite crear clientes sin grupo y conserva la relacion para asignacion posterior.
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_grupoId_fkey";

ALTER TABLE "Cliente"
ALTER COLUMN "grupoId" DROP NOT NULL;

ALTER TABLE "Cliente"
ADD CONSTRAINT "Cliente_grupoId_fkey"
FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
