const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/send",
    price: "$0.001",
    auth: "x402",
    description: "Send from relay@x402email.com",
  },
  {
    method: "POST",
    path: "/api/subdomain/buy",
    price: "$5",
    auth: "x402 + SIWX",
    description: "Purchase yourname.x402email.com",
  },
  {
    method: "POST",
    path: "/api/subdomain/send",
    price: "$0.001",
    auth: "x402 + SIWX",
    description: "Send from your subdomain",
  },
  {
    method: "POST",
    path: "/api/subdomain/signers",
    price: "Free",
    auth: "SIWX",
    description: "Add/remove authorized wallets",
  },
  {
    method: "GET",
    path: "/api/subdomain/status",
    price: "Free",
    auth: "SIWX",
    description: "Check DNS/SES verification",
  },
];

const SEND_EXAMPLE = `{
  "to": ["alice@example.com"],
  "subject": "Hello from x402",
  "text": "Sent and paid in one HTTP request.",
  "replyTo": "you@example.com"
}`;

const SEND_RESPONSE = `HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <base64 payment details>

// Pay with any x402 client, then:

{
  "success": true,
  "messageId": "ses-abc123",
  "from": "relay@x402email.com"
}`;

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto max-w-2xl px-6 py-20">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            x402email
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            Pay-per-send email. No API keys. No accounts. One HTTP request.
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Powered by{" "}
            <a
              href="https://www.x402.org"
              className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
            >
              x402 protocol
            </a>
          </p>
        </div>

        {/* How it works */}
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            How it works
          </h2>
          <ol className="space-y-3 text-zinc-700 dark:text-zinc-300">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                1
              </span>
              <span>
                POST your email to{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm font-mono dark:bg-zinc-800">
                  /api/send
                </code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                2
              </span>
              <span>
                Get back a 402 with payment requirements ($0.001 USDC on Base)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                3
              </span>
              <span>Pay and resend — email delivered via AWS SES</span>
            </li>
          </ol>
        </section>

        {/* Example */}
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Example
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
              POST /api/send
            </div>
            <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-300">
              <code>{SEND_EXAMPLE}</code>
            </pre>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
              Response
            </div>
            <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-800 dark:text-zinc-300">
              <code>{SEND_RESPONSE}</code>
            </pre>
          </div>
        </section>

        {/* Endpoints */}
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Endpoints
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-500">
                    Endpoint
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-500">
                    Price
                  </th>
                  <th className="hidden px-4 py-2 text-left font-medium text-zinc-500 sm:table-cell dark:text-zinc-500">
                    Auth
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {ENDPOINTS.map((ep) => (
                  <tr key={ep.path}>
                    <td className="px-4 py-2.5">
                      <code className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                        {ep.method} {ep.path}
                      </code>
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-600">
                        {ep.description}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {ep.price}
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-zinc-500 sm:table-cell dark:text-zinc-500">
                      {ep.auth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Custom subdomain */}
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Custom subdomains
          </h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Buy{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm font-mono dark:bg-zinc-800">
              yourname.x402email.com
            </code>{" "}
            for $5. Send from any address on your subdomain. Add up to 50
            authorized wallet signers via SIWX.
          </p>
        </section>

        {/* Discovery */}
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Discovery
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            x402 resource discovery at{" "}
            <a
              href="/.well-known/x402"
              className="font-mono underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
            >
              /.well-known/x402
            </a>
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Agent instructions at{" "}
            <a
              href="/llms.txt"
              className="font-mono underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:decoration-zinc-500"
            >
              /llms.txt
            </a>
          </p>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-200 pt-6 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
          <p className="mb-4 leading-relaxed">
            By using this service — whether via the API, an AI agent, or any
            other client — you agree to our{" "}
            <a
              href="/terms"
              className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-600 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:text-zinc-400 dark:hover:decoration-zinc-500"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-600 hover:decoration-zinc-500 dark:decoration-zinc-700 dark:hover:text-zinc-400 dark:hover:decoration-zinc-500"
            >
              Privacy Policy
            </a>
            .
          </p>
          <div>
            <a
              href="https://github.com/Merit-Systems/x402email"
              className="hover:text-zinc-600 dark:hover:text-zinc-400"
            >
              GitHub
            </a>
            <span className="mx-2">|</span>
            <a
              href="https://www.x402.org"
              className="hover:text-zinc-600 dark:hover:text-zinc-400"
            >
              x402 protocol
            </a>
            <span className="mx-2">|</span>
            <a
              href="/terms"
              className="hover:text-zinc-600 dark:hover:text-zinc-400"
            >
              Terms
            </a>
            <span className="mx-2">|</span>
            <a
              href="/privacy"
              className="hover:text-zinc-600 dark:hover:text-zinc-400"
            >
              Privacy
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
