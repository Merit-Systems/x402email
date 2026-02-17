/**
 * POST /api/subdomain/inbox/delete — Delete an inbox on a subdomain.
 * Protection: SIWX only (free). Only the subdomain owner can delete.
 * Cascades: deletes all messages + S3 objects.
 */
import { router, DOMAIN } from '@/lib/routes';
import { DeleteSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { deleteRawEmail } from '@/lib/email/s3';

export const POST = router
  .route('subdomain/inbox/delete')
  .siwx()
  .body(DeleteSubdomainInboxRequestSchema)
  .description('Delete an inbox on a subdomain (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { subdomain: subdomainName, localPart } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the subdomain owner can delete inboxes'),
        { status: 403 },
      );
    }

    const inbox = await prisma.subdomainInbox.findUnique({
      where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    // Get all messages to clean up S3
    const messages = await prisma.subdomainMessage.findMany({
      where: { inboxId: inbox.id },
      select: { s3Key: true },
    });

    // Delete messages first, then the inbox
    await prisma.subdomainMessage.deleteMany({ where: { inboxId: inbox.id } });
    await prisma.subdomainInbox.delete({ where: { id: inbox.id } });

    // Best-effort S3 cleanup (deduplicated keys)
    const uniqueKeys = [...new Set(messages.map((m) => m.s3Key))];
    for (const key of uniqueKeys) {
      const otherRefs = await prisma.inboxMessage.count({ where: { s3Key: key } });
      const otherSubRefs = await prisma.subdomainMessage.count({ where: { s3Key: key } });
      if (otherRefs === 0 && otherSubRefs === 0) {
        try {
          await deleteRawEmail(key);
        } catch {
          // Non-critical — S3 lifecycle rule will clean up
        }
      }
    }

    return {
      success: true,
      deleted: `${localPart}@${subdomainName}.${DOMAIN}`,
      messagesDeleted: messages.length,
    };
  });
