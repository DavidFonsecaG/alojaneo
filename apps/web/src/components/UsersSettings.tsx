import { useState, type FormEvent } from "react";
import { UserPlus, Users as UsersIcon, Shield, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog } from "./ui/dialog";
import { Input, Label, Select } from "./ui/input";
import { Field } from "./ui/field";
import { CenteredSpinner, Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "../lib/setup";
import { PERMISSION_MODULES } from "../lib/permissions";
import type { HotelUser, PermissionMatrix, Role } from "../types";

// A reasonable starting point for a new front-desk member.
const FRONT_DESK: PermissionMatrix = {
  reservations: { view: true, create: true, update: true, cancel: false },
  rooms: { view: true, manage: false },
  guests: { view: true, manage: true },
  payments: { view: true, manage: false },
  housekeeping: { view: true, manage: false },
};

function countEnabled(perms: PermissionMatrix | null): number {
  if (!perms) return 0;
  let n = 0;
  for (const mod of Object.values(perms))
    for (const on of Object.values(mod)) if (on) n++;
  return n;
}

export function UsersSettings() {
  const { user } = useAuth();
  const users = useUsers();
  const del = useDeleteUser();
  const [editing, setEditing] = useState<HotelUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Team &amp; permissions</CardTitle>
        </div>
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" />
          Add user
        </Button>
      </CardHeader>

      <CardContent>
        {users.isLoading ? (
          <div className="py-8">
            <CenteredSpinner label="Loading team…" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(users.data ?? []).map((m) => {
              const isSelf = m.user_id === user?.userId;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.email}</span>
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m.role === "admin" ? (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="h-3 w-3" /> Full access
                        </span>
                      ) : (
                        `${countEnabled(m.permissions)} permission${
                          countEnabled(m.permissions) === 1 ? "" : "s"
                        }`
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                        m.role === "admin"
                          ? "bg-neutral-900 text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {m.role}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(m)}
                    >
                      Edit
                    </Button>
                    {!isSelf &&
                      (confirmingId === m.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={del.isPending}
                            onClick={() => {
                              setRowError(null);
                              del.mutate(m.id, {
                                onSuccess: () => setConfirmingId(null),
                                onError: (e) => {
                                  setConfirmingId(null);
                                  setRowError(
                                    e instanceof ApiError
                                      ? e.message
                                      : "Couldn't remove user.",
                                  );
                                },
                              });
                            }}
                          >
                            {del.isPending && <Spinner />}
                            Remove
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Remove user"
                          onClick={() => setConfirmingId(m.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rowError && <p className="mt-3 text-sm text-destructive">{rowError}</p>}
      </CardContent>

      {creating && <UserDialog onClose={() => setCreating(false)} />}
      {editing && (
        <UserDialog member={editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function PermissionEditor({
  perms,
  onToggle,
}: {
  perms: PermissionMatrix;
  onToggle: (mod: string, action: string, on: boolean) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-border p-3">
      {PERMISSION_MODULES.map((mod) => (
        <div
          key={mod.key}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-1.5"
        >
          <span className="text-sm font-medium">{mod.label}</span>
          <div className="flex flex-wrap gap-3">
            {mod.actions.map((a) => {
              const on = !!perms[mod.key]?.[a.key];
              return (
                <label
                  key={a.key}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onToggle(mod.key, a.key, e.target.checked)}
                    className="h-4 w-4 accent-neutral-900"
                  />
                  {a.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Create (no member) or edit (member given) a staff account.
function UserDialog({
  member,
  onClose,
}: {
  member?: HotelUser;
  onClose: () => void;
}) {
  const isEdit = !!member;
  const create = useCreateUser();
  const updateUser = useUpdateUser();

  const [email, setEmail] = useState(member?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(member?.role ?? "general");
  const [perms, setPerms] = useState<PermissionMatrix>(
    member?.permissions ?? FRONT_DESK,
  );
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || updateUser.isPending;

  function toggle(mod: string, action: string, on: boolean) {
    setPerms((p) => ({ ...p, [mod]: { ...(p[mod] ?? {}), [action]: on } }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const onError = (err: unknown) =>
      setError(
        err instanceof ApiError ? err.message : "Something went wrong.",
      );

    if (isEdit) {
      updateUser.mutate(
        {
          id: member!.id,
          role,
          ...(role === "general" ? { permissions: perms } : {}),
        },
        { onSuccess: onClose, onError },
      );
    } else {
      if (!email.trim() || password.length < 8) {
        setError("Enter an email and a password of at least 8 characters.");
        return;
      }
      create.mutate(
        {
          email: email.trim(),
          password,
          role,
          ...(role === "general" ? { permissions: perms } : {}),
        },
        { onSuccess: onClose, onError },
      );
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? "Edit user" : "Add user"}
      description={isEdit ? member!.email : "Create a staff account for your hotel."}
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={pending}>
            {pending && <Spinner />}
            {isEdit ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {!isEdit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor="u-email">
              <Input
                id="u-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hotel.com"
              />
            </Field>
            <Field label="Initial password" htmlFor="u-pass">
              <Input
                id="u-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 8 chars"
              />
            </Field>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <Select
            id="u-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full sm:w-48"
          >
            <option value="general">General</option>
            <option value="admin">Admin</option>
          </Select>
        </div>

        {role === "admin" ? (
          <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Admins have full access to everything, including settings and user
            management.
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <PermissionEditor perms={perms} onToggle={toggle} />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Dialog>
  );
}
