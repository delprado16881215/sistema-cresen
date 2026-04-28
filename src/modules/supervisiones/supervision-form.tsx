'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupervisionSchema, type CreateSupervisionInput } from '@/server/validators/supervision';

type SupervisionFormProps = {
  mode: 'create' | 'edit';
  supervisionId?: string;
  defaultValues?: Partial<CreateSupervisionInput>;
};

export function SupervisionForm({ mode, supervisionId, defaultValues }: SupervisionFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateSupervisionInput>({
    resolver: zodResolver(createSupervisionSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);

    const response = await fetch(mode === 'create' ? '/api/supervisiones' : `/api/supervisiones/${supervisionId}`, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError(body.message ?? 'No se pudo guardar la supervisión.');
      return;
    }

    router.push('/supervisiones');
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
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/supervisiones')}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent">
          Guardar supervisión
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
