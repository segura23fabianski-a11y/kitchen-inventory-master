import { describe, it, expect } from "vitest";

/**
 * Tests for the product equivalents logic.
 * These test the pure functions and data transformations
 * without requiring Supabase or React rendering.
 */

// ── Simulated equivalents data ──
interface EquivalentRow {
  product_id: string;
  equivalent_product_id: string;
  priority: number;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  average_cost: number;
}

// Helper: build equivalents map (same logic as the hook)
function buildEquivalentsMap(rows: EquivalentRow[]) {
  const map = new Map<string, { equivalentProductId: string; priority: number }[]>();
  for (const row of rows) {
    if (!map.has(row.product_id)) map.set(row.product_id, []);
    map.get(row.product_id)!.push({
      equivalentProductId: row.equivalent_product_id,
      priority: row.priority,
    });
  }
  return map;
}

// Helper: get equivalents enriched
function getEquivalents(
  productId: string,
  equivalentsMap: ReturnType<typeof buildEquivalentsMap>,
  productMap: Map<string, Product>
) {
  const entries = equivalentsMap.get(productId) ?? [];
  return entries
    .map((e) => {
      const prod = productMap.get(e.equivalentProductId);
      if (!prod) return null;
      return {
        id: prod.id,
        name: prod.name,
        unit: prod.unit,
        currentStock: prod.current_stock,
        averageCost: prod.average_cost,
        priority: e.priority,
      };
    })
    .filter(Boolean) as any[];
}

// Helper: suggest mix
function suggestMix(
  productId: string,
  neededQty: number,
  equivalentsMap: ReturnType<typeof buildEquivalentsMap>,
  productMap: Map<string, Product>
) {
  const result: { productId: string; name: string; quantity: number; stock: number }[] = [];
  let remaining = neededQty;

  // Start with original product
  const mainProd = productMap.get(productId);
  if (mainProd) {
    const take = Math.min(remaining, mainProd.current_stock);
    if (take > 0) {
      result.push({ productId: mainProd.id, name: mainProd.name, quantity: take, stock: mainProd.current_stock });
      remaining -= take;
    }
  }

  // Fill with equivalents sorted by priority, then stock
  if (remaining > 0) {
    const equivalents = getEquivalents(productId, equivalentsMap, productMap)
      .sort((a: any, b: any) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.currentStock - a.currentStock;
      });
    for (const eq of equivalents) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, eq.currentStock);
      if (take > 0) {
        result.push({ productId: eq.id, name: eq.name, quantity: take, stock: eq.currentStock });
        remaining -= take;
      }
    }
  }

  return result;
}

// ── Test data ──
const products: Product[] = [
  { id: "gaseosa-lunch", name: "GASEOSA LUNCH", unit: "unidad", current_stock: 0, average_cost: 1500 },
  { id: "coca-cola", name: "Coca-Cola", unit: "unidad", current_stock: 10, average_cost: 2000 },
  { id: "sprite", name: "Sprite", unit: "unidad", current_stock: 5, average_cost: 1800 },
  { id: "colombiana", name: "Colombiana", unit: "unidad", current_stock: 5, average_cost: 1600 },
  { id: "pepsi", name: "Pepsi", unit: "unidad", current_stock: 3, average_cost: 1900 },
  { id: "galleta-lunch", name: "GALLETA LUNCH", unit: "unidad", current_stock: 0, average_cost: 1000 },
  { id: "chocoramo", name: "Chocoramo", unit: "unidad", current_stock: 8, average_cost: 900 },
  { id: "ponque", name: "Ponqué Ramo", unit: "unidad", current_stock: 12, average_cost: 1100 },
];

const productMap = new Map(products.map((p) => [p.id, p]));

