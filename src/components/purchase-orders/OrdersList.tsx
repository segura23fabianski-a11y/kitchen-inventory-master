import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Send, PackageCheck, Trash2, FileText, XCircle, Plus, Download, Eye, Receipt, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generatePurchaseOrderPdf, PdfOrderData, PdfSettings } from "./generatePurchaseOrderPdf";
import { usePdfSettings } from "@/hooks/use-pdf-settings";
import { useAuth } from "@/lib/auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import NewOrderDialog from "./NewOrderDialog";
import { formatCOP } from "@/lib/utils";

export default function OrdersList() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("purchase_orders_create");
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const { data: pdfSettings } = usePdfSettings();

  // Convert to invoice state
  const [convertOrder, setConvertOrder] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [allComplete, setAllComplete] = useState(false);

  // Products for the convert dialog product selector
  const { data: allProducts } = useQuery({
    queryKey: ["products-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, last_unit_cost")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

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

  // Open convert dialog — fetch order items
  const openConvertDialog = async (order: any) => {
    const { data: items, error } = await supabase
      .from("purchase_order_items")
      .select("*, products!inner(name, unit)")
      .eq("purchase_order_id", order.id);
    if (error) {
      toast({ title: "Error cargando items", description: error.message, variant: "destructive" });
      return;
    }
    setInvoiceItems(
      (items || []).map((it: any) => ({
        product_id: it.product_id,
        product_name: it.products?.name || "",
        product_unit: it.products?.unit || "",
        quantity_ordered: Number(it.quantity),
        quantity_received: Number(it.quantity),
        unit_cost: it.unit_cost != null ? Number(it.unit_cost) : 0,
      }))
    );
    setInvoiceNumber("");
    setAllComplete(true);
    setConvertOrder(order);
  };

  // Toggle all complete
  const handleAllComplete = (checked: boolean) => {
    setAllComplete(checked);
    if (checked) {
      setInvoiceItems((prev) =>
        prev.map((it) => ({ ...it, quantity_received: it.quantity_ordered }))
      );
    }
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    setInvoiceItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
    if (field === "quantity_received") setAllComplete(false);
  };

  const changeInvoiceProduct = (index: number, productId: string) => {
    const prod = allProducts?.find((p: any) => p.id === productId);
    if (!prod) return;
    setInvoiceItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product_id: prod.id,
        product_name: prod.name,
        product_unit: prod.unit,
        unit_cost: prod.last_unit_cost ?? copy[index].unit_cost,
      };
      return copy;
    });
  };

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addInvoiceItem = () => {
    setInvoiceItems((prev) => [
      ...prev,
      {
        product_id: "",
        product_name: "",
        product_unit: "",
        quantity_ordered: 0,
        quantity_received: 0,
        unit_cost: 0,
      },
    ]);
  };

  const invoiceTotal = invoiceItems.reduce(
    (sum, it) => sum + Number(it.quantity_received || 0) * Number(it.unit_cost || 0),
    0
  );
  const hasValidItems = invoiceItems.some((it) => Number(it.quantity_received) > 0 && !!it.product_id);

  const convertToInvoice = useMutation({
    mutationFn: async () => {
      if (!convertOrder || !user) throw new Error("Datos incompletos");
      if (!invoiceNumber.trim()) throw new Error("Ingrese el número de factura");

      const { data: invoice, error: invErr } = await supabase
        .from("purchase_invoices" as any)
        .insert({
          restaurant_id: convertOrder.restaurant_id,
          invoice_number: invoiceNumber.trim(),
          supplier_name: (convertOrder as any).suppliers?.name,
          supplier_id: convertOrder.supplier_id,
          invoice_date: new Date().toISOString().split("T")[0],
          status: "draft",
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (invErr) throw invErr;

      const items = invoiceItems
        .filter((i) => Number(i.quantity_received) > 0)
        .map((i) => ({
          restaurant_id: convertOrder.restaurant_id,
          invoice_id: (invoice as any).id,
          product_id: i.product_id,
          quantity: Number(i.quantity_received),
          unit_cost: Number(i.unit_cost),
          line_total: Number(i.quantity_received) * Number(i.unit_cost),
        }));

      const { error: itemsErr } = await supabase
        .from("purchase_invoice_items" as any)
        .insert(items as any);
      if (itemsErr) throw itemsErr;

      // Mark order as received if it wasn't
      if (convertOrder.status !== "received") {
        await supabase
          .from("purchase_orders")
          .update({ status: "received" })
          .eq("id", convertOrder.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      setConvertOrder(null);
      setInvoiceNumber("");
      setInvoiceItems([]);
      setAllComplete(false);
      toast({ title: "Factura creada correctamente", description: "Puedes verla en el módulo de Facturas de Compra" });
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
                <TableHead className="w-44" />
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
                      {stats?.total != null ? `{formatCOP(stats.total, 2)}` : "—"}
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
                        {/* Convert to invoice button for sent/received */}
                        {(o.status === "sent" || o.status === "received") && canCreate && (
                          <Button size="icon" variant="ghost" onClick={() => openConvertDialog(o)} title="Convertir a Factura">
                            <Receipt className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
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
                        {o.status !== "draft" && isAdmin && (
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(o.id)} title="Eliminar (Admin)">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
                  <TableCell className="text-right">{item.unit_cost != null ? `{formatCOP(Number(item.unit_cost), 2)}` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {item.unit_cost != null ? `{formatCOP((Number(item.quantity) * Number(item.unit_cost)), 2)}` : "—"}
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

      {/* Convert to Invoice Dialog */}
      <Dialog open={!!convertOrder} onOpenChange={(v) => { if (!v) { setConvertOrder(null); setInvoiceItems([]); setInvoiceNumber(""); setAllComplete(false); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              Convertir Pedido a Factura
            </DialogTitle>
          </DialogHeader>
          {convertOrder && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Pedido <span className="font-mono font-semibold text-primary">{convertOrder.order_number}</span> — {(convertOrder as any).suppliers?.name}
              </div>

              {/* Invoice number */}
              <div>
                <Label>Número de Factura del Proveedor *</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ej: FAC-001234"
                  className="mt-1"
                />
              </div>

              {/* All complete checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-complete"
                  checked={allComplete}
                  onCheckedChange={(checked) => handleAllComplete(!!checked)}
                />
                <Label htmlFor="all-complete" className="cursor-pointer text-sm">
                  Todo llegó completo (llenar cantidades con lo pedido)
                </Label>
              </div>

              {/* Editable items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right w-20">Pedido</TableHead>
                    <TableHead className="text-right w-28">Recibido</TableHead>
                    <TableHead className="text-right w-28">Precio Unit.</TableHead>
                    <TableHead className="text-right w-24">Subtotal</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceItems.map((item, idx) => {
                    const subtotal = Number(item.quantity_received || 0) * Number(item.unit_cost || 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="p-2">
                          <Select
                            value={item.product_id || ""}
                            onValueChange={(val) => changeInvoiceProduct(idx, val)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Seleccionar producto">
                                {item.product_name
                                  ? `${item.product_name} (${item.product_unit})`
                                  : "Seleccionar producto"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {allProducts?.map((p: any) => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                  {p.name} <span className="text-muted-foreground">({p.unit})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs p-2">
                          {item.quantity_ordered || "—"}
                        </TableCell>
                        <TableCell className="text-right p-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity_received}
                            onChange={(e) => updateInvoiceItem(idx, "quantity_received", Number(e.target.value))}
                            className="h-8 w-24 text-right ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right p-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unit_cost}
                            onChange={(e) => updateInvoiceItem(idx, "unit_cost", Number(e.target.value))}
                            className="h-8 w-24 text-right ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium p-2">
                          ${subtotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="p-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeInvoiceItem(idx)}
                            title="Quitar línea"
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Add item button */}
              <Button variant="outline" size="sm" onClick={addInvoiceItem} className="mt-1">
                <Plus className="h-4 w-4 mr-1" />
                Agregar producto
              </Button>

              {/* Total */}
              <div className="text-right text-sm font-semibold border-t pt-2">
                Total Factura: <span className="text-primary text-base">${invoiceTotal.toFixed(2)}</span>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setConvertOrder(null); setInvoiceItems([]); setInvoiceNumber(""); setAllComplete(false); }}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => convertToInvoice.mutate()}
                  disabled={!invoiceNumber.trim() || !hasValidItems || convertToInvoice.isPending}
                >
                  <Receipt className="h-4 w-4 mr-1" />
                  {convertToInvoice.isPending ? "Creando..." : "Crear Factura"}
                </Button>
              </DialogFooter>
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
