/**
 * POST /api/inbox/_forward — Internal SNS webhook for inbound email forwarding.
 * NOT x402-protected, NOT SIWX-protected.
 * Receives SES inbound email notifications from SNS, forwards to inbox owner.
 *
 * NOTE: This route is a stub until AWS infrastructure is configured:
 * - MX record on x402email.com pointing to SES inbound
 * - SES Receipt Rule to store email in S3 and notify SNS
 * - S3 bucket for inbound email storage
 * - SNS topic subscribed to this endpoint
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/ses';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const EXPECTED_TOPIC_ARN = process.env.SNS_TOPIC_ARN ?? '';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
  }

  // Handle SNS SubscriptionConfirmation
  if (body.Type === 'SubscriptionConfirmation') {
    const subscribeUrl = body.SubscribeURL as string | undefined;
    if (!subscribeUrl) {
      return NextResponse.json({ status: 'error', message: 'Missing SubscribeURL' }, { status: 400 });
    }

    // Validate TopicArn
    if (EXPECTED_TOPIC_ARN && body.TopicArn !== EXPECTED_TOPIC_ARN) {
      console.error('[x402email] SNS topic mismatch:', body.TopicArn);
      return NextResponse.json({ status: 'error' }, { status: 403 });
    }

    try {
      await fetch(subscribeUrl);
      console.log('[x402email] SNS subscription confirmed');
    } catch (error) {
      console.error('[x402email] SNS confirmation failed:', error);
    }
    return NextResponse.json({ status: 'ok' });
  }

  // Handle SNS Notification
  if (body.Type !== 'Notification') {
    return NextResponse.json({ status: 'ignored' });
  }

  // Validate TopicArn
  if (EXPECTED_TOPIC_ARN && body.TopicArn !== EXPECTED_TOPIC_ARN) {
    console.error('[x402email] SNS topic mismatch:', body.TopicArn);
    return NextResponse.json({ status: 'error' }, { status: 403 });
  }

  let message: Record<string, unknown>;
  try {
    message = JSON.parse(body.Message as string) as Record<string, unknown>;
  } catch {
    console.error('[x402email] Failed to parse SNS message');
    return NextResponse.json({ status: 'ok' });
  }

  // SES notification structure
  const receipt = message.receipt as Record<string, unknown> | undefined;
  const mail = message.mail as Record<string, unknown> | undefined;

  if (!receipt || !mail) {
    console.error('[x402email] Missing receipt or mail in SES notification');
    return NextResponse.json({ status: 'ok' });
  }

  const recipients = receipt.recipients as string[] | undefined;
  if (!recipients?.length) {
    return NextResponse.json({ status: 'ok' });
  }

  // Process each recipient
  for (const recipient of recipients) {
    const username = recipient.split('@')[0]?.toLowerCase();
    if (!username) continue;

    const inbox = await prisma.inbox.findUnique({ where: { username } });

    // Silently discard if inbox not found, inactive, or expired
    if (!inbox || !inbox.active || inbox.expiresAt < new Date()) {
      continue;
    }

    // Extract original sender info from mail headers
    const from = (mail.source as string) ?? 'unknown@unknown';
    const subject = ((mail.commonHeaders as Record<string, unknown>)?.subject as string) ?? '(no subject)';

    // Forward via SES — simplified forwarding without raw email (S3 integration needed for full fidelity)
    // TODO: When S3 bucket is configured, fetch raw email from S3 and use SendRawEmailCommand
    // for full-fidelity forwarding with attachments
    try {
      await sendEmail({
        from: `relay@${DOMAIN}`,
        to: [inbox.forwardTo],
        subject: `Fwd: ${subject}`,
        text: `Forwarded from ${from} to ${recipient}\n\nOriginal email body not available — S3 inbound storage not yet configured.`,
        replyTo: from,
      });
    } catch (error) {
      console.error(`[x402email] Forward error for ${recipient}:`, error);
    }
  }

  // Always return 200 (SNS requirement)
  return NextResponse.json({ status: 'ok' });
}
