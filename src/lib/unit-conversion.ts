// Unit conversion utilities for recipe ingredients
// Products are stored in macro units (kg, l, unidad, caja, bolsa, paquete)
// Recipes may use smaller units (g, ml) or the same macro units

type UnitGroup = "weight" | "volume" | "discrete";

const unitGroups: Record<string, UnitGroup> = {
  kg: "weight",
  g: "weight",
  l: "volume",
  ml: "volume",
  unidad: "discrete",
  caja: "discrete",
  bolsa: "discrete",
  paquete: "discrete",
};

// Conversion to base unit (g for weight, ml for volume, 1 for discrete)
const toBase: Record<string, number> = {
  kg: 1000,
  g: 1,
  l: 1000,
  ml: 1,
  unidad: 1,
  caja: 1,
  bolsa: 1,
  paquete: 1,
};

/**
 * Get compatible recipe units for a product unit.
 * e.g. product in "kg" → recipe can use "kg" or "g"
 */
export function getRecipeUnits(productUnit: string): string[] {
  const group = unitGroups[productUnit];
  if (group === "weight") return ["kg", "g"];
  if (group === "volume") return ["l", "ml"];
  return [productUnit]; // discrete units stay the same
}

/**
 * Get the default recipe unit (smaller unit for weight/volume).
 */
export function getDefaultRecipeUnit(productUnit: string): string {
  const group = unitGroups[productUnit];
  if (group === "weight") return "g";
  if (group === "volume") return "ml";
  return productUnit;
}

/**
 * Convert a recipe quantity to the product's unit for cost calculation.
 * e.g. 200g with product in kg → 0.2 kg
 */
export function convertToProductUnit(
  recipeQty: number,
  recipeUnit: string,
  productUnit: string
): number {
  const recipeBase = toBase[recipeUnit] ?? 1;
  const productBase = toBase[productUnit] ?? 1;
  return (recipeQty * recipeBase) / productBase;
}

/**
 * Format a unit label for display.
 */
export function unitLabel(unit: string): string {
  return unit;
}
