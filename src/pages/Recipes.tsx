import { useState, useMemo } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Trash2, ChefHat, DollarSign, Eye, Search, Shirt, SprayCan, Pencil, Save, X, Layers, GripVertical, TrendingUp, TrendingDown, Calendar, Package, BarChart3, LayoutGrid } from "lucide-react";
import RecipeCostAnalysis from "@/components/RecipeCostAnalysis";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { format } from "date-fns";

type RecipeType = "food" | "laundry" | "housekeeping";
type RecipeMode = "fixed" | "variable_combo";

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

interface ComponentLine {
  id?: string;
  component_name: string;
  component_mode: "product" | "recipe";
  quantity_per_service: number;
  required: boolean;
  sort_order: number;
  average_component_cost: number;
}

export default function Recipes() {
  const [open, setOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRecipeType, setEditRecipeType] = useState<RecipeType>("food");
  const [editRecipeMode, setEditRecipeMode] = useState<RecipeMode>("fixed");
  const [editIngredients, setEditIngredients] = useState<(IngredientLine & { id?: string })[]>([]);
  const [editComponents, setEditComponents] = useState<ComponentLine[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipeType, setRecipeType] = useState<RecipeType>("food");
  const [recipeMode, setRecipeMode] = useState<RecipeMode>("fixed");
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const [components, setComponents] = useState<ComponentLine[]>([]);
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
  const [viewMode, setViewMode] = useState<"cards" | "costs">("cards");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, last_unit_cost").order("name");
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

  // Fetch variable components for all recipes
  const { data: allVariableComponents } = useQuery({
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

  // Fetch combo execution logs
  const { data: comboExecutionLogs } = useQuery({
    queryKey: ["combo-execution-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_execution_logs" as any)
        .select("*")
        .order("executed_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch combo execution items
  const { data: comboExecutionItems } = useQuery({
    queryKey: ["combo-execution-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_execution_items" as any)
        .select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const componentsByRecipe = new Map<string, any[]>();
  allVariableComponents?.forEach((c: any) => {
    const arr = componentsByRecipe.get(c.recipe_id) || [];
    arr.push(c);
    componentsByRecipe.set(c.recipe_id, arr);
  });

  const executionItemsByLog = useMemo(() => {
    const map = new Map<string, any[]>();
    comboExecutionItems?.forEach((item: any) => {
      const arr = map.get(item.execution_id) || [];
      arr.push(item);
      map.set(item.execution_id, arr);
    });
    return map;
  }, [comboExecutionItems]);

  const getComboStats = (recipeId: string) => {
    const logs = comboExecutionLogs?.filter((l: any) => l.recipe_id === recipeId) ?? [];
    if (logs.length === 0) return null;
    const costs = logs.map((l: any) => Number(l.unit_cost));
    const avg = costs.reduce((a: number, b: number) => a + b, 0) / costs.length;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return { logs, avg, min, max, count: logs.length };
  };

  const getProductCost = (productId: string): number => {
    const prod = productMap.get(productId);
    if (!prod) return 0;
    const avg = Number(prod.average_cost ?? 0);
    if (avg > 0) return avg;
    const last = Number((prod as any).last_unit_cost ?? 0);
    if (last > 0) return last;
    return 0;
  };

  const calcLineCost = (item: { product_id: string; quantity: number; unit: string }) => {
    const prod = productMap.get(item.product_id);
    if (!prod) return 0;
    const cost = getProductCost(item.product_id);
    const qtyInProductUnit = convertToProductUnit(item.quantity, item.unit, prod.unit);
    return cost * qtyInProductUnit;
  };

  const calcRecipeCost = (items: { product_id: string; quantity: number; unit: string }[]) =>
    items.reduce((sum, item) => sum + calcLineCost(item), 0);

  const formatCost = (cost: number) => {
    if (cost === 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const productHasCost = (productId: string) => {
    return getProductCost(productId) > 0;
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

  // Component operations for create form
  const addComponent = () => setComponents((prev) => [...prev, { component_name: "", component_mode: "product", quantity_per_service: 1, required: true, sort_order: prev.length, average_component_cost: 0 }]);
  const removeComponent = (i: number) => setComponents((prev) => prev.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, sort_order: idx })));
  const updateComponent = (i: number, field: keyof ComponentLine, value: any) =>
    setComponents((prev) => prev.map((item, idx) => idx !== i ? item : { ...item, [field]: value }));

  // Component operations for edit form
  const addEditComponent = () => setEditComponents((prev) => [...prev, { component_name: "", component_mode: "product", quantity_per_service: 1, required: true, sort_order: prev.length, average_component_cost: 0 }]);
  const removeEditComponent = (i: number) => setEditComponents((prev) => prev.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, sort_order: idx })));
  const updateEditComponent = (i: number, field: keyof ComponentLine, value: any) =>
    setEditComponents((prev) => prev.map((item, idx) => idx !== i ? item : { ...item, [field]: value }));

  const resetForm = () => { setName(""); setDescription(""); setRecipeType("food"); setRecipeMode("fixed"); setIngredients([]); setComponents([]); };

  const createRecipe = useMutation({
    mutationFn: async () => {
      const { data: recipe, error } = await supabase.from("recipes").insert({ name, description, recipe_type: recipeType, recipe_mode: recipeMode, restaurant_id: restaurantId! } as any).select("id").single();
      if (error) throw error;

      if (recipeMode === "fixed") {
        const validIngredients = ingredients.filter((i) => i.product_id && i.quantity > 0);
        if (validIngredients.length > 0) {
          const { error: ingError } = await supabase.from("recipe_ingredients").insert(
            validIngredients.map((i) => ({ recipe_id: recipe.id, product_id: i.product_id, quantity: i.quantity, unit: i.unit, yield_per_portion: i.yield_per_portion, restaurant_id: restaurantId! }))
          );
          if (ingError) throw ingError;
        }
      } else {
        const validComponents = components.filter((c) => c.component_name.trim());
        if (validComponents.length > 0) {
          const { error: compError } = await supabase.from("recipe_variable_components" as any).insert(
            validComponents.map((c, i) => ({ recipe_id: recipe.id, component_name: c.component_name.trim(), component_mode: c.component_mode, quantity_per_service: c.quantity_per_service, required: c.required, sort_order: i, average_component_cost: c.average_component_cost || 0, restaurant_id: restaurantId! }))
          );
          if (compError) throw compError;
        }
      }

      await logAudit({ entityType: "recipe", entityId: recipe.id, action: "CREATE", after: { name, description, recipe_type: recipeType, recipe_mode: recipeMode }, canRollback: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe-variable-components"] });
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
      qc.invalidateQueries({ queryKey: ["recipe-variable-components"] });
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
    setEditRecipeMode((recipe.recipe_mode ?? "fixed") as RecipeMode);
    setEditIngredients(
      (recipe.recipe_ingredients ?? []).map((ri: any) => ({
        id: ri.id,
        product_id: ri.product_id,
        quantity: Number(ri.quantity),
        unit: ri.unit ?? productMap.get(ri.product_id)?.unit ?? "unidad",
        yield_per_portion: Number(ri.yield_per_portion ?? 0),
      }))
    );
    const comps = componentsByRecipe.get(recipe.id) ?? [];
    setEditComponents(comps.map((c: any) => ({
      id: c.id,
      component_name: c.component_name,
      component_mode: c.component_mode ?? "product",
      quantity_per_service: Number(c.quantity_per_service),
      required: c.required,
      sort_order: c.sort_order,
    })));
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
        .update({ name: editName, description: editDescription, recipe_type: editRecipeType, recipe_mode: editRecipeMode } as any)
        .eq("id", recipeId);
      if (error) throw error;

      if (editRecipeMode === "fixed") {
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

        // Clean up components if switching from variable to fixed
        await supabase.from("recipe_variable_components" as any).delete().eq("recipe_id", recipeId);
      } else {
        // Delete old components and re-insert
        await supabase.from("recipe_variable_components" as any).delete().eq("recipe_id", recipeId);

        const validComponents = editComponents.filter((c) => c.component_name.trim());
        if (validComponents.length > 0) {
          const { error: compErr } = await supabase.from("recipe_variable_components" as any).insert(
            validComponents.map((c, i) => ({
              recipe_id: recipeId,
              component_name: c.component_name.trim(),
              component_mode: c.component_mode,
              quantity_per_service: c.quantity_per_service,
              required: c.required,
              sort_order: i,
              restaurant_id: restaurantId!,
            }))
          );
          if (compErr) throw compErr;
        }

        // Clean up ingredients if switching from fixed to variable
        await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
      }

      await logAudit({
        entityType: "recipe",
        entityId: recipeId,
        action: "UPDATE",
        before: prev,
        after: { name: editName, description: editDescription, recipe_type: editRecipeType, recipe_mode: editRecipeMode },
        canRollback: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe-variable-components"] });
      setEditMode(false);
      toast({ title: "Receta actualizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editIsValid = editName.trim().length > 0 && (
    editRecipeMode === "fixed"
      ? editIngredients.some((i) => i.product_id && i.quantity > 0)
      : editComponents.some((c) => c.component_name.trim())
  );
  const editCost = calcRecipeCost(editIngredients);

  const newCost = calcRecipeCost(ingredients);
  const isValid = name.trim().length > 0 && (
    recipeMode === "fixed"
      ? ingredients.some((i) => i.product_id && i.quantity > 0)
      : components.some((c) => c.component_name.trim())
  );

  const viewedRecipe = recipes?.find((r) => r.id === viewRecipeId);

  const filteredRecipes = recipes
    ?.filter((r) => filterType === "all" || (r as any).recipe_type === filterType)
    .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  // Render component editor (shared between create and edit)
  const renderComponentEditor = (
    comps: ComponentLine[],
    addFn: () => void,
    removeFn: (i: number) => void,
    updateFn: (i: number, field: keyof ComponentLine, value: any) => void,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4" /> Componentes del servicio
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addFn}>
          <Plus className="mr-1 h-3 w-3" /> Agregar componente
        </Button>
      </div>

      {comps.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Define los componentes variables del servicio (ej: bebida, fruta, snack)
        </p>
      )}

      {comps.map((comp, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <Badge variant="secondary" className="shrink-0 w-6 h-6 p-0 flex items-center justify-center text-xs">
            {i + 1}
          </Badge>
          <div className="flex-1">
            <KioskTextInput
              value={comp.component_name}
              onChange={(v) => updateFn(i, "component_name", v)}
              placeholder="Ej: bebida, fruta, caliente principal..."
              keyboardLabel="Nombre del componente"
            />
          </div>
          <Select value={comp.component_mode} onValueChange={(v) => updateFn(i, "component_mode" as any, v)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="product">
                <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Producto</span>
              </SelectItem>
              <SelectItem value="recipe">
                <span className="flex items-center gap-1"><ChefHat className="h-3 w-3" /> Receta</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="w-20">
            <NumericKeypadInput
              mode="decimal"
              value={comp.quantity_per_service || 1}
              onChange={(v) => updateFn(i, "quantity_per_service", Number(v) || 1)}
              min="0.1"
              keypadLabel="Cantidad por servicio"
            />
          </div>
          <Label className="text-xs text-muted-foreground shrink-0">c/u</Label>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeFn(i)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      {comps.length > 0 && (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <Layers className="h-4 w-4 inline mr-1" />
          {comps.filter(c => c.component_name.trim()).length} componente(s) definidos — el costo se calculará al ejecutar según los productos seleccionados
        </div>
      )}
    </div>
  );

  // Render ingredient editor (shared between create and edit)
  const renderIngredientEditor = (
    ings: (IngredientLine & { id?: string })[],
    addFn: () => void,
    removeFn: (i: number) => void,
    updateFn: (i: number, field: keyof IngredientLine, value: string) => void,
    rType: RecipeType,
    totalCost: number,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">
          {rType === "food" ? "Ingredientes" : "Insumos"}
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addFn}>
          <Plus className="mr-1 h-3 w-3" /> Agregar
        </Button>
      </div>

      {ings.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {rType === "food" ? "Agrega ingredientes a la receta" : "Agrega insumos al servicio"}
        </p>
      )}

      {ings.map((ing, i) => {
        const prod = productMap.get(ing.product_id);
        const availableUnits = prod ? getRecipeUnits(prod.unit) : [];
        const lineCost = calcLineCost(ing);
        const noCost = ing.product_id && !productHasCost(ing.product_id);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                <SearchableSelect
                  options={products?.map((p) => ({ value: p.id, label: `${p.name} (${p.unit}) — $${getProductCost(p.id).toFixed(2)}/${p.unit}`, searchTerms: p.name })) ?? []}
                  value={ing.product_id}
                  onValueChange={(v) => updateFn(i, "product_id", v)}
                  placeholder="Seleccionar..."
                  searchPlaceholder="Buscar producto..."
                />
              </div>
              <div className="w-24 space-y-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Cantidad</Label>}
                <NumericKeypadInput mode="decimal" value={ing.quantity || ""} onChange={(v) => updateFn(i, "quantity", v)} min="0.001" keypadLabel="Cantidad ingrediente" />
              </div>
              <div className="w-20 space-y-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Unidad</Label>}
                {availableUnits.length > 1 ? (
                  <Select value={ing.unit} onValueChange={(v) => updateFn(i, "unit", v)}>
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
                <NumericKeypadInput mode="decimal" value={ing.yield_per_portion || ""} onChange={(v) => updateFn(i, "yield_per_portion", v)} min="0" placeholder="0.000" keypadLabel="Rendimiento (kg)" />
              </div>
              <div className="w-24 text-right space-y-1">
                {i === 0 && <Label className="text-xs text-muted-foreground">Costo</Label>}
                <p className={`h-10 flex items-center justify-end text-sm font-medium ${noCost ? "text-amber-600" : ""}`}>
                  {noCost ? "⚠️ Sin costo" : formatCost(lineCost)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeFn(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {prod && (
              <p className="text-xs text-muted-foreground ml-1">
                Costo: ${getProductCost(prod.id).toFixed(4)}/{prod.unit}
                {ing.quantity > 0 && ` · ${convertToProductUnit(ing.quantity, ing.unit, prod.unit).toFixed(4)} ${prod.unit}`}
              </p>
            )}
          </div>
        );
      })}

      {ings.length > 0 && (
        <div className="rounded-md bg-muted p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-4 w-4" /> Costo teórico total
          </span>
          <span className="font-heading text-lg font-bold">{formatCost(totalCost)}</span>
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Recetas</h1>
            <p className="text-muted-foreground">Preparaciones de cocina, lavandería y aseo con ingredientes y costo teórico</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === "cards" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGrid className="mr-1 h-4 w-4" /> Recetas
              </Button>
              <Button
                variant={viewMode === "costs" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode("costs")}
              >
                <BarChart3 className="mr-1 h-4 w-4" /> Costos
              </Button>
            </div>
          </div>
          {canCreate && viewMode === "cards" && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nueva Receta</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Crear Receta</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); if (isValid) createRecipe.mutate(); }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
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
                      <Label>Modo *</Label>
                      <Select value={recipeMode} onValueChange={(v) => { setRecipeMode(v as RecipeMode); setIngredients([]); setComponents([]); }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">
                            <span className="flex items-center gap-2"><ChefHat className="h-4 w-4" /> Fija (ingredientes definidos)</span>
                          </SelectItem>
                          <SelectItem value="variable_combo">
                            <span className="flex items-center gap-2"><Layers className="h-4 w-4" /> Variable / Combo</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <KioskTextInput value={name} onChange={setName} placeholder="Ej: Lunch empresarial / Carne a la plancha" keyboardLabel="Nombre de la receta" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <KioskTextInput value={description} onChange={setDescription} placeholder="Instrucciones o notas..." keyboardLabel="Descripción de receta" />
                  </div>

                  {recipeMode === "fixed"
                    ? renderIngredientEditor(ingredients, addIngredientLine, removeIngredientLine, updateIngredient, recipeType, newCost)
                    : renderComponentEditor(components, addComponent, removeComponent, updateComponent)
                  }

                  <Button type="submit" className="w-full" disabled={createRecipe.isPending || !isValid}>
                    {createRecipe.isPending ? "Creando..." : "Crear Receta"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {viewMode === "costs" ? (
          <RecipeCostAnalysis restaurantId={restaurantId!} />
        ) : (
          <>
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
                  const rMode = ((recipe as any).recipe_mode ?? "fixed") as RecipeMode;
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
                  const comps = componentsByRecipe.get(recipe.id) ?? [];
                  return (
                    <Card key={recipe.id} className="group hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {rMode === "variable_combo" ? <Layers className="h-5 w-5 text-primary" /> : <Icon className="h-5 w-5 text-primary" />}
                            <CardTitle className="text-lg">{recipe.name}</CardTitle>
                          </div>
                          <div className="flex gap-1">
                            {rMode === "variable_combo" && (
                              <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">Combo</Badge>
                            )}
                            <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                          </div>
                        </div>
                        {recipe.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {rMode === "fixed" ? (
                          <>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{ingCount} {rType === "food" ? "ingrediente" : "insumo"}{ingCount !== 1 ? "s" : ""}</span>
                              <span className="font-heading font-bold text-lg">{formatCost(cost)}</span>
                            </div>
                            {rType === "food" && (
                              <p className="text-xs text-muted-foreground">
                                Rinde: {totalYield.toFixed(3)} kg/porción
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-sm text-muted-foreground">{comps.length} componente(s)</span>
                            <div className="flex flex-wrap gap-1">
                              {comps.slice(0, 5).map((c: any) => (
                                <Badge key={c.id} variant="secondary" className="text-xs">{c.component_name}</Badge>
                              ))}
                              {comps.length > 5 && <Badge variant="secondary" className="text-xs">+{comps.length - 5}</Badge>}
                            </div>
                          </div>
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
          </>
        )}

        {/* Detail / Edit dialog */}
        <Dialog open={!!viewRecipeId} onOpenChange={(o) => { if (!o) { setViewRecipeId(null); setEditMode(false); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                {(() => {
                  const rMode = (editMode ? editRecipeMode : ((viewedRecipe as any)?.recipe_mode ?? "fixed")) as RecipeMode;
                  const rType = (editMode ? editRecipeType : ((viewedRecipe as any)?.recipe_type ?? "food")) as RecipeType;
                  const Icon = rMode === "variable_combo" ? Layers : RECIPE_TYPE_CONFIG[rType].icon;
                  return <Icon className="h-5 w-5 text-primary" />;
                })()}
                {editMode ? "Editar Receta" : viewedRecipe?.name}
                {!editMode && viewedRecipe && (
                  <>
                    <Badge variant="outline" className={RECIPE_TYPE_CONFIG[((viewedRecipe as any).recipe_type ?? "food") as RecipeType].color}>
                      {RECIPE_TYPE_CONFIG[((viewedRecipe as any).recipe_type ?? "food") as RecipeType].label}
                    </Badge>
                    {((viewedRecipe as any).recipe_mode ?? "fixed") === "variable_combo" && (
                      <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">Combo Variable</Badge>
                    )}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            {/* === EDIT MODE === */}
            {editMode && viewedRecipe && (
              <form onSubmit={(e) => { e.preventDefault(); if (editIsValid) saveRecipe.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    <Label>Modo *</Label>
                    <Select value={editRecipeMode} onValueChange={(v) => { setEditRecipeMode(v as RecipeMode); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">
                          <span className="flex items-center gap-2"><ChefHat className="h-4 w-4" /> Fija</span>
                        </SelectItem>
                        <SelectItem value="variable_combo">
                          <span className="flex items-center gap-2"><Layers className="h-4 w-4" /> Variable / Combo</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <KioskTextInput value={editName} onChange={setEditName} placeholder="Nombre de la receta" keyboardLabel="Nombre de la receta" />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <KioskTextInput value={editDescription} onChange={setEditDescription} placeholder="Instrucciones o notas..." keyboardLabel="Descripción" />
                </div>

                {editRecipeMode === "fixed"
                  ? renderIngredientEditor(editIngredients, addEditIngredient, removeEditIngredient, updateEditIngredient, editRecipeType, editCost)
                  : renderComponentEditor(editComponents, addEditComponent, removeEditComponent, updateEditComponent)
                }

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
              const rMode = ((viewedRecipe as any).recipe_mode ?? "fixed") as RecipeMode;

              if (rMode === "variable_combo") {
                const comps = componentsByRecipe.get(viewedRecipe.id) ?? [];
                const stats = getComboStats(viewedRecipe.id);
                const recentLogs = stats?.logs.slice(0, 10) ?? [];

                return (
                  <div className="space-y-4">
                    {viewedRecipe.description && (
                      <p className="text-sm text-muted-foreground">{viewedRecipe.description}</p>
                    )}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Componentes del servicio
                      </Label>
                      {comps.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">Sin componentes definidos</p>
                      ) : (
                        <div className="space-y-1">
                          {comps.map((c: any, i: number) => (
                            <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
                              <Badge variant="secondary" className="shrink-0 w-6 h-6 p-0 flex items-center justify-center text-xs">
                                {i + 1}
                              </Badge>
                              <span className="flex-1 font-medium">{c.component_name}</span>
                              <Badge variant="outline" className="text-xs gap-1">
                                {(c.component_mode ?? "product") === "recipe" ? <><ChefHat className="h-3 w-3" /> Receta</> : <><Package className="h-3 w-3" /> Producto</>}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{Number(c.quantity_per_service)} c/u</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cost statistics */}
                    {stats ? (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <DollarSign className="h-4 w-4" /> Costos históricos del servicio
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-md border p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Promedio</p>
                            <p className="font-heading font-bold text-lg">${stats.avg.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">por servicio</p>
                          </div>
                          <div className="rounded-md border p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Mínimo</p>
                            <p className="font-heading font-bold text-lg text-primary">${stats.min.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">por servicio</p>
                          </div>
                          <div className="rounded-md border p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Máximo</p>
                            <p className="font-heading font-bold text-lg">${stats.max.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">por servicio</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">{stats.count} ejecución(es) registrada(s)</p>

                        {/* Recent executions */}
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <Calendar className="h-4 w-4" /> Últimas ejecuciones
                        </Label>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {recentLogs.map((log: any) => {
                            const items = executionItemsByLog.get(log.id) ?? [];
                            return (
                              <div key={log.id} className="rounded-md border p-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">
                                    {format(new Date(log.executed_at), "dd/MM/yyyy HH:mm")}
                                  </span>
                                  <Badge variant="outline">{Number(log.servings)} servicios</Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Costo unitario</span>
                                  <span className="font-semibold">${Number(log.unit_cost).toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Costo total</span>
                                  <span className="font-semibold">${Number(log.total_cost).toFixed(2)}</span>
                                </div>
                                {items.length > 0 && (
                                  <div className="pt-1 border-t space-y-0.5">
                                    {items.map((item: any) => {
                                      const prod = productMap.get(item.product_id);
                                      return (
                                        <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                          <span><span className="capitalize font-medium">{item.component_name}</span> → {prod?.name ?? "?"}</span>
                                          <span>${Number(item.line_cost).toFixed(2)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                        El costo se calculará dinámicamente al ejecutar, según los productos seleccionados para cada componente. Aún no hay ejecuciones registradas.
                      </div>
                    )}
                    {canUpdate && (
                      <Button className="w-full" variant="outline" onClick={() => startEdit(viewedRecipe)}>
                        <Pencil className="mr-2 h-4 w-4" /> Editar receta
                      </Button>
                    )}
                  </div>
                );
              }

              // Fixed recipe view
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
                            <TableCell className={`text-right ${getProductCost(ing.product_id) === 0 ? "text-amber-600" : ""}`}>
                              {getProductCost(ing.product_id) === 0 ? "⚠️ Sin costo" : `$${getProductCost(ing.product_id).toFixed(4)}/${prod?.unit}`}
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
                      {formatCost(calcRecipeCost(ings.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity), unit: i.unit }))))}
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
