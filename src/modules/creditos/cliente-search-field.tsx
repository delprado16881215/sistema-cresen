'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ClienteSearchOption = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  addressLabel: string | null;
  promotoriaId: string | null;
  placementStatus: 'ELIGIBLE' | 'BLOCKED_LEGAL';
  placementBlockReason: string | null;
  isPlacementBlocked: boolean;
  placementBlockMessage: string | null;
};

type ClienteSearchFieldProps = {
  value: ClienteSearchOption | null;
  onSelect: (cliente: ClienteSearchOption | null) => void;
  placeholder: string;
  emptyMessage: string;
  excludeId?: string;
  disabled?: boolean;
  error?: string;
  blockPlacementBlocked?: boolean;
};

function formatOptionLabel(option: ClienteSearchOption) {
  return `${option.code} · ${option.fullName} · ${option.phone}`;
}

export function ClienteSearchField({
  value,
  onSelect,
  placeholder,
  emptyMessage,
  excludeId,
  disabled = false,
  error,
  blockPlacementBlocked = false,
}: ClienteSearchFieldProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClienteSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (disabled) {
      setResults([]);
      setOpen(false);
      return;
    }

    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          q: normalized,
          limit: '10',
        });

        if (excludeId) {
          params.set('excludeId', excludeId);
        }

        const response = await fetch(`/api/clientes/search?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setResults([]);
          return;
        }

        const body = (await response.json()) as { rows: ClienteSearchOption[] };
        setResults(body.rows);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [disabled, excludeId, query]);

  useEffect(() => {
    if (value && excludeId && value.id === excludeId) {
      onSelect(null);
      setQuery('');
    }
  }, [excludeId, onSelect, value]);

  const selectedLabel = useMemo(() => (value ? formatOptionLabel(value) : ''), [value]);

  return (
    <div className="space-y-2" ref={containerRef}>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{selectedLabel}</p>
            <p className="text-xs text-muted-foreground">
              {value.addressLabel || 'Cliente seleccionado'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onSelect(null);
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            disabled={disabled}
          >
            Cambiar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (results.length) {
                setOpen(true);
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            className="pr-24"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {loading ? 'Buscando...' : 'Min. 2 caracteres'}
          </span>

          {open && query.trim().length >= 2 ? (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-background shadow-soft">
              {results.length ? (
                results.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`flex w-full flex-col gap-1 border-b border-border/60 px-3 py-3 text-left last:border-b-0 ${
                      blockPlacementBlocked && option.isPlacementBlocked
                        ? 'cursor-not-allowed bg-muted/30 text-muted-foreground'
                        : 'hover:bg-secondary/60'
                    }`}
                    onClick={() => {
                      if (blockPlacementBlocked && option.isPlacementBlocked) {
                        return;
                      }
                      onSelect(option);
                      setQuery('');
                      setOpen(false);
                    }}
                    disabled={blockPlacementBlocked && option.isPlacementBlocked}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {option.code} · {option.fullName}
                    </span>
                    <span className="text-xs text-muted-foreground">{option.phone}</span>
                    {option.addressLabel ? (
                      <span className="text-xs text-muted-foreground">{option.addressLabel}</span>
                    ) : null}
                    {option.isPlacementBlocked ? (
                      <span className="text-xs text-destructive">
                        {option.placementBlockMessage ?? 'Cliente bloqueado por proceso jurídico'}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
