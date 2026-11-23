const labels: Record<string, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  living: "Living room",
  dining: "Dining room",
  office: "Office",
  laundry: "Laundry",
  garage: "Garage",
  basement: "Basement",
  attic: "Attic",
  hallway: "Hallway",
  exterior: "Outside",
  whole_house: "Whole house",
  other: "Other",
};

export function roomTypeLabel(type: string): string {
  return labels[type] ?? "Other";
}

const openingLabels: Record<string, string> = { window: "Window", door: "Door", other: "Opening" };

export function openingKindLabel(kind: string): string {
  return openingLabels[kind] ?? "Opening";
}
