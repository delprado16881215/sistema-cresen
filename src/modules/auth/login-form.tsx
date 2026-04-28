'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginFormSchema, type LoginFormValues } from '@/server/validators/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const response = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!response || response.error) {
      setError('Credenciales inválidas o usuario inactivo.');
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Ingresando...' : 'Ingresar'}
      </Button>
    </form>
  );
}
