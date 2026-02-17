/**
 * GET /api/inbox/status — Check inbox status.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can check status.
 */
import { router, DOMAIN } from '@/lib/routes';
import { InboxStatusQuerySchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

export const GET = router
  .route('inbox/status')
  .siwx()
  .query(InboxStatusQuerySchema)
  .description('Check inbox status (SIWX, free)')
  .handler(async ({ query, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { username } = query;

    const inbox = await prisma.inbox.findUnique({
      where: { username },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    if (inbox.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Not authorized to view this inbox'),
        { status: 403 },
      );
    }

    const now = Date.now();
    const daysRemaining = Math.max(0, Math.ceil((inbox.expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)));
    const daysOwned = Math.floor((now - inbox.createdAt.getTime()) / (24 * 60 * 60 * 1000));

    return {
      inbox: `${username}@${DOMAIN}`,
      ownerWallet: inbox.ownerWallet,
      forwardTo: inbox.forwardTo,
      retainMessages: inbox.retainMessages,
      expiresAt: inbox.expiresAt.toISOString(),
      daysRemaining,
      daysOwned,
      active: inbox.active && inbox.expiresAt > new Date(),
      pricing: {
        topup: { price: '$1', days: 30, perDay: '$0.033', endpoint: '/api/inbox/topup' },
        quarter: { price: '$2.50', days: 90, perDay: '$0.028', savings: '17%', endpoint: '/api/inbox/topup/quarter' },
        year: { price: '$8', days: 365, perDay: '$0.022', savings: '34%', endpoint: '/api/inbox/topup/year' },
      },
    };
  });
