'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { createPromotoriaSchema, type CreatePromotoriaInput } from '@/server/validators/promotoria';

type PromotoriaFormProps = {
  mode: 'create' | 'edit';
  promotoriaId?: string;
  defaultValues?: Partial<CreatePromotoriaInput>;
  supervisiones: Array<{ id: string; code: string; name: string }>;
};

export function PromotoriaForm({ mode, promotoriaId, defaultValues, supervisiones }: PromotoriaFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const supervisionOptions = useMemo<SearchSelectOption[]>(
    () =>
      supervisiones.map((supervision) => ({
        id: supervision.id,
        label: `${supervision.code} · ${supervision.name}`,
        keywords: [supervision.code, supervision.name],
      })),
    [supervisiones],
  );

  const form = useForm<CreatePromotoriaInput>({
    resolver: zodResolver(createPromotoriaSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      supervisionId: defaultValues?.supervisionId ?? supervisiones[0]?.id ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  });
  const selectedSupervisionOption =
    supervisionOptions.find((option) => option.id === form.watch('supervisionId')) ?? null;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const response = await fetch(mode === 'create' ? '/api/promotorias' : `/api/promotorias/${promotoriaId}`, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError(body.message ?? 'No se pudo guardar la promotoría.');
      return;
    }

    router.push('/promotorias');
    router.refresh();
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Clave" error={form.formState.errors.code?.message}>
          <Input
            value={form.watch('code')}
            className="uppercase"
            onChange={(event) => form.setValue('code', event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
          />
        </Field>
        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <Input
            value={form.watch('name')}
            className="uppercase"
            onChange={(event) => form.setValue('name', event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
          />
        </Field>
        <Field label="Supervisión" error={form.formState.errors.supervisionId?.message}>
          <SearchSelect
            value={selectedSupervisionOption}
            onSelect={(option) =>
              form.setValue('supervisionId', option?.id ?? '', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={supervisionOptions}
            placeholder="Buscar supervisión por clave o nombre"
            emptyMessage="No encontramos supervisiones con ese criterio."
            allowClear={false}
            helperText="Filtra por clave o nombre para asignar la supervisión operativa."
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/promotorias')}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent">
          Guardar promotoría
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
