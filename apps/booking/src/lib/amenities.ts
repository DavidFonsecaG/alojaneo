// Predefined room amenities — mirrors the staff app. The `key` is what's
// stored on room_types.amenities and returned by the availability API; the
// `label` is display-only.
export const AMENITIES: { key: string; label: string }[] = [
  { key: "wifi", label: "WiFi" },
  { key: "air_conditioning", label: "A/C" },
  { key: "heating", label: "Heating" },
  { key: "tv", label: "TV" },
  { key: "minibar", label: "Minibar" },
  { key: "safe", label: "Safe" },
  { key: "balcony", label: "Balcony" },
  { key: "ocean_view", label: "Ocean view" },
  { key: "kitchenette", label: "Kitchenette" },
  { key: "private_bathroom", label: "Private bathroom" },
  { key: "coffee_maker", label: "Coffee maker" },
  { key: "workspace", label: "Workspace" },
];

export const amenityLabel = (key: string) =>
  AMENITIES.find((a) => a.key === key)?.label ?? key;
