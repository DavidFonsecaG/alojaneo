// Pluggable transactional mailer. Uses Resend when RESEND_API_KEY is set,
// otherwise a dev mailer that logs the message to the server console — so the
// login-code flow works locally with no provider, and a real provider drops in
// just by setting the env var.

export interface Mailer {
  readonly name: string;
  sendLoginCode(to: string, code: string): Promise<void>;
}

const MINUTES = 10;

// The last code the dev mailer "sent", by email — for local tooling and the
// integration tests (which run with no real provider). Never populated by the
// real provider.
const lastDevCodes = new Map<string, string>();
export function getLastDevCode(email: string): string | undefined {
  return lastDevCodes.get(email.toLowerCase());
}

class ConsoleMailer implements Mailer {
  readonly name = "console";
  async sendLoginCode(to: string, code: string): Promise<void> {
    lastDevCodes.set(to.toLowerCase(), code);
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:dev] Login code for ${to}: ${code} (expires in ${MINUTES} min)\n`,
    );
  }
}

class ResendMailer implements Mailer {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async sendLoginCode(to: string, code: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: `Your Alojaneo login code: ${code}`,
        text: `Your Alojaneo login code is ${code}. It expires in ${MINUTES} minutes. If you didn't try to sign in, you can ignore this email.`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${body}`);
    }
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Alojaneo <onboarding@resend.dev>";
  mailer = key ? new ResendMailer(key, from) : new ConsoleMailer();
  return mailer;
}
