import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import {
  ChefHat, CheckCircle2, AlertTriangle, Package, Search,
  Clock, Star, Trash2, ScanBarcode, UtensilsCrossed, Layers, Factory,
} from "lucide-react";
import { format } from "date-fns";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { UnitSelector } from "@/components/UnitSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductionRunDialog } from "@/components/ProductionRunDialog";

interface CartItem {
  productId: string;
  name: string;
  baseUnit: string;
  selectedUnit: string;
  quantity: number;
  currentStock: number;
  averageCost: number;
  recipeId: string | null;
  comboComponentId: string | null; // which component this product fills in a combo
}

interface ComboExecution {
  recipeId: string;
  recipeName: string;
  servings: number;
  components: {
    componentId: string;
    componentName: string;
    componentMode: "product" | "recipe";
    quantityPerService: number;
    selectedProductId: string; // for product mode
    selectedRecipeId: string; // for recipe mode
    productionRunId: string | null; // if using today's production run
    costSource: "theoretical" | "production_run";
    productionRunUnitCost: number; // real unit cost from production run
    recipeIngredients: {
      ingredientId: string;
      productId: string;
      productName: string;
      productUnit: string;
      theoreticalQty: number;
      actualQty: number;
      unitCost: number;
    }[];
  }[];
}

