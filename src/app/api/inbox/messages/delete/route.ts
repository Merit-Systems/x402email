/**
 * POST /api/inbox/messages/delete — Delete a single message.
 * Protection: SIWX only (free, no payment). Wallet must own the inbox.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { DeleteMessageRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';
import { deleteRawEmail } from '@/lib/email/s3';

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = DeleteMessageRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { messageId } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/inbox/messages/delete`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const message = await prisma.inboxMessage.findUnique({
    where: { id: messageId },
    include: { inbox: true },
  });

  if (!message) {
    return NextResponse.json(
      { success: false, error: 'Message not found' },
      { status: 404 },
    );
  }

  if (message.inbox.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the inbox owner can delete messages' },
      { status: 403 },
    );
  }

  // Check if other messages (root or subdomain) share the same s3Key
  const otherRefs = await prisma.inboxMessage.count({
    where: {
      s3Key: message.s3Key,
      id: { not: messageId },
    },
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

  return NextResponse.json({
    success: true,
    deleted: messageId,
  });
}
