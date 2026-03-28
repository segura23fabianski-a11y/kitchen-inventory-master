import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { X, Plus, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { formatCOP } from "@/lib/utils";

interface Props {
  productId: string;
  productName: string;
}

export default function ProductEquivalents({ productId, productName }: Props) {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [addProductId, setAddProductId] = useState("");

  // Fetch equivalents for this product (bidirectional)
  const { data: equivalents = [], isLoading } = useQuery({
    queryKey: ["product-equivalents", productId],
    queryFn: async () => {
      // Get both directions
      const { data, error } = await supabase
        .from("product_equivalents" as any)
        .select("*")
        .or(`product_id.eq.${productId},equivalent_product_id.eq.${productId}`);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!productId,
  });

  // Fetch all products for the selector
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-equivalents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Get the "other" product id from each equivalent row
  const equivalentProductIds = equivalents.map((e: any) =>
    e.product_id === productId ? e.equivalent_product_id : e.product_id
  );

  // Products available to add (exclude self and already linked)
  const availableProducts = products.filter(
    (p) => p.id !== productId && !equivalentProductIds.includes(p.id)
  );

  // Enrich equivalent rows with product info
  const enriched = equivalents.map((e: any) => {
    const otherId = e.product_id === productId ? e.equivalent_product_id : e.product_id;
    const prod = products.find((p) => p.id === otherId);
    return { ...e, otherProduct: prod };
  });

  const addEquivalent = useMutation({
    mutationFn: async () => {
      if (!addProductId || !restaurantId) return;
      // Insert bidirectional pair
      const { error } = await supabase.from("product_equivalents" as any).insert([
        {
          product_id: productId,
          equivalent_product_id: addProductId,
          restaurant_id: restaurantId,
          priority: equivalents.length,
        },
        {
          product_id: addProductId,
          equivalent_product_id: productId,
          restaurant_id: restaurantId,
          priority: 0,
        },
      ] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-equivalents"] });
      setAddProductId("");
      toast.success("Equivalente agregado");
    },
    onError: () => toast.error("Error al agregar equivalente"),
  });

  const removeEquivalent = useMutation({
    mutationFn: async (otherProductId: string) => {
      // Remove both directions
      await supabase
        .from("product_equivalents" as any)
        .delete()
        .eq("product_id", productId)
        .eq("equivalent_product_id", otherProductId);
      await supabase
        .from("product_equivalents" as any)
        .delete()
        .eq("product_id", otherProductId)
        .eq("equivalent_product_id", productId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-equivalents"] });
      toast.success("Equivalente eliminado");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <ArrowLeftRight className="h-4 w-4" />
          Productos equivalentes
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Productos intercambiables con <strong>{productName}</strong>. En operación, podrás usar cualquiera de estos como sustituto.
      </p>

      {/* List current equivalents */}
      {enriched.length > 0 && (
        <div className="space-y-1.5 rounded-md border p-3">
          {enriched.map((eq: any) => (
            <div key={eq.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">
                  {eq.otherProduct?.name ?? "?"}
                </span>
                <Badge variant="outline" className="text-xs shrink-0">
                  {eq.otherProduct?.unit}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0">
                  Stock: {Number(eq.otherProduct?.current_stock ?? 0).toLocaleString()}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeEquivalent.mutate(eq.otherProduct?.id)}
              >
                <X className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new equivalent */}
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchableSelect
            value={addProductId}
            onValueChange={setAddProductId}
            placeholder="Buscar producto equivalente..."
            options={availableProducts.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.unit}) — Stock: ${formatCOP(p.current_stock ?? 0)}`,
            }))}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!addProductId || addEquivalent.isPending}
          onClick={() => addEquivalent.mutate()}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      {!isLoading && enriched.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin equivalentes configurados.
        </p>
      )}
    </div>
  );
}
