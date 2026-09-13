import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, ImageIcon, Palette, Trash2, Upload } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { useAuth } from "../lib/auth";
import { useHotelProfile, useUpdateHotelProfile } from "../lib/setup";
import { RoomsSetup } from "./RoomsPage";

const BOOKING_URL =
  import.meta.env.VITE_BOOKING_URL || "http://localhost:5174";

// Default accent shown in the picker before a hotel has chosen one (matches the
// engine's default ink primary).
const DEFAULT_ACCENT = "#171717";
const MAX_BANNER_BYTES = 4 * 1024 * 1024;

// Property configuration, admin-only. Room/room-type setup lives here so the
// Rooms nav page can stay a pure operations board. The API also enforces the
// admin/manage gate, so this is defence in depth, not the only check.
export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Property configuration" />

      {isAdmin ? (
        <>
          <BrandingSettings />
          <RoomsSetup />
        </>
      ) : (
        <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground shadow-sm">
          You need admin access to change property settings.
        </p>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Booking-engine branding: the banner image guests see and the accent color
// applied to the engine's buttons and links.
function BrandingSettings() {
  const profile = useHotelProfile();
  const update = useUpdateHotelProfile();
  const fileInput = useRef<HTMLInputElement>(null);

  const [banner, setBanner] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Seed local state from the loaded profile (and re-sync after a save).
  const p = profile.data;
  useEffect(() => {
    if (!p) return;
    setBanner(p.banner_url);
    setAccent(p.accent_color ?? "");
  }, [p?.banner_url, p?.accent_color]);

  const bannerDirty = !!p && banner !== (p.banner_url ?? null);
  const accentDirty = !!p && (accent || null) !== (p.accent_color ?? null);
  const dirty = bannerDirty || accentDirty;

  async function onPickFile(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setError("Image must be under 4 MB.");
      return;
    }
    setError(null);
    setBanner(await fileToDataUrl(file));
    // Allow re-selecting the same file later.
    if (fileInput.current) fileInput.current.value = "";
  }

  function save() {
    const input: {
      bannerUrl?: string;
      accentColor?: string;
    } = {};
    if (bannerDirty) input.bannerUrl = banner ?? ""; // "" clears
    if (accentDirty) input.accentColor = accent || ""; // "" resets to default
    update.mutate(input, {
      onError: () => setError("Couldn't save branding. Please try again."),
      onSuccess: () => setError(null),
    });
  }

  function reset() {
    if (!p) return;
    setBanner(p.banner_url);
    setAccent(p.accent_color ?? "");
    setError(null);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Booking engine</CardTitle>
        </div>
        {p?.slug && (
          <a
            href={`${BOOKING_URL}/${p.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ring hover:underline"
          >
            View booking page
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {profile.isLoading ? (
          <Spinner />
        ) : (
          <>
            {/* Banner */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Banner image</div>
              <p className="text-xs text-muted-foreground">
                Shown across the top of your booking page. Wide images work best
                (about 1600×500). Max 4 MB.
              </p>

              <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-muted">
                {banner ? (
                  <img
                    src={banner}
                    alt="Banner preview"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">No banner yet</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {banner ? "Replace" : "Upload"}
                </Button>
                {banner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBanner(null)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Accent color */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Accent color</div>
              <p className="text-xs text-muted-foreground">
                Applied to the booking page's buttons and links.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Accent color"
                  value={accent || DEFAULT_ACCENT}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"
                />
                <span className="font-mono text-sm text-muted-foreground">
                  {accent || `${DEFAULT_ACCENT} (default)`}
                </span>
                {accent && (
                  <button
                    type="button"
                    onClick={() => setAccent("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {dirty && (
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  disabled={update.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={update.isPending}
                >
                  {update.isPending && <Spinner />}
                  Save changes
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
