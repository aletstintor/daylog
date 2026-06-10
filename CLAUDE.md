# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Build for production
npm start         # Start production server
npm run lint      # Run ESLint
npm run test      # Run all Vitest tests
npm run coverage  # Generate test coverage reports
```

Run a single test file:
```bash
npx vitest run path/to/file.test.tsx
```

Database migrations:
```bash
npx prisma migrate dev    # Create and apply migration in development
npx prisma migrate deploy # Apply migrations in production
npx prisma generate       # Regenerate Prisma client after schema changes
```

## Architecture

**daylog** is a self-hosted, multi-user notes and boards application. Built with Next.js 15 App Router, Prisma + PostgreSQL, and Tailwind CSS.

### Route Structure

- `/app/(authenticated)/` — Protected routes (boards, notes, profiles, admin). The `(authenticated)` route group wraps all pages that require a logged-in session.
- `/app/api/v1/` — REST API endpoints for auth, storage, images, sharing, and locale.
- `/app/login/`, `/app/register/` — Unauthenticated pages; `/register/init` creates the first admin user.
- `/app/share/[token]/` — Public share view (no auth required).

### Data Models (Prisma)

Core models in `prisma/schema.prisma`:
- **User** — email/password auth, TOTP 2FA, account locking, role (user/admin)
- **Session** — server-side session records linked to Users
- **Board** — container for Notes, supports favorites and metadata
- **Note** — markdown content with title, images, favorites; belongs to a Board
- **Picture** — images attached to Notes, stored via S3 or local filesystem
- **NoteChange** — version history using diff-match-patch patches
- **ChangeComment** — comments on NoteChange records
- **Share** — public share tokens with optional password, expiry, and view tracking
- **Setting** — application-wide key-value configuration store

### Authentication & Security

Session-based auth using secure cookies (SameSite=Lax). Key flows:
- Login → session creation → `Session` record in DB
- TOTP 2FA with QR code provisioning
- CSRF token validation on mutations
- Rate limiting on login with automatic account locking
- Password reset and email verification via Nodemailer

Auth logic lives in `/lib/` (crypto, TOTP, rate limiting) and the API routes under `/app/api/v1/auth/`.

### Component Patterns

- `/components/ui/` — Radix UI primitives styled with Tailwind (shadcn/ui pattern). These are low-level building blocks.
- Feature components sit directly in `/components/` (e.g., `Navigation`, `Search`, share dialogs).
- Forms use React Hook Form + Zod for validation.

### Testing

Vitest with jsdom. The test setup (`vitest.setup.ts`) mocks next-intl, localStorage, and Radix UI globals. Prisma uses a singleton pattern for test isolation.

Tests live alongside source files or in `__tests__/` directories. Coverage excludes API routes, test files, icons, and Prisma-generated files (see `vitest.config.ts`).

Never use `any` in tests or any other code. If a suitable type does not already exist, create one.

### Storage

Image storage supports two backends configured via environment variables:
- **S3-compatible** — set `S3_*` env vars
- **Local filesystem** — set `STORAGE_PATH`

Sharp is used for image optimization. Unsplash API integration is available for cover image search.

### Internationalization

next-intl with translation files in `/messages/`. The i18n setup is in `/i18n/`. All user-facing strings should go through the translation layer.

### Design System

See `STYLE_GUIDE.md` for the design system: semantic color tokens, typography hierarchy, and component specifications. The app supports dark/light mode via Tailwind's class-based dark mode, with preference persisted per user.
