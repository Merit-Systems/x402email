interface ReminderParams {
  username: string;
  domain: string;
  expiresAt: Date;
  createdAt: Date;
  baseUrl: string;
}

export function buildReminderEmailHtml(params: ReminderParams): string {
  const { username, domain, expiresAt, createdAt, baseUrl } = params;
  const daysOwned = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const expiryDate = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="margin-bottom: 4px;">Your inbox is expiring soon</h2>
  <p style="color: #666; margin-top: 0;"><strong>${username}@${domain}</strong> expires in <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong></p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr><td style="padding: 6px 0; color: #666;">Owned for</td><td style="padding: 6px 0;">${daysOwned} days</td></tr>
    <tr><td style="padding: 6px 0; color: #666;">Expires</td><td style="padding: 6px 0;">${expiryDate}</td></tr>
    <tr><td style="padding: 6px 0; color: #666;">Remaining</td><td style="padding: 6px 0;">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</td></tr>
  </table>

  <h3 style="margin-bottom: 8px;">Top up your inbox</h3>
  <p style="color: #666; font-size: 14px; margin-top: 0;">Anyone with a funded wallet can top up your inbox. No SIWX required.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px;">
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px 0;"><strong>$1</strong> &rarr; 30 days</td>
      <td style="padding: 8px 0; color: #666;">$0.033/day</td>
      <td style="padding: 8px 0;"><code>POST ${baseUrl}/api/inbox/topup</code></td>
    </tr>
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 8px 0;"><strong>$2.50</strong> &rarr; 90 days</td>
      <td style="padding: 8px 0; color: #888;">save 17%</td>
      <td style="padding: 8px 0;"><code>POST ${baseUrl}/api/inbox/topup/quarter</code></td>
    </tr>
    <tr>
      <td style="padding: 8px 0;"><strong>$8</strong> &rarr; 365 days</td>
      <td style="padding: 8px 0; color: #888;">save 34%</td>
      <td style="padding: 8px 0;"><code>POST ${baseUrl}/api/inbox/topup/year</code></td>
    </tr>
  </table>
  <p style="font-size: 13px; color: #666;">Body: <code>{ "username": "${username}" }</code></p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">
    This reminder was sent by <a href="${baseUrl}" style="color: #999;">x402email</a>.
    If your inbox expires, forwarding will stop but the username stays reserved to your wallet.
  </p>
</body>
</html>`;
}

export function buildReminderEmailText(params: ReminderParams): string {
  const { username, domain, expiresAt, createdAt, baseUrl } = params;
  const daysOwned = Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const expiryDate = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `Your inbox is expiring soon

${username}@${domain} expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}

Owned for: ${daysOwned} days
Expires: ${expiryDate}
Remaining: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}

TOP UP YOUR INBOX
Anyone with a funded wallet can top up. No SIWX required.

$1    -> 30 days  ($0.033/day)      POST ${baseUrl}/api/inbox/topup
$2.50 -> 90 days  (save 17%)        POST ${baseUrl}/api/inbox/topup/quarter
$8    -> 365 days (save 34%)        POST ${baseUrl}/api/inbox/topup/year

Body: { "username": "${username}" }

---
This reminder was sent by x402email (${baseUrl}).
If your inbox expires, forwarding will stop but the username stays reserved to your wallet.`;
}
