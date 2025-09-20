import { z } from 'zod';

export const MandateSchema = z.object({
  platform_name: z.string().min(2, 'Platform name is required'),
  mandate_description: z.string().min(5, 'Description is required'),
  tags: z
    .string()
    .optional()
    .transform((value) =>
      (value || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  source: z.string().optional(),
});

export type MandateInput = z.infer<typeof MandateSchema>;
