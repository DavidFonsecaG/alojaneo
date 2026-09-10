// Predefined room amenities. The `key` is what's stored on
// room_types.amenities and surfaced on the booking engine / OTAs; the `label`
// is display-only. Keep keys stable — they map to OTA amenity codes later.
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
