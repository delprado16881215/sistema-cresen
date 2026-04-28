'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeactivateSupervisionButton } from '@/modules/supervisiones/deactivate-supervision-button';

export type SupervisionRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  promotoriasCount: number;
};

type SupervisionesTableProps = {
  rows: SupervisionRow[];
  search: string;
  isActive: 'all' | 'true' | 'false';
};

export function SupervisionesTable({ rows, search, isActive }: SupervisionesTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search);

  const columns = useMemo<ColumnDef<SupervisionRow>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Clave',
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: 'Supervisión',
      },
      {
        accessorKey: 'promotoriasCount',
        header: 'Promotorías',
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.isActive ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>,
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/supervisiones/${row.original.id}`}>Ver</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/supervisiones/${row.original.id}/editar`}>Editar</Link>
            </Button>
            <DeactivateSupervisionButton supervisionId={row.original.id} disabled={!row.original.isActive} />
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    if (isActive !== 'all') params.set('isActive', isActive);
    router.push(`/supervisiones?${params.toString()}`);
  };

  const applyStatus = (next: 'all' | 'true' | 'false') => {
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    if (next !== 'all') params.set('isActive', next);
    router.push(`/supervisiones?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full gap-2 md:max-w-xl">
            <Input
              placeholder="Buscar por clave o nombre"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters();
              }}
            />
            <Button variant="secondary" onClick={applyFilters}>
              Buscar
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant={isActive === 'all' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('all')}>
              Todas
            </Button>
            <Button variant={isActive === 'true' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('true')}>
              Activas
            </Button>
            <Button variant={isActive === 'false' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('false')}>
              Inactivas
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={header.id === 'actions' ? 'text-right' : undefined}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.id === 'actions' ? 'text-right' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Sin resultados para los filtros actuales.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
