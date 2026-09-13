/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // Base URL of the guest-facing booking engine (apps/booking). Used to link
  // admins to their live booking page. Defaults to http://localhost:5174.
  readonly VITE_BOOKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
