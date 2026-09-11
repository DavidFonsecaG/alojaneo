import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BedDouble, ArrowRight } from "lucide-react";
import { Button, Card, Input } from "../components/ui";

// The booking engine is normally reached at /:hotelSlug (each hotel gets its
// own link). This landing page is a convenience for finding a hotel by slug
// during development — in production a hotel would link straight to its slug.
export function LandingPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (trimmed) navigate(`/${trimmed}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <BedDouble className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Book your stay
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a hotel to see live availability and reserve a room.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="hotel-slug"
            aria-label="Hotel slug"
            autoFocus
          />
          <Button type="submit" size="lg" className="w-full" disabled={!slug.trim()}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Try the demo:{" "}
          <button
            type="button"
            onClick={() => navigate("/hotel-demo")}
            className="font-medium text-foreground underline underline-offset-2"
          >
            hotel-demo
          </button>
        </p>
      </Card>
    </div>
  );
}
