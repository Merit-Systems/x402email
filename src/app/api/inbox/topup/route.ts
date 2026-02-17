/**
 * POST /api/inbox/topup — Top up an inbox for 30 days ($1).
 * Protection: x402 payment ($1), no SIWX. Anyone can top up any inbox.
 */
import { router, INBOX_DURATIONS } from '@/lib/routes';
import { TopupInboxRequestSchema } from '@/schemas/inbox';
import { createTopupHandler } from '@/lib/inbox/topup';

const topup = createTopupHandler(INBOX_DURATIONS.topup);

export const POST = router
  .route('inbox/topup')
  .paid('1')
  .body(TopupInboxRequestSchema)
  .description('Top up a forwarding inbox for 30 days ($1 via x402)')
  .handler(async ({ body }) => topup(body.username));
