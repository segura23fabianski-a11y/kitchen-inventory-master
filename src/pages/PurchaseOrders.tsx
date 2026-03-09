import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ShoppingCart, Send, PackageCheck, Pencil, Trash2, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

// ---- Suggested purchases tab ----

interface SuggestedItem {
  product_id: string;
  product_name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  suggested_qty: number;
  supplier_id: string | null;
  supplier_name: string | null;
  last_unit_cost: number | null;
}

function SuggestedPurchases() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("purchase_orders_create");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products-low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, min_stock")
        .order("name");
      if (error) throw error;
      return data.filter((p) => p.current_stock <= p.min_stock);
    },
  });

  const { data: productSuppliers } = useQuery({
    queryKey: ["product-suppliers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_suppliers" as any)
        .select("*, suppliers!inner(name)" as any);
      if (error) throw error;
      return data as any[];
    },
  });

  const suggestions: SuggestedItem[] = useMemo(() => {
    if (!products) return [];
    return products.map((p) => {
      const ps = productSuppliers?.find((r: any) => r.product_id === p.id && r.is_primary);
      const fallback = !ps ? productSuppliers?.find((r: any) => r.product_id === p.id) : null;
      const supplier = ps || fallback;
      return {
        product_id: p.id,
        product_name: p.name,
        unit: p.unit,
        current_stock: Number(p.current_stock),
        min_stock: Number(p.min_stock),
        suggested_qty: Math.max(Number(p.min_stock) - Number(p.current_stock), 0),
        supplier_id: supplier?.supplier_id || null,
        supplier_name: supplier ? (supplier as any).suppliers?.name : null,
        last_unit_cost: supplier?.last_unit_cost ? Number(supplier.last_unit_cost) : null,
      };
    });
  }, [products, productSuppliers]);

  const grouped = useMemo(() => {
    const map = new Map<string, { supplier_id: string; supplier_name: string; items: SuggestedItem[] }>();
    const noSupplier: SuggestedItem[] = [];
    suggestions.forEach((s) => {
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
  }, [suggestions]);

  const generateOrder = useMutation({
    mutationFn: async (group: { supplier_id: string; items: SuggestedItem[] }) => {
      if (!restaurantId || !user) throw new Error("Sin contexto");
      const { data: order, error } = await supabase
        .from("purchase_orders" as any)
        .insert({
          restaurant_id: restaurantId,
          supplier_id: group.supplier_id,
          order_date: new Date().toISOString().slice(0, 10),
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      const items = group.items.map((item) => ({
        restaurant_id: restaurantId,
        purchase_order_id: (order as any).id,
        product_id: item.product_id,
        quantity: item.suggested_qty,
        unit_cost: item.last_unit_cost,
      }));
      const { error: itemErr } = await supabase.from("purchase_order_items" as any).insert(items as any);
      if (itemErr) throw itemErr;
      await logAudit({
        entityType: "purchase_order",
        entityId: (order as any).id,
        action: "CREATE",
        after: { supplier_id: group.supplier_id, items_count: items.length },
        metadata: { source: "suggested_purchases" },
      });
      return (order as any).id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Pedido de compra generado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!suggestions.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <PackageCheck className="mx-auto h-12 w-12 mb-3 text-primary/30" />
          <p className="text-lg font-medium">¡Todo en orden!</p>
          <p className="text-sm">No hay productos por debajo del stock mínimo.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
                  <TableHead className="text-right">Stock Actual</TableHead>
                  <TableHead className="text-right">Stock Mín.</TableHead>
                  <TableHead className="text-right">Cant. Sugerida</TableHead>
                  <TableHead className="text-right">Últ. Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((item) => (
                  <TableRow key={item.product_id}>
                    <TableCell className="font-medium">{item.product_name} <span className="text-muted-foreground text-xs">({item.unit})</span></TableCell>
                    <TableCell className="text-right text-destructive font-semibold">{item.current_stock}</TableCell>
                    <TableCell className="text-right">{item.min_stock}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">{item.suggested_qty}</TableCell>
                    <TableCell className="text-right">{item.last_unit_cost != null ? `$${item.last_unit_cost.toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---- Orders list tab ----

function OrdersList() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("purchase_orders_create");
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders" as any)
        .select("*, suppliers!inner(name)" as any)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["purchase-order-items", viewOrder?.id],
    queryFn: async () => {
      if (!viewOrder) return [];
      const { data, error } = await supabase
        .from("purchase_order_items" as any)
        .select("*, products!inner(name, unit)" as any)
        .eq("purchase_order_id", viewOrder.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!viewOrder,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchase_orders" as any).update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Pedido eliminado" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusBadge = (s: string) => {
    switch (s) {
      case "draft": return <Badge variant="secondary">Borrador</Badge>;
      case "sent": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Enviado</Badge>;
      case "received": return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Recibido</Badge>;
      default: return <Badge>{s}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : !orders?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin pedidos</TableCell></TableRow>
              ) : orders.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>{format(new Date(o.order_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-medium">{(o as any).suppliers?.name}</TableCell>
                  <TableCell>{statusBadge(o.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewOrder(o)} title="Ver detalle">
                        <FileText className="h-4 w-4" />
                      </Button>
                      {o.status === "draft" && canCreate && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "sent" })} title="Marcar enviado">
                            <Send className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(o.id)} title="Eliminar">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {o.status === "sent" && canCreate && (
                        <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "received" })} title="Marcar recibido">
                          <PackageCheck className="h-4 w-4 text-emerald-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View order detail */}
      <Dialog open={!!viewOrder} onOpenChange={(v) => !v && setViewOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedido — {viewOrder && (viewOrder as any).suppliers?.name}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Fecha: {viewOrder && format(new Date(viewOrder.order_date), "dd/MM/yyyy")} · {viewOrder && statusBadge(viewOrder.status)}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.products?.name} <span className="text-muted-foreground text-xs">({item.products?.unit})</span></TableCell>
                  <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                  <TableCell className="text-right">{item.unit_cost != null ? `$${Number(item.unit_cost).toFixed(2)}` : "—"}</TableCell>
                </TableRow>
              )) || (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pedido?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteOrder.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Main page ----

export default function PurchaseOrders() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos de Compra</h1>
          <p className="text-muted-foreground text-sm">Sugeridos de reposición y pedidos a proveedores.</p>
        </div>
        <Tabs defaultValue="suggestions">
          <TabsList>
            <TabsTrigger value="suggestions">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Sugeridos
            </TabsTrigger>
            <TabsTrigger value="orders">
              <ShoppingCart className="h-4 w-4 mr-1" />
              Pedidos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="suggestions" className="mt-4">
            <SuggestedPurchases />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <OrdersList />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
