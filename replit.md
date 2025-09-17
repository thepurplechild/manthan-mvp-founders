# Project Manthan - Replit Configuration

## Overview

Manthan is an AI-native operating system for India's Media & Entertainment industry, designed to provide a "Concept-to-Contract" pipeline for creators. The project transforms scripts into professional pitch decks using AI and connects creators with verified buyers through an intelligent marketplace. This MVP implementation focuses on a "Managed Marketplace" approach, targeting established creators with existing scripts to validate the market before building a full self-serve platform.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Next.js 15 with App Router and TypeScript
- **UI Components**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with Indian-inspired color palette (saffron, gold, royal blue)
- **State Management**: React hooks with custom pipeline progress tracking
- **Client-side routing**: App Router with dynamic routes for projects

### Backend Architecture
- **Serverless Functions**: Vercel Edge Functions with regional deployment (iad1)
- **API Design**: RESTful endpoints with optimized function configurations
- **File Processing**: Multi-format document parsing (PDF, DOCX, TXT) with AI transformation pipeline
- **Rate Limiting**: Memory-based rate limiting with abuse protection
- **Error Handling**: Comprehensive error boundaries with graceful fallbacks

### Authentication & Authorization
- **Provider**: Supabase Auth with cookie-based sessions
- **Session Management**: Server-side rendering support with middleware-based route protection
- **Route Protection**: Automatic redirects for unauthenticated users on protected routes (/dashboard, /projects, /admin)
- **Role-based Access**: Creator and founder role differentiation with specialized workflows

### Data Storage Solutions
- **Primary Database**: Supabase PostgreSQL with Row-Level Security (RLS)
- **File Storage**: Supabase Storage for scripts and generated assets
- **Temporary Storage**: Vercel Blob for file processing pipeline
- **Queue Management**: Vercel KV for asynchronous job processing
- **Schema Design**: Normalized tables for profiles, projects, ingestions, and generated assets

### AI Processing Pipeline
- **AI Provider**: Anthropic Claude 3.5 Sonnet for script analysis and content generation
- **Pipeline Steps**: 6-stage transformation (extract, characters, market adaptation, pitch assembly, visuals, final package)
- **Content Processing**: Script-to-pitch deck conversion with Indian market adaptation
- **Retry Logic**: Exponential backoff for API failures with circuit breaker pattern

### Deployment & Infrastructure
- **Hosting**: Vercel with automatic GitHub deployments
- **CDN**: Global edge network with optimized asset delivery
- **Environment Management**: Structured environment validation with client/server separation
- **Performance**: Function-specific memory and timeout allocations
- **Monitoring**: Built-in logging with Pino for structured logs

## External Dependencies

### Core Services
- **Supabase**: Database, authentication, storage, and real-time subscriptions
- **Anthropic API**: Claude 3.5 Sonnet for AI content generation and script analysis
- **Vercel**: Hosting, serverless functions, blob storage, KV database, and cron jobs

### File Processing Libraries
- **PDF Processing**: pdfjs-dist, pdf-parse, pdf-lib for comprehensive PDF handling
- **Document Processing**: mammoth (DOCX), adm-zip (ZIP archives), fast-xml-parser (XML)
- **Content Generation**: @react-pdf/renderer, jspdf, pptxgenjs for output generation

### UI & Styling Dependencies
- **Component Library**: @radix-ui components for accessible UI primitives
- **Styling**: Tailwind CSS with custom Indian-inspired design tokens
- **Icons**: Lucide React for consistent iconography
- **Theming**: next-themes for dark/light mode support

### Development & Quality Tools
- **TypeScript**: Strict type checking with custom type definitions
- **Testing**: Jest with React Testing Library and Playwright for E2E
- **Linting**: ESLint with Next.js configuration
- **Validation**: Zod for runtime type validation and environment variable checking

### Utility Libraries
- **Data Processing**: lodash-es for utility functions, date-fns for date manipulation
- **HTTP Client**: ky for enhanced fetch with retry logic
- **Queue Management**: p-queue for controlled concurrency, p-retry for retry mechanisms
- **Security**: dompurify for HTML sanitization, nanoid for secure ID generation