/**
 * POST /api/subdomain/inbox/messages/delete — Delete a single subdomain inbox message.
 * Protection: SIWX only (free). Wallet must own the subdomain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { SubdomainInboxDeleteMessageRequestSchema } from '@/schemas/subdomain';
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

  const parsed = SubdomainInboxDeleteMessageRequestSchema.safeParse(rawBody);
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
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/inbox/messages/delete`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const message = await prisma.subdomainMessage.findUnique({
    where: { id: messageId },
    include: { inbox: { include: { subdomain: true } } },
  });

  if (!message) {
    return NextResponse.json(
      { success: false, error: 'Message not found' },
      { status: 404 },
    );
  }

  if (message.inbox.subdomain.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Wallet not authorized for this subdomain' },
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

  return NextResponse.json({
    success: true,
    deleted: messageId,
  });
}
