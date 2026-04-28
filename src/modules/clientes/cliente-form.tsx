'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClienteSchema, type CreateClienteInput } from '@/server/validators/cliente';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  formatPhoneForDisplay,
  normalizePhone,
  normalizePostalCode,
  toUppercaseInputValue,
} from '@/modules/clientes/cliente-normalizers';
import {
  isClienteDocumentStorageKey,
  isLegacyClienteDocumentPath,
  type ClienteDocumentType,
} from '@/modules/clientes/cliente-document-utils';
import { ClienteDocumentLink } from '@/modules/clientes/cliente-document-link';

type PostalCodeOption = {
  postalCode: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ClienteGeoResolutionState = {
  latitude: number | null;
  longitude: number | null;
  source: 'VISIT_GPS' | 'MANUAL' | 'GEOCODE' | 'NONE';
  isApproximate: boolean;
  isReliable: boolean;
  resolvedFrom: 'PERSISTED_CREDITO' | 'PERSISTED_CLIENTE' | 'VISIT_FALLBACK' | 'NONE';
  updatedAt: string | null;
  provider: string | null;
};

type ClienteFormDefaultValues = Partial<CreateClienteInput> & {
  code?: string;
  ineFrontPath?: string | null;
  ineBackPath?: string | null;
  pagareFrontPath?: string | null;
  pagareBackPath?: string | null;
  proofOfAddressPath?: string | null;
  currentGeoResolution?: ClienteGeoResolutionState;
};

type ClienteFormProps = {
  mode: 'create' | 'edit';
  clienteId?: string;
  defaultValues?: ClienteFormDefaultValues;
};

function getGeoSourceLabel(source: ClienteGeoResolutionState['source']) {
  if (source === 'MANUAL') return 'Manual';
  if (source === 'VISIT_GPS') return 'GPS de visita';
  if (source === 'GEOCODE') return 'Geocodificacion';
  return 'Sin referencia';
}

function getGeoSourceVariant(source: ClienteGeoResolutionState['source']) {
  if (source === 'MANUAL') return 'success' as const;
  if (source === 'VISIT_GPS') return 'secondary' as const;
  if (source === 'GEOCODE') return 'outline' as const;
  return 'outline' as const;
}

function getGeoResolutionLabel(resolvedFrom: ClienteGeoResolutionState['resolvedFrom']) {
  if (resolvedFrom === 'PERSISTED_CREDITO') return 'Referencia persistida por credito';
  if (resolvedFrom === 'PERSISTED_CLIENTE') return 'Referencia persistida por cliente';
  if (resolvedFrom === 'VISIT_FALLBACK') return 'GPS de ultima visita';
  return 'Sin resolucion vigente';
}

function getGeoPrecisionLabel(input: ClienteGeoResolutionState | null | undefined) {
  if (!input || input.source === 'NONE' || input.latitude == null || input.longitude == null) {
    return 'Sin coordenada vigente';
  }

  return input.isApproximate ? 'Coordenada aproximada' : 'Coordenada exacta';
}

function formatGeoTimestamp(value: string | null | undefined) {
  if (!value) return 'Sin actualizacion registrada';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getFieldErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as { message?: unknown };
  return typeof candidate.message === 'string' ? candidate.message : undefined;
}

export function ClienteForm({ mode, clienteId, defaultValues }: ClienteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [postalOptions, setPostalOptions] = useState<PostalCodeOption[]>([]);
  const [postalLookupStatus, setPostalLookupStatus] = useState<'idle' | 'loading' | 'loaded' | 'empty'>('idle');
  const [postalLookupError, setPostalLookupError] = useState<string | null>(null);
  const [ineFrontFileName, setIneFrontFileName] = useState<string | null>(null);
  const [ineBackFileName, setIneBackFileName] = useState<string | null>(null);
  const [pagareFrontFileName, setPagareFrontFileName] = useState<string | null>(null);
  const [pagareBackFileName, setPagareBackFileName] = useState<string | null>(null);
  const [proofOfAddressFileName, setProofOfAddressFileName] = useState<string | null>(null);
  const lastResolvedPostalCode = useRef<string>('');

  const form = useForm<CreateClienteInput>({
    resolver: zodResolver(createClienteSchema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? '',
      phone: defaultValues?.phone ?? '',
      secondaryPhone: defaultValues?.secondaryPhone ?? '',
      address: defaultValues?.address ?? '',
      postalCode: defaultValues?.postalCode ?? '',
      neighborhood: defaultValues?.neighborhood ?? '',
      city: defaultValues?.city ?? '',
      state: defaultValues?.state ?? '',
      betweenStreets: defaultValues?.betweenStreets ?? '',
      referencesNotes: defaultValues?.referencesNotes ?? '',
      observations: defaultValues?.observations ?? '',
      manualGeoLatitude: defaultValues?.manualGeoLatitude ?? null,
      manualGeoLongitude: defaultValues?.manualGeoLongitude ?? null,
      manualGeoIsApproximate: defaultValues?.manualGeoIsApproximate ?? false,
      manualGeoObservation: defaultValues?.manualGeoObservation ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  });

  const currentGeoResolution = defaultValues?.currentGeoResolution ?? null;
  const postalCode = form.watch('postalCode');
  const selectedNeighborhood = form.watch('neighborhood');
  const phone = form.watch('phone');
  const secondaryPhone = form.watch('secondaryPhone');
  const manualGeoLatitude = form.watch('manualGeoLatitude');
  const manualGeoLongitude = form.watch('manualGeoLongitude');
  const manualGeoIsApproximate = form.watch('manualGeoIsApproximate');
  const hasManualCoordinates = typeof manualGeoLatitude === 'number' && typeof manualGeoLongitude === 'number';

  useEffect(() => {
    const normalizedPostalCode = normalizePostalCode(postalCode);

    if (normalizedPostalCode !== postalCode) {
      form.setValue('postalCode', normalizedPostalCode, { shouldDirty: true });
      return;
    }

    if (normalizedPostalCode.length !== 5) {
      setPostalOptions([]);
      setPostalLookupStatus('idle');
      setPostalLookupError(null);
      lastResolvedPostalCode.current = '';
      return;
    }

    if (lastResolvedPostalCode.current === normalizedPostalCode) {
      return;
    }

    let cancelled = false;
    setPostalLookupStatus('loading');
    setPostalLookupError(null);

    const loadPostalCodeOptions = async () => {
      const response = await fetch(`/api/catalogos/codigos-postales/${normalizedPostalCode}`);
      if (!response.ok) {
        throw new Error('No se pudo consultar el codigo postal.');
      }

      const payload = (await response.json()) as { options: PostalCodeOption[] };
      if (cancelled) return;

      lastResolvedPostalCode.current = normalizedPostalCode;
      setPostalOptions(payload.options);
      setPostalLookupStatus(payload.options.length > 0 ? 'loaded' : 'empty');

      if (payload.options.length === 1) {
        const option = payload.options[0];
        if (!option) {
          return;
        }
        form.setValue('neighborhood', option.neighborhood, { shouldDirty: true, shouldValidate: true });
        form.setValue('city', option.city, { shouldDirty: true, shouldValidate: true });
        form.setValue('state', option.state, { shouldDirty: true, shouldValidate: true });
      }
    };

    loadPostalCodeOptions().catch((fetchError: unknown) => {
      if (cancelled) return;
      setPostalOptions([]);
      setPostalLookupStatus('empty');
      setPostalLookupError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar el codigo postal.');
    });

    return () => {
      cancelled = true;
    };
  }, [form, postalCode]);

  useEffect(() => {
    if (postalOptions.length === 0 || !selectedNeighborhood) {
      return;
    }

    const selectedOption = postalOptions.find((option) => option.neighborhood === selectedNeighborhood);
    if (!selectedOption) {
      return;
    }

    if (form.getValues('city') !== selectedOption.city) {
      form.setValue('city', selectedOption.city, { shouldDirty: true, shouldValidate: true });
    }

    if (form.getValues('state') !== selectedOption.state) {
      form.setValue('state', selectedOption.state, { shouldDirty: true, shouldValidate: true });
    }
  }, [form, postalOptions, selectedNeighborhood]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);

    const payload = {
      ...values,
      secondaryPhone: values.secondaryPhone || null,
      neighborhood: values.neighborhood || null,
      city: values.city || null,
      state: values.state || null,
      betweenStreets: values.betweenStreets || null,
      referencesNotes: values.referencesNotes || null,
      observations: values.observations || null,
    };

    const formData = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined) {
        formData.append(key, '');
      } else {
        formData.append(key, String(value));
      }
    }

    const ineFrontInput = document.getElementById('ineFront') as HTMLInputElement | null;
    const ineBackInput = document.getElementById('ineBack') as HTMLInputElement | null;
    const pagareFrontInput = document.getElementById('pagareFront') as HTMLInputElement | null;
    const pagareBackInput = document.getElementById('pagareBack') as HTMLInputElement | null;
    const proofOfAddressInput = document.getElementById('proofOfAddress') as HTMLInputElement | null;
    if (ineFrontInput?.files?.[0]) {
      formData.append('ineFront', ineFrontInput.files[0]);
    }
    if (ineBackInput?.files?.[0]) {
      formData.append('ineBack', ineBackInput.files[0]);
    }
    if (pagareFrontInput?.files?.[0]) {
      formData.append('pagareFront', pagareFrontInput.files[0]);
    }
    if (pagareBackInput?.files?.[0]) {
      formData.append('pagareBack', pagareBackInput.files[0]);
    }
    if (proofOfAddressInput?.files?.[0]) {
      formData.append('proofOfAddress', proofOfAddressInput.files[0]);
    }

    const response = await fetch(mode === 'create' ? '/api/clientes' : `/api/clientes/${clienteId}`, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      body: formData,
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError(body.message ?? 'No se pudo guardar el cliente.');
      return;
    }

    router.push('/clientes');
    router.refresh();
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Código">
          <Input
            readOnly
            value={mode === 'create' ? 'Se genera automáticamente al guardar' : defaultValues?.code ?? ''}
            className="bg-secondary/40 text-muted-foreground"
          />
        </Field>
        <Field label="Nombre completo" error={getFieldErrorMessage(form.formState.errors.fullName)}>
          <Input
            {...form.register('fullName')}
            autoComplete="name"
            className="uppercase"
            onChange={(event) =>
              form.setValue('fullName', toUppercaseInputValue(event.target.value) ?? '', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Teléfono" error={getFieldErrorMessage(form.formState.errors.phone)}>
          <Input
            value={formatPhoneForDisplay(phone)}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="000 000 0000"
            maxLength={12}
            className="tracking-[0.2em]"
            onChange={(event) =>
              form.setValue('phone', normalizePhone(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Teléfono secundario" error={getFieldErrorMessage(form.formState.errors.secondaryPhone)}>
          <Input
            value={formatPhoneForDisplay(secondaryPhone)}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="000 000 0000"
            maxLength={12}
            className="tracking-[0.2em]"
            onChange={(event) =>
              form.setValue('secondaryPhone', normalizePhone(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Dirección" error={getFieldErrorMessage(form.formState.errors.address)}>
          <Input
            {...form.register('address')}
            autoComplete="street-address"
            className="uppercase"
            onChange={(event) =>
              form.setValue('address', toUppercaseInputValue(event.target.value) ?? '', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Código postal" error={getFieldErrorMessage(form.formState.errors.postalCode)}>
          <Input
            value={postalCode}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000"
            maxLength={5}
            className="tracking-[0.25em]"
            onChange={(event) =>
              form.setValue('postalCode', normalizePostalCode(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Colonia" error={getFieldErrorMessage(form.formState.errors.neighborhood)}>
          {postalOptions.length > 0 ? (
            <Select
              value={selectedNeighborhood ?? ''}
              onChange={(event) =>
                form.setValue('neighborhood', event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="">Selecciona una colonia</option>
              {postalOptions.map((option) => (
                <option key={`${option.postalCode}-${option.neighborhood}`} value={option.neighborhood}>
                  {option.neighborhood}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              {...form.register('neighborhood')}
              autoComplete="address-level3"
              className="uppercase"
              onChange={(event) =>
                form.setValue('neighborhood', toUppercaseInputValue(event.target.value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          )}
        </Field>
        <Field label="Ciudad" error={getFieldErrorMessage(form.formState.errors.city)}>
          <Input
            {...form.register('city')}
            autoComplete="address-level2"
            readOnly={postalOptions.length > 0}
            className={postalOptions.length > 0 ? 'bg-secondary/40 uppercase text-muted-foreground' : 'uppercase'}
            onChange={(event) =>
              form.setValue('city', toUppercaseInputValue(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Estado" error={getFieldErrorMessage(form.formState.errors.state)}>
          <Input
            {...form.register('state')}
            autoComplete="address-level1"
            readOnly={postalOptions.length > 0}
            className={postalOptions.length > 0 ? 'bg-secondary/40 uppercase text-muted-foreground' : 'uppercase'}
            onChange={(event) =>
              form.setValue('state', toUppercaseInputValue(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Entre calles" error={getFieldErrorMessage(form.formState.errors.betweenStreets)}>
          <Input
            {...form.register('betweenStreets')}
            autoComplete="address-line2"
            className="uppercase"
            onChange={(event) =>
              form.setValue('betweenStreets', toUppercaseInputValue(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Referencias" error={getFieldErrorMessage(form.formState.errors.referencesNotes)}>
          <Textarea
            {...form.register('referencesNotes')}
            autoComplete="off"
            className="uppercase"
            onChange={(event) =>
              form.setValue('referencesNotes', toUppercaseInputValue(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
        <Field label="Observaciones" error={getFieldErrorMessage(form.formState.errors.observations)}>
          <Textarea
            {...form.register('observations')}
            autoComplete="off"
            className="uppercase"
            onChange={(event) =>
              form.setValue('observations', toUppercaseInputValue(event.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </Field>
      </div>

      <div className="rounded-2xl border border-border/80 bg-secondary/20 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Referencia geografica</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta captura registra una referencia manual en la capa geo separada del cliente. Si dejas
            latitud y longitud vacias, se conserva la referencia actual. Una referencia peor no
            reemplaza automaticamente una mejor.
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getGeoSourceVariant(currentGeoResolution?.source ?? 'NONE')}>
              {getGeoSourceLabel(currentGeoResolution?.source ?? 'NONE')}
            </Badge>
            <Badge variant="outline">{getGeoPrecisionLabel(currentGeoResolution)}</Badge>
            <Badge variant="outline">
              {getGeoResolutionLabel(currentGeoResolution?.resolvedFrom ?? 'NONE')}
            </Badge>
          </div>
          <div className="mt-3 space-y-1 text-sm text-foreground">
            <p>
              Coordenada actual:{' '}
              {currentGeoResolution?.latitude != null && currentGeoResolution.longitude != null
                ? `${currentGeoResolution.latitude}, ${currentGeoResolution.longitude}`
                : 'Sin coordenada vigente'}
            </p>
            <p className="text-muted-foreground">
              Actualizada: {formatGeoTimestamp(currentGeoResolution?.updatedAt)}
            </p>
            {currentGeoResolution?.provider ? (
              <p className="text-muted-foreground">Observacion registrada: {currentGeoResolution.provider}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Latitud manual" error={getFieldErrorMessage(form.formState.errors.manualGeoLatitude)}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.0000001"
              min={-90}
              max={90}
              value={manualGeoLatitude == null ? '' : String(manualGeoLatitude)}
              placeholder="21.5123456"
              onChange={(event) => {
                const value = event.target.value.trim();
                form.setValue('manualGeoLatitude', value ? Number(value) : null, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
          </Field>
          <Field label="Longitud manual" error={getFieldErrorMessage(form.formState.errors.manualGeoLongitude)}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.0000001"
              min={-180}
              max={180}
              value={manualGeoLongitude == null ? '' : String(manualGeoLongitude)}
              placeholder="-104.8943210"
              onChange={(event) => {
                const value = event.target.value.trim();
                form.setValue('manualGeoLongitude', value ? Number(value) : null, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
          </Field>
          <Field label="Precision de la coordenada">
            <Select
              value={manualGeoIsApproximate ? 'approximate' : 'exact'}
              onChange={(event) =>
                form.setValue('manualGeoIsApproximate', event.target.value === 'approximate', {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="exact">Exacta</option>
              <option value="approximate">Aproximada</option>
            </Select>
          </Field>
          <Field label="Fuente u observacion" error={getFieldErrorMessage(form.formState.errors.manualGeoObservation)}>
            <Input
              {...form.register('manualGeoObservation')}
              placeholder="EJ. COMPARTIDA POR EL CLIENTE EN MOSTRADOR"
              className="uppercase"
              onChange={(event) =>
                form.setValue('manualGeoObservation', toUppercaseInputValue(event.target.value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          {hasManualCoordinates ? (
            <p>
              Se intentara guardar una referencia manual {manualGeoIsApproximate ? 'aproximada' : 'exacta'}.
              Si ya existe una referencia mejor, la actual se conservara.
            </p>
          ) : (
            <p>
              Captura latitud y longitud para crear o actualizar una referencia manual. Esta fase no
              elimina referencias existentes desde el formulario.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/80 bg-secondary/20 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Documentación</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjunta identificación y soporte del expediente del cliente. Se aceptan JPG, PNG y WEBP de hasta 5 MB por archivo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DocumentUploadField
            id="ineFront"
            clienteId={clienteId}
            documentType="ineFront"
            label="INE frente"
            selectedFileName={ineFrontFileName}
            currentPath={defaultValues?.ineFrontPath}
            emptyMessage="Aún no se ha cargado un frente de INE."
            onFileChange={setIneFrontFileName}
          />

          <DocumentUploadField
            id="ineBack"
            clienteId={clienteId}
            documentType="ineBack"
            label="INE reverso"
            selectedFileName={ineBackFileName}
            currentPath={defaultValues?.ineBackPath}
            emptyMessage="Aún no se ha cargado un reverso de INE."
            onFileChange={setIneBackFileName}
          />

          <DocumentUploadField
            id="pagareFront"
            clienteId={clienteId}
            documentType="pagareFront"
            label="Pagaré frente"
            selectedFileName={pagareFrontFileName}
            currentPath={defaultValues?.pagareFrontPath}
            emptyMessage="Aún no se ha cargado el frente del pagaré."
            onFileChange={setPagareFrontFileName}
          />

          <DocumentUploadField
            id="pagareBack"
            clienteId={clienteId}
            documentType="pagareBack"
            label="Pagaré reverso"
            selectedFileName={pagareBackFileName}
            currentPath={defaultValues?.pagareBackPath}
            emptyMessage="Aún no se ha cargado el reverso del pagaré."
            onFileChange={setPagareBackFileName}
          />

          <DocumentUploadField
            id="proofOfAddress"
            clienteId={clienteId}
            documentType="proofOfAddress"
            label="Comprobante de domicilio"
            selectedFileName={proofOfAddressFileName}
            currentPath={defaultValues?.proofOfAddressPath}
            emptyMessage="Aún no se ha cargado comprobante de domicilio."
            onFileChange={setProofOfAddressFileName}
          />
        </div>
      </div>

      {postalLookupStatus !== 'idle' || postalLookupError ? (
        <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm">
          {postalLookupStatus === 'loading' ? (
            <p className="text-primary">Buscando colonias para el codigo postal...</p>
          ) : null}
          {postalLookupStatus === 'loaded' ? (
            <p className="text-primary">
              Se encontraron {postalOptions.length} colonias para el codigo postal {postalCode}.
            </p>
          ) : null}
          {postalLookupStatus === 'empty' && postalCode?.length === 5 ? (
            <p className="text-muted-foreground">
              No hay colonias cargadas para este codigo postal en el catalogo temporal. Puedes capturar la colonia
              manualmente.
            </p>
          ) : null}
          {postalLookupError ? <p className="text-destructive">{postalLookupError}</p> : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/clientes')}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? 'Guardando...'
            : mode === 'create'
              ? 'Crear cliente'
              : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function DocumentUploadField({
  id,
  clienteId,
  documentType,
  label,
  selectedFileName,
  currentPath,
  emptyMessage,
  onFileChange,
}: {
  id: string;
  clienteId?: string;
  documentType: ClienteDocumentType;
  label: string;
  selectedFileName: string | null;
  currentPath?: string | null;
  emptyMessage: string;
  onFileChange: (fileName: string | null) => void;
}) {
  const hasStorageDocument = isClienteDocumentStorageKey(currentPath);
  const hasLegacyDocument = isLegacyClienteDocumentPath(currentPath);

  return (
    <Field label={label}>
      <div className="space-y-2">
        <Input
          id={id}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(event) => onFileChange(event.target.files?.[0]?.name ?? null)}
        />
        {selectedFileName ? (
          <p className="text-xs text-primary">Archivo seleccionado: {selectedFileName}</p>
        ) : currentPath ? (
          <p className="text-xs text-muted-foreground">
            {hasLegacyDocument ? 'Documento pendiente de migración' : 'Documento actual disponible.'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        )}
        {hasStorageDocument && clienteId ? (
          <ClienteDocumentLink clienteId={clienteId} documentType={documentType}>
            Ver documento
          </ClienteDocumentLink>
        ) : null}
      </div>
    </Field>
  );
}
