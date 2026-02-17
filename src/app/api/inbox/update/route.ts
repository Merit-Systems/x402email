/**
 * POST /api/inbox/update — Update inbox settings (forwarding address, message retention).
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the inbox owner can update.
 */
import { router, DOMAIN } from '@/lib/routes';
import { UpdateInboxRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('inbox/update')
  .siwx()
  .body(UpdateInboxRequestSchema)
  .description('Update inbox settings (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { username, forwardTo, retainMessages } = body;

    const inbox = await prisma.inbox.findUnique({
      where: { username },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    if (inbox.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the inbox owner can update forwarding'),
        { status: 403 },
      );
    }

    const updateData: { forwardTo?: string | null; retainMessages?: boolean } = {};
    if (forwardTo !== undefined) updateData.forwardTo = forwardTo;
    if (retainMessages !== undefined) updateData.retainMessages = retainMessages;

    const updated = await prisma.inbox.update({
      where: { username },
      data: updateData,
    });

    return {
      success: true,
      inbox: `${username}@${DOMAIN}`,
      forwardTo: updated.forwardTo,
      retainMessages: updated.retainMessages,
    };
  });
