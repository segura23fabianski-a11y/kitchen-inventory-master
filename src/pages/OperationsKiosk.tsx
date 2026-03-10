import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAudit } from "@/hooks/use-audit";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { UnitSelector } from "@/components/UnitSelector";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import {
  Shirt, SprayCan, ChevronLeft, CheckCircle2, History,
  CalendarDays, ClipboardList, Droplets, Search, Package,
  Plus, Settings, Trash2, Tag, Pencil,
} from "lucide-react";

// ── Types ──
type MainMode = "home" | "recipes" | "services";
type RecipeStep = "type" | "recipe" | "confirm";
type ServiceStep = "service" | "product" | "confirm";
type ServiceType = "laundry" | "housekeeping";

const SERVICE_CONFIG: Record<ServiceType, { label: string; emoji: string }> = {
  laundry: { label: "Lavandería", emoji: "🧺" },
  housekeeping: { label: "Housekeeping", emoji: "🧹" },
};

export default function OperationsKiosk() {
  // ── Shared state ──
  const [mode, setMode] = useState<MainMode>("home");
  const [showHistory, setShowHistory] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // ── Recipe flow state ──
  const [recipeStep, setRecipeStep] = useState<RecipeStep>("type");
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [portions, setPortions] = useState<number>(1);

  // ── Service flow state ──
  const [serviceStep, setServiceStep] = useState<ServiceStep>("service");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(0);
  const [serviceInputUnit, setServiceInputUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");

  // ── Admin manage services ──
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [manageCategoriesServiceId, setManageCategoriesServiceId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editServiceDesc, setEditServiceDesc] = useState("");

  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const { logAudit } = useAudit();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const isAdmin = hasPermission("products") || hasPermission("recipes");

  // ── Queries ──
  const { data: recipes } = useQuery({
    queryKey: ["recipes-operational"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, description, recipe_type, recipe_ingredients(id, product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      return (data as any[]).filter((r) => r.recipe_type === "laundry" || r.recipe_type === "housekeeping");
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, current_stock, average_cost, category_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["operational-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("operational_services").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceCategoryLinks } = useQuery({
    queryKey: ["service-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_categories").select("*").eq("active", true);
      if (error) throw error;
      return data as { id: string; service_id: string; category_id: string; restaurant_id: string }[];
    },
  });

  const { data: history } = useQuery({
    queryKey: ["operations-history-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, created_at, notes, quantity, total_cost, product_id, recipe_id, service_id, type")
        .or("type.eq.operational_consumption,recipe_id.not.is.null")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) ?? []);
  const serviceMap = new Map(services?.map((s) => [s.id, s]) ?? []);
  const recipeMap = new Map(recipes?.map((r: any) => [r.id, r]) ?? []);
  const categoryMap = new Map(categories?.map((c) => [c.id, c]) ?? []);

  // Products filtered by categories linked to selected service
  const productsForService = useMemo(() => {
    if (!selectedServiceId || !serviceCategoryLinks || !products) return [];
    const linkedCategoryIds = new Set(
      serviceCategoryLinks.filter((l) => l.service_id === selectedServiceId).map((l) => l.category_id)
    );
    if (linkedCategoryIds.size === 0) return [];
    const filtered = products.filter((p) => p.category_id && linkedCategoryIds.has(p.category_id));
    if (!productSearch.trim()) return filtered;
    const q = productSearch.toLowerCase();
    return filtered.filter((p) => p.name.toLowerCase().includes(q));
  }, [selectedServiceId, serviceCategoryLinks, products, productSearch]);

  // ── Recipe helpers ──
  const filteredRecipes = useMemo(() => {
    if (!recipes || !serviceType) return [];
    return recipes.filter((r: any) => r.recipe_type === serviceType);
  }, [recipes, serviceType]);

  const selectedRecipe = recipes?.find((r: any) => r.id === selectedRecipeId);
  const portionLabel = serviceType === "laundry" ? "prendas" : "habitaciones";
  const portionSingular = serviceType === "laundry" ? "prenda" : "habitación";

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

  const recipeTotalCost = recipeIngredients.reduce((s: number, i: any) => s + i.cost, 0);
  const allHaveStock = recipeIngredients.every((i: any) => i.hasStock);
  const canConfirmRecipe = selectedRecipeId && portions > 0 && allHaveStock;

  // ── Service helpers ──
  const selectedProduct = selectedProductId ? productMap.get(selectedProductId) : null;
  const selectedService = selectedServiceId ? serviceMap.get(selectedServiceId) : null;
  const svcEffectiveUnit = serviceInputUnit || selectedProduct?.unit || "unidad";
  const svcConvertedQty = selectedProduct
    ? convertToProductUnit(quantity, svcEffectiveUnit, selectedProduct.unit)
    : quantity;
  const estimatedCost = selectedProduct && svcConvertedQty > 0 ? svcConvertedQty * Number(selectedProduct.average_cost) : 0;
  const hasStock = selectedProduct ? Number(selectedProduct.current_stock) >= svcConvertedQty : false;
  const canConfirmService = selectedProductId && quantity > 0 && selectedServiceId && hasStock;

  // ── Mutations ──
  const confirmRecipeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: selectedRecipeId!,
        _user_id: user!.id,
        _portions: portions,
        _notes: `Registro operativo: ${SERVICE_CONFIG[serviceType!].label} — ${selectedRecipe?.name} x${portions} ${portionLabel}`,
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
      qc.invalidateQueries({ queryKey: ["operations-history-all"] });
      toast({ title: "✅ Servicio registrado", description: `${selectedRecipe?.name} — ${portions} ${portions === 1 ? portionSingular : portionLabel} — $${recipeTotalCost.toFixed(2)}` });
      goHome();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const confirmServiceMutation = useMutation({
    mutationFn: async () => {
      const unitCost = Number(selectedProduct!.average_cost);
      const totalCost = quantity * unitCost;
      const { error } = await supabase.from("inventory_movements").insert({
        product_id: selectedProductId!,
        user_id: user!.id,
        type: "operational_consumption",
        quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        service_id: selectedServiceId!,
        notes: notes.trim() || `Consumo operativo: ${selectedService?.name} — ${selectedProduct?.name} x${quantity} ${selectedProduct?.unit}`,
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;
      await logAudit({
        entityType: "operational_consumption",
        entityId: selectedProductId!,
        action: "CREATE",
        after: { product_id: selectedProductId, product_name: selectedProduct?.name, quantity, unit: selectedProduct?.unit, service: selectedService?.name, total_cost: totalCost },
        canRollback: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["operations-history-all"] });
      toast({ title: "✅ Consumo registrado", description: `${selectedProduct?.name} — ${quantity} ${selectedProduct?.unit} — $${estimatedCost.toFixed(2)}` });
      goHome();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createServiceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("operational_services").insert({
        name: newServiceName.trim(),
        description: newServiceDesc.trim() || null,
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-services"] });
      setNewServiceName("");
      setNewServiceDesc("");
      toast({ title: "Servicio creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateServiceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("operational_services")
        .update({ name: editServiceName.trim(), description: editServiceDesc.trim() || null })
        .eq("id", editingServiceId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-services"] });
      setEditingServiceId(null);
      toast({ title: "Servicio actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("operational_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-services"] });
      qc.invalidateQueries({ queryKey: ["service-categories"] });
      setManageCategoriesServiceId(null);
      toast({ title: "Servicio eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const linkCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from("service_categories").insert({
        category_id: categoryId,
        service_id: manageCategoriesServiceId!,
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-categories"] });
      toast({ title: "Categoría vinculada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unlinkCategoryMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("service_categories").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-categories"] });
      toast({ title: "Categoría desvinculada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Navigation ──
  const goHome = () => {
    setMode("home");
    setRecipeStep("type");
    setServiceStep("service");
    setServiceType(null);
    setSelectedRecipeId(null);
    setPortions(1);
    setSelectedServiceId(null);
    setSelectedProductId(null);
    setQuantity(0);
    setNotes("");
    setProductSearch("");
    setShowHistory(false);
  };

  // Category IDs linked to service being managed
  const linkedCategoryIds = useMemo(() => {
    if (!manageCategoriesServiceId || !serviceCategoryLinks) return new Set<string>();
    return new Set(serviceCategoryLinks.filter((l) => l.service_id === manageCategoriesServiceId).map((l) => l.category_id));
  }, [manageCategoriesServiceId, serviceCategoryLinks]);

  const linksForManageService = useMemo(() => {
    if (!manageCategoriesServiceId || !serviceCategoryLinks) return [];
    return serviceCategoryLinks.filter((l) => l.service_id === manageCategoriesServiceId);
  }, [manageCategoriesServiceId, serviceCategoryLinks]);

  // ── Deduplicated history for recipes ──
  const historyItems = useMemo(() => {
    if (!history) return [];
    const seen = new Set<string>();
    const result: typeof history = [];
    for (const h of history) {
      if (h.recipe_id) {
        const key = `${h.recipe_id}_${h.created_at}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const recipe = h.recipe_id ? recipeMap.get(h.recipe_id) : null;
      const isOpsRecipe = recipe && ((recipe as any).recipe_type === "laundry" || (recipe as any).recipe_type === "housekeeping");
      const isManual = h.type === "operational_consumption";
      if (!isOpsRecipe && !isManual) continue;
      result.push(h);
    }
    return result.slice(0, 50);
  }, [history, recipeMap]);

  // Count products per service (for display)
  const productCountForService = (serviceId: string) => {
    if (!serviceCategoryLinks || !products) return 0;
    const catIds = new Set(serviceCategoryLinks.filter((l) => l.service_id === serviceId).map((l) => l.category_id));
    if (catIds.size === 0) return 0;
    return products.filter((p) => p.category_id && catIds.has(p.category_id)).length;
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Kiosco Operativo</h1>
          <p className="text-muted-foreground">Lavandería · Housekeeping · Aseo · Consumibles</p>
        </div>

        {/* ===== HOME ===== */}
        {mode === "home" && !showHistory && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => { setMode("recipes"); setRecipeStep("type"); }}
                className="rounded-xl border-2 border-border p-8 text-center transition-all hover:shadow-lg hover:border-primary active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <div className="flex flex-col items-center gap-3">
                  <span className="text-5xl">📋</span>
                  <ClipboardList className="h-8 w-8 text-primary" />
                  <span className="font-heading text-xl font-bold">Recetas Operativas</span>
                  <span className="text-sm text-muted-foreground">Lavandería · Housekeeping</span>
                </div>
              </button>
              <button
                onClick={() => { setMode("services"); setServiceStep("service"); }}
                className="rounded-xl border-2 border-border p-8 text-center transition-all hover:shadow-lg hover:border-primary active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <div className="flex flex-col items-center gap-3">
                  <span className="text-5xl">🧴</span>
                  <Droplets className="h-8 w-8 text-primary" />
                  <span className="font-heading text-xl font-bold">Registro por Servicio</span>
                  <span className="text-sm text-muted-foreground">Menaje · Aseo · Consumibles</span>
                </div>
              </button>
            </div>

            <div className="flex justify-between gap-2">
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
                  <Settings className="mr-1 h-3.5 w-3.5" /> Gestionar Servicios
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                <History className="mr-1 h-3.5 w-3.5" /> Historial
              </Button>
            </div>
          </>
        )}

        {/* ===== HISTORY ===== */}
        {showHistory && mode === "home" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Historial reciente
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!historyItems.length ? (
                <p className="text-center text-muted-foreground py-8">Sin registros recientes</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {historyItems.map((h) => {
                    const recipe = h.recipe_id ? recipeMap.get(h.recipe_id) : null;
                    const prod = productMap.get(h.product_id);
                    const svc = h.service_id ? serviceMap.get(h.service_id) : null;
                    const rType = (recipe as any)?.recipe_type as ServiceType | undefined;
                    const isRecipe = !!recipe;
                    const emoji = rType ? SERVICE_CONFIG[rType]?.emoji : "🧴";
                    return (
                      <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <span className="text-xl">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {isRecipe ? recipe?.name : prod?.name ?? h.notes}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(h.created_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {svc && <span className="ml-1">· {svc.name}</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {isRecipe ? "Receta" : "Manual"}
                        </Badge>
                        <span className="font-heading font-bold text-sm">${Number(h.total_cost).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════
            RECIPE FLOW
            ═══════════════════════════════════════════ */}
        {mode === "recipes" && (
          <>
            <div className="flex items-center justify-center gap-2 text-sm">
              <Badge variant={recipeStep === "type" ? "default" : "secondary"}>1. Tipo</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={recipeStep === "recipe" ? "default" : "secondary"}>2. Receta</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={recipeStep === "confirm" ? "default" : "secondary"}>3. Confirmar</Badge>
            </div>

            {recipeStep === "type" && (
              <>
                <Button variant="ghost" size="sm" onClick={goHome} className="mb-2">
                  <ChevronLeft className="mr-1 h-4 w-4" /> Menú principal
                </Button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(Object.entries(SERVICE_CONFIG) as [ServiceType, typeof SERVICE_CONFIG["laundry"]][]).map(([key, cfg]) => {
                    const count = recipes?.filter((r: any) => r.recipe_type === key).length ?? 0;
                    return (
                      <button
                        key={key}
                        onClick={() => { setServiceType(key); setRecipeStep("recipe"); }}
                        className="rounded-xl border-2 border-border p-8 text-center transition-all hover:shadow-lg hover:border-primary active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-5xl">{cfg.emoji}</span>
                          <span className="font-heading text-xl font-bold">{cfg.label}</span>
                          <span className="text-sm text-muted-foreground">{count} receta{count !== 1 ? "s" : ""}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {recipeStep === "recipe" && serviceType && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setRecipeStep("type"); setServiceType(null); }}>
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg">{SERVICE_CONFIG[serviceType].emoji} {SERVICE_CONFIG[serviceType].label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredRecipes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No hay recetas de {SERVICE_CONFIG[serviceType].label.toLowerCase()} registradas.</p>
                  ) : (
                    <div className="grid gap-3">
                      {filteredRecipes.map((r: any) => {
                        const cost = (r.recipe_ingredients ?? []).reduce((s: number, ri: any) => {
                          const prod = productMap.get(ri.product_id);
                          if (!prod) return s;
                          const qty = convertToProductUnit(Number(ri.quantity), ri.unit, prod.unit);
                          return s + qty * Number(prod.average_cost);
                        }, 0);
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setSelectedRecipeId(r.id); setPortions(1); setRecipeStep("confirm"); }}
                            className="rounded-lg border-2 border-border p-5 text-left transition-all hover:shadow-md hover:border-primary active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-heading font-bold text-lg">{r.name}</p>
                                {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                                <p className="text-xs text-muted-foreground mt-1">{r.recipe_ingredients?.length ?? 0} insumo{(r.recipe_ingredients?.length ?? 0) !== 1 ? "s" : ""}</p>
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

            {recipeStep === "confirm" && selectedRecipe && serviceType && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setRecipeStep("recipe"); setSelectedRecipeId(null); }}>
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg">{SERVICE_CONFIG[serviceType].emoji} {selectedRecipe.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cantidad de {portionLabel}</label>
                    <NumericKeypadInput
                      mode="integer"
                      value={portions}
                      onChange={(v) => setPortions(Math.max(1, Number(v) || 1))}
                      min="1"
                      keypadLabel={`Cantidad de ${portionLabel}`}
                      className="text-center text-2xl font-bold h-14"
                    />
                  </div>
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
                  <div className="rounded-md bg-muted p-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Costo total</span>
                    <span className="font-heading text-2xl font-bold">${recipeTotalCost.toFixed(2)}</span>
                  </div>
                  {!allHaveStock && <p className="text-sm text-destructive text-center font-medium">⚠️ Stock insuficiente en uno o más insumos</p>}
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => { setRecipeStep("recipe"); setSelectedRecipeId(null); }}>Cancelar</Button>
                    <Button className="flex-1 h-14 text-lg" disabled={!canConfirmRecipe || confirmRecipeMutation.isPending} onClick={() => confirmRecipeMutation.mutate()}>
                      {confirmRecipeMutation.isPending ? "Registrando..." : <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Confirmar</span>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════
            SERVICE FLOW (Manual consumption)
            ═══════════════════════════════════════════ */}
        {mode === "services" && (
          <>
            <div className="flex items-center justify-center gap-2 text-sm">
              <Badge variant={serviceStep === "service" ? "default" : "secondary"}>1. Servicio</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={serviceStep === "product" ? "default" : "secondary"}>2. Producto</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={serviceStep === "confirm" ? "default" : "secondary"}>3. Confirmar</Badge>
            </div>

            {serviceStep === "service" && (
              <>
                <Button variant="ghost" size="sm" onClick={goHome} className="mb-2">
                  <ChevronLeft className="mr-1 h-4 w-4" /> Menú principal
                </Button>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><Droplets className="h-5 w-5 text-primary" /> Seleccionar servicio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!services?.length ? (
                      <p className="text-center text-muted-foreground py-8">No hay servicios. Un administrador debe crearlos.</p>
                    ) : (
                      <div className="grid gap-3">
                        {services.map((s) => {
                          const pCount = productCountForService(s.id);
                          const catCount = serviceCategoryLinks?.filter((l) => l.service_id === s.id).length ?? 0;
                          return (
                            <button
                              key={s.id}
                              onClick={() => { setSelectedServiceId(s.id); setServiceStep("product"); setProductSearch(""); }}
                              className="rounded-lg border-2 border-border p-5 text-left transition-all hover:shadow-md hover:border-primary active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <p className="font-heading font-bold text-lg">{s.name}</p>
                              {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                              <p className="text-xs text-muted-foreground mt-1">
                                {catCount} categoría{catCount !== 1 ? "s" : ""} · {pCount} producto{pCount !== 1 ? "s" : ""}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {serviceStep === "product" && selectedServiceId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setServiceStep("service"); setSelectedServiceId(null); }}>
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg">{selectedService?.name} — Producto</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <KioskTextInput className="pl-10" placeholder="Buscar producto..." value={productSearch} onChange={setProductSearch} keyboardLabel="Buscar" inputType="search" />
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto space-y-2">
                    {productsForService.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {(serviceCategoryLinks?.filter((l) => l.service_id === selectedServiceId).length ?? 0) === 0
                          ? "No hay categorías asociadas a este servicio. Un administrador debe configurarlas."
                          : "Sin productos en las categorías asociadas."}
                      </p>
                    ) : (
                      productsForService.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedProductId(p.id); setQuantity(0); setNotes(""); setServiceStep("confirm"); }}
                          className="w-full rounded-lg border-2 border-border p-4 text-left transition-all hover:shadow-md hover:border-primary active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-heading font-bold">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.category_id && categoryMap.get(p.category_id)?.name ? <span className="mr-2"><Tag className="inline h-3 w-3 mr-0.5" />{categoryMap.get(p.category_id)!.name}</span> : null}
                                Stock: {Number(p.current_stock).toFixed(2)} {p.unit} · ${Number(p.average_cost).toFixed(2)}/{p.unit}
                              </p>
                            </div>
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {serviceStep === "confirm" && selectedProduct && selectedServiceId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setServiceStep("product"); setSelectedProductId(null); }}>
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="text-lg">{selectedProduct.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Cantidad ({selectedProduct.unit}) *</Label>
                    <NumericKeypadInput
                      mode="decimal"
                      value={quantity || ""}
                      onChange={(v) => setQuantity(Math.max(0, Number(v) || 0))}
                      min="0.001"
                      keypadLabel={`Cantidad en ${selectedProduct.unit}`}
                      className="text-center text-2xl font-bold h-14"
                    />
                    <p className="text-xs text-muted-foreground text-center">Stock: {Number(selectedProduct.current_stock).toFixed(2)} {selectedProduct.unit}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Notas (opcional)</Label>
                    <KioskTextInput value={notes} onChange={setNotes} placeholder="Observaciones..." keyboardLabel="Notas" />
                  </div>
                  <div className="rounded-md bg-muted p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Servicio</span>
                      <span className="font-medium">{selectedService?.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Producto</span>
                      <span className="font-medium">{selectedProduct.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cantidad</span>
                      <span className="font-medium">{quantity} {selectedProduct.unit}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Costo estimado</span>
                      <span className="font-heading text-2xl font-bold">${estimatedCost.toFixed(2)}</span>
                    </div>
                  </div>
                  {!hasStock && quantity > 0 && <p className="text-sm text-destructive text-center font-medium">⚠️ Stock insuficiente</p>}
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => { setServiceStep("product"); setSelectedProductId(null); }}>Cancelar</Button>
                    <Button className="flex-1 h-14 text-lg" disabled={!canConfirmService || confirmServiceMutation.isPending} onClick={() => confirmServiceMutation.mutate()}>
                      {confirmServiceMutation.isPending ? "Registrando..." : <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Confirmar</span>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ═══ Manage Services Dialog (Admin) ═══ */}
      <Dialog open={manageOpen} onOpenChange={(o) => { setManageOpen(o); if (!o) { setManageCategoriesServiceId(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar Servicios Operativos</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Create service */}
            <div className="space-y-3 border-b border-border pb-4">
              <Label className="font-semibold">Crear nuevo servicio</Label>
              <KioskTextInput value={newServiceName} onChange={setNewServiceName} placeholder="Nombre del servicio" keyboardLabel="Nombre" />
              <KioskTextInput value={newServiceDesc} onChange={setNewServiceDesc} placeholder="Descripción (opcional)" keyboardLabel="Descripción" />
              <Button size="sm" disabled={!newServiceName.trim() || createServiceMutation.isPending} onClick={() => createServiceMutation.mutate()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Crear
              </Button>
            </div>

            {/* Existing services + product linking */}
            <div className="space-y-3">
              <Label className="font-semibold">Servicios existentes — Categorías asociadas</Label>
              {!services?.length ? (
                <p className="text-muted-foreground text-sm">Sin servicios</p>
              ) : (
                <div className="space-y-2">
                  {services.map((s) => {
                    const isExpanded = manageCategoriesServiceId === s.id;
                    const isEditing = editingServiceId === s.id;
                    const links = serviceCategoryLinks?.filter((l) => l.service_id === s.id) ?? [];
                    return (
                      <div key={s.id} className="border rounded-lg">
                        <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                          <button
                            className="flex-1 text-left"
                            onClick={() => setManageCategoriesServiceId(isExpanded ? null : s.id)}
                          >
                            <p className="font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {links.length} categoría{links.length !== 1 ? "s" : ""} · {productCountForService(s.id)} producto{productCountForService(s.id) !== 1 ? "s" : ""}
                            </p>
                          </button>
                          <div className="flex items-center gap-1 ml-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              setEditingServiceId(s.id);
                              setEditServiceName(s.name);
                              setEditServiceDesc(s.description || "");
                              setManageCategoriesServiceId(s.id);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar servicio?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Se eliminará "{s.name}" y sus categorías asociadas. Si hay movimientos vinculados, la operación podría fallar.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteServiceMutation.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <ChevronLeft className={`h-4 w-4 transition-transform ${isExpanded ? "-rotate-90" : ""}`} />
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t p-3 space-y-3">
                            {/* Edit service name/description */}
                            {isEditing && (
                              <div className="space-y-2 border-b border-border pb-3">
                                <p className="text-xs font-medium text-muted-foreground">Editar servicio:</p>
                                <KioskTextInput value={editServiceName} onChange={setEditServiceName} placeholder="Nombre" keyboardLabel="Nombre" />
                                <KioskTextInput value={editServiceDesc} onChange={setEditServiceDesc} placeholder="Descripción (opcional)" keyboardLabel="Descripción" />
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setEditingServiceId(null)}>Cancelar</Button>
                                  <Button size="sm" disabled={!editServiceName.trim() || updateServiceMutation.isPending} onClick={() => updateServiceMutation.mutate()}>
                                    {updateServiceMutation.isPending ? "Guardando..." : "Guardar"}
                                  </Button>
                                </div>
                              </div>
                            )}
                            {/* Linked categories */}
                            {links.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Categorías vinculadas:</p>
                                {links.map((link) => {
                                  const cat = categoryMap.get(link.category_id);
                                  return (
                                    <div key={link.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                                      <span className="text-sm flex items-center gap-1.5">
                                        <Tag className="h-3 w-3 text-primary" />
                                        {cat?.name ?? "—"}
                                      </span>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => unlinkCategoryMutation.mutate(link.id)}>
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Add categories */}
                            {categories && categories.filter((c) => !linkedCategoryIds.has(c.id)).length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Agregar categoría:</p>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {categories.filter((c) => !linkedCategoryIds.has(c.id)).map((c) => (
                                    <button
                                      key={c.id}
                                      onClick={() => linkCategoryMutation.mutate(c.id)}
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-1.5"
                                    >
                                      <Plus className="h-3 w-3 text-primary" />
                                      <Tag className="h-3 w-3" />
                                      {c.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {categories && categories.filter((c) => !linkedCategoryIds.has(c.id)).length === 0 && links.length > 0 && (
                              <p className="text-xs text-muted-foreground text-center">Todas las categorías ya están vinculadas</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
