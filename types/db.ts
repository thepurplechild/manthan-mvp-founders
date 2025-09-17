// Zod/TypeScript types mirroring Supabase schema (subset)
import { z } from "zod";

export const ProjectIndiaFields = z.object({
  regional_focus: z.array(z.string()).nullable().optional(),
  cultural_themes: z.array(z.string()).nullable().optional(),
  festival_tie_ins: z.array(z.string()).nullable().optional(),
  mythology_elements: z.array(z.string()).nullable().optional(),
  social_issues: z.array(z.string()).nullable().optional(),
  collaboration_preferences: z.array(z.string()).nullable().optional(),
});
export type ProjectIndiaFields = z.infer<typeof ProjectIndiaFields>;

export const Ingestion = z.object({
  id: z.string(),
  user_id: z.string(),
  project_id: z.string().nullable().optional(),
  source_file_url: z.string().url(),
  mime_type: z.string().nullable().optional(),
  status: z.enum(["queued","running","paused","failed","succeeded"]),
  progress: z.number().int().min(0).max(100),
  error: z.string().nullable().optional(),
});
export type Ingestion = z.infer<typeof Ingestion>;

export const IngestionStep = z.object({
  id: z.string(),
  ingestion_id: z.string(),
  name: z.enum([
    "script_preprocess",
    "core_extraction",
    "character_bible",
    "market_adaptation",
    "package_assembly",
    "final_package",
  ]),
  status: z.enum(["queued","running","failed","succeeded","skipped"]),
  output: z.record(z.any()).default({}),
  error: z.string().nullable().optional(),
});
export type IngestionStep = z.infer<typeof IngestionStep>;

export const Package = z.object({
  id: z.string(),
  ingestion_id: z.string(),
  summary: z.record(z.any()).default({}),
  deck_url: z.string().nullable().optional(),
  document_url: z.string().nullable().optional(),
});
export type Package = z.infer<typeof Package>;

