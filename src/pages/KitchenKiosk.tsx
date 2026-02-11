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
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Package, CheckCircle2, AlertTriangle } from "lucide-react";

export default function KitchenKiosk() {
  const [recipeId, setRecipeId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
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

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, current_stock, average_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find((p) => p.id === productId);
  const qty = Number(quantity) || 0;
  const unitCost = Number(selectedProduct?.average_cost ?? 0);
  const totalCost = qty * unitCost;
  const stock = Number(selectedProduct?.current_stock ?? 0);
  const insufficientStock = qty > 0 && qty > stock;
  const isValid = recipeId && productId && qty > 0 && !insufficientStock;

  const confirmConsumption = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_movements").insert({
        product_id: productId,
        recipe_id: recipeId,
        user_id: user!.id,
        type: "salida",
        quantity: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        notes: `Consumo: ${recipes?.find((r) => r.id === recipeId)?.name ?? ""}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      toast({ title: "Consumo registrado", description: `${qty} ${selectedProduct?.unit} de ${selectedProduct?.name}` });
      setProductId("");
      setQuantity("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Kiosco Cocina</h1>
          <p className="text-muted-foreground">Registrar consumo de ingredientes</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ChefHat className="h-5 w-5 text-primary" /> 1. Seleccionar receta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger><SelectValue placeholder="Elegir receta..." /></SelectTrigger>
              <SelectContent>
                {recipes?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" /> 2. Producto y cantidad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Producto</Label>
              <Select value={productId} onValueChange={(v) => { setProductId(v); setQuantity(""); }}>
                <SelectTrigger><SelectValue placeholder="Elegir producto..." /></SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.unit}) — Stock: {Number(p.current_stock)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && (
              <>
                <div className="space-y-2">
                  <Label>Cantidad ({selectedProduct.unit})</Label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="0.01"
                    placeholder="0"
                    className="text-lg"
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Stock disponible</span>
                  <span className={insufficientStock ? "text-destructive font-semibold" : "font-medium"}>
                    {stock} {selectedProduct.unit}
                  </span>
                </div>

                {insufficientStock && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Stock insuficiente
                  </div>
                )}

                {qty > 0 && !insufficientStock && (
                  <div className="rounded-md bg-muted p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Costo unitario</span>
                      <span>${unitCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Costo total</span>
                      <span className="font-heading font-bold text-lg">${totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full h-14 text-lg"
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
    </AppLayout>
  );
}
