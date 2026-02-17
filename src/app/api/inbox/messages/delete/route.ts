/**
 * POST /api/inbox/messages/delete — Delete a single message.
 * Protection: SIWX only (free, no payment). Wallet must own the inbox.
 */
import { router } from '@/lib/routes';
import { DeleteMessageRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { deleteRawEmail } from '@/lib/email/s3';

export const POST = router
  .route('inbox/messages/delete')
  .siwx()
  .body(DeleteMessageRequestSchema)
  .description('Delete a single inbox message (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { messageId } = body;

    const message = await prisma.inboxMessage.findUnique({
      where: { id: messageId },
      include: { inbox: true },
    });

    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 });
    }

    if (message.inbox.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the inbox owner can delete messages'),
        { status: 403 },
      );
    }

    // Check if other messages (root or subdomain) share the same s3Key
    const otherRefs = await prisma.inboxMessage.count({
      where: { s3Key: message.s3Key, id: { not: messageId } },
    });
    const otherSubRefs = await prisma.subdomainMessage.count({
      where: { s3Key: message.s3Key },
    });

    // Delete the DB record
    await prisma.inboxMessage.delete({ where: { id: messageId } });

    // Only delete from S3 if no other messages reference this key
    if (otherRefs === 0 && otherSubRefs === 0) {
      try {
        await deleteRawEmail(message.s3Key);
      } catch {
        // Non-critical — S3 lifecycle rule will clean up
      }
    }

    return { success: true, deleted: messageId };
  });
