// Pluggable transactional mailer. Uses Resend when RESEND_API_KEY is set,
// otherwise a dev mailer that logs to the server console — so login codes and
// booking confirmations work locally with no provider, and a real provider
// drops in just by setting the env var.
import {
  bookingConfirmationEmail,
  loginCodeEmail,
  verificationCodeEmail,
  type BookingConfirmationData,
} from "./templates.js";

export type { BookingConfirmationData };

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly name: string;
  sendLoginCode(to: string, code: string): Promise<void>;
  sendVerificationCode(to: string, code: string): Promise<void>;
  sendBookingConfirmation(
    to: string,
    data: BookingConfirmationData,
  ): Promise<void>;
}

// The last login code the dev mailer "sent", by email — for local tooling and
// the integration tests (which run with no real provider). Never populated by
// the real provider.
const lastDevCodes = new Map<string, string>();
export function getLastDevCode(email: string): string | undefined {
  return lastDevCodes.get(email.toLowerCase());
}

class ConsoleMailer implements Mailer {
  readonly name = "console";
  async sendLoginCode(to: string, code: string): Promise<void> {
    lastDevCodes.set(to.toLowerCase(), code);
    // eslint-disable-next-line no-console
    console.log(`\n[mail:dev] Login code for ${to}: ${code} (expires in 10 min)\n`);
  }
  async sendVerificationCode(to: string, code: string): Promise<void> {
    lastDevCodes.set(to.toLowerCase(), code);
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:dev] Verification code for ${to}: ${code} (expires in 10 min)\n`,
    );
  }
  async sendBookingConfirmation(
    to: string,
    data: BookingConfirmationData,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:dev] Booking confirmation ${data.bookingRef} → ${to} (${data.hotelName})\n`,
    );
  }
}

class ResendMailer implements Mailer {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  private async send(msg: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: this.from, ...msg }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend send failed (${res.status}): ${body}`);
    }
  }

  sendLoginCode(to: string, code: string): Promise<void> {
    return this.send({ to, ...loginCodeEmail(code) });
  }
  sendVerificationCode(to: string, code: string): Promise<void> {
    return this.send({ to, ...verificationCodeEmail(code) });
  }
  sendBookingConfirmation(
    to: string,
    data: BookingConfirmationData,
  ): Promise<void> {
    return this.send({ to, ...bookingConfirmationEmail(data) });
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
