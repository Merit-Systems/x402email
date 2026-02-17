/**
 * POST /api/subdomain/inbox/messages/read — Read a single subdomain inbox message.
 * Protection: x402 payment ($0.001). Wallet must own the subdomain.
 */
import { router, SUBDOMAIN_INBOX_LIMITS } from '@/lib/routes';
import { SubdomainInboxReadMessageRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { getRawEmail } from '@/lib/email/s3';
import { parseRawEmail } from '@/lib/email/parse';

const { maxMessagesPerInbox: MESSAGE_LIMIT } = SUBDOMAIN_INBOX_LIMITS;

export const POST = router
  .route('subdomain/inbox/messages/read')
  .paid('0.001')
  .body(SubdomainInboxReadMessageRequestSchema)
  .description('Read a single subdomain inbox message ($0.001 via x402)')
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();
    const { messageId } = body;

    const message = await prisma.subdomainMessage.findUnique({
      where: { id: messageId },
      include: { inbox: { include: { subdomain: true } } },
    });

    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 });
    }

    if (message.inbox.subdomain.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Wallet not authorized for this subdomain'),
        { status: 403 },
      );
    }

    let rawEmail: Buffer;
    try {
      rawEmail = await getRawEmail(message.s3Key);
    } catch (error) {
      console.error('[x402email] Failed to fetch message from S3:', error);
      throw Object.assign(
        new Error('Message content unavailable (may have been deleted from storage)'),
        { status: 410 },
      );
    }

    let email;
    try {
      email = await parseRawEmail(rawEmail);
    } catch (error) {
      console.error('[x402email] Failed to parse email:', error);
      throw Object.assign(new Error('Failed to parse email content'), { status: 500 });
    }

    if (!message.read) {
      await prisma.subdomainMessage.update({
        where: { id: messageId },
        data: { read: true },
      });
    }

    const totalCount = await prisma.subdomainMessage.count({
      where: { inboxId: message.inboxId },
    });

    let warning: string | undefined;
    if (totalCount >= MESSAGE_LIMIT) {
      warning = `Inbox is at capacity (${totalCount}/${MESSAGE_LIMIT} messages). New inbound messages will not be retained. Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
    } else if (totalCount >= MESSAGE_LIMIT * 0.8) {
      warning = `Inbox is near capacity (${totalCount}/${MESSAGE_LIMIT} messages). Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
    }

    return {
      success: true,
      message: {
        id: message.id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        date: email.date,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
        receivedAt: message.receivedAt.toISOString(),
      },
      messageCount: totalCount,
      messageLimit: MESSAGE_LIMIT,
      ...(warning ? { warning } : {}),
    };
  });
