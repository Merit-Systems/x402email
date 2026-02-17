/**
 * POST /api/inbox/buy — Purchase an inbox.
 * Protection: x402 payment ($1).
 * The buyer's wallet is extracted from the x402 payment header.
 *
 * forwardTo is optional — if omitted, retainMessages is enabled automatically
 * so the inbox works as a programmatic mailbox via the messages API.
 */
import { router, DOMAIN } from '@/lib/routes';
import { BuyInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('inbox/buy')
  .paid('1', { protocols: ['x402', 'mpp'] })
  .body(BuyInboxRequestSchema)
  .validate(async (body) => {
    // Pre-payment check: reject if inbox already exists
    const existingInbox = await prisma.inbox.findUnique({
      where: { username: body.username },
    });
    if (existingInbox) {
      throw Object.assign(new Error('Username already taken as an inbox'), { status: 409 });
    }
  })
  .description(`Buy an inbox on ${DOMAIN} ($1 via x402, 30 days). forwardTo is optional — omit it to use as a programmatic mailbox via the messages API (retainMessages enabled automatically). Subdomain owners can buy the matching inbox name with the same wallet.`)
  .handler(async ({ body, wallet }) => {
    const ownerWallet = wallet!.toLowerCase();

    // Subdomain owners CAN buy the matching inbox name — but only with the same wallet
    const existingSubdomain = await prisma.subdomain.findUnique({
      where: { name: body.username },
    });
    if (existingSubdomain && existingSubdomain.ownerWallet.toLowerCase() !== ownerWallet) {
      throw Object.assign(
        new Error('Username already taken as a subdomain by a different wallet'),
        { status: 409 },
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const retainMessages = !body.forwardTo;

    await prisma.inbox.create({
      data: {
        username: body.username,
        forwardTo: body.forwardTo ?? null,
        ownerWallet,
        expiresAt,
        retainMessages,
      },
    });

    return {
      success: true,
      inbox: `${body.username}@${DOMAIN}`,
      ...(body.forwardTo ? { forwardTo: body.forwardTo } : {}),
      retainMessages,
      expiresAt: expiresAt.toISOString(),
      daysRemaining: 30,
    };
  });
