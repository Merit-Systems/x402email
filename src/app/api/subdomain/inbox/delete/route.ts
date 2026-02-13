/**
 * POST /api/subdomain/inbox/delete — Delete an inbox on a subdomain.
 * Protection: SIWX only (free). Only the subdomain owner can delete.
 * Cascades: deletes all messages + S3 objects.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { DeleteSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { deleteRawEmail } from '@/lib/email/s3';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

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

  const parsed = DeleteSubdomainInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, localPart } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/inbox/delete`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can delete inboxes' },
      { status: 403 },
    );
  }

  const inbox = await prisma.subdomainInbox.findUnique({
    where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
  });

  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found' },
      { status: 404 },
    );
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
    // Only delete if no other messages (root or subdomain) reference this key
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

  return NextResponse.json({
    success: true,
    deleted: `${localPart}@${subdomainName}.${DOMAIN}`,
    messagesDeleted: messages.length,
  });
}
