import { z } from 'zod'
import type { JSONValue } from '@/types/common'

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const zJSON: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string(), zJSON), z.array(zJSON)])
)

