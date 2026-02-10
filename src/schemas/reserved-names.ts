export const RESERVED_NAMES = new Set([
  // Infrastructure
  'www', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'api', 'admin',
  'ns1', 'ns2', 'mx', 'app', 'autoconfig', 'autodiscover',
  'localhost', 'test', 'staging', 'dev',

  // Email system
  'postmaster', 'abuse', 'webmaster', 'hostmaster', 'mailer-daemon',
  'noreply', 'no-reply', 'relay', 'bounce', 'bounces', 'mailer',
  'daemon', 'root',

  // Service & notifications
  'notifications', 'alerts', 'updates', 'newsletter', 'digest',
  'reminder', 'reminders', 'billing', 'receipts', 'receipt',
  'invoice', 'invoices', 'system', 'service', 'operator',
  'security', 'verify', 'verification', 'confirm', 'confirmation',
  'welcome', 'onboarding', 'subscribe', 'unsubscribe',

  // Support & contact
  'support', 'help', 'info', 'contact', 'feedback', 'sales',
  'legal', 'compliance', 'privacy', 'terms',

  // x402 brand
  'x402', 'x-402', 'protocol', 'pay', 'payment', 'payments',
  'wallet', 'wallets', 'x402email', 'x402mail',

  // Merit Systems brand
  'merit', 'meritsystems', 'merit-systems', 'meritx',

  // Generic high-value
  'email', 'account', 'accounts', 'user', 'users', 'me',
  'team', 'teams', 'hello', 'hi', 'hey', 'news', 'blog',
  'press', 'media', 'marketing', 'inbox', 'outbox', 'sent',
  'draft', 'drafts', 'spam', 'junk', 'trash', 'archive',
]);