export default function KitchenKiosk() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [comboExecution, setComboExecution] = useState<ComboExecution | null>(null);
  const [productionRunOpen, setProductionRunOpen] = useState(false);
  const barcodeBufferRef = useRef("");
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // ──── Data queries ────
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, barcode, image_url")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productCodes } = useQuery({
    queryKey: ["product-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_codes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ["recipes-food"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_mode, recipe_type")
        .eq("recipe_type", "food")
        .order("name");
      if (error) throw error;
      return data as (typeof data[0] & { recipe_mode?: string })[];
    },
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id, product_id, quantity, unit");
      if (error) throw error;
      return data;
    },
  });

  // Fetch variable components for combo recipes
  const { data: variableComponents } = useQuery({
    queryKey: ["recipe-variable-components"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_variable_components" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch today's production runs to use real costs in combos
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayProductionRuns } = useQuery({
    queryKey: ["production-runs-today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_production_runs" as any)
        .select("*")
        .eq("production_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Map recipe_id → latest production run of today
  const todayRunByRecipe = useMemo(() => {
    const map = new Map<string, any>();
    todayProductionRuns?.forEach((run: any) => {
      if (!map.has(run.recipe_id)) {
        map.set(run.recipe_id, run);
      }
    });
    return map;
  }, [todayProductionRuns]);

  const componentsByRecipe = useMemo(() => {
    const map = new Map<string, any[]>();
    variableComponents?.forEach((c: any) => {
      const arr = map.get(c.recipe_id) || [];
      arr.push(c);
      map.set(c.recipe_id, arr);
    });
    return map;
  }, [variableComponents]);

  // Map product → recipes that use it (for fixed recipes)
  const recipesForProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    recipeIngredients?.forEach((ri) => {
      if (!map.has(ri.product_id)) map.set(ri.product_id, new Set());
      map.get(ri.product_id)!.add(ri.recipe_id);
    });
    return map;
  }, [recipeIngredients]);

  // Map recipe → ingredients with details
  const ingredientsByRecipe = useMemo(() => {
    const map = new Map<string, typeof recipeIngredients>();
    recipeIngredients?.forEach((ri) => {
      const arr = map.get(ri.recipe_id) || [];
      arr.push(ri);
      map.set(ri.recipe_id, arr);
    });
    return map;
  }, [recipeIngredients]);

  const recipeMap = useMemo(() => {
    const map = new Map<string, string>();
    recipes?.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [recipes]);

  // Split recipes into fixed and combo
  const fixedRecipes = useMemo(() => recipes?.filter(r => (r as any).recipe_mode !== "variable_combo") ?? [], [recipes]);
  const comboRecipes = useMemo(() => recipes?.filter(r => (r as any).recipe_mode === "variable_combo") ?? [], [recipes]);

  const { data: recentProductIds } = useQuery({
    queryKey: ["recent-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, created_at")
        .eq("type", "salida")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const m of data ?? []) {
        if (!seen.has(m.product_id)) {
          seen.add(m.product_id);
          ids.push(m.product_id);
          if (ids.length >= 10) break;
        }
      }
      return ids;
    },
  });

  const { data: frequentProductIds } = useQuery({
    queryKey: ["frequent-products"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id")
        .eq("type", "salida")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(500);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const m of data ?? []) counts.set(m.product_id, (counts.get(m.product_id) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    },
  });

  // ──── Derived data ────
  const codesByProduct = useMemo(() => {
    const map = new Map<string, string[]>();
    productCodes?.forEach((c) => {
      const arr = map.get(c.product_id) || [];
      arr.push(c.code.toLowerCase());
      map.set(c.product_id, arr);
    });
    return map;
  }, [productCodes]);

  const productByCode = useMemo(() => {
    const map = new Map<string, string>();
    products?.forEach((p) => {
      if (p.barcode) map.set(p.barcode.toLowerCase(), p.id);
    });
    productCodes?.forEach((c) => {
      map.set(c.code.toLowerCase(), c.product_id);
    });
    return map;
  }, [products, productCodes]);

  const recentProducts = useMemo(() => {
    if (!products || !recentProductIds) return [];
    return recentProductIds.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  }, [products, recentProductIds]);

  const frequentProducts = useMemo(() => {
    if (!products || !frequentProductIds) return [];
    return frequentProductIds.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  }, [products, frequentProductIds]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = productSearch.trim();
    if (!q) return products;
    return products.filter((p) => {
      const pCodes = codesByProduct.get(p.id);
      const haystack = buildHaystack(p.name, p.barcode, ...(pCodes || []));
      return fuzzyMatch(haystack, q);
    });
  }, [products, productSearch, codesByProduct]);

  // ──── Barcode scanner detection ────
  const addProductToCart = useCallback((productId: string) => {
    const p = products?.find((x) => x.id === productId);
    if (!p) return;
    if (cart.some((c) => c.productId === p.id)) {
      setScanFeedback(`"${p.name}" ya está en la lista`);
      setTimeout(() => setScanFeedback(null), 2000);
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        baseUnit: p.unit,
        selectedUnit: p.unit,
        quantity: 0,
        currentStock: Number(p.current_stock ?? 0),
        averageCost: Number(p.average_cost ?? 0),
        recipeId: null,
        comboComponentId: null,
      },
    ]);
    setScanFeedback(`✓ ${p.name} agregado`);
    setTimeout(() => setScanFeedback(null), 2000);
  }, [products, cart]);

  const handleBarcodeInput = useCallback((code: string) => {
    const normalizedCode = code.toLowerCase().trim();
    const productId = productByCode.get(normalizedCode);
    if (productId) {
      addProductToCart(productId);
    } else {
      setScanFeedback("Producto no encontrado");
      setTimeout(() => setScanFeedback(null), 2500);
    }
  }, [productByCode, addProductToCart]);

  // Global keydown listener for barcode scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Enter") {
        if (barcodeBufferRef.current.length >= 3) {
          handleBarcodeInput(barcodeBufferRef.current);
        }
        barcodeBufferRef.current = "";
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        return;
      }

      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          barcodeBufferRef.current = "";
        }, 300);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBarcodeInput]);

  // ──── Cart operations ────
  const updateCartItem = (productId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, ...updates } : item))
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // ──── Computed values ────
  const cartLines = useMemo(() => {
    return cart.map((item) => {
      const qtyInBase = convertToProductUnit(item.quantity, item.selectedUnit, item.baseUnit);
      const totalCost = qtyInBase * item.averageCost;
      const insufficient = qtyInBase > item.currentStock;
      return { ...item, qtyInBase, totalCost, insufficient };
    });
  }, [cart]);

  const hasInsufficient = cartLines.some((l) => l.insufficient);
  const hasQuantities = cartLines.some((l) => l.quantity > 0);
  const grandTotal = cartLines.reduce((s, l) => s + l.totalCost, 0);
  const isValid = cart.length > 0 && hasQuantities && !hasInsufficient;

  // ──── Combo execution helpers ────
  const startComboExecution = (recipe: any) => {
    const comps = componentsByRecipe.get(recipe.id) ?? [];
    setComboExecution({
      recipeId: recipe.id,
      recipeName: recipe.name,
      servings: 1,
      components: comps.map((c: any) => ({
        componentId: c.id,
        componentName: c.component_name,
        componentMode: (c.component_mode ?? "product") as "product" | "recipe",
        quantityPerService: Number(c.quantity_per_service),
        selectedProductId: "",
        selectedRecipeId: "",
        productionRunId: null,
        costSource: "theoretical" as const,
        productionRunUnitCost: 0,
        recipeIngredients: [],
      })),
    });
  };

  const updateComboComponent = (componentId: string, productId: string) => {
    setComboExecution((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        components: prev.components.map((c) =>
          c.componentId === componentId ? { ...c, selectedProductId: productId } : c
        ),
      };
    });
  };

  // When a recipe is selected for a recipe-type component, load its ingredients and check production run
  const updateComboRecipeComponent = (componentId: string, recipeId: string) => {
    setComboExecution((prev) => {
      if (!prev) return null;
      const ings = ingredientsByRecipe.get(recipeId) ?? [];
      const todayRun = todayRunByRecipe.get(recipeId);
      return {
        ...prev,
        components: prev.components.map((c) => {
          if (c.componentId !== componentId) return c;
          const recipeIngs = ings.map((ri: any) => {
            const prod = products?.find(p => p.id === ri.product_id);
            const ingredientUnit = ri.unit ?? prod?.unit ?? "unidad";
            const productBaseUnit = prod?.unit ?? "unidad";
            const qtyPerService = Number(ri.quantity);
            const totalQty = qtyPerService * prev.servings;
            // Convert average_cost (per product base unit) to cost per ingredient unit
            // e.g. if product is in kg ($4794/kg) and ingredient is in g, cost per g = $4.794
            const costPerProductUnit = Number(prod?.average_cost ?? 0);
            const costPerIngredientUnit = costPerProductUnit * convertToProductUnit(1, ingredientUnit, productBaseUnit);
            return {
              ingredientId: ri.product_id + "_" + recipeId,
              productId: ri.product_id,
              productName: prod?.name ?? "?",
              productUnit: ingredientUnit,
              theoreticalQty: totalQty,
              actualQty: totalQty,
              unitCost: costPerIngredientUnit,
            };
          });
          return {
            ...c,
            selectedRecipeId: recipeId,
            recipeIngredients: recipeIngs,
            productionRunId: todayRun ? todayRun.id : null,
            costSource: todayRun ? "production_run" as const : "theoretical" as const,
            productionRunUnitCost: todayRun ? Number(todayRun.actual_unit_cost) : 0,
          };
        }),
      };
    });
  };

  // Recalculate theoretical quantities when servings change
  const updateComboServings = (newServings: number) => {
    setComboExecution((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        servings: newServings,
        components: prev.components.map((c) => {
          if (c.componentMode !== "recipe" || !c.selectedRecipeId) return c;
          const ings = ingredientsByRecipe.get(c.selectedRecipeId) ?? [];
          return {
            ...c,
            recipeIngredients: c.recipeIngredients.map((ri) => {
              const origIng = ings.find((i: any) => i.product_id === ri.productId);
              const qtyPerService = origIng ? Number((origIng as any).quantity) : 0;
              const newTheoretical = qtyPerService * newServings;
              return { ...ri, theoreticalQty: newTheoretical, actualQty: newTheoretical };
            }),
          };
        }),
      };
    });
  };

  const updateRecipeIngredientActualQty = (componentId: string, productId: string, actualQty: number) => {
    setComboExecution((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        components: prev.components.map((c) => {
          if (c.componentId !== componentId) return c;
          return {
            ...c,
            recipeIngredients: c.recipeIngredients.map((ri) =>
              ri.productId === productId ? { ...ri, actualQty } : ri
            ),
          };
        }),
      };
    });
  };

  const comboIsValid = useMemo(() => {
    if (!comboExecution) return false;
    if (comboExecution.servings <= 0) return false;

    let hasSelectedComponent = false;

    for (const comp of comboExecution.components) {
      if (comp.componentMode === "product") {
        if (!comp.selectedProductId) continue;
        hasSelectedComponent = true;
        const prod = products?.find((p) => p.id === comp.selectedProductId);
        if (!prod) return false;
        const needed = comboExecution.servings * comp.quantityPerService;
        if (needed > Number(prod.current_stock ?? 0)) return false;
      } else {
        if (!comp.selectedRecipeId) continue;
        hasSelectedComponent = true;
        // If using production run, no ingredient-level stock check needed (already produced)
        if (comp.costSource !== "production_run") {
          if (comp.recipeIngredients.length === 0) return false;
          for (const ri of comp.recipeIngredients) {
            const prod = products?.find((p) => p.id === ri.productId);
            if (!prod) return false;
            const qtyInBaseUnit = convertToProductUnit(ri.actualQty, ri.productUnit, prod.unit);
            if (qtyInBaseUnit > Number(prod.current_stock ?? 0)) return false;
          }
        }
      }
    }

    return hasSelectedComponent;
  }, [comboExecution, products]);

  const comboCostBreakdown = useMemo(() => {
    if (!comboExecution) return { totalCost: 0, components: [] as { name: string; totalCost: number; unitCost: number; source: string; lotTotal?: number; lotQty?: number }[] };
    const servings = comboExecution.servings;
    const components: { name: string; totalCost: number; unitCost: number; source: string; lotTotal?: number; lotQty?: number }[] = [];
    let totalCost = 0;

    for (const comp of comboExecution.components) {
      if (comp.componentMode === "product") {
        const prod = products?.find((p) => p.id === comp.selectedProductId);
        if (!prod) continue;
        const cost = Number(prod.average_cost ?? 0);
        const lineCost = cost * comp.quantityPerService * servings;
        totalCost += lineCost;
        components.push({ name: comp.componentName, totalCost: lineCost, unitCost: lineCost / servings, source: "CPP" });
      } else {
        if (comp.costSource === "production_run" && comp.productionRunUnitCost > 0) {
          const qty = comp.quantityPerService * servings;
          const lineCost = comp.productionRunUnitCost * qty;
          totalCost += lineCost;
          // Find the production run to get lot info
          const run = todayRunByRecipe.get(comp.selectedRecipeId);
          components.push({
            name: comp.componentName,
            totalCost: lineCost,
            unitCost: comp.productionRunUnitCost * comp.quantityPerService,
            source: "Lote del día",
            lotTotal: run ? Number(run.actual_total_cost) : undefined,
            lotQty: run ? Number(run.quantity_produced) : undefined,
          });
        } else {
          const ingCost = comp.recipeIngredients.reduce((s, ri) => s + (ri.actualQty * ri.unitCost), 0);
          totalCost += ingCost;
          components.push({ name: comp.componentName, totalCost: ingCost, unitCost: ingCost / servings, source: "Teórico" });
        }
      }
    }
    return { totalCost, components };
  }, [comboExecution, products, todayRunByRecipe]);

  const comboTotalCost = comboCostBreakdown.totalCost;

  // ──── Confirm mutation (individual products) ────
  const confirmConsumption = useMutation({
    mutationFn: async () => {
      for (const line of cartLines) {
        if (line.quantity <= 0) continue;
        const recipeName = line.recipeId ? recipeMap.get(line.recipeId) : null;
        const isCombo = line.recipeId ? comboRecipes.some(r => r.id === line.recipeId) : false;
        const compName = line.comboComponentId && line.comboComponentId !== "__pending"
          ? (componentsByRecipe.get(line.recipeId!)?.find((c: any) => c.id === line.comboComponentId) as any)?.component_name
          : null;
        const notesParts = ["Consumo kiosco cocina"];
        if (recipeName) notesParts.push(isCombo ? `Combo: ${recipeName}` : `Receta: ${recipeName}`);
        if (compName) notesParts.push(`Componente: ${compName}`);
        const { error } = await supabase.from("inventory_movements").insert({
          product_id: line.productId,
          user_id: user!.id,
          type: "salida",
          quantity: line.qtyInBase,
          unit_cost: line.averageCost,
          total_cost: line.totalCost,
          notes: notesParts.join(" — "),
          restaurant_id: restaurantId!,
          recipe_id: line.recipeId && line.recipeId !== "__pending" ? line.recipeId : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["recent-products"] });
      qc.invalidateQueries({ queryKey: ["frequent-products"] });
      toast({
        title: "Consumo registrado",
        description: `${cartLines.filter((l) => l.quantity > 0).length} productos descontados`,
      });
      setCart([]);
      setProductSearch("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ──── Confirm combo mutation ────
  const confirmComboConsumption = useMutation({
    mutationFn: async () => {
      if (!comboExecution) throw new Error("No combo");

      let totalCost = 0;
      const itemsForLog: any[] = [];

        for (const comp of comboExecution.components) {
          if (comp.componentMode === "product") {
            if (!comp.selectedProductId) continue;
            const prod = products?.find((p) => p.id === comp.selectedProductId);
            if (!prod) throw new Error(`Producto no encontrado: ${comp.selectedProductId}`);
            const qty = comp.quantityPerService * comboExecution.servings;
            const cost = Number(prod.average_cost ?? 0);
            const lineCost = qty * cost;
            totalCost += lineCost;
            itemsForLog.push({ componentName: comp.componentName, productId: comp.selectedProductId, qty, unitCost: cost, lineCost, isRecipeComponent: false, selectedRecipeId: null, theoreticalQty: null, actualQty: null, productionRunId: null, costSource: "theoretical" });

            const { error } = await supabase.from("inventory_movements").insert({
              product_id: comp.selectedProductId, user_id: user!.id, type: "salida", quantity: qty, unit_cost: cost, total_cost: lineCost,
              notes: `Combo: ${comboExecution.recipeName} — ${comp.componentName} — ${comboExecution.servings} servicios`,
              restaurant_id: restaurantId!, recipe_id: comboExecution.recipeId,
            });
            if (error) throw error;
          } else {
            if (!comp.selectedRecipeId) continue;
            const selectedRecipeName = recipeMap.get(comp.selectedRecipeId) ?? "Receta";

            if (comp.costSource === "production_run" && comp.productionRunUnitCost > 0) {
              // Use production run cost — no ingredient-level deduction (already deducted during production)
              const qty = comp.quantityPerService * comboExecution.servings;
              const lineCost = comp.productionRunUnitCost * qty;
              totalCost += lineCost;
              itemsForLog.push({
                componentName: comp.componentName, productId: comp.selectedRecipeId, qty, unitCost: comp.productionRunUnitCost, lineCost,
                isRecipeComponent: true, selectedRecipeId: comp.selectedRecipeId,
                theoreticalQty: qty, actualQty: qty,
                productionRunId: comp.productionRunId, costSource: "production_run",
              });
            } else {
              // Deduct each ingredient with actual quantities
              for (const ri of comp.recipeIngredients) {
                const prod = products?.find((p) => p.id === ri.productId);
                if (!prod) continue;
                // ri.unitCost is already converted to cost-per-ingredient-unit
                const lineCost = ri.actualQty * ri.unitCost;
                totalCost += lineCost;
                // Convert actualQty from ingredient unit to product base unit for inventory
                const qtyInBaseUnit = convertToProductUnit(ri.actualQty, ri.productUnit, prod.unit);
                const costPerBaseUnit = Number(prod.average_cost ?? 0);
                itemsForLog.push({
                  componentName: comp.componentName, productId: ri.productId, qty: ri.actualQty, unitCost: ri.unitCost, lineCost,
                  isRecipeComponent: true, selectedRecipeId: comp.selectedRecipeId,
                  theoreticalQty: ri.theoreticalQty, actualQty: ri.actualQty,
                  productionRunId: null, costSource: "theoretical",
                });

                const { error } = await supabase.from("inventory_movements").insert({
                  product_id: ri.productId, user_id: user!.id, type: "salida", quantity: qtyInBaseUnit, unit_cost: costPerBaseUnit, total_cost: lineCost,
                  notes: `Combo: ${comboExecution.recipeName} — ${comp.componentName} (${selectedRecipeName}) — ${ri.productName} — ${comboExecution.servings} servicios`,
                  restaurant_id: restaurantId!, recipe_id: comboExecution.recipeId,
                });
                if (error) throw error;
              }
            }
          }
        }

      const unitCost = comboExecution.servings > 0 ? totalCost / comboExecution.servings : 0;
      const { data: execLog, error: logError } = await supabase
        .from("combo_execution_logs" as any)
        .insert({ restaurant_id: restaurantId!, recipe_id: comboExecution.recipeId, executed_by: user!.id, servings: comboExecution.servings, total_cost: totalCost, unit_cost: unitCost } as any)
        .select("id").single();
      if (logError) throw logError;

      const { error: itemsError } = await supabase
        .from("combo_execution_items" as any)
        .insert(
          itemsForLog.map((item) => ({
            execution_id: (execLog as any).id, component_name: item.componentName, product_id: item.productId,
            quantity: item.qty, unit_cost: item.unitCost, line_cost: item.lineCost,
            is_recipe_component: item.isRecipeComponent, selected_recipe_id: item.selectedRecipeId,
            theoretical_quantity: item.theoreticalQty, actual_quantity: item.actualQty,
            production_run_id: item.productionRunId, cost_source: item.costSource,
          })) as any
        );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["recent-products"] });
      qc.invalidateQueries({ queryKey: ["frequent-products"] });
      qc.invalidateQueries({ queryKey: ["combo-execution-logs"] });
      toast({
        title: "Combo registrado",
        description: `${comboExecution!.recipeName} — ${comboExecution!.servings} servicios descontados`,
      });
      setComboExecution(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Get relevant recipes for a product (all fixed recipes + all combo recipes)
  const getProductRecipes = (productId: string) => {
    const result: { id: string; name: string; isCombo: boolean }[] = [];
    // All fixed recipes (products may not be pre-assigned but can still be used)
    for (const r of fixedRecipes) {
      result.push({ id: r.id, name: r.name, isCombo: false });
    }
    // All combo recipes (any product can fill any component)
    for (const r of comboRecipes) {
      result.push({ id: r.id, name: `🔲 ${r.name}`, isCombo: true });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  };

  const renderProductButton = (p: any) => {
    const inCart = cart.some((c) => c.productId === p.id);
    return (
      <Tooltip key={p.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => addProductToCart(p.id)}
            className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
              inCart
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border hover:bg-muted/50"
            }`}
          >
            {p.image_url && (
              <img src={p.image_url} alt={p.name} className="h-10 w-full rounded object-cover mb-1" />
            )}
            <p className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5em]">{p.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Stock: {p.current_stock} {p.unit}
            </p>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{p.name}</p>
          <p className="text-muted-foreground">Stock: {p.current_stock} {p.unit}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  // ──── Combo execution dialog ────
  if (comboExecution) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="text-center">
            <h1 className="font-heading text-3xl font-bold flex items-center justify-center gap-2">
              <Layers className="h-8 w-8 text-primary" />
              {comboExecution.recipeName}
            </h1>
            <p className="text-muted-foreground text-sm">Selecciona un producto o receta para cada componente</p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Cantidad de servicios</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NumericKeypadInput
                mode="integer"
                value={comboExecution.servings || ""}
                onChange={(v) => {
                  const newVal = Math.max(1, Number(v) || 1);
                  updateComboServings(newVal);
                }}
                min="1"
                className="w-32 text-center text-lg"
                keypadLabel="Cantidad de servicios"
                forceKeypad
              />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {comboExecution.components.map((comp) => {
              if (comp.componentMode === "product") {
                // ── Product component ──
                const selectedProd = products?.find((p) => p.id === comp.selectedProductId);
                const needed = comp.quantityPerService * comboExecution.servings;
                const insufficient = selectedProd && needed > Number(selectedProd.current_stock ?? 0);
                const unitCost = selectedProd ? Number(selectedProd.average_cost ?? 0) : 0;
                const lineCost = unitCost * needed;

                return (
                  <Card key={comp.componentId} className={insufficient ? "border-destructive/50" : ""}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold capitalize flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {comp.componentName}
                        </Label>
                        <span className="text-xs text-muted-foreground">{comp.quantityPerService} × {comboExecution.servings} = {needed} unidades</span>
                      </div>
                      <SearchableSelect
                        options={products?.map((p) => ({
                          value: p.id,
                          label: `${p.name} — Stock: ${p.current_stock} ${p.unit}`,
                          searchTerms: p.name + " " + (p.barcode || ""),
                        })) ?? []}
                        value={comp.selectedProductId}
                        onValueChange={(v) => updateComboComponent(comp.componentId, v)}
                        placeholder="Buscar y seleccionar producto..."
                        searchPlaceholder="Buscar producto..."
                        forceKeyboard
                      />
                      {selectedProd && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Stock: {selectedProd.current_stock} {selectedProd.unit} · Costo: ${unitCost.toFixed(2)}/{selectedProd.unit}
                          </span>
                          <span className="font-medium">${lineCost.toFixed(2)}</span>
                        </div>
                      )}
                      {insufficient && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Stock insuficiente (necesita {needed}, disponible {selectedProd?.current_stock})
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              } else {
                // ── Recipe component ──
                const selectedRecipeName = comp.selectedRecipeId ? recipeMap.get(comp.selectedRecipeId) : null;
                const compIngCost = comp.recipeIngredients.reduce((s, ri) => s + (ri.actualQty * ri.unitCost), 0);
                const useRunCost = comp.costSource === "production_run" && comp.productionRunUnitCost > 0;
                const runCostTotal = useRunCost ? comp.productionRunUnitCost * comp.quantityPerService * comboExecution.servings : 0;

                return (
                  <Card key={comp.componentId}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-semibold capitalize flex items-center gap-1.5">
                          <ChefHat className="h-3.5 w-3.5 text-muted-foreground" />
                          {comp.componentName}
                          <Badge variant="outline" className="text-[10px] ml-1">Receta</Badge>
                        </Label>
                        {comp.selectedRecipeId && (
                          <Badge variant={useRunCost ? "default" : "secondary"} className="text-[10px] gap-1">
                            {useRunCost ? <><Factory className="h-3 w-3" /> Costo real del día</> : "Costo teórico"}
                          </Badge>
                        )}
                      </div>
                      <SearchableSelect
                        options={fixedRecipes.map((r) => {
                          const hasRun = todayRunByRecipe.has(r.id);
                          return {
                            value: r.id,
                            label: hasRun ? `✅ ${r.name} (producción de hoy)` : r.name,
                            searchTerms: r.name,
                          };
                        })}
                        value={comp.selectedRecipeId}
                        onValueChange={(v) => updateComboRecipeComponent(comp.componentId, v)}
                        placeholder="Buscar y seleccionar receta..."
                        searchPlaceholder="Buscar receta..."
                        forceKeyboard
                      />

                      {/* Production run info */}
                      {useRunCost && selectedRecipeName && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
                          <p className="text-xs font-semibold flex items-center gap-1.5">
                            <Factory className="h-3.5 w-3.5 text-primary" />
                            Producción de hoy disponible
                          </p>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Costo unitario real</span>
                            <span className="font-semibold">${comp.productionRunUnitCost.toFixed(2)} / unidad</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Costo total ({comp.quantityPerService} × {comboExecution.servings})</span>
                            <span className="font-semibold">${runCostTotal.toFixed(2)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Inventario ya descontado en la producción</p>
                        </div>
                      )}

                      {/* Fallback: show ingredients when no production run */}
                      {!useRunCost && selectedRecipeName && comp.recipeIngredients.length > 0 && (
                        <div className="space-y-1.5 rounded-md border p-3 bg-muted/30">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Ingredientes de "{selectedRecipeName}" × {comboExecution.servings} servicios (teórico)
                          </p>
                          <div className="space-y-1">
                            {comp.recipeIngredients.map((ri) => {
                              const prod = products?.find(p => p.id === ri.productId);
                              const stock = prod ? Number(prod.current_stock ?? 0) : 0;
                              const insuf = ri.actualQty > stock;
                              return (
                                <div key={ri.productId} className="flex items-center gap-2 text-sm">
                                  <span className="flex-1 truncate">{ri.productName}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    Teórico: {ri.theoreticalQty.toFixed(2)} {ri.productUnit}
                                  </span>
                                  <NumericKeypadInput
                                    mode="decimal"
                                    value={ri.actualQty || ""}
                                    onChange={(v) => updateRecipeIngredientActualQty(comp.componentId, ri.productId, Math.max(0, Number(v) || 0))}
                                    min="0"
                                    className="w-20 text-right text-sm h-8"
                                    keypadLabel={`${ri.productName} (real)`}
                                    forceKeypad
                                  />
                                  <span className="text-xs text-muted-foreground shrink-0 w-10">{ri.productUnit}</span>
                                  {insuf && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-xs pt-1 border-t">
                            <span className="text-muted-foreground">Costo ingredientes (teórico)</span>
                            <span className="font-medium">${compIngCost.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              }
            })}
          </div>

          {/* Cost breakdown */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">Desglose de costos por componente</p>
              {comboCostBreakdown.components.map((comp, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium capitalize">{comp.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">({comp.source})</span>
                    {comp.lotTotal !== undefined && comp.lotQty !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Lote: ${comp.lotTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })} / {comp.lotQty} unidades = ${(comp.lotTotal / comp.lotQty).toLocaleString("es-CO", { maximumFractionDigits: 0 })}/u
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-mono text-sm">${comp.unitCost.toLocaleString("es-CO", { maximumFractionDigits: 0 })}/u</p>
                    <p className="font-mono text-xs text-muted-foreground">${comp.totalCost.toLocaleString("es-CO", { maximumFractionDigits: 0 })} total</p>
                  </div>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Costo total del lote</p>
                  <p className="text-xs text-muted-foreground">{comboExecution.servings} servicios</p>
                </div>
                <div className="text-right">
                  <span className="font-heading font-bold text-2xl">${comboTotalCost.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                  <p className="text-sm font-semibold text-primary">
                    ${(comboTotalCost / comboExecution.servings).toLocaleString("es-CO", { maximumFractionDigits: 0 })} / servicio
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setComboExecution(null)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-14 text-lg"
              disabled={!comboIsValid || confirmComboConsumption.isPending}
              onClick={() => confirmComboConsumption.mutate()}
            >
              {confirmComboConsumption.isPending ? "Registrando..." : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Confirmar ({comboExecution.servings} servicios)
                </>
              )}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold flex items-center justify-center gap-2">
            <ChefHat className="h-8 w-8 text-primary" />
            Kiosco Cocina
          </h1>
          <p className="text-muted-foreground text-sm">
            Escanea códigos o selecciona productos — ingresa cantidades — confirma
          </p>
        </div>

        {/* Production Run button */}
        {fixedRecipes.length > 0 && (
          <div className="flex justify-center">
            <Button variant="outline" className="gap-2" onClick={() => setProductionRunOpen(true)}>
              <Factory className="h-4 w-4" /> Registrar Producción de Receta
            </Button>
          </div>
        )}

        {/* Barcode scan feedback */}
        {scanFeedback && (
          <div className={`text-center py-2 px-4 rounded-lg text-sm font-medium animate-in fade-in ${
            scanFeedback.startsWith("✓") ? "bg-primary/10 text-primary"
              : scanFeedback.includes("ya está") ? "bg-accent text-accent-foreground"
              : "bg-destructive/10 text-destructive"
          }`}>
            <ScanBarcode className="h-4 w-4 inline mr-2" />
            {scanFeedback}
          </div>
        )}

        {/* Combo recipes quick access */}
        {comboRecipes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Combos / Servicios variables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {comboRecipes.map((r) => {
                  const comps = componentsByRecipe.get(r.id) ?? [];
                  return (
                    <Tooltip key={r.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => startComboExecution(r)}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          {r.name}
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{comps.length}</Badge>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{r.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {comps.map((c: any) => c.component_name).join(", ")}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Product selection */}
          <Card className="lg:max-h-[70vh] flex flex-col">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-primary" /> Agregar productos
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput
                  className="pl-10"
                  placeholder="Buscar por nombre o código..."
                  value={productSearch}
                  onChange={setProductSearch}
                  forceKeyboard
                  keyboardLabel="Buscar producto"
                  inputType="search"
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ScanBarcode className="h-3 w-3" />
                Escanea un código de barras en cualquier momento
              </p>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 pb-4">
              {/* Recent / Frequent */}
              {!productSearch && (
                <>
                  {recentProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" /> Recientes
                      </h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        {recentProducts.map((p: any) => renderProductButton(p))}
                      </div>
                    </div>
                  )}
                  {frequentProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                        <Star className="h-3 w-3" /> Más usados
                      </h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        {frequentProducts.map((p: any) => renderProductButton(p))}
                      </div>
                    </div>
                  )}
                  {(recentProducts.length > 0 || frequentProducts.length > 0) && (
                    <div className="border-t pt-2">
                      <h3 className="text-xs font-medium text-muted-foreground mb-1.5">Todos</h3>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {filteredProducts.map((p: any) => renderProductButton(p))}
              </div>
              {filteredProducts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Cart / quantities */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Lista de consumo
                  </span>
                  {cart.length > 0 && (
                    <Badge variant="secondary">{cart.length} productos</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <ScanBarcode className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    Escanea un código o selecciona productos para comenzar
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {cartLines.map((item) => {
                      const availableRecipes = getProductRecipes(item.productId);
                      const hasRecipe = !!item.recipeId;
                      return (
                        <div
                          key={item.productId}
                          className={`rounded-lg border p-3 space-y-2 ${
                            item.insufficient ? "border-destructive/50 bg-destructive/5" : "border-border"
                          }`}
                        >
                          {/* Product name + delete */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm leading-tight">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Stock: {item.currentStock} {item.baseUnit}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeFromCart(item.productId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Quantity + unit */}
                          <div className="flex items-center gap-2">
                            <NumericKeypadInput
                              mode="decimal"
                              value={item.quantity || ""}
                              onChange={(v) =>
                                updateCartItem(item.productId, {
                                  quantity: Math.max(0, Number(v) || 0),
                                })
                              }
                              min="0"
                              className="w-24 text-right"
                              keypadLabel={item.name}
                              forceKeypad
                            />
                            <UnitSelector
                              productUnit={item.baseUnit}
                              value={item.selectedUnit}
                              onChange={(u) => updateCartItem(item.productId, { selectedUnit: u })}
                              className="w-20"
                            />
                            {item.quantity > 0 && item.selectedUnit !== item.baseUnit && (
                              <span className="text-xs text-muted-foreground">
                                = {item.qtyInBase.toFixed(3)} {item.baseUnit}
                              </span>
                            )}
                          </div>

                          {/* Recipe toggle + selector */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartItem(item.productId, { recipeId: hasRecipe ? null : "__pending" as any })
                                }
                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                  hasRecipe
                                    ? "bg-primary/10 text-primary border border-primary/30"
                                    : "bg-muted text-muted-foreground border border-border"
                                }`}
                              >
                                {hasRecipe ? (
                                  <>
                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                    Con receta
                                  </>
                                ) : (
                                  <>
                                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                                    Sin receta
                                  </>
                                )}
                              </button>
                              {hasRecipe && item.recipeId && item.recipeId !== "__pending" && (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                                  {comboRecipes.some(r => r.id === item.recipeId)
                                    ? <Layers className="h-2.5 w-2.5" />
                                    : <UtensilsCrossed className="h-2.5 w-2.5" />}
                                  {recipeMap.get(item.recipeId) ?? "Receta"}
                                </Badge>
                              )}
                            </div>

                            {/* Show recipe dropdown when toggled to "Con receta" */}
                            {hasRecipe && (
                              <>
                                <SearchableSelect
                                  options={availableRecipes.length > 0
                                    ? availableRecipes.map((r) => ({ value: r.id, label: r.name }))
                                    : []}
                                  value={item.recipeId === "__pending" ? "" : (item.recipeId ?? "")}
                                  onValueChange={(v) => {
                                    const isCombo = comboRecipes.some(r => r.id === v);
                                    updateCartItem(item.productId, {
                                      recipeId: v || null,
                                      comboComponentId: isCombo ? "__pending" : null,
                                    });
                                  }}
                                  placeholder="Seleccionar receta..."
                                  searchPlaceholder="Buscar receta..."
                                  emptyMessage={availableRecipes.length === 0 ? "No hay recetas disponibles" : "Sin resultados."}
                                  triggerClassName="h-8 text-xs"
                                />
                                {/* Component selector for combo recipes */}
                                {item.recipeId && item.recipeId !== "__pending" && comboRecipes.some(r => r.id === item.recipeId) && (() => {
                                  const comps = componentsByRecipe.get(item.recipeId!) ?? [];
                                  return comps.length > 0 ? (
                                    <SearchableSelect
                                      options={comps.map((c: any) => ({
                                        value: c.id,
                                        label: c.component_name,
                                      }))}
                                      value={item.comboComponentId === "__pending" ? "" : (item.comboComponentId ?? "")}
                                      onValueChange={(v) => updateCartItem(item.productId, { comboComponentId: v || null })}
                                      placeholder="¿Qué componente llena?"
                                      searchPlaceholder="Buscar componente..."
                                      triggerClassName="h-8 text-xs"
                                    />
                                  ) : null;
                                })()}
                              </>
                            )}
                          </div>

                          {item.insufficient && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Stock insuficiente
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {cart.length > 0 && (
              <>

                {hasInsufficient && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Stock insuficiente en uno o más productos
                  </div>
                )}

                <div className="rounded-md bg-muted p-4 flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Costo total estimado</span>
                  <span className="font-heading font-bold text-2xl">${grandTotal.toFixed(2)}</span>
                </div>

                <Button
                  className="w-full h-14 text-lg"
                  disabled={!isValid || confirmConsumption.isPending}
                  onClick={() => confirmConsumption.mutate()}
                >
                  {confirmConsumption.isPending ? (
                    "Registrando..."
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Confirmar Consumo ({cartLines.filter((l) => l.quantity > 0).length})
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <ProductionRunDialog
        open={productionRunOpen}
        onOpenChange={setProductionRunOpen}
        fixedRecipes={fixedRecipes}
        recipeIngredientsByRecipe={ingredientsByRecipe}
        products={products ?? []}
      />
    </AppLayout>
  );
}
