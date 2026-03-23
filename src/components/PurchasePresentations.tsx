import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Package } from "lucide-react";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

interface Props {
  productId: string;
  productName: string;
  productUnit: string;
}

export default function PurchasePresentations({ productId, productName, productUnit }: Props) {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");

  const { data: presentations = [] } = useQuery({
    queryKey: ["purchase-presentations", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_presentations" as any)
        .select("*")
        .eq("product_id", productId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!productId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !factor || Number(factor) <= 0) throw new Error("Nombre y factor son requeridos");
      const { error } = await supabase.from("purchase_presentations" as any).insert({
        product_id: productId,
        name: name.trim(),
        conversion_factor: Number(factor),
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-presentations", productId] });
      setName("");
      setFactor("");
      toast({ title: "Presentación agregada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("purchase_presentations" as any)
        .update({ active: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-presentations", productId] });
      toast({ title: "Presentación eliminada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">Presentaciones de Compra</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Define cómo se compra este producto (ej: "bolsa 900g" = 0.9 {productUnit}, "caja x12" = 12 {productUnit}).
      </p>

      {presentations.length > 0 && (
        <div className="space-y-1">
          {presentations.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="outline" className="text-xs">
                  1 × {p.name} = {Number(p.conversion_factor)} {productUnit}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => removeMutation.mutate(p.id)}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Nombre</Label>
          <KioskTextInput
            value={name}
            onChange={setName}
            placeholder="ej: bolsa 900g"
            keyboardLabel="Nombre presentación"
            className="h-8 text-sm"
          />
        </div>
        <div className="w-32 space-y-1">
          <Label className="text-xs">= {productUnit}</Label>
          <NumericKeypadInput
            mode="decimal"
            value={factor}
            onChange={setFactor}
            placeholder="ej: 0.9"
            keypadLabel={`Factor (${productUnit})`}
            className="h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8"
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || !factor || Number(factor) <= 0 || addMutation.isPending}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
