// The permission catalog the Users editor renders. Keys must match the API's
// requirePermission modules/actions and the admin defaults in auth.ts.
export interface PermModule {
  key: string;
  label: string;
  actions: { key: string; label: string }[];
}

const VIEW_MANAGE = [
  { key: "view", label: "View" },
  { key: "manage", label: "Manage" },
];

export const PERMISSION_MODULES: PermModule[] = [
  {
    key: "reservations",
    label: "Reservations",
    actions: [
      { key: "view", label: "View" },
      { key: "create", label: "Create" },
      { key: "update", label: "Update" },
      { key: "cancel", label: "Cancel" },
    ],
  },
  { key: "rooms", label: "Rooms", actions: VIEW_MANAGE },
  { key: "rate_plans", label: "Rate plans", actions: VIEW_MANAGE },
  { key: "guests", label: "Guests", actions: VIEW_MANAGE },
  { key: "payments", label: "Payments", actions: VIEW_MANAGE },
  { key: "housekeeping", label: "Housekeeping", actions: VIEW_MANAGE },
  { key: "reports", label: "Reports", actions: [{ key: "view", label: "View" }] },
  { key: "users", label: "Users", actions: VIEW_MANAGE },
  { key: "settings", label: "Settings", actions: VIEW_MANAGE },
];
