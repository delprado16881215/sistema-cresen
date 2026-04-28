'use client';

import { Button } from '@/components/ui/button';

export function PrintSheetButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Imprimir / PDF
    </Button>
  );
}
