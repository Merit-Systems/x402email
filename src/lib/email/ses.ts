import {
  SESClient,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

interface SendEmailParams {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

/** Strip CR/LF to prevent email header injection. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const boundary = `----=_Part_${Date.now()}`;
  const toHeader = params.to.map(sanitizeHeader).join(', ');

  const rawMessage = [
    `From: ${sanitizeHeader(params.from)}`,
    `To: ${toHeader}`,
    `Subject: ${sanitizeHeader(params.subject)}`,
    `MIME-Version: 1.0`,
  ];

  if (params.replyTo) {
    rawMessage.push(`Reply-To: ${sanitizeHeader(params.replyTo)}`);
  }

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

  const result = await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: new TextEncoder().encode(rawMessage.join('\r\n')) },
    }),
  );

  return { messageId: result.MessageId ?? '' };
}
