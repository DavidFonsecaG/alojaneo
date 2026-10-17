// Email content builders. Each returns { subject, html, text } so the mailer
// just has to deliver it. Kept dependency-free — plain template strings with
// inline styles (the only CSS email clients reliably honor).

export interface BookingConfirmationData {
  bookingRef: string;
  hotelName: string;
  guestName: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );

const prettyDate = (d: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));

// Wrap body HTML in a minimal, centered, email-safe shell.
function shell(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171717;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">Alojaneo</div>
    <div style="background:#ffffff;border-radius:16px;padding:28px;">${body}</div>
    <div style="color:#8a8a8a;font-size:12px;text-align:center;margin-top:16px;">Sent by Alojaneo</div>
  </div></body></html>`;
}

export function loginCodeEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: `Your Alojaneo login code: ${code}`,
    html: shell(
      `<p style="margin:0 0 12px;font-size:15px;">Use this code to finish signing in:</p>
       <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px 0;">${code}</div>
       <p style="margin:12px 0 0;color:#6b6b6b;font-size:13px;">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>`,
    ),
    text: `Your Alojaneo login code is ${code}. It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.`,
  };
}

export function verificationCodeEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: `Verify your email · Alojaneo (${code})`,
    html: shell(
      `<p style="margin:0 0 4px;font-size:18px;font-weight:700;">Welcome to Alojaneo</p>
       <p style="margin:0 0 12px;color:#6b6b6b;font-size:14px;">Enter this code to verify your email and finish creating your account:</p>
       <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px 0;">${code}</div>
       <p style="margin:12px 0 0;color:#6b6b6b;font-size:13px;">It expires in 10 minutes. If you didn't sign up for Alojaneo, you can ignore this email.</p>`,
    ),
    text: `Your Alojaneo verification code is ${code}. It expires in 10 minutes. If you didn't sign up for Alojaneo, you can ignore this email.`,
  };
}

export function passwordResetEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: `Reset your Alojaneo password (${code})`,
    html: shell(
      `<p style="margin:0 0 12px;font-size:15px;">Use this code to reset your password:</p>
       <div style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px 0;">${code}</div>
       <p style="margin:12px 0 0;color:#6b6b6b;font-size:13px;">It expires in 10 minutes. If you didn't request a password reset, you can ignore this email — your password won't change.</p>`,
    ),
    text: `Your Alojaneo password reset code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
  };
}

export function bookingConfirmationEmail(d: BookingConfirmationData): {
  subject: string;
  html: string;
  text: string;
} {
  const row = (label: string, value: string, strong = false) =>
    `<tr>
       <td style="padding:6px 0;color:#6b6b6b;font-size:14px;">${label}</td>
       <td style="padding:6px 0;text-align:right;font-size:14px;${strong ? "font-weight:700;" : ""}">${value}</td>
     </tr>`;

  const paidRows =
    d.paidCents > 0
      ? row("Paid now", money(d.paidCents, d.currency)) +
        row("Balance at property", money(d.balanceCents, d.currency))
      : row("Payment", "Pay at the property");

  return {
    subject: `Booking confirmed · ${d.hotelName} (${d.bookingRef})`,
    html: shell(
      `<p style="margin:0 0 4px;font-size:18px;font-weight:700;">You're booked!</p>
       <p style="margin:0 0 20px;color:#6b6b6b;font-size:14px;">${d.hotelName} is expecting you, ${d.guestName}.</p>
       <table style="width:100%;border-collapse:collapse;">
         ${row("Booking ref", d.bookingRef, true)}
         ${row("Check-in", prettyDate(d.checkIn))}
         ${row("Check-out", prettyDate(d.checkOut))}
         ${row("Nights", String(d.nights))}
         <tr><td colspan="2" style="border-top:1px solid #eee;padding-top:8px;"></td></tr>
         ${row("Total", money(d.totalCents, d.currency), true)}
         ${paidRows}
       </table>`,
    ),
    text:
      `Booking confirmed at ${d.hotelName}.\n` +
      `Ref: ${d.bookingRef}\n` +
      `Check-in: ${prettyDate(d.checkIn)}\n` +
      `Check-out: ${prettyDate(d.checkOut)} (${d.nights} nights)\n` +
      `Total: ${money(d.totalCents, d.currency)}\n` +
      (d.paidCents > 0
        ? `Paid now: ${money(d.paidCents, d.currency)}\nBalance at property: ${money(d.balanceCents, d.currency)}\n`
        : `Payment: pay at the property\n`),
  };
}
