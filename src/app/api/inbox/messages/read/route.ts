/**
 * POST /api/inbox/messages/read — Read a single message.
 * Protection: x402 payment ($0.001). Wallet must own the inbox.
 */
import { router } from '@/lib/routes';
import { ReadMessageRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { getRawEmail } from '@/lib/email/s3';
import { parseRawEmail } from '@/lib/email/parse';

export const POST = router
  .route('inbox/messages/read')
  .paid('0.001', { protocols: ['x402', 'mpp'] })
  .body(ReadMessageRequestSchema)
  .description('Read a single inbox message ($0.001 via x402)')
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();
    const { messageId } = body;

    const message = await prisma.inboxMessage.findUnique({
      where: { id: messageId },
      include: { inbox: true },
    });

    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 });
    }

    if (message.inbox.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Wallet not authorized for this inbox'),
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
      await prisma.inboxMessage.update({
        where: { id: messageId },
        data: { read: true },
      });
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
    };
  });
