// Unit conversion utilities
// Products store quantities in base units (kg, litro, unidad, etc.)
// Users may input in smaller/larger compatible units (g, ml)

type UnitGroup = "weight" | "volume" | "discrete";

const unitGroups: Record<string, UnitGroup> = {
  kg: "weight",
  g: "weight",
  litro: "volume",
  l: "volume",
  ml: "volume",
  unidad: "discrete",
  caja: "discrete",
  bolsa: "discrete",
  paquete: "discrete",
};

// Conversion factor to the smallest unit in each group (g for weight, ml for volume)
const toBase: Record<string, number> = {
  kg: 1000,
  g: 1,
  litro: 1000,
  l: 1000,
  ml: 1,
  unidad: 1,
  caja: 1,
  bolsa: 1,
  paquete: 1,
};

/**
 * Normalize unit aliases (e.g. "l" → "litro")
 */
export function normalizeUnit(unit: string): string {
  if (unit === "l") return "litro";
  return unit;
}

/**
 * Get compatible units for a given product base unit.
 * e.g. "kg" → ["kg", "g"], "litro" → ["litro", "ml"]
 */
export function getCompatibleUnits(productUnit: string): string[] {
  const norm = normalizeUnit(productUnit);
  const group = unitGroups[norm];
  if (group === "weight") return ["kg", "g"];
  if (group === "volume") return ["litro", "ml"];
  return [norm]; // discrete units only allow themselves
}

/**
 * Get compatible recipe units for a product unit (same as getCompatibleUnits).
 */
export function getRecipeUnits(productUnit: string): string[] {
  return getCompatibleUnits(productUnit);
}

/**
 * Get the default (smaller) recipe unit for a product.
 */
export function getDefaultRecipeUnit(productUnit: string): string {
  const norm = normalizeUnit(productUnit);
  const group = unitGroups[norm];
  if (group === "weight") return "g";
  if (group === "volume") return "ml";
  return norm;
}

/**
 * Convert a quantity from one unit to the product's base unit.
 * e.g. 500g with product in kg → 0.5 kg
 *      250ml with product in litro → 0.25 litro
 */
export function convertToProductUnit(
  qty: number,
  fromUnit: string,
  productUnit: string
): number {
  const fromBase = toBase[normalizeUnit(fromUnit)] ?? 1;
  const prodBase = toBase[normalizeUnit(productUnit)] ?? 1;
  return (qty * fromBase) / prodBase;
}

/**
 * Format a unit label for display.
 */
export function unitLabel(unit: string): string {
  return unit;
}
