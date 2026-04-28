import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      roles: string[];
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User {
    roles?: string[];
    permissions?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: string[];
    permissions?: string[];
  }
}
