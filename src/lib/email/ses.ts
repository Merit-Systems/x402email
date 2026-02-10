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

export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const boundary = `----=_Part_${Date.now()}`;
  const toHeader = params.to.join(', ');

  const rawMessage = [
    `From: ${params.from}`,
    `To: ${toHeader}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
  ];

  if (params.replyTo) {
    rawMessage.push(`Reply-To: ${params.replyTo}`);
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
