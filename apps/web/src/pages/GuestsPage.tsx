import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Dialog, ConfirmDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  useGuests,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
} from "../lib/setup";
import { ApiError } from "../lib/api";
import type { Guest } from "../types";

const DOC_TYPES = [
  { value: "", label: "—" },
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
];

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "–";
}

export function GuestsPage() {
  const guests = useGuests();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [deleting, setDeleting] = useState<Guest | null>(null);
  const deleteGuest = useDeleteGuest();

  const filtered = useMemo(() => {
    const data = guests.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((g) =>
      `${g.first_name} ${g.last_name} ${g.email ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [guests.data, query]);

  return (
    <>
      <div className="flex h-full flex-col gap-3">
        <PageHeader
          title="Guests"
          description="Guest directory"
          actions={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add guest
            </Button>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-card">
          {/* Header bar — a separate container from the scrolling rows. */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-72 pl-9 shadow-none"
                placeholder="Search by name or email…"
                aria-label="Search guests"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {!guests.isLoading && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {filtered.length} {filtered.length === 1 ? "guest" : "guests"}
              </span>
            )}
          </div>

          {/* Body — only this region scrolls. */}
          {guests.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <CenteredSpinner label="Loading guests…" />
            </div>
          ) : guests.isError ? (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {(guests.error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <Users className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">
                {query ? "No matching guests" : "No guests yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query
                  ? "Try a different search."
                  : "Add your first guest with the button above."}
              </p>
            </div>
          ) : (
            <Table containerClassName="min-h-0 flex-1">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(g.first_name, g.last_name)}
                        </span>
                        <span className="font-medium">
                          {g.first_name} {g.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.document_number
                        ? `${g.document_type?.replace(/_/g, " ") ?? ""} ${g.document_number}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(g);
                            setFormOpen(true);
                          }}
                          aria-label="Edit guest"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(g)}
                          aria-label="Delete guest"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {formOpen && (
        <GuestFormDialog guest={editing} onClose={() => setFormOpen(false)} />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.first_name} ${deleting?.last_name}?`}
        description="This cannot be undone. Guests with existing reservations cannot be deleted."
        loading={deleteGuest.isPending}
        onConfirm={() =>
          deleting &&
          deleteGuest.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
          })
        }
      />
    </>
  );
}

function GuestFormDialog({
  guest,
  onClose,
}: {
  guest: Guest | null;
  onClose: () => void;
}) {
  const isEdit = !!guest;
  const [firstName, setFirstName] = useState(guest?.first_name ?? "");
  const [lastName, setLastName] = useState(guest?.last_name ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [phone, setPhone] = useState(guest?.phone ?? "");
  const [documentType, setDocumentType] = useState(guest?.document_type ?? "");
  const [documentNumber, setDocumentNumber] = useState(
    guest?.document_number ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateGuest();
  const update = useUpdateGuest();
  const pending = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      documentType: documentType || undefined,
      documentNumber: documentNumber.trim() || undefined,
    };
    const onError = (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Failed to save guest.");

    if (isEdit && guest) {
      update.mutate({ id: guest.id, ...payload }, { onSuccess: onClose, onError });
    } else {
      create.mutate(payload, { onSuccess: onClose, onError });
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${guest?.first_name} ${guest?.last_name}` : "Add guest"}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="guest-form"
            disabled={pending || !firstName.trim() || !lastName.trim()}
          >
            {pending && <Spinner />}
            {isEdit ? "Save changes" : "Add guest"}
          </Button>
        </>
      }
    >
      <form id="guest-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="g-first">
            <Input
              id="g-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </Field>
          <Field label="Last name" htmlFor="g-last">
            <Input
              id="g-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" htmlFor="g-email">
            <Input
              id="g-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="g-phone">
            <Input
              id="g-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Document type" htmlFor="g-doctype">
            <Select
              id="g-doctype"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Document number" htmlFor="g-docnum">
            <Input
              id="g-docnum"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Dialog>
  );
}
