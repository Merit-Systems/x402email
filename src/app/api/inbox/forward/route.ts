/**
 * POST /api/inbox/forward — Internal SNS webhook for inbound email forwarding.
 * NOT x402-protected, NOT SIWX-protected.
 *
 * Flow: Email → SES inbound → S3 + SNS → this handler → fetch from S3 → forward via SES.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { prisma } from '@/lib/db/client';
import { getRawEmail, deleteRawEmail } from '@/lib/email/s3';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';
const EXPECTED_TOPIC_ARN = process.env.SNS_TOPIC_ARN ?? '';
const MAX_MESSAGES_PER_SUBDOMAIN_INBOX = 500;
const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

/**
 * Rewrite email headers for forwarding. Operates on the raw RFC 2822 message:
 * - Replace From with relay address (preserving original sender name)
 * - Replace To with the forwarding destination
 * - Add Reply-To pointing to original sender
 * - Add X-Forwarded-For with original recipient
 * - Keep Subject, body, and all attachments untouched
 */
function rewriteHeadersForForward(
  raw: Buffer,
  opts: { forwardTo: string; originalFrom: string; originalTo: string },
): Buffer {
  const text = raw.toString('utf-8');

  // Split headers from body at the first blank line
  const headerEndIndex = text.indexOf('\r\n\r\n');
  if (headerEndIndex === -1) {
    // Malformed email — try LF-only
    const lfIndex = text.indexOf('\n\n');
    if (lfIndex === -1) return raw; // give up, forward as-is
    const headers = text.slice(0, lfIndex);
    const body = text.slice(lfIndex);
    return Buffer.from(rewriteHeaders(headers, opts, '\n') + body, 'utf-8');
  }

  const headers = text.slice(0, headerEndIndex);
  const body = text.slice(headerEndIndex);
  return Buffer.from(rewriteHeaders(headers, opts, '\r\n') + body, 'utf-8');
}

function rewriteHeaders(
  headers: string,
  opts: { forwardTo: string; originalFrom: string; originalTo: string },
  lineEnding: string,
): string {
  const lines = headers.split(lineEnding);
  const newLines: string[] = [];
  let hasReplyTo = false;

  // Extract display name from original From if present
  const fromMatch = opts.originalFrom.match(/^"?([^"<]*)"?\s*<(.+)>$/);
  const rawSenderName = fromMatch ? fromMatch[1].trim() : opts.originalFrom.split('@')[0];
  const rawSenderEmail = fromMatch ? fromMatch[2] : opts.originalFrom;
  // Sanitize to prevent header injection via CRLF in display name
  const senderName = rawSenderName.replace(/[\r\n"]/g, '');
  const senderEmail = rawSenderEmail.replace(/[\r\n]/g, '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip continuation lines (folded headers) — they start with whitespace
    // We handle them by checking the header name of the current "unfolded" header
    const isFrom = /^From:/i.test(line);
    const isTo = /^To:/i.test(line);
    const isReplyTo = /^Reply-To:/i.test(line);
    const isReturnPath = /^Return-Path:/i.test(line);
    const isDkimSig = /^DKIM-Signature:/i.test(line);

    if (isFrom) {
      // Skip original From (and any continuation lines)
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++;
      newLines.push(`From: "${senderName} via x402email" <relay@${DOMAIN}>`);
    } else if (isTo) {
      // Skip original To (and any continuation lines)
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++;
      newLines.push(`To: ${opts.forwardTo}`);
    } else if (isReplyTo) {
      // Replace existing Reply-To
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++;
      newLines.push(`Reply-To: ${senderEmail}`);
      hasReplyTo = true;
    } else if (isReturnPath) {
      // Replace Return-Path to avoid bounce issues
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++;
      newLines.push(`Return-Path: <relay@${DOMAIN}>`);
    } else if (isDkimSig) {
      // Strip original DKIM signature — it will fail after header rewrite
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) i++;
      // Don't add it
    } else {
      newLines.push(line);
    }
  }

  // Add Reply-To if not already present
  if (!hasReplyTo) {
    newLines.push(`Reply-To: ${senderEmail}`);
  }

  // Add forwarding metadata
  newLines.push(`X-Forwarded-For: ${opts.originalTo}`);
  newLines.push(`X-Forwarded-By: x402email`);

  return newLines.join(lineEnding);
}