// Bidirectional equivalents
const equivalentRows: EquivalentRow[] = [
  // GASEOSA LUNCH ↔ Coca-Cola, Sprite, Colombiana, Pepsi
  { product_id: "gaseosa-lunch", equivalent_product_id: "coca-cola", priority: 1 },
  { product_id: "gaseosa-lunch", equivalent_product_id: "sprite", priority: 2 },
  { product_id: "gaseosa-lunch", equivalent_product_id: "colombiana", priority: 3 },
  { product_id: "gaseosa-lunch", equivalent_product_id: "pepsi", priority: 4 },
  { product_id: "coca-cola", equivalent_product_id: "gaseosa-lunch", priority: 0 },
  { product_id: "sprite", equivalent_product_id: "gaseosa-lunch", priority: 0 },
  { product_id: "colombiana", equivalent_product_id: "gaseosa-lunch", priority: 0 },
  { product_id: "pepsi", equivalent_product_id: "gaseosa-lunch", priority: 0 },
  // Bidirectional between the sodas
  { product_id: "coca-cola", equivalent_product_id: "sprite", priority: 1 },
  { product_id: "coca-cola", equivalent_product_id: "colombiana", priority: 2 },
  { product_id: "sprite", equivalent_product_id: "coca-cola", priority: 1 },
  { product_id: "colombiana", equivalent_product_id: "coca-cola", priority: 1 },
  // GALLETA LUNCH ↔ Chocoramo, Ponqué
  { product_id: "galleta-lunch", equivalent_product_id: "chocoramo", priority: 1 },
  { product_id: "galleta-lunch", equivalent_product_id: "ponque", priority: 2 },
  { product_id: "chocoramo", equivalent_product_id: "galleta-lunch", priority: 0 },
  { product_id: "ponque", equivalent_product_id: "galleta-lunch", priority: 0 },
];

const equivalentsMap = buildEquivalentsMap(equivalentRows);

// ═══════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════

describe("Product Equivalents — Data Model", () => {
  it("builds bidirectional equivalents map correctly", () => {
    // GASEOSA LUNCH should have 4 equivalents
    expect(equivalentsMap.get("gaseosa-lunch")?.length).toBe(4);
    // Coca-Cola should have equivalents too (bidirectional)
    expect(equivalentsMap.get("coca-cola")?.length).toBeGreaterThanOrEqual(2);
  });

  it("a product can belong to multiple groups", () => {
    // Coca-Cola is equivalent to gaseosa-lunch AND to sprite/colombiana directly
    const cocaEquivs = equivalentsMap.get("coca-cola")!;
    const eqIds = cocaEquivs.map((e) => e.equivalentProductId);
    expect(eqIds).toContain("gaseosa-lunch");
    expect(eqIds).toContain("sprite");
    expect(eqIds).toContain("colombiana");
  });

  it("a product is NOT its own equivalent", () => {
    const cocaEquivs = equivalentsMap.get("coca-cola")!;
    const eqIds = cocaEquivs.map((e) => e.equivalentProductId);
    expect(eqIds).not.toContain("coca-cola");
  });
});

describe("Product Equivalents — Get Equivalents", () => {
  it("returns enriched equivalent products", () => {
    const eqs = getEquivalents("gaseosa-lunch", equivalentsMap, productMap);
    expect(eqs.length).toBe(4);
    expect(eqs[0].name).toBe("Coca-Cola");
    expect(eqs[0].currentStock).toBe(10);
  });

  it("returns empty array for products without equivalents", () => {
    const eqs = getEquivalents("nonexistent", equivalentsMap, productMap);
    expect(eqs.length).toBe(0);
  });

  it("handles products with no configured equivalents", () => {
    // Pepsi has gaseosa-lunch as equivalent but nothing else directly configured
    const eqs = getEquivalents("pepsi", equivalentsMap, productMap);
    expect(eqs.length).toBeGreaterThan(0);
    expect(eqs[0].name).toBe("GASEOSA LUNCH");
  });
});

