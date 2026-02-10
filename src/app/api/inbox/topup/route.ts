/**
 * POST /api/inbox/topup — Top up an inbox for 30 days ($1).
 * Protection: x402 payment ($1), no SIWX. Anyone can top up any inbox.
 */
import { NextResponse } from 'next/server';
import { createX402PostRoute } from '@/lib/x402/route-wrapper';
import { PRICES, INBOX_DURATIONS } from '@/lib/x402/pricing';
import { TopupInboxRequestSchema } from '@/schemas/inbox';
import { createTopupHandler } from '@/lib/inbox/topup';

const topup = createTopupHandler(INBOX_DURATIONS.topup);

export const POST = createX402PostRoute({
  description: 'Top up a forwarding inbox for 30 days ($1 via x402)',
  inputSchema: TopupInboxRequestSchema,
  outputExample: {
    success: true as const,
    inbox: 'alice',
    expiresAt: '2025-07-15T12:00:00.000Z',
    daysRemaining: 30,
    daysAdded: 30,
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      inbox: { type: 'string' },
      expiresAt: { type: 'string' },
      daysRemaining: { type: 'number' },
      daysAdded: { type: 'number' },
    },
    required: ['success', 'inbox', 'expiresAt', 'daysRemaining', 'daysAdded'],
  },
  accepts: [PRICES.inboxTopup],
  handler: async (body) => {
    return topup(body) as Promise<NextResponse>;
  },
});
