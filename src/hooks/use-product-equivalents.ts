import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EquivalentProduct {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  averageCost: number;
  priority: number;
}

/**
 * Hook to fetch and resolve product equivalents.
 * Returns a Map from productId → list of equivalent products (bidirectional).
 * Also provides helper functions.
 */
export function useProductEquivalents() {
  const { data: rawEquivalents = [] } = useQuery({
    queryKey: ["product-equivalents-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_equivalents" as any)
        .select("product_id, equivalent_product_id, priority");
      if (error) throw error;
      return data as { product_id: string; equivalent_product_id: string; priority: number }[];
    },
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, barcode")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Build bidirectional map: productId → [{equivalentProductId, priority}]
  const equivalentsMap = useMemo(() => {
    const map = new Map<string, { equivalentProductId: string; priority: number }[]>();
    for (const row of rawEquivalents) {
      // Direction: product_id → equivalent_product_id
      if (!map.has(row.product_id)) map.set(row.product_id, []);
      map.get(row.product_id)!.push({
        equivalentProductId: row.equivalent_product_id,
        priority: row.priority,
      });
    }
    return map;
  }, [rawEquivalents]);

  // productMap for enrichment
  const productMap = useMemo(() => {
    const map = new Map<string, typeof allProducts[0]>();
    allProducts.forEach((p) => map.set(p.id, p));
    return map;
  }, [allProducts]);

  /**
   * Get enriched equivalent products for a given product ID.
   * Sorted by priority (lower first), then by stock (higher first).
   */
  const getEquivalents = (productId: string): EquivalentProduct[] => {
    const entries = equivalentsMap.get(productId) ?? [];
    return entries
      .map((e) => {
        const prod = productMap.get(e.equivalentProductId);
        if (!prod) return null;
        return {
          id: prod.id,
          name: prod.name,
          unit: prod.unit,
          currentStock: Number(prod.current_stock ?? 0),
          averageCost: Number(prod.average_cost ?? 0),
          priority: e.priority,
        };
      })
      .filter(Boolean) as EquivalentProduct[];
  };

  /**
   * Get equivalents sorted for best auto-suggestion:
   * priority first, then most stock available.
   */
  const getSuggestedEquivalents = (productId: string): EquivalentProduct[] => {
    return getEquivalents(productId).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.currentStock - a.currentStock;
    });
  };

  /**
   * Check if a product has any equivalents configured.
   */
  const hasEquivalents = (productId: string): boolean => {
    return (equivalentsMap.get(productId)?.length ?? 0) > 0;
  };

  /**
   * Get all equivalent product IDs (flat set) for a given product.
   */
  const getEquivalentIds = (productId: string): Set<string> => {
    const entries = equivalentsMap.get(productId) ?? [];
    return new Set(entries.map((e) => e.equivalentProductId));
  };

  /**
   * Build an auto-fill suggestion for a required quantity.
   * Returns an array of { productId, quantity } that fills the needed amount,
   * starting with the original product, then equivalents by priority/stock.
   */
  const suggestMix = (
    productId: string,
    neededQty: number
  ): { productId: string; name: string; quantity: number; stock: number }[] => {
    const result: { productId: string; name: string; quantity: number; stock: number }[] = [];
    let remaining = neededQty;

    // Start with the original product
    const mainProd = productMap.get(productId);
    if (mainProd) {
      const stock = Number(mainProd.current_stock ?? 0);
      const take = Math.min(remaining, stock);
      if (take > 0) {
        result.push({ productId: mainProd.id, name: mainProd.name, quantity: take, stock });
        remaining -= take;
      }
    }

    // Fill with equivalents
    if (remaining > 0) {
      const equivalents = getSuggestedEquivalents(productId);
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
  };

  return {
    equivalentsMap,
    getEquivalents,
    getSuggestedEquivalents,
    hasEquivalents,
    getEquivalentIds,
    suggestMix,
    isLoaded: rawEquivalents.length > 0 || allProducts.length > 0,
  };
}
