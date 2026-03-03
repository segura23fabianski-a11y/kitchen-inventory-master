import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { ChefHat, CheckCircle2, AlertTriangle, Package, ClipboardList, Search, Clock, Star } from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

type Step = "products" | "recipe" | "quantities";

interface SelectedProduct {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  average_cost: number;
  barcode: string | null;
}

export default function KitchenKiosk() {
  const [step, setStep] = useState<Step>("products");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [recipeId, setRecipeId] = useState("");
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // All products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, barcode, image_url")
        .order("name");
      if (error) throw error;
      return data as (SelectedProduct & { image_url: string | null })[];
    },
  });

  // Product codes for search
  const { data: productCodes } = useQuery({
    queryKey: ["product-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_codes").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Recent products (last 20 distinct products used)
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

  // Frequent products (most used in last 30 days)
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
      for (const m of data ?? []) {
        counts.set(m.product_id, (counts.get(m.product_id) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);
    },
  });

  const recentProducts = useMemo(() => {
    if (!products || !recentProductIds) return [];
    return recentProductIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as SelectedProduct[];
  }, [products, recentProductIds]);

  const frequentProducts = useMemo(() => {
    if (!products || !frequentProductIds) return [];
    return frequentProductIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as SelectedProduct[];
  }, [products, frequentProductIds]);

  // All recipes
  const { data: recipes } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Recipe ingredients for selected recipe
  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients", recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients")
        .select("*, products(id, name, unit, current_stock, average_cost)")
        .eq("recipe_id", recipeId);
      if (error) throw error;
      return data;
    },
    enabled: !!recipeId,
  });

  const filteredRecipes = useMemo(() => recipes ?? [], [recipes]);

  // When recipe is selected, pre-fill quantities from recipe ingredients
  const initializeQuantities = (ingredients: typeof recipeIngredients) => {
    if (!ingredients) return;
    const qtys: Record<string, number> = {};
    ingredients.forEach((ing) => {
      const product = (ing as any).products;
      const productQty = convertToProductUnit(Number(ing.quantity), ing.unit, product?.unit ?? ing.unit);
      qtys[ing.product_id] = productQty;
    });
    setCustomQuantities(qtys);
  };

  // Selected products data
  const selectedProducts: SelectedProduct[] = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => selectedProductIds.has(p.id));
  }, [products, selectedProductIds]);

  // Build code lookup
  const codesByProduct = useMemo(() => {
    const map = new Map<string, string[]>();
    productCodes?.forEach((c) => {
      const arr = map.get(c.product_id) || [];
      arr.push(c.code.toLowerCase());
      map.set(c.product_id, arr);
    });
    return map;
  }, [productCodes]);

  // Filter products by name, barcode, or product codes
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = productSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.barcode && p.barcode.toLowerCase().includes(q)) return true;
      const pCodes = codesByProduct.get(p.id);
      if (pCodes?.some((c) => c.includes(q))) return true;
      return false;
    });
  }, [products, productSearch, codesByProduct]);

  // Build lines for the quantities step
  const lines = useMemo(() => {
    return selectedProducts.map((product) => {
      const qty = customQuantities[product.id] ?? 0;
      const stock = Number(product.current_stock ?? 0);
      const unitCost = Number(product.average_cost ?? 0);
      const totalCost = qty * unitCost;
      const insufficient = qty > stock;
      return { product, qty, stock, unitCost, totalCost, insufficient };
    });
  }, [selectedProducts, customQuantities]);

  const hasInsufficient = lines.some((l) => l.insufficient);
  const grandTotal = lines.reduce((s, l) => s + l.totalCost, 0);
  const hasQuantities = lines.some((l) => l.qty > 0);
  const isValid = selectedProducts.length > 0 && hasQuantities && !hasInsufficient;

  const selectedRecipe = recipes?.find((r) => r.id === recipeId);

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const goToRecipeStep = () => {
    setRecipeId("");
    setCustomQuantities({});
    setStep("recipe");
  };

  const goToQuantitiesStep = () => {
    if (recipeIngredients) {
      initializeQuantities(recipeIngredients);
      const newIds = new Set(selectedProductIds);
      recipeIngredients.forEach((ing) => newIds.add(ing.product_id));
      setSelectedProductIds(newIds);
    }
    setStep("quantities");
  };

  const skipRecipe = () => {
    setRecipeId("");
    setCustomQuantities({});
    setStep("quantities");
  };

  const confirmConsumption = useMutation({
    mutationFn: async () => {
      if (recipeId) {
        const recipeName = selectedRecipe?.name ?? "";
        const { error } = await supabase.rpc("register_recipe_consumption", {
          _recipe_id: recipeId,
          _user_id: user!.id,
          _portions: 1,
          _notes: `Consumo kiosco: ${recipeName} (cantidades personalizadas)`,
        });
        if (error) throw error;
      } else {
        for (const line of lines) {
          if (line.qty <= 0) continue;
          const { error } = await supabase.from("inventory_movements").insert({
            product_id: line.product.id,
            user_id: user!.id,
            type: "salida",
            quantity: -line.qty,
            unit_cost: line.unitCost,
            total_cost: line.totalCost,
            notes: `Consumo kiosco manual`,
            restaurant_id: restaurantId!,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["recent-products"] });
      qc.invalidateQueries({ queryKey: ["frequent-products"] });
      toast({ title: "Consumo registrado", description: `${lines.filter((l) => l.qty > 0).length} productos descontados` });
      resetAll();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAll = () => {
    setStep("products");
    setSelectedProductIds(new Set());
    setRecipeId("");
    setCustomQuantities({});
    setProductSearch("");
  };

  const renderProductButton = (p: SelectedProduct & { image_url?: string | null }) => {
    const selected = selectedProductIds.has(p.id);
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggleProduct(p.id)}
        className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
          selected
            ? "border-primary bg-primary/10 ring-1 ring-primary"
            : "border-border hover:bg-muted/50"
        }`}
      >
        {p.image_url && (
          <img src={p.image_url} alt={p.name} className="h-10 w-full rounded object-cover mb-1" />
        )}
        <p className="font-medium text-sm truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Stock: {p.current_stock} {p.unit}
        </p>
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Kiosco Cocina</h1>
          <p className="text-muted-foreground">Registrar consumo de ingredientes</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <Badge variant={step === "products" ? "default" : "secondary"}>1. Productos</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === "recipe" ? "default" : "secondary"}>2. Receta</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === "quantities" ? "default" : "secondary"}>3. Cantidades</Badge>
        </div>

        {/* Step 1: Select Products */}
        {step === "products" && (
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-primary" /> Seleccionar productos
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput
                  className="pl-10"
                  placeholder="Buscar por nombre o código de barras..."
                  value={productSearch}
                  onChange={setProductSearch}
                  forceKeyboard
                  keyboardLabel="Buscar producto"
                  inputType="search"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Recent and Frequent products when no search */}
              {!productSearch && (
                <>
                  {recentProducts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> Recientes
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {recentProducts.map(renderProductButton)}
                      </div>
                    </div>
                  )}
                  {frequentProducts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Star className="h-3.5 w-3.5" /> Más usados
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {frequentProducts.map(renderProductButton)}
                      </div>
                    </div>
                  )}
                  {(recentProducts.length > 0 || frequentProducts.length > 0) && (
                    <div className="border-t pt-3">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Todos los productos</h3>
                    </div>
                  )}
                </>
              )}

              <div className="max-h-[28rem] overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredProducts.map(renderProductButton)}
                </div>
                {filteredProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
                )}
              </div>
              <Button
                className="w-full"
                disabled={selectedProductIds.size === 0}
                onClick={goToRecipeStep}
              >
                Siguiente ({selectedProductIds.size} productos)
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Recipe (optional) */}
        {step === "recipe" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ChefHat className="h-5 w-5 text-primary" /> Asignar receta (opcional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecciona una receta para pre-cargar las cantidades, o salta este paso para ingresar cantidades manualmente.
              </p>
              <Select value={recipeId} onValueChange={setRecipeId}>
                <SelectTrigger><SelectValue placeholder="Elegir receta..." /></SelectTrigger>
                <SelectContent>
                  {filteredRecipes?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("products")}>
                  Atrás
                </Button>
                <Button variant="outline" className="flex-1" onClick={skipRecipe}>
                  Sin receta
                </Button>
                <Button className="flex-1" disabled={!recipeId} onClick={goToQuantitiesStep}>
                  Siguiente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Edit Quantities & Confirm */}
        {step === "quantities" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList className="h-5 w-5 text-primary" /> Cantidades a descontar
                  {selectedRecipe && (
                    <Badge variant="outline" className="ml-auto">{selectedRecipe.name}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.product.id}>
                        <TableCell className="font-medium">{l.product.name}</TableCell>
                        <TableCell className="text-right">
                          <NumericKeypadInput
                            mode="decimal"
                            value={l.qty || ""}
                            onChange={(v) =>
                              setCustomQuantities((prev) => ({
                                ...prev,
                                [l.product.id]: Math.max(0, Number(v) || 0),
                              }))
                            }
                            min="0"
                            className="w-24 text-right ml-auto"
                            keypadLabel={l.product.name}
                            forceKeypad
                          />
                          <span className="text-xs text-muted-foreground">{l.product.unit}</span>
                        </TableCell>
                        <TableCell className="text-right">{l.stock} {l.product.unit}</TableCell>
                        <TableCell className="text-right font-semibold">${l.totalCost.toFixed(2)}</TableCell>
                        <TableCell className="w-8">
                          {l.insufficient ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : l.qty > 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {hasInsufficient && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Stock insuficiente en uno o más productos
              </div>
            )}

            <div className="rounded-md bg-muted p-4 flex justify-between items-center">
              <span className="text-muted-foreground">Costo total estimado</span>
              <span className="font-heading font-bold text-2xl">${grandTotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("recipe")}>
                Atrás
              </Button>
              <Button
                className="flex-1 h-14 text-lg"
                disabled={!isValid || confirmConsumption.isPending}
                onClick={() => confirmConsumption.mutate()}
              >
                {confirmConsumption.isPending ? (
                  "Registrando..."
                ) : (
                  <><CheckCircle2 className="mr-2 h-5 w-5" /> Confirmar Consumo</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
