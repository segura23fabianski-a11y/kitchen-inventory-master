import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { convertToProductUnit, getRecipeUnits, getDefaultRecipeUnit } from "@/lib/unit-conversion";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Trash2, ChefHat, DollarSign, Eye, Search, Shirt, SprayCan, Pencil, Save, X } from "lucide-react";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

type RecipeType = "food" | "laundry" | "housekeeping";

const RECIPE_TYPE_CONFIG: Record<RecipeType, { label: string; icon: typeof ChefHat; color: string }> = {
  food: { label: "Cocina", icon: ChefHat, color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  laundry: { label: "Lavandería", icon: Shirt, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  housekeeping: { label: "Aseo", icon: SprayCan, color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
};

interface IngredientLine {
  product_id: string;
  quantity: number;
  unit: string;
  yield_per_portion: number;
}

export default function Recipes() {
  const [open, setOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRecipeType, setEditRecipeType] = useState<RecipeType>("food");
  const [editIngredients, setEditIngredients] = useState<(IngredientLine & { id?: string })[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipeType, setRecipeType] = useState<RecipeType>("food");
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [filterType, setFilterType] = useState<RecipeType | "all">("all");
  const { hasRole } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canCreate = hasPermission("recipes_create");
  const canUpdate = hasPermission("recipes_update");
  const canDelete = hasPermission("recipes_delete");
  const canManage = canCreate || canUpdate;
  const restaurantId = useRestaurantId();
  const [search, setSearch] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) ?? []);

  const { data: recipes, isLoading } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*, recipe_ingredients(id, product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const calcLineCost = (item: { product_id: string; quantity: number; unit: string }) => {
    const prod = productMap.get(item.product_id);
    if (!prod) return 0;
    const qtyInProductUnit = convertToProductUnit(item.quantity, item.unit, prod.unit);
    return Number(prod.average_cost) * qtyInProductUnit;
  };

  const calcRecipeCost = (items: { product_id: string; quantity: number; unit: string }[]) =>
    items.reduce((sum, item) => sum + calcLineCost(item), 0);

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const productHasCost = (productId: string) => {
    const prod = productMap.get(productId);
    return prod ? Number(prod.average_cost) > 0 : false;
  };

  const addIngredientLine = () => setIngredients((prev) => [...prev, { product_id: "", quantity: 0, unit: "g", yield_per_portion: 0 }]);
  const removeIngredientLine = (i: number) => setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateIngredient = (i: number, field: keyof IngredientLine, value: string) =>
    setIngredients((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        if (field === "quantity" || field === "yield_per_portion") return { ...item, [field]: Number(value) };
        if (field === "product_id") {
          const prod = productMap.get(value);
          const defaultUnit = prod ? getDefaultRecipeUnit(prod.unit) : "unidad";
          return { ...item, product_id: value, unit: defaultUnit };
        }
        return { ...item, [field]: value };
      })
    );

  const resetForm = () => { setName(""); setDescription(""); setRecipeType("food"); setIngredients([]); };

  const createRecipe = useMutation({
    mutationFn: async () => {
      const { data: recipe, error } = await supabase.from("recipes").insert({ name, description, recipe_type: recipeType, restaurant_id: restaurantId! } as any).select("id").single();
      if (error) throw error;
      const validIngredients = ingredients.filter((i) => i.product_id && i.quantity > 0);
      if (validIngredients.length > 0) {
        const { error: ingError } = await supabase.from("recipe_ingredients").insert(
          validIngredients.map((i) => ({ recipe_id: recipe.id, product_id: i.product_id, quantity: i.quantity, unit: i.unit, yield_per_portion: i.yield_per_portion, restaurant_id: restaurantId! }))
        );
        if (ingError) throw ingError;
      }
      await logAudit({ entityType: "recipe", entityId: recipe.id, action: "CREATE", after: { name, description, recipe_type: recipeType, ingredients: validIngredients }, canRollback: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setOpen(false);
      resetForm();
      toast({ title: "Receta creada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: string) => {
      const { data: prev } = await supabase.from("recipes").select("*").eq("id", id).single();
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ entityType: "recipe", entityId: id, action: "DELETE", before: prev, canRollback: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setViewRecipeId(null);
      toast({ title: "Receta eliminada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateIngredientYield = useMutation({
    mutationFn: async ({ id, yield_per_portion }: { id: string; yield_per_portion: number }) => {
      const { error } = await supabase.from("recipe_ingredients").update({ yield_per_portion }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast({ title: "Rendimiento actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (recipe: any) => {
    setEditName(recipe.name);
    setEditDescription(recipe.description || "");
    setEditRecipeType((recipe.recipe_type ?? "food") as RecipeType);
    setEditIngredients(
      (recipe.recipe_ingredients ?? []).map((ri: any) => ({
        id: ri.id,
        product_id: ri.product_id,
        quantity: Number(ri.quantity),
        unit: ri.unit ?? productMap.get(ri.product_id)?.unit ?? "unidad",
        yield_per_portion: Number(ri.yield_per_portion ?? 0),
      }))
    );
    setEditMode(true);
  };

  const cancelEdit = () => setEditMode(false);

  const addEditIngredient = () =>
    setEditIngredients((prev) => [...prev, { product_id: "", quantity: 0, unit: "g", yield_per_portion: 0 }]);

  const removeEditIngredient = (i: number) =>
    setEditIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateEditIngredient = (i: number, field: keyof IngredientLine, value: string) =>
    setEditIngredients((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        if (field === "quantity" || field === "yield_per_portion") return { ...item, [field]: Number(value) };
        if (field === "product_id") {
          const prod = productMap.get(value);
          const defaultUnit = prod ? getDefaultRecipeUnit(prod.unit) : "unidad";
          return { ...item, product_id: value, unit: defaultUnit };
        }
        return { ...item, [field]: value };
      })
    );

  const saveRecipe = useMutation({
    mutationFn: async () => {
      const recipeId = viewRecipeId!;
      const { data: prev } = await supabase.from("recipes").select("*").eq("id", recipeId).single();
      const { error } = await supabase
        .from("recipes")
        .update({ name: editName, description: editDescription, recipe_type: editRecipeType } as any)
        .eq("id", recipeId);
      if (error) throw error;

      // Delete old ingredients and re-insert
      const { error: delErr } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
      if (delErr) throw delErr;

      const validIngredients = editIngredients.filter((i) => i.product_id && i.quantity > 0);
      if (validIngredients.length > 0) {
        const { error: insErr } = await supabase.from("recipe_ingredients").insert(
          validIngredients.map((i) => ({
            recipe_id: recipeId,
            product_id: i.product_id,
            quantity: i.quantity,
            unit: i.unit,
            yield_per_portion: i.yield_per_portion,
            restaurant_id: restaurantId!,
          }))
        );
        if (insErr) throw insErr;
      }

      await logAudit({
        entityType: "recipe",
        entityId: recipeId,
        action: "UPDATE",
        before: prev,
        after: { name: editName, description: editDescription, recipe_type: editRecipeType, ingredients: validIngredients },
        canRollback: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setEditMode(false);
      toast({ title: "Receta actualizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editIsValid = editName.trim().length > 0 && editIngredients.some((i) => i.product_id && i.quantity > 0);
  const editCost = calcRecipeCost(editIngredients);

  const newCost = calcRecipeCost(ingredients);
  const isValid = name.trim().length > 0 && ingredients.some((i) => i.product_id && i.quantity > 0);

  const viewedRecipe = recipes?.find((r) => r.id === viewRecipeId);

  const filteredRecipes = recipes
    ?.filter((r) => filterType === "all" || (r as any).recipe_type === filterType)
    .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Recetas</h1>
            <p className="text-muted-foreground">Preparaciones de cocina, lavandería y aseo con ingredientes y costo teórico</p>
          </div>
          {canCreate && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nueva Receta</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Crear Receta</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); if (isValid) createRecipe.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de receta *</Label>
                    <Select value={recipeType} onValueChange={(v) => setRecipeType(v as RecipeType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RECIPE_TYPE_CONFIG).map(([key, cfg]) => {
                          const Icon = cfg.icon;
                          return (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2"><Icon className="h-4 w-4" /> {cfg.label}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <KioskTextInput value={name} onChange={setName} placeholder="Ej: Carne a la plancha / Lavado de ropa" keyboardLabel="Nombre de la receta" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <KioskTextInput value={description} onChange={setDescription} placeholder="Instrucciones o notas..." keyboardLabel="Descripción de receta" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">
                        {recipeType === "food" ? "Ingredientes" : "Insumos"}
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={addIngredientLine}>
                        <Plus className="mr-1 h-3 w-3" /> Agregar
                      </Button>
                    </div>

                    {ingredients.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {recipeType === "food" ? "Agrega ingredientes a la receta" : "Agrega insumos al servicio"}
                      </p>
                    )}

                    {ingredients.map((ing, i) => {
                      const prod = productMap.get(ing.product_id);
                      const availableUnits = prod ? getRecipeUnits(prod.unit) : [];
                      const lineCost = calcLineCost(ing);
                      const noCost = ing.product_id && !productHasCost(ing.product_id);
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-end gap-2">
                            <div className="flex-1 space-y-1">
                              {i === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                              <Select value={ing.product_id} onValueChange={(v) => updateIngredient(i, "product_id", v)}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                  {products?.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit}) — ${Number(p.average_cost).toFixed(2)}/{p.unit}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-24 space-y-1">
                              {i === 0 && <Label className="text-xs text-muted-foreground">Cantidad</Label>}
                              <NumericKeypadInput mode="decimal" value={ing.quantity || ""} onChange={(v) => updateIngredient(i, "quantity", v)} min="0.001" keypadLabel="Cantidad ingrediente" />
                            </div>
                            <div className="w-20 space-y-1">
                              {i === 0 && <Label className="text-xs text-muted-foreground">Unidad</Label>}
                              {availableUnits.length > 1 ? (
                                <Select value={ing.unit} onValueChange={(v) => updateIngredient(i, "unit", v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {availableUnits.map((u) => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="h-10 flex items-center text-sm">{ing.unit || "—"}</p>
                              )}
                            </div>
                            <div className="w-20 space-y-1">
                              {i === 0 && <Label className="text-xs text-muted-foreground">Rinde (kg)</Label>}
                              <NumericKeypadInput mode="decimal" value={ing.yield_per_portion || ""} onChange={(v) => updateIngredient(i, "yield_per_portion", v)} min="0" placeholder="0.000" keypadLabel="Rendimiento (kg)" />
                            </div>
                            <div className="w-24 text-right space-y-1">
                              {i === 0 && <Label className="text-xs text-muted-foreground">Costo</Label>}
                              <p className={`h-10 flex items-center justify-end text-sm font-medium ${noCost ? "text-amber-600" : ""}`}>
                                {noCost ? "⚠️ Sin costo" : formatCost(lineCost)}
                              </p>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeIngredientLine(i)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          {prod && (
                            <p className="text-xs text-muted-foreground ml-1">
                              Costo: ${Number(prod.average_cost).toFixed(4)}/{prod.unit}
                              {ing.quantity > 0 && ` · ${convertToProductUnit(ing.quantity, ing.unit, prod.unit).toFixed(4)} ${prod.unit}`}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {ingredients.length > 0 && (
                      <div className="rounded-md bg-muted p-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-4 w-4" /> Costo teórico total
                        </span>
                        <span className="font-heading text-lg font-bold">{formatCost(newCost)}</span>
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={createRecipe.isPending || !isValid}>
                    {createRecipe.isPending ? "Creando..." : "Crear Receta"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Type filter tabs */}
        <Tabs value={filterType} onValueChange={(v) => setFilterType(v as RecipeType | "all")}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="food" className="gap-1"><ChefHat className="h-3.5 w-3.5" /> Cocina</TabsTrigger>
            <TabsTrigger value="laundry" className="gap-1"><Shirt className="h-3.5 w-3.5" /> Lavandería</TabsTrigger>
            <TabsTrigger value="housekeeping" className="gap-1"><SprayCan className="h-3.5 w-3.5" /> Aseo</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <KioskTextInput className="pl-10" placeholder="Buscar receta..." value={search} onChange={setSearch} keyboardLabel="Buscar receta" inputType="search" />
        </div>

        {/* Recipe list */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full text-center py-12">Cargando...</p>
          ) : !filteredRecipes?.length ? (
            <p className="text-muted-foreground col-span-full text-center py-12">Sin recetas registradas</p>
          ) : (
            filteredRecipes.map((recipe) => {
              const rType = ((recipe as any).recipe_type ?? "food") as RecipeType;
              const cfg = RECIPE_TYPE_CONFIG[rType];
              const Icon = cfg.icon;
              const ings = (recipe.recipe_ingredients ?? []).map((ri) => ({
                product_id: ri.product_id,
                quantity: Number(ri.quantity),
                unit: (ri as any).unit ?? productMap.get(ri.product_id)?.unit ?? "unidad",
                yield_per_portion: Number((ri as any).yield_per_portion ?? 0),
              }));
              const cost = calcRecipeCost(ings);
              const totalYield = ings.reduce((s, i) => s + i.yield_per_portion, 0);
              const ingCount = ings.length;
              return (
                <Card key={recipe.id} className="group hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                      </div>
                      <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{ingCount} {rType === "food" ? "ingrediente" : "insumo"}{ingCount !== 1 ? "s" : ""}</span>
                      <span className="font-heading font-bold text-lg">{formatCost(cost)}</span>
                    </div>
                    {rType === "food" && (
                      <p className="text-xs text-muted-foreground">
                        Rinde: {totalYield.toFixed(3)} kg/porción
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setViewRecipeId(recipe.id); setEditMode(false); }}>
                        <Eye className="mr-1 h-3 w-3" /> Ver detalle
                      </Button>
                      {canUpdate && (
                        <Button variant="outline" size="sm" onClick={() => { setViewRecipeId(recipe.id); startEdit(recipe); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => deleteRecipe.mutate(recipe.id)} disabled={deleteRecipe.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Detail / Edit dialog */}
        <Dialog open={!!viewRecipeId} onOpenChange={(o) => { if (!o) { setViewRecipeId(null); setEditMode(false); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                {(() => {
                  const rType = (editMode ? editRecipeType : ((viewedRecipe as any)?.recipe_type ?? "food")) as RecipeType;
                  const Icon = RECIPE_TYPE_CONFIG[rType].icon;
                  return <Icon className="h-5 w-5 text-primary" />;
                })()}
                {editMode ? "Editar Receta" : viewedRecipe?.name}
                {!editMode && viewedRecipe && (
                  <Badge variant="outline" className={RECIPE_TYPE_CONFIG[((viewedRecipe as any).recipe_type ?? "food") as RecipeType].color}>
                    {RECIPE_TYPE_CONFIG[((viewedRecipe as any).recipe_type ?? "food") as RecipeType].label}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {/* === EDIT MODE === */}
            {editMode && viewedRecipe && (
              <form onSubmit={(e) => { e.preventDefault(); if (editIsValid) saveRecipe.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de receta *</Label>
                  <Select value={editRecipeType} onValueChange={(v) => setEditRecipeType(v as RecipeType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECIPE_TYPE_CONFIG).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2"><Icon className="h-4 w-4" /> {cfg.label}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <KioskTextInput value={editName} onChange={setEditName} placeholder="Nombre de la receta" keyboardLabel="Nombre de la receta" />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <KioskTextInput value={editDescription} onChange={setEditDescription} placeholder="Instrucciones o notas..." keyboardLabel="Descripción" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">{editRecipeType === "food" ? "Ingredientes" : "Insumos"}</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addEditIngredient}>
                      <Plus className="mr-1 h-3 w-3" /> Agregar
                    </Button>
                  </div>

                  {editIngredients.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">Sin ingredientes</p>
                  )}

                  {editIngredients.map((ing, i) => {
                    const prod = productMap.get(ing.product_id);
                    const availableUnits = prod ? getRecipeUnits(prod.unit) : [];
                    const lineCost = calcLineCost(ing);
                    const noCost = ing.product_id && !productHasCost(ing.product_id);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                            <Select value={ing.product_id} onValueChange={(v) => updateEditIngredient(i, "product_id", v)}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {products?.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit}) — ${Number(p.average_cost).toFixed(2)}/{p.unit}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Cantidad</Label>}
                            <NumericKeypadInput mode="decimal" value={ing.quantity || ""} onChange={(v) => updateEditIngredient(i, "quantity", v)} min="0.001" keypadLabel="Cantidad" />
                          </div>
                          <div className="w-20 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Unidad</Label>}
                            {availableUnits.length > 1 ? (
                              <Select value={ing.unit} onValueChange={(v) => updateEditIngredient(i, "unit", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {availableUnits.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="h-10 flex items-center text-sm">{ing.unit || "—"}</p>
                            )}
                          </div>
                          <div className="w-20 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Rinde (kg)</Label>}
                            <NumericKeypadInput mode="decimal" value={ing.yield_per_portion || ""} onChange={(v) => updateEditIngredient(i, "yield_per_portion", v)} min="0" placeholder="0.000" keypadLabel="Rendimiento (kg)" />
                          </div>
                          <div className="w-24 text-right space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Costo</Label>}
                            <p className={`h-10 flex items-center justify-end text-sm font-medium ${noCost ? "text-amber-600" : ""}`}>
                              {noCost ? "⚠️ Sin costo" : formatCost(lineCost)}
                            </p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeEditIngredient(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        {prod && (
                          <p className="text-xs text-muted-foreground ml-1">
                            Costo: ${Number(prod.average_cost).toFixed(4)}/{prod.unit}
                            {ing.quantity > 0 && ` · ${convertToProductUnit(ing.quantity, ing.unit, prod.unit).toFixed(4)} ${prod.unit}`}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {editIngredients.length > 0 && (
                    <div className="rounded-md bg-muted p-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-4 w-4" /> Costo teórico total</span>
                      <span className="font-heading text-lg font-bold">{formatCost(editCost)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={cancelEdit}>
                    <X className="mr-1 h-4 w-4" /> Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={saveRecipe.isPending || !editIsValid}>
                    <Save className="mr-1 h-4 w-4" /> {saveRecipe.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </form>
            )}

            {/* === VIEW MODE === */}
            {!editMode && viewedRecipe && (() => {
              const ings = (viewedRecipe.recipe_ingredients ?? []).map((ri) => ({
                ...ri,
                unit: (ri as any).unit ?? productMap.get(ri.product_id)?.unit ?? "unidad",
              }));
              return (
                <div className="space-y-4">
                  {viewedRecipe.description && (
                    <p className="text-sm text-muted-foreground">{viewedRecipe.description}</p>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{((viewedRecipe as any).recipe_type ?? "food") === "food" ? "Ingrediente" : "Insumo"}</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Rinde (kg)</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ings.map((ing) => {
                        const prod = productMap.get(ing.product_id);
                        const sub = calcLineCost({ product_id: ing.product_id, quantity: Number(ing.quantity), unit: ing.unit });
                        return (
                          <TableRow key={ing.id}>
                            <TableCell className="font-medium">{prod?.name ?? "—"}</TableCell>
                            <TableCell className="text-right">{Number(ing.quantity)} {ing.unit}</TableCell>
                            <TableCell className="text-right">
                              {canManage ? (
                                <NumericKeypadInput
                                  mode="decimal"
                                  className="w-20 h-8 text-right inline-block"
                                  value={Number((ing as any).yield_per_portion) || ""}
                                  onChange={(v) => updateIngredientYield.mutate({ id: ing.id, yield_per_portion: Number(v) })}
                                  min="0"
                                  keypadLabel="Rendimiento (kg)"
                                />
                              ) : (
                                <span>{Number((ing as any).yield_per_portion ?? 0).toFixed(3)}</span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right ${Number(prod?.average_cost ?? 0) === 0 ? "text-amber-600" : ""}`}>
                              {Number(prod?.average_cost ?? 0) === 0 ? "⚠️ Sin costo" : `$${Number(prod?.average_cost).toFixed(4)}/${prod?.unit}`}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{formatCost(sub)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="rounded-md bg-muted p-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Costo teórico total</span>
                    <span className="font-heading text-xl font-bold">
                      ${calcRecipeCost(ings.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity), unit: i.unit }))).toFixed(2)}
                    </span>
                  </div>
                  {canUpdate && (
                    <Button className="w-full" variant="outline" onClick={() => startEdit(viewedRecipe)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar receta
                    </Button>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
}
