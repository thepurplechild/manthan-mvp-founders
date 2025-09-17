import { z } from 'zod'

export const CoreElements = z.object({
  logline: z.string().default(''),
  synopsis: z.string().default(''),
  themes: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  comps: z.array(z.string()).default([]),
})
export type CoreElements = z.infer<typeof CoreElements>

export const Character = z.object({
  name: z.string(),
  motivations: z.array(z.string()).optional().default([]),
  conflicts: z.array(z.string()).optional().default([]),
  relationships: z.array(z.string()).optional().default([]),
  arc: z.string().optional(),
  cultural_context: z.string().optional(),
  description: z.string().optional(),
})
export type Character = z.infer<typeof Character>

export const CharactersResult = z.object({
  characters: z.array(Character).default([]),
})
export type CharactersResult = z.infer<typeof CharactersResult>

export const MarketAdaptation = z.object({
  recommendations: z.array(z.object({ platform: z.string(), note: z.string().optional() })).default([]),
  variants: z.array(z.object({
    format: z.enum(['OTT','Film','Shorts']).default('OTT'),
    angle: z.string().optional(),
  })).default([])
})
export type MarketAdaptation = z.infer<typeof MarketAdaptation>

export const PitchContent = z.object({
  sections: z.array(z.object({
    title: z.string(),
    bullets: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })).default([]),
})
export type PitchContent = z.infer<typeof PitchContent>

export const VisualConcepts = z.object({
  scenes: z.array(z.object({
    prompt: z.string(),
    style: z.string().optional(),
  })).default([]),
})
export type VisualConcepts = z.infer<typeof VisualConcepts>

export type StepKey = 'elements' | 'characters' | 'market' | 'pitch' | 'visuals' | 'documents'

export interface OrchestratorInput {
  ingestionId?: string
  projectId?: string
  forceReprocess?: boolean
}

export interface StandardErrorModel {
  code: string
  message: string
  hint?: string
  retriable?: boolean
}

