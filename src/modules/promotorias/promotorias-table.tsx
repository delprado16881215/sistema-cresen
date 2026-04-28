import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type PromotoriaRow = {
  id: string;
  code: string;
  name: string;
  supervisionName: string | null;
  clientesCount: number;
  isActive: boolean;
};

export function PromotoriasTable({ rows }: { rows: PromotoriaRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Clave</TableHead>
          <TableHead>Promotoría</TableHead>
          <TableHead>Supervisión</TableHead>
          <TableHead>Clientes</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-primary">{row.code}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.supervisionName ?? 'Sin supervisión'}</TableCell>
            <TableCell>{row.clientesCount}</TableCell>
            <TableCell>{row.isActive ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/promotorias/${row.id}`}>Ver</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/promotorias/${row.id}/editar`}>Editar</Link>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )) : (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
              No hay promotorías registradas.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
