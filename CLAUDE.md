# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run ESLint
npm run lint
```

## Architecture Overview

This is a Next.js 15 application using the App Router with Supabase for authentication and database. The project follows a modular component architecture with shadcn/ui components.

### Key Architectural Patterns

- **Authentication Flow**: Uses Supabase Auth with middleware-based route protection
- **Route Protection**: Middleware (`middleware.ts`) automatically redirects unauthenticated users from `/dashboard` and `/projects` routes to `/login`
- **Auth State Management**: Supabase client configured for SSR with cookie-based sessions
- **Component Structure**: shadcn/ui components in `components/ui/`, custom components in `components/`

### Core Directory Structure

```
app/                    # Next.js App Router pages
├── auth/              # Authentication pages (login, signup, etc.)
├── dashboard/         # Protected dashboard pages
├── projects/          # Project-related pages with [id] dynamic routes
└── protected/         # Additional protected pages

components/            # React components
├── ui/               # shadcn/ui components
├── auth-*.tsx        # Authentication components
└── tutorial/         # Tutorial step components

lib/                   # Utility functions and configs
└── supabase/         # Supabase client configurations
    ├── client.ts     # Client-side Supabase client
    ├── server.ts     # Server-side Supabase client
    └── middleware.ts # Middleware Supabase client

types/                # TypeScript type definitions
```

### Environment Setup

Required environment variables (copy from `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Authentication Architecture

The app uses Supabase Auth with three different client configurations:
- **Client-side**: `lib/supabase/client.ts` - For client components
- **Server-side**: `lib/supabase/server.ts` - For server components and API routes
- **Middleware**: `lib/supabase/middleware.ts` - For route protection

### UI Components

Uses shadcn/ui with the "new-york" style variant and Tailwind CSS. Components are configured with:
- Base color: neutral
- CSS variables enabled
- Lucide icons for iconography
- Dark mode support via next-themes

### Route Protection Logic

Middleware protects routes with the following logic:
- Redirects unauthenticated users from `/dashboard/*` and `/projects/*` to `/login`
- Redirects authenticated users from `/login` and `/signup` to `/dashboard`
- Applies to all routes except static assets and images