// Kushki client-side card tokenisation. The card is entered on our page and
// turned into a one-time token by Kushki's SDK — the raw card number never
// touches our server. The SDK is loaded from Kushki's CDN (PCI best practice:
// the provider serves it, we don't bundle it).
//
// TODO(sandbox): verify the CDN URL, the global shape, and the requestToken
// signature against a real Kushki account. Scaffolded from the public docs.

const SDK_URL = "https://cdn.kushkipagos.com/kushki.min.js";

interface KushkiInstance {
  requestToken(
    opts: {
      amount: string; // decimal major units as a string, e.g. "49.99"
      currency: string;
      card: {
        name: string;
        number: string;
        cvc: string;
        expiryMonth: string;
        expiryYear: string;
      };
    },
    cb: (res: {
      token?: string;
      code?: string;
      message?: string;
      error?: { details?: string[] };
    }) => void,
  ): void;
}
type KushkiGlobal = {
  Kushki: new (o: { merchantId: string; inTestEnvironment: boolean }) => KushkiInstance;
};

let scriptPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { Kushki?: unknown }).Kushki) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("Couldn't load the secure payment library."));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface CardInput {
  name: string;
  number: string;
  expiryMonth: string; // "MM"
  expiryYear: string; // "YY"
  cvc: string;
}

// Returns a single-use card token, or throws with a guest-facing message.
export async function tokenizeCard(opts: {
  publicKey: string;
  amountCents: number;
  currency: string;
  test?: boolean;
  card: CardInput;
}): Promise<string> {
  await loadSdk();
  const g = (window as unknown as { Kushki?: KushkiGlobal }).Kushki;
  if (!g) throw new Error("Payment library unavailable.");

  const kushki = new g.Kushki({
    merchantId: opts.publicKey,
    inTestEnvironment: opts.test ?? true,
  });
  // Kushki.js wants the amount as a decimal-major-unit string, e.g. "49.99".
  const amount = (opts.amountCents / 100).toFixed(2);

  return new Promise<string>((resolve, reject) => {
    kushki.requestToken(
      {
        amount,
        currency: opts.currency,
        card: {
          name: opts.card.name.trim(),
          number: opts.card.number.replace(/\s+/g, ""),
          cvc: opts.card.cvc.trim(),
          expiryMonth: opts.card.expiryMonth.trim(),
          expiryYear: opts.card.expiryYear.trim(),
        },
      },
      (res) => {
        if (res?.token) resolve(res.token);
        else
          reject(
            new Error(
              res?.error?.details?.[0] ??
                res?.message ??
                "Your card couldn't be processed. Check the details and try again.",
            ),
          );
      },
    );
  });
}
