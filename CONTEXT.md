# Project Manthan - Technical Context

## Project Overview
Manthan OS is an AI-native operating system for India's Media & Entertainment industry, providing a "Concept-to-Contract" pipeline that integrates creative development with intelligent marketplace functionality.

## MVP Implementation Strategy
**Focus**: "Managed Marketplace" MVP using "Accelerated Path" for established creators with existing scripts.

## Technology Stack

### Core Infrastructure
- **Frontend**: Next.js with App Router + TypeScript
- **Hosting**: Vercel (automatic deployments from GitHub)
- **Backend**: Vercel Serverless Functions (Python Flask)
- **Database**: Supabase (PostgreSQL with Row-Level Security)
- **Storage**: Supabase Storage (for scripts and generated assets)
- **Authentication**: Supabase Auth
- **AI Engine**: Anthropic Claude 3 Opus API

### Key Architecture Decisions
- **Cloud-only development** using GitHub Codespaces
- **Serverless-first** approach for cost efficiency
- **Data sovereignty** priority (Indian cloud infrastructure when possible)

## Database Schema

### Core Tables
```sql
-- User profiles extending Supabase auth
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  role TEXT DEFAULT 'creator', -- 'creator' or 'founder'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Creator projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'submitted', 'in_review', 'active'
  logline TEXT,
  synopsis TEXT,
  genre TEXT, -- Array of genres
  character_breakdowns JSONB,
  budget_range TEXT,
  target_platforms TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Script uploads metadata
CREATE TABLE script_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated assets
CREATE TABLE generated_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  asset_type TEXT NOT NULL, -- 'pitch_deck', 'series_outline', 'character_bible'
  asset_url TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Founder's market intelligence
CREATE TABLE platform_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT, -- 'Netflix', 'SonyLIV', etc.
  mandate_description TEXT NOT NULL,
  tags TEXT, -- Searchable tags
  source TEXT, -- How intelligence was obtained
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Deal pipeline tracking
CREATE TABLE deal_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  target_buyer_name TEXT,
  status TEXT, -- 'introduced', 'passed', 'in_discussion', 'deal_closed'
  feedback_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## API Endpoints Structure

### Creator Endpoints
- `POST /api/projects/request-upload-url` - Generate signed URL for script upload
- `POST /api/projects/finalize-upload` - Trigger AI processing after upload
- `POST /api/projects/run-packaging-agent` - Internal AI processing endpoint

### Founder Endpoints
- `GET /api/founder/dashboard` - Fetch all projects and market data
- `POST /api/founder/mandates` - Create platform mandate entries
- `PUT /api/founder/mandates/{id}` - Update platform mandates
- `POST /api/founder/pipeline` - Manage deal pipeline entries

## AI Packaging Agent - Prompt Chain

The core AI functionality uses a 6-step prompt chain with Claude 3 Opus:

1. **Structural Analysis** - Parse screenplay format
2. **Core Elements Extraction** - Generate logline, synopsis, themes, characters
3. **Character Bible Generation** - Detailed character profiles
4. **Format Adaptation** - Adapt for specific platforms using mandate data
5. **Pitch Deck Content Generation** - Synthesize professional pitch materials
6. **Document Assembly** - Create formatted DOCX/PDF output

## Security & Compliance

### Row-Level Security Policies
- Users can only access their own projects
- Founder role has full access to all data
- Platform mandates and deal pipeline restricted to founder only

### Data Protection (DPDP Act 2023 Compliance)
- Explicit consent modal for "Creator's Bill of Rights"
- Granular consent for different data uses
- User privacy dashboard for data management
- Encryption in transit and at rest

## Development Workflow

1. **Development**: GitHub Codespaces (cloud IDE)
2. **Version Control**: GitHub repository
3. **Deployment**: Automatic via Vercel on git push
4. **Database Management**: Supabase Dashboard
5. **AI API**: Direct integration with Anthropic API

## Key User Journeys

### Creator (Accelerated Path)
1. Secure sign-up with IP protection consent
2. Upload existing script via secure signed URLs
3. AI generates professional pitch package
4. Collaborative refinement with founder
5. Passive monitoring of deal progress

### Founder (Managed Marketplace)
1. Curate projects via Command Center dashboard
2. Log proprietary market intelligence
3. Review and refine AI-generated packages
4. Execute strategic matchmaking with buyers
5. Manage deal pipeline and transactions

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Immediate Implementation Priorities

1. **Founder's Command Center** - Core operational dashboard
2. **Creator project ingestion** - Script upload and processing
3. **AI Packaging Agent** - Core value proposition
4. **Security and compliance** - Trust building features

## Strategic Goals
- Solve "cold start" problem through founder-managed approach
- Build proprietary dataset for future AI matchmaking
- Establish trust through transparency and compliance
- Create defensible moat through hyper-verticalization in Indian M&E market