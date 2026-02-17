/**
 * POST /api/subdomain/inbox/messages/delete — Delete a single subdomain inbox message.
 * Protection: SIWX only (free). Wallet must own the subdomain.
 */
import { router } from '@/lib/routes';
import { SubdomainInboxDeleteMessageRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { deleteRawEmail } from '@/lib/email/s3';

export const POST = router
  .route('subdomain/inbox/messages/delete')
  .siwx()
  .body(SubdomainInboxDeleteMessageRequestSchema)
  .description('Delete a single subdomain inbox message (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { messageId } = body;

    const message = await prisma.subdomainMessage.findUnique({
      where: { id: messageId },
      include: { inbox: { include: { subdomain: true } } },
    });

    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 });
    }

    if (message.inbox.subdomain.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Wallet not authorized for this subdomain'),
        { status: 403 },
      );
    }

    // Delete the DB record
    await prisma.subdomainMessage.delete({ where: { id: messageId } });

    // Only delete from S3 if no other messages reference this key
    const otherRefs = await prisma.inboxMessage.count({ where: { s3Key: message.s3Key } });
    const otherSubRefs = await prisma.subdomainMessage.count({ where: { s3Key: message.s3Key } });
    if (otherRefs === 0 && otherSubRefs === 0) {
      try {
        await deleteRawEmail(message.s3Key);
      } catch {
        // Non-critical — S3 lifecycle rule will clean up
      }
    }

    return { success: true, deleted: messageId };
  });
