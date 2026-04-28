'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type SearchSelectOption = {
  id: string;
  label: string;
  keywords?: string[];
};

type SearchSelectProps = {
  value: SearchSelectOption | null;
  onSelect: (option: SearchSelectOption | null) => void;
  options: SearchSelectOption[];
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
  allowClear?: boolean;
  minChars?: number;
  helperText?: string;
};

function matchesOption(option: SearchSelectOption, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [option.label, ...(option.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(normalized);
}

export function SearchSelect({
  value,
  onSelect,
  options,
  placeholder,
  emptyMessage,
  disabled = false,
  allowClear = true,
  minChars = 0,
  helperText,
}: SearchSelectProps) {
  const [query, setQuery] = useState('');
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

  const filteredOptions = useMemo(() => {
    if (query.trim().length < minChars) {
      return options;
    }

    return options.filter((option) => matchesOption(option, query));
  }, [minChars, options, query]);

  return (
    <div className="space-y-2" ref={containerRef}>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{value.label}</p>
            <p className="text-xs text-muted-foreground">Valor seleccionado</p>
          </div>
          {allowClear ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onSelect(null);
                setQuery('');
                setOpen(false);
              }}
              disabled={disabled}
            >
              Cambiar
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
          />

          {open ? (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-background shadow-soft">
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full flex-col gap-1 border-b border-border/60 px-3 py-3 text-left last:border-b-0 hover:bg-secondary/60"
                    onClick={() => {
                      onSelect(option);
                      setQuery('');
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-muted-foreground">{emptyMessage}</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}