/**
 * Extract the Subject header from raw email bytes without full parsing.
 */
function extractSubjectFromRaw(raw: Buffer): string {
  const text = raw.toString('utf-8');
  // Find Subject header (case-insensitive)
  const match = text.match(/^Subject:\s*(.+)/im);
  if (!match) return '(no subject)';
  // Handle folded headers: collect continuation lines
  let subject = match[1].trim();
  const afterMatch = text.slice(text.indexOf(match[0]) + match[0].length);
  const lines = afterMatch.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s/.test(line)) {
      subject += ' ' + line.trim();
    } else {
      break;
    }
  }
  return subject.slice(0, 998); // RFC 2822 max
}

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

    if (EXPECTED_TOPIC_ARN && body.TopicArn !== EXPECTED_TOPIC_ARN) {
      console.error('[x402email] SNS topic mismatch:', body.TopicArn);
      return NextResponse.json({ status: 'error' }, { status: 403 });
    }

    // Validate SubscribeURL is an actual AWS SNS endpoint to prevent SSRF
    try {
      const parsed = new URL(subscribeUrl);
      if (
        parsed.protocol !== 'https:' ||
        !parsed.hostname.endsWith('.amazonaws.com')
      ) {
        console.error('[x402email] Suspicious SubscribeURL:', subscribeUrl);
        return NextResponse.json({ status: 'error', message: 'Invalid SubscribeURL' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ status: 'error', message: 'Invalid SubscribeURL' }, { status: 400 });
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

  const receipt = message.receipt as Record<string, unknown> | undefined;
  const mail = message.mail as Record<string, unknown> | undefined;

  if (!receipt || !mail) {
    console.error('[x402email] Missing receipt or mail in SES notification');
    return NextResponse.json({ status: 'ok' });
  }

  // Extract S3 location from the receipt action
  const action = receipt.action as Record<string, unknown> | undefined;
  const objectKey = action?.objectKey as string | undefined;

  if (!objectKey) {
    console.error('[x402email] Missing S3 object key in SES receipt action');
    return NextResponse.json({ status: 'ok' });
  }

  const recipients = receipt.recipients as string[] | undefined;
  if (!recipients?.length) {
    return NextResponse.json({ status: 'ok' });
  }

  const originalFrom = (mail.source as string) ?? 'unknown@unknown';

  // Fetch the raw email from S3 once (shared across all recipients)
  let rawEmail: Buffer;
  try {
    rawEmail = await getRawEmail(objectKey);
  } catch (error) {
    console.error('[x402email] Failed to fetch email from S3:', error);
    return NextResponse.json({ status: 'ok' });
  }

  // Extract subject from raw email headers for InboxMessage records
  const subjectLine = extractSubjectFromRaw(rawEmail);

  // Process each recipient — route to root inbox or subdomain inbox
  let forwarded = 0;
  let retainedAny = false;
  for (const recipient of recipients) {
    const atIndex = recipient.indexOf('@');
    if (atIndex === -1) continue;
    const localPart = recipient.slice(0, atIndex).toLowerCase();
    const recipientDomain = recipient.slice(atIndex + 1).toLowerCase();

    const isSubdomain = recipientDomain !== DOMAIN && recipientDomain.endsWith(`.${DOMAIN}`);

    if (isSubdomain) {
      // --- Subdomain inbox routing ---
      const subdomainName = recipientDomain.replace(`.${DOMAIN}`, '');
      const subdomainInbox = await prisma.subdomainInbox.findFirst({
        where: {
          localPart,
          active: true,
          subdomain: { name: subdomainName, dnsVerified: true },
        },
        include: { subdomain: true },
      });

      if (subdomainInbox) {
        // Forward if the subdomain inbox has a forwarding address
        if (subdomainInbox.forwardTo) {
          try {
            const rewritten = rewriteHeadersForForward(rawEmail, {
              forwardTo: subdomainInbox.forwardTo,
              originalFrom,
              originalTo: recipient,
            });
            await ses.send(new SendRawEmailCommand({ RawMessage: { Data: rewritten } }));
            forwarded++;
            console.log(`[x402email] Forwarded ${recipient} → ${subdomainInbox.forwardTo}`);
          } catch (error) {
            console.error(`[x402email] Forward error for ${recipient}:`, error);
          }
        }

        // Retain message if enabled and under cap
        if (subdomainInbox.retainMessages) {
          const messageCount = await prisma.subdomainMessage.count({
            where: { inboxId: subdomainInbox.id },
          });
          if (messageCount >= MAX_MESSAGES_PER_SUBDOMAIN_INBOX) {
            console.log(`[x402email] Inbox ${recipient} at message cap (${MAX_MESSAGES_PER_SUBDOMAIN_INBOX}), skipping retention`);
          } else {
            try {
              await prisma.subdomainMessage.create({
                data: {
                  inboxId: subdomainInbox.id,
                  s3Key: objectKey,
                  fromEmail: originalFrom,
                  subject: subjectLine,
                },
              });
              retainedAny = true;
              console.log(`[x402email] Retained subdomain message for ${recipient}`);
            } catch (error) {
              console.error(`[x402email] Retain error for ${recipient}:`, error);
            }
          }
        }
      } else {
        // No specific inbox — check catch-all on the subdomain
        const subdomain = await prisma.subdomain.findUnique({
          where: { name: subdomainName },
        });
        if (subdomain?.catchAllForwardTo) {
          try {
            const rewritten = rewriteHeadersForForward(rawEmail, {
              forwardTo: subdomain.catchAllForwardTo,
              originalFrom,
              originalTo: recipient,
            });
            await ses.send(new SendRawEmailCommand({ RawMessage: { Data: rewritten } }));
            forwarded++;
            console.log(`[x402email] Catch-all forwarded ${recipient} → ${subdomain.catchAllForwardTo}`);
          } catch (error) {
            console.error(`[x402email] Catch-all forward error for ${recipient}:`, error);
          }
        }
        // No catch-all and no inbox → silently drop
      }
    } else {
      // --- Root domain inbox routing (existing logic) ---
      const inbox = await prisma.inbox.findUnique({ where: { username: localPart } });
      if (!inbox || !inbox.active || inbox.expiresAt < new Date()) {
        continue;
      }

      // Forward if the inbox has a forwarding address
      if (inbox.forwardTo) {
        try {
          const rewritten = rewriteHeadersForForward(rawEmail, {
            forwardTo: inbox.forwardTo,
            originalFrom,
            originalTo: recipient,
          });
          await ses.send(new SendRawEmailCommand({ RawMessage: { Data: rewritten } }));
          forwarded++;
          console.log(`[x402email] Forwarded ${recipient} → ${inbox.forwardTo}`);
        } catch (error) {
          console.error(`[x402email] Forward error for ${recipient}:`, error);
        }
      }

      // Retain message in S3 if inbox has retention enabled
      if (inbox.retainMessages) {
        try {
          await prisma.inboxMessage.create({
            data: {
              inboxId: inbox.id,
              s3Key: objectKey,
              fromEmail: originalFrom,
              subject: subjectLine,
            },
          });
          retainedAny = true;
          console.log(`[x402email] Retained message for ${recipient}`);
        } catch (error) {
          console.error(`[x402email] Retain error for ${recipient}:`, error);
        }
      }
    }
  }

  // Clean up S3 object after processing — only if no inbox is retaining it
  if (!retainedAny) {
    try {
      await deleteRawEmail(objectKey);
    } catch {
      // Non-critical — lifecycle rule will clean up anyway
    }
  }

  return NextResponse.json({ status: 'ok', forwarded });
}
