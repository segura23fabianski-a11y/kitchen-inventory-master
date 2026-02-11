import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { ChefHat, CheckCircle2, AlertTriangle, Minus, Plus } from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";

export default function KitchenKiosk() {
  const [recipeId, setRecipeId] = useState("");
  const [portions, setPortions] = useState(1);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: recipes } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: ingredients } = useQuery({
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

  const lines = (ingredients ?? []).map((ing) => {
    const product = (ing as any).products;
    const recipeQty = Number(ing.quantity) * portions;
    const productQty = convertToProductUnit(recipeQty, ing.unit, product?.unit ?? ing.unit);
    const stock = Number(product?.current_stock ?? 0);
    const unitCost = Number(product?.average_cost ?? 0);
    const totalCost = productQty * unitCost;
    const insufficient = productQty > stock;
    return { ing, product, recipeQty, productQty, stock, unitCost, totalCost, insufficient };
  });

  const hasInsufficient = lines.some((l) => l.insufficient);
  const grandTotal = lines.reduce((s, l) => s + l.totalCost, 0);
  const isValid = recipeId && ingredients && ingredients.length > 0 && portions >= 1 && !hasInsufficient;

  const confirmConsumption = useMutation({
    mutationFn: async () => {
      const recipeName = recipes?.find((r) => r.id === recipeId)?.name ?? "";
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: recipeId,
        _user_id: user!.id,
        _portions: portions,
        _notes: `Consumo: ${recipeName} x${portions}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["recipe-ingredients", recipeId] });
      toast({ title: "Consumo registrado", description: `${lines.length} ingredientes descontados (x${portions})` });
      setPortions(1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Kiosco Cocina</h1>
          <p className="text-muted-foreground">Registrar consumo de ingredientes por receta</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ChefHat className="h-5 w-5 text-primary" /> 1. Seleccionar receta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={recipeId} onValueChange={(v) => { setRecipeId(v); setPortions(1); }}>
              <SelectTrigger><SelectValue placeholder="Elegir receta..." /></SelectTrigger>
              <SelectContent>
                {recipes?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {recipeId && (
              <div className="space-y-2">
                <Label>Cantidad de porciones / lotes</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="icon" onClick={() => setPortions(Math.max(1, portions - 1))} disabled={portions <= 1}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    value={portions}
                    onChange={(e) => setPortions(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    min="1"
                    className="w-20 text-center text-lg font-bold"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setPortions(portions + 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {recipeId && ingredients && ingredients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Ingredientes a descontar</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.ing.id}>
                      <TableCell className="font-medium">{l.product?.name}</TableCell>
                      <TableCell className="text-right">
                        {l.recipeQty} {l.ing.unit}
                        {l.ing.unit !== l.product?.unit && (
                          <span className="text-muted-foreground text-xs ml-1">({l.productQty.toFixed(2)} {l.product?.unit})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{l.stock} {l.product?.unit}</TableCell>
                      <TableCell className="text-right font-semibold">${l.totalCost.toFixed(2)}</TableCell>
                      <TableCell className="w-8">
                        {l.insufficient ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {recipeId && ingredients && ingredients.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Esta receta no tiene ingredientes configurados.
            </CardContent>
          </Card>
        )}

        {lines.length > 0 && (
          <>
            {hasInsufficient && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Stock insuficiente en uno o más ingredientes
              </div>
            )}

            <div className="rounded-md bg-muted p-4 flex justify-between items-center">
              <span className="text-muted-foreground">Costo total estimado</span>
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
                <><CheckCircle2 className="mr-2 h-5 w-5" /> Confirmar Consumo ({lines.length} ingredientes)</>
              )}
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
