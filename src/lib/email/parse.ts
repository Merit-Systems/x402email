/**
 * Email parser using mailparser. Parses raw RFC 2822 email into structured data.
 */
import { simpleParser } from 'mailparser';

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface ParsedEmail {
  from: string;
  to: string[];
  subject: string;
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: ParsedAttachment[];
}

export async function parseRawEmail(raw: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw);

  const from = parsed.from?.text ?? 'unknown';
  const to: string[] = [];
  if (parsed.to) {
    const toAddrs = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
    for (const addr of toAddrs) {
      if (addr.value) {
        for (const v of addr.value) {
          if (v.address) to.push(v.address);
        }
      }
    }
  }

  const attachments: ParsedAttachment[] = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename ?? 'untitled',
    contentType: a.contentType ?? 'application/octet-stream',
    size: a.size ?? 0,
  }));

  return {
    from,
    to,
    subject: parsed.subject ?? '(no subject)',
    date: parsed.date?.toISOString() ?? null,
    text: parsed.text ?? null,
    html: parsed.html || null,
    attachments,
  };
}
