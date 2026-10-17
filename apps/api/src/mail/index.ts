// Pluggable transactional mailer. Uses Resend when RESEND_API_KEY is set,
// otherwise a dev mailer that logs to the server console — so login codes and
// booking confirmations work locally with no provider, and a real provider
// drops in just by setting the env var.
import {
  bookingConfirmationEmail,
  loginCodeEmail,
  passwordResetEmail,
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
  sendPasswordResetCode(to: string, code: string): Promise<void>;
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
  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    lastDevCodes.set(to.toLowerCase(), code);
    // eslint-disable-next-line no-console
    console.log(
      `\n[mail:dev] Password reset code for ${to}: ${code} (expires in 10 min)\n`,
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
  sendPasswordResetCode(to: string, code: string): Promise<void> {
    return this.send({ to, ...passwordResetEmail(code) });
  }
  sendBookingConfirmation(
    to: string,
    data: BookingConfirmationData,
  ): Promise<void> {
    return this.send({ to, ...bookingConfirmationEmail(data) });
  }
}

// Wraps the real mailer for local dev: codes are always printed to the console
// (and readable by getLastDevCode), and a provider send failure is tolerated —
// so a test-mode Resend account (which only delivers to the owner's address)
// never locks you out of login/signup. Never used in production.
class DevTeeMailer implements Mailer {
  readonly name: string;
  constructor(private inner: Mailer) {
    this.name = `${inner.name}+devlog`;
  }
  private logCode(kind: string, to: string, code: string) {
    lastDevCodes.set(to.toLowerCase(), code);
    // eslint-disable-next-line no-console
    console.log(`\n[mail:dev] ${kind} for ${to}: ${code} (expires in 10 min)\n`);
  }
  private async tee(send: Promise<void>) {
    try {
      await send;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[mail:dev] real send failed (${(err as Error).message}); use the code logged above`,
      );
    }
  }
  async sendLoginCode(to: string, code: string): Promise<void> {
    this.logCode("Login code", to, code);
    await this.tee(this.inner.sendLoginCode(to, code));
  }
  async sendVerificationCode(to: string, code: string): Promise<void> {
    this.logCode("Verification code", to, code);
    await this.tee(this.inner.sendVerificationCode(to, code));
  }
  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    this.logCode("Password reset code", to, code);
    await this.tee(this.inner.sendPasswordResetCode(to, code));
  }
  sendBookingConfirmation(
    to: string,
    data: BookingConfirmationData,
  ): Promise<void> {
    return this.inner.sendBookingConfirmation(to, data);
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Alojaneo <onboarding@resend.dev>";
  const base: Mailer = key ? new ResendMailer(key, from) : new ConsoleMailer();
  // Outside production, tee codes to the console so local dev is never blocked
  // by email (e.g. a test-mode Resend account). With no key the console mailer
  // already does this.
  mailer =
    key && process.env.NODE_ENV !== "production" ? new DevTeeMailer(base) : base;
  return mailer;
}
