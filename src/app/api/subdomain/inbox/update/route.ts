/**
 * POST /api/subdomain/inbox/update — Update subdomain inbox settings.
 * Protection: SIWX only (free). Only the subdomain owner can update.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { UpdateSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

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

  const parsed = UpdateSubdomainInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, localPart, forwardTo, retainMessages } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/inbox/update`;
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
      { success: false, error: 'Only the subdomain owner can update inboxes' },
      { status: 403 },
    );
  }

  const inbox = await prisma.subdomainInbox.findUnique({
    where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
  });

  if (!inbox) {
    return NextResponse.json(
      { success: false, error: 'Inbox not found on this subdomain' },
      { status: 404 },
    );
  }

  const updateData: { forwardTo?: string | null; retainMessages?: boolean } = {};
  if (forwardTo !== undefined) updateData.forwardTo = forwardTo;
  if (retainMessages !== undefined) updateData.retainMessages = retainMessages;

  const updated = await prisma.subdomainInbox.update({
    where: { id: inbox.id },
    data: updateData,
  });

  return NextResponse.json({
    success: true,
    inbox: `${localPart}@${subdomainName}.${DOMAIN}`,
    forwardTo: updated.forwardTo,
    retainMessages: updated.retainMessages,
  });
}
