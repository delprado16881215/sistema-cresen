import type { Metadata } from 'next';
import { ChunkErrorRecovery } from '@/components/system/chunk-error-recovery';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sistema Cresen',
  description: 'Sistema administrativo financiero para créditos semanales',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ChunkErrorRecovery />
        {children}
      </body>
    </html>
  );
}
