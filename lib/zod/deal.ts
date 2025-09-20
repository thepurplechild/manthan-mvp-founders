import { z } from 'zod';

export const DealStatusEnum = z.enum(['introduced', 'in_discussion', 'passed', 'deal_closed']);

export const DealEntrySchema = z.object({
  target_buyer_name: z.string().min(2, 'Target buyer name is required'),
  status: DealStatusEnum,
  feedback_notes: z.string().optional(),
});

export type DealEntryInput = z.infer<typeof DealEntrySchema>;
export type DealStatus = z.infer<typeof DealStatusEnum>;
