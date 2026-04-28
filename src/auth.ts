import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 12,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isValid = await compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        const roles = user.roles.map((r) => r.role.code);
        const permissions = user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.code),
        );

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles,
          permissions: [...new Set(permissions)],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roles = (user as { roles?: string[] }).roles ?? [];
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.permissions = (token.permissions as string[]) ?? [];
      }
      return session;
    },
  },
});
