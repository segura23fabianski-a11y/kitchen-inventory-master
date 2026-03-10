import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAudit } from "@/hooks/use-audit";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { Shirt, SprayCan, ChevronLeft, CheckCircle2, History, ChefHat, CalendarDays } from "lucide-react";

type ServiceType = "laundry" | "housekeeping";
type Step = "type" | "recipe" | "confirm" | "history";

const SERVICE_CONFIG: Record<ServiceType, { label: string; icon: typeof Shirt; color: string; emoji: string }> = {
  laundry: { label: "Lavandería", icon: Shirt, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300", emoji: "🧺" },
  housekeeping: { label: "Aseo / Housekeeping", icon: SprayCan, color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300", emoji: "🧹" },
};

export default function OperationsKiosk() {
  const [step, setStep] = useState<Step>("type");
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [portions, setPortions] = useState<number>(1);
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAudit } = useAudit();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // Recipes filtered by type
  const { data: recipes } = useQuery({
    queryKey: ["recipes-operational"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, description, recipe_type, recipe_ingredients(id, product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      // Filter in JS to avoid TS issues with .in on new column
      return (data as any[]).filter((r: any) => r.recipe_type === "laundry" || r.recipe_type === "housekeeping");
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, current_stock, average_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Recent operational history
  const { data: history } = useQuery({
    queryKey: ["operations-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, created_at, notes, quantity, total_cost, recipe_id")
        .not("recipe_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      // Deduplicate by recipe_id + created_at (grouped movements)
      const seen = new Map<string, typeof data[0]>();
      for (const m of data ?? []) {
        const key = `${m.recipe_id}_${m.created_at}`;
        if (!seen.has(key)) seen.set(key, m);
      }
      return [...seen.values()].slice(0, 50);
    },
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) ?? []);

  const filteredRecipes = useMemo(() => {
    if (!recipes || !serviceType) return [];
    return recipes.filter((r: any) => r.recipe_type === serviceType);
  }, [recipes, serviceType]);

  const selectedRecipe = recipes?.find((r: any) => r.id === selectedRecipeId);

  const recipeIngredients = useMemo(() => {
    if (!selectedRecipe) return [];
    return ((selectedRecipe as any).recipe_ingredients ?? []).map((ri: any) => {
      const prod = productMap.get(ri.product_id);
      const qtyPerPortion = Number(ri.quantity);
      const totalQty = qtyPerPortion * portions;
      const qtyInProdUnit = prod ? convertToProductUnit(totalQty, ri.unit, prod.unit) : totalQty;
      const cost = prod ? qtyInProdUnit * Number(prod.average_cost) : 0;
      const hasStock = prod ? Number(prod.current_stock) >= qtyInProdUnit : false;
      return { ...ri, prod, qtyPerPortion, totalQty, qtyInProdUnit, cost, hasStock, unit: ri.unit };
    });
  }, [selectedRecipe, portions, productMap]);

  const totalCost = recipeIngredients.reduce((s: number, i: any) => s + i.cost, 0);
  const allHaveStock = recipeIngredients.every((i: any) => i.hasStock);
  const canConfirm = selectedRecipeId && portions > 0 && allHaveStock;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: selectedRecipeId!,
        _user_id: user!.id,
        _portions: portions,
        _notes: `Registro operativo: ${SERVICE_CONFIG[serviceType!].label} — ${selectedRecipe?.name} x${portions}`,
      });
      if (error) throw error;
      await logAudit({
        entityType: "operational_consumption",
        entityId: selectedRecipeId!,
        action: "CREATE",
        after: { recipe_id: selectedRecipeId, recipe_name: selectedRecipe?.name, service_type: serviceType, portions },
        canRollback: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["operations-history"] });
      toast({
        title: "✅ Servicio registrado",
        description: `${selectedRecipe?.name} x${portions} — $${totalCost.toFixed(2)}`,
      });
      resetAll();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAll = () => {
    setStep("type");
    setServiceType(null);
    setSelectedRecipeId(null);
    setPortions(1);
  };

  const selectType = (t: ServiceType) => {
    setServiceType(t);
    setSelectedRecipeId(null);
    setPortions(1);
    setStep("recipe");
  };

  const selectRecipe = (id: string) => {
    setSelectedRecipeId(id);
    setPortions(1);
    setStep("confirm");
  };

  const recipeMap = new Map(recipes?.map((r: any) => [r.id, r]) ?? []);

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Registro Operativo</h1>
          <p className="text-muted-foreground">Lavandería &amp; Housekeeping</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <Badge variant={step === "type" ? "default" : "secondary"}>1. Servicio</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === "recipe" ? "default" : "secondary"}>2. Receta</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === "confirm" ? "default" : "secondary"}>3. Confirmar</Badge>
        </div>

        {/* History toggle */}
        {step === "type" && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setStep("history")}>
              <History className="mr-1 h-3.5 w-3.5" /> Historial
            </Button>
          </div>
        )}

        {/* ===== Step 1: Select service type ===== */}
        {step === "type" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(Object.entries(SERVICE_CONFIG) as [ServiceType, typeof SERVICE_CONFIG["laundry"]][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const count = recipes?.filter((r: any) => r.recipe_type === key).length ?? 0;
              return (
                <button
                  key={key}
                  onClick={() => selectType(key)}
                  className="rounded-xl border-2 border-border p-8 text-center transition-all hover:shadow-lg hover:border-primary active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-5xl">{cfg.emoji}</span>
                    <Icon className="h-8 w-8 text-primary" />
                    <span className="font-heading text-xl font-bold">{cfg.label}</span>
                    <span className="text-sm text-muted-foreground">{count} receta{count !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ===== Step 2: Select recipe ===== */}
        {step === "recipe" && serviceType && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => { setStep("type"); setServiceType(null); }}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg flex items-center gap-2">
                  {SERVICE_CONFIG[serviceType].emoji} {SERVICE_CONFIG[serviceType].label}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredRecipes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay recetas de {SERVICE_CONFIG[serviceType].label.toLowerCase()} registradas.<br />
                  Créalas en el módulo de Recetas.
                </p>
              ) : (
                <div className="grid gap-3">
                  {filteredRecipes.map((r: any) => {
                    const ingCount = r.recipe_ingredients?.length ?? 0;
                    const cost = (r.recipe_ingredients ?? []).reduce((s: number, ri: any) => {
                      const prod = productMap.get(ri.product_id);
                      if (!prod) return s;
                      const qty = convertToProductUnit(Number(ri.quantity), ri.unit, prod.unit);
                      return s + qty * Number(prod.average_cost);
                    }, 0);
                    return (
                      <button
                        key={r.id}
                        onClick={() => selectRecipe(r.id)}
                        className="rounded-lg border-2 border-border p-5 text-left transition-all hover:shadow-md hover:border-primary active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-heading font-bold text-lg">{r.name}</p>
                            {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                            <p className="text-xs text-muted-foreground mt-1">{ingCount} insumo{ingCount !== 1 ? "s" : ""}</p>
                          </div>
                          <span className="font-heading font-bold text-lg text-primary">${cost.toFixed(2)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== Step 3: Confirm ===== */}
        {step === "confirm" && selectedRecipe && serviceType && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => { setStep("recipe"); setSelectedRecipeId(null); }}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg flex items-center gap-2">
                  {SERVICE_CONFIG[serviceType].emoji} {selectedRecipe.name}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Quantity input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Cantidad ejecutada</label>
                <NumericKeypadInput
                  mode="integer"
                  value={portions}
                  onChange={(v) => setPortions(Math.max(1, Number(v) || 1))}
                  min="1"
                  keypadLabel="Cantidad"
                  className="text-center text-2xl font-bold h-14"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Ej: 2 habitaciones, 5 prendas, 8 kg…
                </p>
              </div>

              {/* Ingredients preview */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Cant. total</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipeIngredients.map((ing: any) => (
                    <TableRow key={ing.id}>
                      <TableCell className="font-medium">{ing.prod?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{ing.totalQty.toFixed(2)} {ing.unit}</TableCell>
                      <TableCell className={`text-right ${!ing.hasStock ? "text-destructive font-semibold" : ""}`}>
                        {ing.prod ? `${Number(ing.prod.current_stock).toFixed(2)} ${ing.prod.unit}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">${ing.cost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="rounded-md bg-muted p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Costo total</span>
                <span className="font-heading text-2xl font-bold">${totalCost.toFixed(2)}</span>
              </div>

              {!allHaveStock && (
                <p className="text-sm text-destructive text-center font-medium">⚠️ Stock insuficiente en uno o más insumos</p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setStep("recipe"); setSelectedRecipeId(null); }}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-14 text-lg"
                  disabled={!canConfirm || confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                >
                  {confirmMutation.isPending ? "Registrando..." : (
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Confirmar</span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== History ===== */}
        {step === "history" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setStep("type")}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Historial reciente
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!history?.length ? (
                <p className="text-center text-muted-foreground py-8">Sin registros recientes</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {history.map((h) => {
                    const recipe = recipeMap.get(h.recipe_id ?? "");
                    const rType = (recipe as any)?.recipe_type;
                    const isOps = rType === "laundry" || rType === "housekeeping";
                    if (!isOps) return null;
                    const cfg = rType ? SERVICE_CONFIG[rType as ServiceType] : null;
                    return (
                      <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <span className="text-xl">{cfg?.emoji ?? "📦"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{recipe?.name ?? h.notes}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(h.created_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <span className="font-heading font-bold text-sm">${Number(h.total_cost).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
