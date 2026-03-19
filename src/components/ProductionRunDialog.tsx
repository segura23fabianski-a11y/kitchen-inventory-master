import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertTriangle, CheckCircle2, ChefHat } from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";

interface ProductionRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedRecipes: { id: string; name: string }[];
  recipeIngredientsByRecipe: Map<string, any[]>;
  products: any[];
}

interface RunIngredient {
  productId: string;
  productName: string;
  productUnit: string;
  theoreticalQty: number;
  actualQty: number;
  unitCost: number;
}

export function ProductionRunDialog({
  open,
  onOpenChange,
  fixedRecipes,
  recipeIngredientsByRecipe,
  products,
}: ProductionRunDialogProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [ingredients, setIngredients] = useState<RunIngredient[]>([]);
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const loadRecipeIngredients = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    const ings = recipeIngredientsByRecipe.get(recipeId) ?? [];
    setIngredients(
      ings.map((ri: any) => {
        const prod = products.find((p) => p.id === ri.product_id);
        const qtyPerUnit = Number(ri.quantity);
        const totalQty = qtyPerUnit * quantity;
        return {
          productId: ri.product_id,
          productName: prod?.name ?? "?",
          productUnit: ri.unit ?? prod?.unit ?? "unidad",
          theoreticalQty: totalQty,
          actualQty: totalQty,
          unitCost: Number(prod?.average_cost ?? 0),
        };
      })
    );
  };

  const updateQuantity = (newQty: number) => {
    setQuantity(newQty);
    if (!selectedRecipeId) return;
    const ings = recipeIngredientsByRecipe.get(selectedRecipeId) ?? [];
    setIngredients((prev) =>
      prev.map((ing) => {
        const origIng = ings.find((i: any) => i.product_id === ing.productId);
        const qtyPerUnit = origIng ? Number((origIng as any).quantity) : 0;
        const newTheoretical = qtyPerUnit * newQty;
        return { ...ing, theoreticalQty: newTheoretical, actualQty: newTheoretical };
      })
    );
  };

  const theoreticalTotalCost = useMemo(
    () => ingredients.reduce((s, i) => {
      const prod = products.find((p) => p.id === i.productId);
      const baseQty = convertToProductUnit(i.theoreticalQty, i.productUnit, prod?.unit ?? i.productUnit);
      return s + baseQty * i.unitCost;
    }, 0),
    [ingredients, products]
  );
  const actualTotalCost = useMemo(
    () => ingredients.reduce((s, i) => {
      const prod = products.find((p) => p.id === i.productId);
      const baseQty = convertToProductUnit(i.actualQty, i.productUnit, prod?.unit ?? i.productUnit);
      return s + baseQty * i.unitCost;
    }, 0),
    [ingredients, products]
  );

  const isValid = selectedRecipeId && quantity > 0 && ingredients.length > 0;

  const hasInsufficient = ingredients.some((ing) => {
    const prod = products.find((p) => p.id === ing.productId);
    return prod && ing.actualQty > Number(prod.current_stock ?? 0);
  });

  const confirmRun = useMutation({
    mutationFn: async () => {
      const theoreticalUnitCost = quantity > 0 ? theoreticalTotalCost / quantity : 0;
      const actualUnitCost = quantity > 0 ? actualTotalCost / quantity : 0;

      // Create run
      const { data: run, error: runError } = await supabase
        .from("recipe_production_runs" as any)
        .insert({
          restaurant_id: restaurantId!,
          recipe_id: selectedRecipeId,
          production_date: new Date().toISOString().split("T")[0],
          quantity_produced: quantity,
          theoretical_total_cost: theoreticalTotalCost,
          theoretical_unit_cost: theoreticalUnitCost,
          actual_total_cost: actualTotalCost,
          actual_unit_cost: actualUnitCost,
          produced_by: user!.id,
        } as any)
        .select("id")
        .single();
      if (runError) throw runError;

      // Create run items
      const { error: itemsError } = await supabase
        .from("recipe_production_run_items" as any)
        .insert(
          ingredients.map((ing) => ({
            run_id: (run as any).id,
            product_id: ing.productId,
            theoretical_quantity: ing.theoreticalQty,
            actual_quantity: ing.actualQty,
            unit: ing.productUnit,
            unit_cost: ing.unitCost,
            theoretical_line_cost: ing.theoreticalQty * ing.unitCost,
            actual_line_cost: ing.actualQty * ing.unitCost,
          })) as any
        );
      if (itemsError) throw itemsError;

      // Deduct inventory for each ingredient
      for (const ing of ingredients) {
        if (ing.actualQty <= 0) continue;
        const lineCost = ing.actualQty * ing.unitCost;
        const recipeName =
          fixedRecipes.find((r) => r.id === selectedRecipeId)?.name ?? "Receta";
        const { error } = await supabase.from("inventory_movements").insert({
          product_id: ing.productId,
          user_id: user!.id,
          type: "salida",
          quantity: ing.actualQty,
          unit_cost: ing.unitCost,
          total_cost: lineCost,
          notes: `Producción: ${recipeName} × ${quantity} — ${ing.productName}`,
          restaurant_id: restaurantId!,
          recipe_id: selectedRecipeId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["production-runs-today"] });
      const recipeName =
        fixedRecipes.find((r) => r.id === selectedRecipeId)?.name ?? "Receta";
      toast({
        title: "Producción registrada",
        description: `${recipeName} × ${quantity} — Costo real: $${actualTotalCost.toFixed(2)}`,
      });
      setSelectedRecipeId("");
      setQuantity(1);
      setIngredients([]);
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelectedRecipeId("");
          setQuantity(1);
          setIngredients([]);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            Registrar Producción
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Receta a producir</Label>
            <SearchableSelect
              options={fixedRecipes.map((r) => ({
                value: r.id,
                label: r.name,
                searchTerms: r.name,
              }))}
              value={selectedRecipeId}
              onValueChange={(v) => {
                loadRecipeIngredients(v);
              }}
              placeholder="Seleccionar receta..."
              searchPlaceholder="Buscar receta..."
            />
          </div>

          {selectedRecipeId && (
            <>
              <div className="space-y-2">
                <Label>Cantidad a producir</Label>
                <NumericKeypadInput
                  mode="integer"
                  value={quantity || ""}
                  onChange={(v) => updateQuantity(Math.max(1, Number(v) || 1))}
                  min="1"
                  className="w-32 text-center text-lg"
                  keypadLabel="Cantidad a producir"
                  forceKeypad
                />
              </div>

              {ingredients.length > 0 && (
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Ingredientes — Teórico vs Real
                    </p>
                    <div className="space-y-1.5">
                      {ingredients.map((ing) => {
                        const prod = products.find((p) => p.id === ing.productId);
                        const stock = prod ? Number(prod.current_stock ?? 0) : 0;
                        const insuf = ing.actualQty > stock;
                        const diff = ing.actualQty - ing.theoreticalQty;
                        return (
                          <div
                            key={ing.productId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="flex-1 truncate">{ing.productName}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              Teórico: {ing.theoreticalQty.toFixed(2)}
                            </span>
                            <NumericKeypadInput
                              mode="decimal"
                              value={ing.actualQty || ""}
                              onChange={(v) =>
                                setIngredients((prev) =>
                                  prev.map((i) =>
                                    i.productId === ing.productId
                                      ? { ...i, actualQty: Math.max(0, Number(v) || 0) }
                                      : i
                                  )
                                )
                              }
                              min="0"
                              className="w-20 text-right text-sm h-8"
                              keypadLabel={`${ing.productName} (real)`}
                              forceKeypad
                            />
                            <span className="text-xs text-muted-foreground shrink-0 w-10">
                              {ing.productUnit}
                            </span>
                            {diff !== 0 && (
                              <Badge
                                variant={diff > 0 ? "destructive" : "default"}
                                className="text-[10px] px-1 h-4"
                              >
                                {diff > 0 ? "+" : ""}
                                {diff.toFixed(2)}
                              </Badge>
                            )}
                            {insuf && (
                              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Costo teórico total</span>
                        <span>${theoreticalTotalCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Costo real total</span>
                        <span>${actualTotalCost.toFixed(2)}</span>
                      </div>
                      {quantity > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Costo unitario real</span>
                          <span>${(actualTotalCost / quantity).toFixed(2)} / unidad</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                className="w-full h-12 text-base"
                disabled={!isValid || hasInsufficient || confirmRun.isPending}
                onClick={() => confirmRun.mutate()}
              >
                {confirmRun.isPending ? (
                  "Registrando..."
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Confirmar Producción
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
