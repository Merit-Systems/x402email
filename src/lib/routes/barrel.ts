/**
 * Barrel import — forces all route files to execute so they self-register
 * with the router before discovery endpoints run.
 *
 * Import this file in .well-known/x402 and openapi.json routes.
 */

// Paid routes
import '@/app/api/send/route';
import '@/app/api/subdomain/buy/route';
import '@/app/api/subdomain/send/route';
import '@/app/api/inbox/buy/route';
import '@/app/api/inbox/send/route';
import '@/app/api/inbox/topup/route';
import '@/app/api/inbox/topup/quarter/route';
import '@/app/api/inbox/topup/year/route';
import '@/app/api/inbox/messages/route';
import '@/app/api/inbox/messages/read/route';
import '@/app/api/subdomain/inbox/create/route';
import '@/app/api/subdomain/inbox/messages/route';
import '@/app/api/subdomain/inbox/messages/read/route';

// SIWX routes (not in discovery, but register for completeness)
import '@/app/api/subdomain/status/route';
import '@/app/api/subdomain/signers/route';
import '@/app/api/subdomain/update/route';
import '@/app/api/inbox/status/route';
import '@/app/api/inbox/update/route';
import '@/app/api/inbox/cancel/route';
import '@/app/api/inbox/messages/delete/route';
import '@/app/api/subdomain/inbox/list/route';
import '@/app/api/subdomain/inbox/delete/route';
import '@/app/api/subdomain/inbox/update/route';
import '@/app/api/subdomain/inbox/messages/delete/route';
