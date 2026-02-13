/**
 * POST /api/subdomain/inbox/create — Create an inbox on a subdomain.
 * Protection: SIWX only (free). Only the subdomain owner can create inboxes.
 * Cap: 100 inboxes per subdomain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { CreateSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const MAX_INBOXES_PER_SUBDOMAIN = 100;

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

  const parsed = CreateSubdomainInboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, localPart, forwardTo } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/inbox/create`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
    include: { _count: { select: { inboxes: true } } },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can create inboxes' },
      { status: 403 },
    );
  }

  if (subdomain._count.inboxes >= MAX_INBOXES_PER_SUBDOMAIN) {
    return NextResponse.json(
      { success: false, error: `Maximum ${MAX_INBOXES_PER_SUBDOMAIN} inboxes per subdomain` },
      { status: 409 },
    );
  }

  // Check for existing inbox with same localPart
  const existing = await prisma.subdomainInbox.findUnique({
    where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
  });

  if (existing) {
    return NextResponse.json(
      { success: false, error: 'Inbox already exists on this subdomain' },
      { status: 409 },
    );
  }

  const retainMessages = !forwardTo;

  const inbox = await prisma.subdomainInbox.create({
    data: {
      subdomainId: subdomain.id,
      localPart,
      forwardTo: forwardTo ?? null,
      retainMessages,
    },
  });

  return NextResponse.json({
    success: true,
    inbox: `${localPart}@${subdomainName}.${DOMAIN}`,
    id: inbox.id,
    ...(forwardTo ? { forwardTo } : {}),
    retainMessages,
  });
}
