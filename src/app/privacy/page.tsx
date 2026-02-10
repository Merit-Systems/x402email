import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — x402email",
  description: "Privacy Policy for x402email pay-per-send email service.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-2xl px-6 py-20">
        <div className="mb-12">
          <a
            href="/"
            className="text-sm text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
          >
            &larr; x402email
          </a>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Last updated: February 10, 2025
          </p>
        </div>

        <div className="space-y-10 text-zinc-700 dark:text-zinc-300 [&_h2]:mb-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-zinc-400 dark:[&_h2]:text-zinc-500 [&_p]:mb-3 [&_p]:leading-relaxed">
          <section>
            <h2>What we collect</h2>
            <p>
              When you send email through x402email, we store the following in
              our database:
            </p>
            <ul className="mb-3 list-disc space-y-1.5 pl-6">
              <li>
                <strong>Wallet addresses</strong> — payer/sender wallet for
                payment verification and abuse prevention.
              </li>
              <li>
                <strong>Email metadata</strong> — sender address, recipient
                addresses, subject line, and SES message ID.
              </li>
              <li>
                <strong>Subdomain ownership</strong> — which wallet owns which
                subdomain, authorized signers.
              </li>
              <li>
                <strong>SIWX nonces</strong> — used nonces for replay attack
                prevention. No personal data.
              </li>
            </ul>
          </section>

          <section>
            <h2>What we do not collect</h2>
            <ul className="mb-3 list-disc space-y-1.5 pl-6">
              <li>
                <strong>Email bodies</strong> — we do not store the content of
                your emails. Email bodies are passed directly to AWS SES for
                delivery and not persisted.
              </li>
              <li>
                <strong>Cookies or tracking</strong> — this site sets no
                cookies, uses no analytics, and does not track visitors.
              </li>
              <li>
                <strong>Personal identity</strong> — we identify users by wallet
                address only. We do not collect names, physical addresses, or
                phone numbers.
              </li>
            </ul>
          </section>

          <section>
            <h2>How we use your data</h2>
            <ul className="mb-3 list-disc space-y-1.5 pl-6">
              <li>
                <strong>Send logs</strong> — used for rate limiting, abuse
                detection, and bounce/complaint monitoring. Required to maintain
                deliverability for all users.
              </li>
              <li>
                <strong>Subdomain records</strong> — used to verify ownership
                and authorize senders.
              </li>
              <li>
                <strong>Payment records</strong> — used to verify x402 payment
                settlement.
              </li>
            </ul>
          </section>

          <section>
            <h2>Third parties</h2>
            <p>Your email is processed by:</p>
            <ul className="mb-3 list-disc space-y-1.5 pl-6">
              <li>
                <strong>AWS SES</strong> — delivers your email. Subject to{" "}
                <a
                  href="https://aws.amazon.com/privacy/"
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
                >
                  AWS Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Coinbase x402 facilitator</strong> — settles USDC
                payments on Base. Subject to{" "}
                <a
                  href="https://www.coinbase.com/legal/privacy"
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
                >
                  Coinbase Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Neon (database)</strong> — stores send logs and
                subdomain records. Subject to{" "}
                <a
                  href="https://neon.tech/privacy-policy"
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
                >
                  Neon Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Vercel</strong> — hosts the application. Subject to{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
                >
                  Vercel Privacy Policy
                </a>
                .
              </li>
            </ul>
            <p>We do not sell or share your data with anyone else.</p>
          </section>

          <section>
            <h2>Data retention</h2>
            <p>
              Send logs are retained indefinitely for abuse prevention. SIWX
              nonces are retained for replay prevention. Subdomain records
              persist for the lifetime of the subdomain. We may implement
              automated log rotation in the future.
            </p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>
              Since we identify users by wallet address only, there is no
              account to delete. If you want your send logs removed, open an
              issue on{" "}
              <a
                href="https://github.com/Merit-Systems/x402email"
                className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
              >
                GitHub
              </a>{" "}
              and we will process your request.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              We may update this policy at any time. Continued use of the
              service after changes constitutes acceptance.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
