import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChefHat, DollarSign, Eye } from "lucide-react";

interface IngredientLine {
  product_id: string;
  quantity: number;
  unit: string;
  yield_per_portion: number;
}

export default function Recipes() {
  const [open, setOpen] = useState(false);
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<IngredientLine[]>([]);
  const { hasRole } = useAuth();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canCreate = hasPermission("recipes_create");
  const canUpdate = hasPermission("recipes_update");
  const canDelete = hasPermission("recipes_delete");
  const canManage = canCreate || canUpdate;

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

  const resetForm = () => { setName(""); setDescription(""); setIngredients([]); };

  const createRecipe = useMutation({
    mutationFn: async () => {
      const { data: recipe, error } = await supabase.from("recipes").insert({ name, description }).select("id").single();
      if (error) throw error;
      const validIngredients = ingredients.filter((i) => i.product_id && i.quantity > 0);
      if (validIngredients.length > 0) {
        const { error: ingError } = await supabase.from("recipe_ingredients").insert(
          validIngredients.map((i) => ({ recipe_id: recipe.id, product_id: i.product_id, quantity: i.quantity, unit: i.unit, yield_per_portion: i.yield_per_portion }))
        );
        if (ingError) throw ingError;
      }
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
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
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

  const newCost = calcRecipeCost(ingredients);
  const isValid = name.trim().length > 0 && ingredients.some((i) => i.product_id && i.quantity > 0);

  const viewedRecipe = recipes?.find((r) => r.id === viewRecipeId);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Recetas</h1>
            <p className="text-muted-foreground">Preparaciones con ingredientes y costo teórico</p>
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
                    <Label>Nombre *</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Carne a la plancha" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instrucciones o notas..." maxLength={500} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Ingredientes</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addIngredientLine}>
                        <Plus className="mr-1 h-3 w-3" /> Agregar
                      </Button>
                    </div>

                    {ingredients.length === 0 && (
                      <p className="text-sm text-muted-foreground py-4 text-center">Agrega ingredientes a la receta</p>
                    )}

                    {ingredients.map((ing, i) => {
                      const prod = productMap.get(ing.product_id);
                      const availableUnits = prod ? getRecipeUnits(prod.unit) : [];
                      const lineCost = calcLineCost(ing);
                      return (
                        <div key={i} className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                            <Select value={ing.product_id} onValueChange={(v) => updateIngredient(i, "product_id", v)}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {products?.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24 space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Cantidad</Label>}
                            <Input type="number" value={ing.quantity || ""} onChange={(e) => updateIngredient(i, "quantity", e.target.value)} min="0.01" step="0.01" />
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
                            <Input type="number" value={ing.yield_per_portion || ""} onChange={(e) => updateIngredient(i, "yield_per_portion", e.target.value)} min="0" step="0.001" placeholder="0.000" />
                          </div>
                          <div className="w-24 text-right space-y-1">
                            {i === 0 && <Label className="text-xs text-muted-foreground">Costo</Label>}
                            <p className="h-10 flex items-center justify-end text-sm font-medium">${lineCost.toFixed(2)}</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeIngredientLine(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}

                    {ingredients.length > 0 && (
                      <div className="rounded-md bg-muted p-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-4 w-4" /> Costo teórico total
                        </span>
                        <span className="font-heading text-lg font-bold">${newCost.toFixed(2)}</span>
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

        {/* Recipe list */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full text-center py-12">Cargando...</p>
          ) : !recipes?.length ? (
            <p className="text-muted-foreground col-span-full text-center py-12">Sin recetas registradas</p>
          ) : (
            recipes.map((recipe) => {
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
                        <ChefHat className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                      </div>
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{ingCount} ingrediente{ingCount !== 1 ? "s" : ""}</span>
                      <span className="font-heading font-bold text-lg">${cost.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Rinde: {totalYield.toFixed(3)} kg/porción
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewRecipeId(recipe.id)}>
                        <Eye className="mr-1 h-3 w-3" /> Ver detalle
                      </Button>
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

        {/* Detail dialog */}
        <Dialog open={!!viewRecipeId} onOpenChange={(o) => { if (!o) setViewRecipeId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-primary" /> {viewedRecipe?.name}
              </DialogTitle>
            </DialogHeader>
            {viewedRecipe && (() => {
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
                        <TableHead>Ingrediente</TableHead>
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
                                <Input
                                  type="number"
                                  className="w-20 h-8 text-right inline-block"
                                  value={Number((ing as any).yield_per_portion) || ""}
                                  onChange={(e) => updateIngredientYield.mutate({ id: ing.id, yield_per_portion: Number(e.target.value) })}
                                  min="0"
                                  step="0.001"
                                />
                              ) : (
                                <span>{Number((ing as any).yield_per_portion ?? 0).toFixed(3)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">${Number(prod?.average_cost ?? 0).toFixed(2)}/{prod?.unit}</TableCell>
                            <TableCell className="text-right font-semibold">${sub.toFixed(2)}</TableCell>
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
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
}
