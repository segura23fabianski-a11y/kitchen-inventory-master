import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ShoppingCart, PackageCheck, Info } from "lucide-react";

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

  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({});
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        if (daily && daily > 0) days_coverage = stock / daily;
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

  // Apply overrides
  const effectiveSuggestions = useMemo(() => {
    return suggestions.map((s) => {
      const qty = qtyOverrides[s.product_id] ?? s.suggested_qty;
      const overrideId = supplierOverrides[s.product_id];
      let result = { ...s, suggested_qty: qty };
      if (overrideId && overrideId !== s.supplier_id) {
        const found = s.available_suppliers.find((sup) => sup.id === overrideId);
        if (found) {
          result = { ...result, supplier_id: found.id, supplier_name: found.name, last_unit_cost: found.last_unit_cost };
        } else {
          const globalSup = allSuppliers?.find((sup) => sup.id === overrideId);
          if (globalSup) {
            result = { ...result, supplier_id: globalSup.id, supplier_name: globalSup.name, last_unit_cost: null };
          }
        }
      }
      return result;
    });
  }, [suggestions, supplierOverrides, qtyOverrides, allSuppliers]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === effectiveSuggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(effectiveSuggestions.map((s) => s.product_id)));
    }
  };

  const allSelected = effectiveSuggestions.length > 0 && selected.size === effectiveSuggestions.length;

  // Selected items grouped by supplier for preview
  const selectedGroups = useMemo(() => {
    const items = effectiveSuggestions.filter((s) => selected.has(s.product_id));
    const map = new Map<string, { supplier_id: string; supplier_name: string; items: SuggestedItem[] }>();
    const noSupplier: SuggestedItem[] = [];
    items.forEach((s) => {
      if (!s.supplier_id) {
        noSupplier.push(s);
        return;
      }
      if (!map.has(s.supplier_id)) map.set(s.supplier_id, { supplier_id: s.supplier_id, supplier_name: s.supplier_name || "Sin nombre", items: [] });
      map.get(s.supplier_id)!.items.push(s);
    });
    const groups = Array.from(map.values());
    return { valid: groups, invalid: noSupplier };
  }, [effectiveSuggestions, selected]);

  const generateOrders = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin contexto");
      const groups = selectedGroups.valid;
      if (!groups.length) throw new Error("No hay productos con proveedor seleccionados");
      const createdIds: string[] = [];
      for (const group of groups) {
        const { data: order, error } = await supabase
          .from("purchase_orders")
          .insert({
            restaurant_id: restaurantId,
            supplier_id: group.supplier_id,
            order_date: new Date().toISOString().slice(0, 10),
            created_by: user.id,
            order_number: '',  // auto-generated by DB trigger
          } as any)
          .select("id, order_number")
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
        createdIds.push(order.id);
      }
      return createdIds;
    },
    onSuccess: (ids) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setSelected(new Set());
      setQtyOverrides({});
      setSupplierOverrides({});
      toast({ title: `${ids.length} pedido(s) creado(s) exitosamente` });
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

  const hasInvalidSelected = selectedGroups.invalid.length > 0;
  const validSelectedCount = selectedGroups.valid.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      {canCreate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selected.size}</span> de{" "}
                <span className="font-medium text-foreground">{effectiveSuggestions.length}</span> productos seleccionados
                {selected.size > 0 && selectedGroups.valid.length > 0 && (
                  <span className="ml-2">
                    → <span className="font-semibold text-primary">{selectedGroups.valid.length} pedido(s)</span> para:{" "}
                    {selectedGroups.valid.map((g) => g.supplier_name).join(", ")}
                  </span>
                )}
              </div>
              <Button
                onClick={() => generateOrders.mutate()}
                disabled={validSelectedCount === 0 || generateOrders.isPending}
              >
                <ShoppingCart className="h-4 w-4 mr-1" />
                {generateOrders.isPending ? "Generando..." : `Generar pedidos (${selectedGroups.valid.length})`}
              </Button>
            </div>
            {hasInvalidSelected && (
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                <Info className="h-3.5 w-3.5" />
                {selectedGroups.invalid.length} producto(s) sin proveedor no serán incluidos. Asigne un proveedor primero.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Productos que necesitan reposición
            <Badge variant="secondary">{effectiveSuggestions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canCreate && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={selectAll}
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                )}
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Stock actual</TableHead>
                <TableHead className="text-right">Stock mín.</TableHead>
                <TableHead className="text-right w-28">Cant. sugerida</TableHead>
                <TableHead className="w-48">Proveedor</TableHead>
                <TableHead className="text-right">Últ. Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {effectiveSuggestions.map((item) => {
                const isSelected = selected.has(item.product_id);
                const supplierOptions = item.available_suppliers.length > 0 ? item.available_suppliers : [];
                const hasMultiple = supplierOptions.length > 1 || (allSuppliers && allSuppliers.length > 0);
                const noSupplier = !item.supplier_id && !supplierOverrides[item.product_id];

                return (
                  <TableRow key={item.product_id} className={isSelected ? "bg-primary/5" : ""}>
                    {canCreate && (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.product_id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {item.product_name}{" "}
                      <span className="text-muted-foreground text-xs">({item.unit})</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={item.current_stock < item.min_stock ? "text-destructive font-semibold" : ""}>
                        {item.current_stock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{item.min_stock}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={qtyOverrides[item.product_id] ?? item.suggested_qty}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setQtyOverrides((prev) => ({ ...prev, [item.product_id]: val > 0 ? val : 0 }));
                        }}
                        className="h-8 w-24 text-right ml-auto"
                      />
                    </TableCell>
                    <TableCell>
                      {canCreate && hasMultiple ? (
                        <SearchableSelect
                          options={[
                            ...supplierOptions.map((sup) => ({
                              value: sup.id,
                              label: `${sup.name}${sup.last_unit_cost != null ? ` ($${sup.last_unit_cost.toFixed(2)})` : ""}`,
                            })),
                            ...(allSuppliers
                              ?.filter((s) => !supplierOptions.some((so) => so.id === s.id))
                              .map((s) => ({ value: s.id, label: s.name })) ?? []),
                          ]}
                          value={supplierOverrides[item.product_id] || item.supplier_id || ""}
                          onValueChange={(v) => setSupplierOverrides((prev) => ({ ...prev, [item.product_id]: v }))}
                          placeholder="Sin proveedor"
                          searchPlaceholder="Buscar proveedor..."
                          triggerClassName={`h-8 w-44 ${noSupplier ? "border-amber-400" : ""}`}
                        />
                      ) : (
                        <span className={`text-sm ${noSupplier ? "text-amber-600 italic" : ""}`}>
                          {item.supplier_name || "Sin proveedor"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.last_unit_cost != null ? `$${item.last_unit_cost.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
