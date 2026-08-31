import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Dialog, DialogFooter, ConfirmDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { ErrorBox, EmptyBox } from "../components/States";
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

      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {guests.isLoading ? (
          <CenteredSpinner label="Loading guests…" />
        ) : guests.isError ? (
          <ErrorBox message={(guests.error as Error).message} />
        ) : filtered.length === 0 ? (
          <EmptyBox
            icon={<Users className="h-8 w-8 text-muted-foreground" />}
            title={query ? "No matching guests" : "No guests yet"}
            body={
              query
                ? "Try a different search."
                : "Add your first guest with the button above."
            }
          />
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
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
                    <TableCell className="font-medium">
                      {g.first_name} {g.last_name}
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
          </div>
        )}
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
    >
      <form onSubmit={onSubmit} className="space-y-4">
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || !firstName.trim() || !lastName.trim()}
          >
            {pending && <Spinner />}
            {isEdit ? "Save changes" : "Add guest"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
