import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, CheckCircle2, AlertTriangle, Package, ClipboardList } from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";

type Step = "products" | "recipe" | "quantities";

interface SelectedProduct {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  average_cost: number;
}

export default function KitchenKiosk() {
  const [step, setStep] = useState<Step>("products");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [recipeId, setRecipeId] = useState("");
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // All products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

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

  // Filter recipes that use at least one of the selected products
  const filteredRecipes = useMemo(() => {
    if (!recipes || !recipeIngredients && !recipeId) return recipes ?? [];
    // We need all recipe_ingredients to filter, so we fetch them separately
    return recipes;
  }, [recipes]);

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
    // If recipe selected, pre-fill quantities
    if (recipeIngredients) {
      initializeQuantities(recipeIngredients);
      // Also add any recipe products not yet selected
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
        // Use the RPC for recipe-based consumption
        const recipeName = selectedRecipe?.name ?? "";
        const { error } = await supabase.rpc("register_recipe_consumption", {
          _recipe_id: recipeId,
          _user_id: user!.id,
          _portions: 1,
          _notes: `Consumo kiosco: ${recipeName} (cantidades personalizadas)`,
        });
        if (error) throw error;
      } else {
        // Manual consumption: create individual movements
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
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-primary" /> Seleccionar productos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-80 overflow-y-auto space-y-2">
                {products?.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedProductIds.has(p.id)}
                      onCheckedChange={() => toggleProduct(p.id)}
                    />
                    <span className="flex-1 font-medium">{p.name}</span>
                    <span className="text-sm text-muted-foreground">
                      Stock: {p.current_stock} {p.unit}
                    </span>
                  </label>
                ))}
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
                          <Input
                            type="number"
                            value={l.qty || ""}
                            onChange={(e) =>
                              setCustomQuantities((prev) => ({
                                ...prev,
                                [l.product.id]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            min="0"
                            step="0.01"
                            className="w-24 text-right ml-auto"
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
