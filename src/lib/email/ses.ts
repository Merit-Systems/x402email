import {
  SESClient,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

interface Attachment {
  content: string; // base64-encoded
  contentType: string;
  filename: string;
}

interface SendEmailParams {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: Attachment[];
}

/** Strip CR/LF to prevent email header injection. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const toHeader = params.to.map(sanitizeHeader).join(', ');
  const hasAttachments = params.attachments && params.attachments.length > 0;

  const rawMessage = [
    `From: ${sanitizeHeader(params.from)}`,
    `To: ${toHeader}`,
    `Subject: ${sanitizeHeader(params.subject)}`,
    `MIME-Version: 1.0`,
  ];

  if (params.replyTo) {
    rawMessage.push(`Reply-To: ${sanitizeHeader(params.replyTo)}`);
  }

  if (hasAttachments) {
    // multipart/mixed: body part(s) + attachment(s)
    const mixedBoundary = `----=_Mixed_${Date.now()}`;
    const altBoundary = `----=_Alt_${Date.now()}`;

    rawMessage.push(
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
    );

    // Body part
    if (params.html && params.text) {
      rawMessage.push(
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        `--${altBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.text,
        `--${altBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.html,
        `--${altBoundary}--`,
      );
    } else if (params.html) {
      rawMessage.push(
        `--${mixedBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.html,
      );
    } else {
      rawMessage.push(
        `--${mixedBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.text ?? '',
      );
    }

    // Attachments
    for (const attachment of params.attachments!) {
      rawMessage.push(
        `--${mixedBoundary}`,
        `Content-Type: ${sanitizeHeader(attachment.contentType)}; name="${sanitizeHeader(attachment.filename)}"`,
        `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        attachment.content,
      );
    }

    rawMessage.push(`--${mixedBoundary}--`);
  } else {
    // No attachments -- simple body
    const boundary = `----=_Part_${Date.now()}`;

    if (params.html && params.text) {
      rawMessage.push(
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.text,
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        params.html,
        `--${boundary}--`,
      );
    } else if (params.html) {
      rawMessage.push(
        'Content-Type: text/html; charset=UTF-8',
        '',
        params.html,
      );
    } else {
      rawMessage.push(
        'Content-Type: text/plain; charset=UTF-8',
        '',
        params.text ?? '',
      );
    }
  }

  const result = await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: new TextEncoder().encode(rawMessage.join('\r\n')) },
    }),
  );

  return { messageId: result.MessageId ?? '' };
}
