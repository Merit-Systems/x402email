import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — x402email",
  description: "Terms of Service for x402email pay-per-send email service.",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Last updated: February 10, 2025
          </p>
        </div>

        <div className="space-y-10 text-zinc-700 dark:text-zinc-300 [&_h2]:mb-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-zinc-400 dark:[&_h2]:text-zinc-500 [&_p]:mb-3 [&_p]:leading-relaxed">
          <section>
            <h2>Agreement</h2>
            <p>
              By using x402email — whether via the API, an AI agent, a script,
              or any other client — you agree to these terms. If you do not
              agree, do not use the service.
            </p>
          </section>

          <section>
            <h2>Service description</h2>
            <p>
              x402email is a pay-per-send email relay. You pay via the x402
              protocol (USDC on Base) and we deliver your email through AWS SES.
              We offer two tiers: a shared domain (relay@x402email.com) and
              custom subdomains (yourname.x402email.com).
            </p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <p>You must not use x402email to:</p>
            <ul className="mb-3 list-disc space-y-1.5 pl-6">
              <li>
                Send unsolicited bulk or commercial email (spam). All recipients
                must have opted in to receive your messages.
              </li>
              <li>
                Send phishing, malware, fraud, or deceptive content of any kind.
              </li>
              <li>
                Violate CAN-SPAM, GDPR, CASL, or any applicable email or
                privacy regulation.
              </li>
              <li>
                Impersonate another person, organization, or service.
              </li>
              <li>
                Send content that is illegal, abusive, threatening, or promotes
                violence.
              </li>
              <li>
                Attempt to circumvent rate limits, abuse detection, or payment
                requirements.
              </li>
            </ul>
            <p>
              You are solely responsible for the content of emails you send and
              for ensuring your recipients have consented to receive them.
            </p>
          </section>

          <section>
            <h2>Enforcement</h2>
            <p>
              We monitor bounce rates, spam complaint rates, and sending
              patterns. We may suspend or permanently block any wallet address,
              subdomain, or sender that violates these terms or degrades email
              deliverability for other users. Suspensions are at our sole
              discretion and are not subject to appeal.
            </p>
          </section>

          <section>
            <h2>Payments</h2>
            <p>
              All payments are made via the x402 protocol in USDC on Base
              (EIP-155:8453). Payments are final and non-refundable. Subdomain
              purchases ($5) are one-time. Per-send fees ($0.001) are charged on
              every email.
            </p>
          </section>

          <section>
            <h2>Subdomains</h2>
            <p>
              Purchased subdomains (yourname.x402email.com) are tied to the
              purchasing wallet address. Subdomains may be suspended or revoked
              if used in violation of these terms. We do not guarantee perpetual
              availability of any subdomain.
            </p>
          </section>

          <section>
            <h2>No warranty</h2>
            <p>
              x402email is provided &ldquo;as is&rdquo; without warranty of any
              kind. We do not guarantee email delivery, inbox placement, or
              uptime. Email delivery depends on recipient mail servers, spam
              filters, and domain reputation — none of which we control.
            </p>
          </section>

          <section>
            <h2>Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, x402email and its
              operators shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of
              profits or revenue, arising from your use of the service. Our
              total liability is limited to the amount you paid for the specific
              transaction at issue.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              We may update these terms at any time. Continued use of the
              service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about these terms? Open an issue on{" "}
              <a
                href="https://github.com/Merit-Systems/x402email"
                className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
              >
                GitHub
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
