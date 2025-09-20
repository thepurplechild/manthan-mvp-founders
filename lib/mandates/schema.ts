import { z } from 'zod';

export const MandateInputSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters long')
    .max(64, 'Code must be 64 characters or fewer')
    .regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, hyphen, or underscore for the code'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(160, 'Title is too long'),
  description: z
    .string()
    .max(2000, 'Description is too long')
    .optional()
    .transform((value) => (value ?? '').trim()),
  is_active: z.boolean().default(true),
});

export const MandateUpdateSchema = MandateInputSchema.partial();

export type MandateInput = z.infer<typeof MandateInputSchema>;
export type MandateUpdateInput = z.infer<typeof MandateUpdateSchema>;

export const MANDATES_PAGE_SIZE = 10;
