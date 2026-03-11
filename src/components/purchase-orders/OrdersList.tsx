import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Send, PackageCheck, Trash2, FileText, XCircle, Plus, Download, Eye } from "lucide-react";
import { generatePurchaseOrderPdf, PdfOrderData, PdfSettings } from "./generatePurchaseOrderPdf";
import { usePdfSettings } from "@/hooks/use-pdf-settings";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import NewOrderDialog from "./NewOrderDialog";

export default function OrdersList() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("purchase_orders_create");
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { data: pdfSettings } = usePdfSettings();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers!inner(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch item counts and totals for all orders
  const { data: orderStats } = useQuery({
    queryKey: ["purchase-order-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("purchase_order_id, quantity, unit_cost");
      if (error) throw error;
      const map = new Map<string, { count: number; total: number }>();
      (data as any[]).forEach((item) => {
        const key = item.purchase_order_id;
        if (!map.has(key)) map.set(key, { count: 0, total: 0 });
        const entry = map.get(key)!;
        entry.count += 1;
        entry.total += Number(item.quantity) * (item.unit_cost ? Number(item.unit_cost) : 0);
      });
      return map;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["purchase-order-items", viewOrder?.id],
    queryFn: async () => {
      if (!viewOrder) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("*, products!inner(name, unit)")
        .eq("purchase_order_id", viewOrder.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!viewOrder,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
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
      // Delete items first
      await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id);
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-order-stats"] });
      toast({ title: "Pedido eliminado" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handlePdf = async (order: any, action: "download" | "preview") => {
    // Fetch supplier details
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name, nit, phone, email, notes")
      .eq("id", order.supplier_id)
      .single();

    // Fetch items
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*, products!inner(name, unit)")
      .eq("purchase_order_id", order.id);

    const pdfOrder: PdfOrderData = {
      order_id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date,
      supplier_name: supplier?.name || order.suppliers?.name || "",
      supplier_nit: supplier?.nit,
      supplier_phone: supplier?.phone,
      supplier_email: supplier?.email,
      notes: order.notes,
      items: (items || []).map((it: any) => ({
        name: it.products?.name || "",
        unit: it.products?.unit || "",
        quantity: Number(it.quantity),
        unit_cost: it.unit_cost != null ? Number(it.unit_cost) : null,
      })),
    };

    await generatePurchaseOrderPdf(pdfSettings || {}, pdfOrder, action);
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "draft": return <Badge variant="secondary">Borrador</Badge>;
      case "sent": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Enviado</Badge>;
      case "received": return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Recibido</Badge>;
      case "cancelled": return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Cancelado</Badge>;
      default: return <Badge>{s}</Badge>;
    }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        {canCreate && (
          <Button onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Pedido
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N.º Orden</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead className="text-right">Costo estimado</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : !orders?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin pedidos</TableCell></TableRow>
              ) : orders.map((o: any) => {
                const stats = orderStats?.get(o.id);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">{o.order_number || o.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell>{format(new Date(o.order_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium">{(o as any).suppliers?.name}</TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                    <TableCell className="text-right">{stats?.count ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {stats?.total != null ? `$${stats.total.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setViewOrder(o)} title="Ver detalle">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handlePdf(o, "download")} title="Descargar PDF">
                          <Download className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handlePdf(o, "preview")} title="Vista previa PDF">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        {o.status === "draft" && canCreate && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "sent" })} title="Marcar enviado">
                              <Send className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "cancelled" })} title="Cancelar">
                              <XCircle className="h-4 w-4 text-amber-500" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(o.id)} title="Eliminar">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {o.status === "sent" && canCreate && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "received" })} title="Marcar recibido">
                              <PackageCheck className="h-4 w-4 text-emerald-500" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => updateStatus.mutate({ id: o.id, status: "cancelled" })} title="Cancelar">
                              <XCircle className="h-4 w-4 text-amber-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View order detail */}
      <Dialog open={!!viewOrder} onOpenChange={(v) => !v && setViewOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <span className="font-mono text-primary">{viewOrder?.order_number}</span> — {viewOrder && (viewOrder as any).suppliers?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Fecha: {viewOrder && format(new Date(viewOrder.order_date), "dd/MM/yyyy")} · {viewOrder && statusBadge(viewOrder.status)}
          </div>
          {viewOrder?.notes && (
            <p className="text-sm text-muted-foreground italic mb-2">Notas: {viewOrder.notes}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.products?.name} <span className="text-muted-foreground text-xs">({item.products?.unit})</span></TableCell>
                  <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                  <TableCell className="text-right">{item.unit_cost != null ? `$${Number(item.unit_cost).toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {item.unit_cost != null ? `$${(Number(item.quantity) * Number(item.unit_cost)).toFixed(2)}` : "—"}
                  </TableCell>
                </TableRow>
              )) || (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {orderItems && orderItems.length > 0 && (
            <div className="text-right text-sm font-semibold mt-2">
              Total: <span className="text-primary">
                ${orderItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) * (item.unit_cost ? Number(item.unit_cost) : 0)), 0).toFixed(2)}
              </span>
            </div>
          )}
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

      <NewOrderDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </>
  );
}
