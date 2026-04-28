import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from '@/modules/auth/login-form';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
        <div className="mb-6 space-y-2">
          <h1 className="font-display text-3xl font-semibold text-primary">Sistema Cresen</h1>
          <p className="text-sm text-muted-foreground">Ingresa con tu usuario autorizado.</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
