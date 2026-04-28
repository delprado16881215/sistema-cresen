# Sistema Cresen · Fase 1

Base profesional para sistema administrativo financiero con Next.js, Prisma y Auth.js.

## Stack
- Next.js App Router + TypeScript estricto
- Tailwind CSS + componentes UI reutilizables
- Prisma ORM + PostgreSQL
- Auth.js (NextAuth) con credenciales y RBAC
- React Hook Form + Zod
- TanStack Table

## Instalación
1. Copia variables de entorno:
   ```bash
   cp .env.example .env
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Genera cliente Prisma:
   ```bash
   npm run db:generate
   ```
4. Ejecuta migraciones:
   ```bash
   npm run db:migrate -- --name init_fase_1
   ```
5. Ejecuta seed:
   ```bash
   npm run db:seed
   ```
6. Inicia entorno local:
   ```bash
   npm run dev
   ```

## Usuario inicial
- Email: valor de `ADMIN_EMAIL`
- Password: valor de `ADMIN_PASSWORD`

## Alcance Fase 1
- Autenticación por credenciales + middleware protegido
- Roles/permisos base y validación de acceso
- Dashboard ejecutivo inicial con KPIs base
- Módulo de clientes completo (listado, búsqueda, filtros, paginación, alta, edición, detalle, baja lógica)
- Seed inicial de catálogos esenciales y grupo base temporal

## Nota temporal de integridad
En Fase 1 se siembra `GRUPO_BASE_TEMP` para mantener `cliente.grupoId` obligatorio sin romper el modelo final aprobado. En Fase 2 se reemplaza por gestión completa de grupos/promotoras.
