import { getMailer, type BookingConfirmationData } from "./index.js";

export const nightsBetween = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));

// Best-effort booking confirmation — a mail hiccup never affects the booking.
// Shared by the return-URL confirm and the webhook settlement paths so a guest
// who paid but didn't return still gets their email.
export function sendBookingConfirmation(
  to: string,
  data: BookingConfirmationData,
): void {
  const onErr = (err: unknown) =>
    // eslint-disable-next-line no-console
    console.error(
      "[mail] booking confirmation failed:",
      (err as Error).message,
    );
  // try/catch guards a *synchronous* throw (e.g. bad template input); .catch
  // guards the async send — either way a mail problem never breaks the booking.
  try {
    void getMailer().sendBookingConfirmation(to, data).catch(onErr);
  } catch (err) {
    onErr(err);
  }
}