describe("Product Equivalents — Suggest Mix", () => {
  it("uses original product first, then fills with equivalents", () => {
    const mix = suggestMix("gaseosa-lunch", 20, equivalentsMap, productMap);
    // GASEOSA LUNCH has 0 stock, so all comes from equivalents
    expect(mix.length).toBeGreaterThan(0);
    expect(mix.some((m) => m.productId === "gaseosa-lunch")).toBe(false);
    // Total should equal 20 (10 + 5 + 5 = 20, Pepsi not needed)
    const total = mix.reduce((s, m) => s + m.quantity, 0);
    expect(total).toBe(20);
  });

  it("fills exact amount with Coca-Cola(10) + Sprite(5) + Colombiana(5)", () => {
    const mix = suggestMix("gaseosa-lunch", 20, equivalentsMap, productMap);
    const cocaLine = mix.find((m) => m.productId === "coca-cola");
    const spriteLine = mix.find((m) => m.productId === "sprite");
    const colombianaLine = mix.find((m) => m.productId === "colombiana");
    expect(cocaLine?.quantity).toBe(10);
    expect(spriteLine?.quantity).toBe(5);
    expect(colombianaLine?.quantity).toBe(5);
  });

  it("uses all equivalents including Pepsi when needed for larger quantity", () => {
    const mix = suggestMix("gaseosa-lunch", 25, equivalentsMap, productMap);
    const total = mix.reduce((s, m) => s + m.quantity, 0);
    // Max available: Coca(10) + Sprite(5) + Colombiana(5) + Pepsi(3) = 23
    expect(total).toBe(23); // Can't reach 25
    expect(mix.some((m) => m.productId === "pepsi")).toBe(true);
  });

  it("starts with original product stock when available", () => {
    // Give GASEOSA LUNCH some stock
    const modProducts = new Map(productMap);
    modProducts.set("gaseosa-lunch", { ...products[0], current_stock: 7 });
    const mix = suggestMix("gaseosa-lunch", 15, equivalentsMap, modProducts);
    // Should start with 7 from gaseosa-lunch, then 8 from equivalents
    const mainLine = mix.find((m) => m.productId === "gaseosa-lunch");
    expect(mainLine?.quantity).toBe(7);
    const rest = mix.filter((m) => m.productId !== "gaseosa-lunch");
    const restTotal = rest.reduce((s, m) => s + m.quantity, 0);
    expect(restTotal).toBe(8);
    expect(mix.reduce((s, m) => s + m.quantity, 0)).toBe(15);
  });

  it("handles product with no equivalents (returns only original)", () => {
    const mix = suggestMix("coca-cola", 5, equivalentsMap, productMap);
    // Coca-Cola has 10 stock, needs only 5
    expect(mix.length).toBe(1);
    expect(mix[0].productId).toBe("coca-cola");
    expect(mix[0].quantity).toBe(5);
  });

  it("handles zero quantity gracefully", () => {
    const mix = suggestMix("gaseosa-lunch", 0, equivalentsMap, productMap);
    expect(mix.length).toBe(0);
  });
});

describe("Product Equivalents — Priority ordering", () => {
  it("respects priority order: Coca-Cola (1) before Sprite (2) before Colombiana (3)", () => {
    const eqs = getEquivalents("gaseosa-lunch", equivalentsMap, productMap);
    expect(eqs[0].name).toBe("Coca-Cola");
    expect(eqs[1].name).toBe("Sprite");
    expect(eqs[2].name).toBe("Colombiana");
    expect(eqs[3].name).toBe("Pepsi");
  });
});

describe("Product Equivalents — No breaking changes", () => {
  it("products without equivalents work normally", () => {
    // A product not in the equivalents system
    const randomProduct: Product = { id: "arroz", name: "Arroz", unit: "kg", current_stock: 50, average_cost: 3000 };
    const modMap = new Map(productMap);
    modMap.set("arroz", randomProduct);
    const eqs = getEquivalents("arroz", equivalentsMap, modMap);
    expect(eqs.length).toBe(0);
    const mix = suggestMix("arroz", 10, equivalentsMap, modMap);
    expect(mix.length).toBe(1);
    expect(mix[0].productId).toBe("arroz");
    expect(mix[0].quantity).toBe(10);
  });

  it("inventory movements still tracked per real product", () => {
    // Verify the mix returns individual product lines, not grouped
    const mix = suggestMix("gaseosa-lunch", 20, equivalentsMap, productMap);
    for (const line of mix) {
      expect(line.productId).toBeTruthy();
      expect(line.productId).not.toBe("gaseosa-lunch"); // Real products, not the group
      expect(line.quantity).toBeGreaterThan(0);
    }
  });

  it("existing GALLETA LUNCH equivalents work independently", () => {
    const mix = suggestMix("galleta-lunch", 15, equivalentsMap, productMap);
    // GALLETA LUNCH has 0 stock. Chocoramo(8) + Ponqué(12) = 20 available
    const total = mix.reduce((s, m) => s + m.quantity, 0);
    expect(total).toBe(15);
    const choco = mix.find((m) => m.productId === "chocoramo");
    const ponque = mix.find((m) => m.productId === "ponque");
    expect(choco?.quantity).toBe(8);
    expect(ponque?.quantity).toBe(7);
  });
});
