import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import {
  ChefHat, CheckCircle2, AlertTriangle, Package, Search,
  Clock, Star, Trash2, ScanBarcode, UtensilsCrossed,
} from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { UnitSelector } from "@/components/UnitSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CartItem {
  productId: string;
  name: string;
  baseUnit: string;
  selectedUnit: string;
  quantity: number;
  currentStock: number;
  averageCost: number;
  recipeId: string | null;
}

export default function KitchenKiosk() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
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
        .select("id, name")
        .eq("recipe_type", "food")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: recipeIngredients } = useQuery({
    queryKey: ["recipe-ingredients-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id, product_id");
      if (error) throw error;
      return data;
    },
  });

  // Map product → recipes that use it
  const recipesForProduct = useMemo(() => {
    const map = new Map<string, Set<string>>();
    recipeIngredients?.forEach((ri) => {
      if (!map.has(ri.product_id)) map.set(ri.product_id, new Set());
      map.get(ri.product_id)!.add(ri.recipe_id);
    });
    return map;
  }, [recipeIngredients]);

  const recipeMap = useMemo(() => {
    const map = new Map<string, string>();
    recipes?.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [recipes]);

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

  // ──── Confirm mutation ────
  const confirmConsumption = useMutation({
    mutationFn: async () => {
      for (const line of cartLines) {
        if (line.quantity <= 0) continue;
        const recipeName = line.recipeId ? recipeMap.get(line.recipeId) : null;
        const notesParts = ["Consumo kiosco cocina"];
        if (recipeName) notesParts.push(`Receta: ${recipeName}`);
        const { error } = await supabase.from("inventory_movements").insert({
          product_id: line.productId,
          user_id: user!.id,
          type: "salida",
          quantity: line.qtyInBase,
          unit_cost: line.averageCost,
          total_cost: line.totalCost,
          notes: notesParts.join(" — "),
          restaurant_id: restaurantId!,
          service_id: serviceId || null,
          recipe_id: line.recipeId || null,
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
      setServiceId("");
      setProductSearch("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Get relevant recipes for a product
  const getProductRecipes = (productId: string) => {
    const recipeIds = recipesForProduct.get(productId);
    if (!recipeIds || recipeIds.size === 0) return [];
    return [...recipeIds]
      .map((id) => ({ id, name: recipeMap.get(id) ?? "" }))
      .filter((r) => r.name)
      .sort((a, b) => a.name.localeCompare(b.name));
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
                          {/* Product name + recipe indicator + delete */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm leading-tight">{item.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground">
                                  Stock: {item.currentStock} {item.baseUnit}
                                </p>
                                {hasRecipe ? (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                                    <UtensilsCrossed className="h-2.5 w-2.5" />
                                    {recipeMap.get(item.recipeId!) ?? "Receta"}
                                  </Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60">Sin receta</span>
                                )}
                              </div>
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

                          {/* Recipe selector */}
                          {availableRecipes.length > 0 && (
                            <Select
                              value={item.recipeId ?? "none"}
                              onValueChange={(v) =>
                                updateCartItem(item.productId, { recipeId: v === "none" ? null : v })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <UtensilsCrossed className="h-3 w-3 mr-1 shrink-0" />
                                <SelectValue placeholder="Asignar receta (opcional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin receta</SelectItem>
                                {availableRecipes.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

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
                {/* Service selector */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Servicio (opcional)</label>
                  <Select value={serviceId} onValueChange={setServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin servicio</SelectItem>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
    </AppLayout>
  );
}
