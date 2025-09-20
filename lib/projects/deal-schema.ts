import { z } from 'zod';

export const DealStatusSchema = z.enum([
  'lead',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
]);

export type DealStatus = z.infer<typeof DealStatusSchema>;

export const OutreachChannelSchema = z.enum(['email', 'call', 'dm', 'meeting', 'other']);

export type OutreachChannel = z.infer<typeof OutreachChannelSchema>;

export const OutreachInputSchema = z.object({
  channel: OutreachChannelSchema,
  contact: z
    .string()
    .max(200, 'Contact must be shorter than 200 characters')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ?? '').trim()),
  note: z.string().min(2, 'Note must be at least 2 characters').max(2000, 'Note is too long'),
  next_follow_up_at: z
    .union([
      z.string().datetime({ offset: true }).optional(),
      z.string().datetime({ offset: false }).optional(),
      z.date().optional(),
      z.null(),
    ])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      if (value instanceof Date) return value.toISOString();
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }),
});

export type OutreachInput = z.infer<typeof OutreachInputSchema>;

export const FeedbackInputSchema = z.object({
  feedback: z
    .string()
    .max(1000, 'Feedback must be 1000 characters or fewer')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ?? '').trim()),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const OUTREACH_PAGE_SIZE = 10;
