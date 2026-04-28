'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type ClienteRow = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  postalCode: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  promotoriaName: string | null;
  supervisionName: string | null;
  clientTypeName: string | null;
};

type ClientesTableProps = {
  rows: ClienteRow[];
  search: string;
  isActive: 'all' | 'true' | 'false';
  page: number;
  pageSize: number;
  total: number;
};

export function ClientesTable({ rows, search, isActive, page, pageSize, total }: ClientesTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(search);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = useMemo<ColumnDef<ClienteRow>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Código',
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.code}</span>,
      },
      {
        accessorKey: 'fullName',
        header: 'Cliente',
      },
      {
        accessorKey: 'phone',
        header: 'Teléfono',
      },
      {
        accessorKey: 'postalCode',
        header: 'CP',
      },
      {
        id: 'ubicacion',
        header: 'Ubicación',
        cell: ({ row }) => `${row.original.city ?? '-'}, ${row.original.state ?? '-'}`,
      },
      {
        accessorKey: 'promotoriaName',
        header: 'Promotoría',
        cell: ({ row }) => row.original.promotoriaName ?? 'Sin asignar',
      },
      {
        accessorKey: 'supervisionName',
        header: 'Supervisión',
        cell: ({ row }) => row.original.supervisionName ?? 'Derivada al asignar',
      },
      {
        accessorKey: 'isActive',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.isActive ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>,
      },
      {
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/clientes/${row.original.id}`}>Ver</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/clientes/${row.original.id}/editar`}>Editar</Link>
            </Button>
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

  const applyFilters = (nextPage = 1) => {
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    if (isActive !== 'all') params.set('isActive', isActive);
    params.set('page', String(nextPage));
    params.set('pageSize', String(pageSize));
    router.push(`/clientes?${params.toString()}`);
  };

  const applyStatus = (next: 'all' | 'true' | 'false') => {
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    if (next !== 'all') params.set('isActive', next);
    params.set('page', '1');
    params.set('pageSize', String(pageSize));
    router.push(`/clientes?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full gap-2 md:max-w-xl">
            <Input
              placeholder="Buscar por nombre, teléfono, dirección, CP o código"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters(1);
              }}
            />
            <Button variant="secondary" onClick={() => applyFilters(1)}>
              Buscar
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant={isActive === 'all' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('all')}>
              Todos
            </Button>
            <Button variant={isActive === 'true' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('true')}>
              Activos
            </Button>
            <Button variant={isActive === 'false' ? 'default' : 'outline'} size="sm" onClick={() => applyStatus('false')}>
              Inactivos
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={9}>
                  Sin resultados para los filtros actuales.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages} · {total} registros
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => applyFilters(page - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => applyFilters(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
