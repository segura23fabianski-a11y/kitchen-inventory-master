import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ShoppingCart, PackageCheck } from "lucide-react";

export interface SuggestedItem {
  product_id: string;
  product_name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  daily_consumption: number | null;
  target_days: number;
  reorder_mode: string;
  days_coverage: number | null;
  suggested_qty: number;
  supplier_id: string | null;
  supplier_name: string | null;
  last_unit_cost: number | null;
  available_suppliers: { id: string; name: string; last_unit_cost: number | null }[];
}

export default function SuggestedPurchases() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("purchase_orders_create");
  const { toast } = useToast();
  const qc = useQueryClient();

  // Track supplier overrides per product
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({});

  const { data: products } = useQuery({
    queryKey: ["products-for-reorder"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, min_stock, daily_consumption, target_days_of_stock, reorder_mode")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productSuppliers } = useQuery({
    queryKey: ["product-suppliers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_suppliers")
        .select("*, suppliers!inner(name)");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: allSuppliers } = useQuery({
    queryKey: ["suppliers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const suggestions: SuggestedItem[] = useMemo(() => {
    if (!products) return [];
    return products.map((p: any) => {
      // Find all suppliers for this product
      const allPS = productSuppliers?.filter((r: any) => r.product_id === p.id) || [];
      const available_suppliers = allPS.map((ps: any) => ({
        id: ps.supplier_id,
        name: (ps as any).suppliers?.name || "Sin nombre",
        last_unit_cost: ps.last_unit_cost ? Number(ps.last_unit_cost) : null,
      }));

      const ps = allPS.find((r: any) => r.is_primary);
      const fallback = !ps ? allPS[0] : null;
      const supplier = ps || fallback;

      const stock = Number(p.current_stock);
      const minStock = Number(p.min_stock);
      const daily = p.daily_consumption != null ? Number(p.daily_consumption) : null;
      const targetDays = Number(p.target_days_of_stock ?? 5);
      const mode = p.reorder_mode ?? "min_stock";

      let suggested_qty: number;
      let days_coverage: number | null = null;

      if (mode === "coverage" && daily && daily > 0) {
        days_coverage = stock / daily;
        const stock_target = daily * targetDays;
        suggested_qty = Math.max(stock_target - stock, 0);
      } else {
        if (daily && daily > 0) {
          days_coverage = stock / daily;
        }
        suggested_qty = Math.max(minStock - stock, 0);
      }

      return {
        product_id: p.id,
        product_name: p.name,
        unit: p.unit,
        current_stock: stock,
        min_stock: minStock,
        daily_consumption: daily,
        target_days: targetDays,
        reorder_mode: mode,
        days_coverage,
        suggested_qty: Math.round(suggested_qty * 100) / 100,
        supplier_id: supplier?.supplier_id || null,
        supplier_name: supplier ? (supplier as any).suppliers?.name : null,
        last_unit_cost: supplier?.last_unit_cost ? Number(supplier.last_unit_cost) : null,
        available_suppliers,
      };
    }).filter((s) => s.suggested_qty > 0);
  }, [products, productSuppliers]);

  // Apply overrides to get effective supplier per product
  const effectiveSuggestions = useMemo(() => {
    return suggestions.map((s) => {
      const overrideId = supplierOverrides[s.product_id];
      if (overrideId && overrideId !== s.supplier_id) {
        const found = s.available_suppliers.find((sup) => sup.id === overrideId);
        if (found) {
          return { ...s, supplier_id: found.id, supplier_name: found.name, last_unit_cost: found.last_unit_cost };
        }
        // Could be from allSuppliers (not linked)
        const globalSup = allSuppliers?.find((sup) => sup.id === overrideId);
        if (globalSup) {
          return { ...s, supplier_id: globalSup.id, supplier_name: globalSup.name, last_unit_cost: null };
        }
      }
      return s;
    });
  }, [suggestions, supplierOverrides, allSuppliers]);

  const grouped = useMemo(() => {
    const map = new Map<string, { supplier_id: string; supplier_name: string; items: SuggestedItem[] }>();
    const noSupplier: SuggestedItem[] = [];
    effectiveSuggestions.forEach((s) => {
      if (!s.supplier_id) {
        noSupplier.push(s);
        return;
      }
      const key = s.supplier_id;
      if (!map.has(key)) map.set(key, { supplier_id: key, supplier_name: s.supplier_name || "Sin nombre", items: [] });
      map.get(key)!.items.push(s);
    });
    const groups = Array.from(map.values());
    if (noSupplier.length) groups.push({ supplier_id: "", supplier_name: "Sin proveedor asignado", items: noSupplier });
    return groups;
  }, [effectiveSuggestions]);

  const generateOrder = useMutation({
    mutationFn: async (group: { supplier_id: string; items: SuggestedItem[] }) => {
      if (!restaurantId || !user) throw new Error("Sin contexto");
      const { data: order, error } = await supabase
        .from("purchase_orders")
        .insert({
          restaurant_id: restaurantId,
          supplier_id: group.supplier_id,
          order_date: new Date().toISOString().slice(0, 10),
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const items = group.items.map((item) => ({
        restaurant_id: restaurantId,
        purchase_order_id: order.id,
        product_id: item.product_id,
        quantity: item.suggested_qty,
        unit_cost: item.last_unit_cost,
      }));
      const { error: itemErr } = await supabase.from("purchase_order_items").insert(items);
      if (itemErr) throw itemErr;
      await logAudit({
        entityType: "purchase_order",
        entityId: order.id,
        action: "CREATE",
        after: { supplier_id: group.supplier_id, items_count: items.length },
        metadata: { source: "suggested_purchases" },
      });
      return order.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Pedido de compra generado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generateAll = useMutation({
    mutationFn: async () => {
      const validGroups = grouped.filter((g) => g.supplier_id);
      for (const group of validGroups) {
        await generateOrder.mutateAsync(group);
      }
    },
    onSuccess: () => {
      toast({ title: "Todos los pedidos generados" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!suggestions.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <PackageCheck className="mx-auto h-12 w-12 mb-3 text-primary/30" />
          <p className="text-lg font-medium">¡Todo en orden!</p>
          <p className="text-sm">No hay productos que necesiten reposición.</p>
        </CardContent>
      </Card>
    );
  }

  const hasValidGroups = grouped.some((g) => g.supplier_id);

  return (
    <div className="space-y-4">
      {canCreate && hasValidGroups && (
        <div className="flex justify-end">
          <Button onClick={() => generateAll.mutate()} disabled={generateAll.isPending}>
            <ShoppingCart className="h-4 w-4 mr-1" />
            Generar todos los pedidos
          </Button>
        </div>
      )}

      {grouped.map((group) => (
        <Card key={group.supplier_id || "none"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {group.supplier_name}
                <Badge variant="secondary">{group.items.length} productos</Badge>
              </CardTitle>
              {canCreate && group.supplier_id && (
                <Button
                  size="sm"
                  onClick={() => generateOrder.mutate(group)}
                  disabled={generateOrder.isPending}
                >
                  <ShoppingCart className="h-4 w-4 mr-1" />
                  Generar Pedido
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock actual</TableHead>
                  <TableHead className="text-right">Stock mínimo</TableHead>
                  <TableHead className="text-right">Cant. Sugerida</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Últ. Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((item) => {
                  const effectiveItem = effectiveSuggestions.find((s) => s.product_id === item.product_id) || item;
                  const supplierOptions = item.available_suppliers.length > 0 ? item.available_suppliers : [];
                  const hasMultiple = supplierOptions.length > 1 || (allSuppliers && allSuppliers.length > 0);

                  return (
                    <TableRow key={item.product_id}>
                      <TableCell className="font-medium">
                        {item.product_name} <span className="text-muted-foreground text-xs">({item.unit})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={item.current_stock < item.min_stock ? "text-destructive font-semibold" : ""}>{item.current_stock}</span>
                      </TableCell>
                      <TableCell className="text-right">{item.min_stock}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{effectiveItem.suggested_qty}</TableCell>
                      <TableCell>
                        {canCreate && hasMultiple ? (
                          <Select
                            value={supplierOverrides[item.product_id] || effectiveItem.supplier_id || ""}
                            onValueChange={(v) => setSupplierOverrides((prev) => ({ ...prev, [item.product_id]: v }))}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue placeholder="Sin proveedor" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Linked suppliers first */}
                              {supplierOptions.map((sup) => (
                                <SelectItem key={sup.id} value={sup.id}>
                                  {sup.name} {sup.last_unit_cost != null ? `($${sup.last_unit_cost.toFixed(2)})` : ""}
                                </SelectItem>
                              ))}
                              {/* Other suppliers */}
                              {allSuppliers
                                ?.filter((s) => !supplierOptions.some((so) => so.id === s.id))
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{effectiveItem.supplier_name || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{effectiveItem.last_unit_cost != null ? `$${effectiveItem.last_unit_cost.toFixed(2)}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
