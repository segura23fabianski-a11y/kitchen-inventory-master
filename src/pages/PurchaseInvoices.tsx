import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { UnitSelector } from "@/components/UnitSelector";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check, ChevronsUpDown, Search, CalendarIcon, FileText, Trash2, Send, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Invoice = {
  id: string;
  restaurant_id: string;
  invoice_number: string;
  supplier_name: string | null;
  invoice_date: string;
  received_date: string;
  status: string;
  total_amount: number;
  created_by: string;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  restaurant_id: string;
};

type DraftItem = {
  tempId: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  input_unit: string;
  quantity: string;
  unit_cost: string;
};

export default function PurchaseInvoices() {
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [postConfirmId, setPostConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);

  // Add item state
  const [addProductId, setAddProductId] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [addUnitCost, setAddUnitCost] = useState("");
  const [addInputUnit, setAddInputUnit] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);

  const { user } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canView = hasPermission("purchases");
  const canCreate = hasPermission("purchases_create");
  const canPost = hasPermission("purchases_post");
  const canDelete = hasPermission("purchases_delete");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["purchase-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
    enabled: !!restaurantId,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, barcode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: viewItems } = useQuery({
    queryKey: ["invoice-items", viewingInvoice?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items" as any)
        .select("*")
        .eq("invoice_id", viewingInvoice!.id);
      if (error) throw error;
      return data as unknown as InvoiceItem[];
    },
    enabled: !!viewingInvoice,
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

  const filtered = invoices?.filter((inv) => {
    const matchSearch = !search || inv.invoice_number.toLowerCase().includes(search.toLowerCase()) || inv.supplier_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const resetForm = () => {
    setInvoiceNumber("");
    setSupplierName("");
    setInvoiceDate(new Date());
    setItems([]);
    setAddProductId("");
    setAddQuantity("");
    setAddUnitCost("");
    setAddInputUnit("");
    setEditingInvoice(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditForm = async (inv: Invoice) => {
    if (inv.status === "posted") return;
    setEditingInvoice(inv);
    setInvoiceNumber(inv.invoice_number);
    setSupplierName(inv.supplier_name ?? "");
    setInvoiceDate(new Date(inv.invoice_date + "T12:00:00"));

    // Load existing items
    const { data } = await supabase
      .from("purchase_invoice_items" as any)
      .select("*")
      .eq("invoice_id", inv.id);
    
    const existingItems: DraftItem[] = ((data as unknown as InvoiceItem[]) ?? []).map((it) => {
      const prod = products?.find((p) => p.id === it.product_id);
      return {
        tempId: it.id,
        product_id: it.product_id,
        product_name: prod?.name ?? "?",
        product_unit: prod?.unit ?? "",
        input_unit: prod?.unit ?? "",
        quantity: String(it.quantity),
        unit_cost: String(it.unit_cost),
      };
    });
    setItems(existingItems);
    setFormOpen(true);
  };

  const addItemToList = () => {
    if (!addProductId || !addQuantity || !addUnitCost) return;
    if (Number(addQuantity) <= 0 || Number(addUnitCost) <= 0) {
      toast({ title: "Cantidad y costo deben ser > 0", variant: "destructive" });
      return;
    }
    const prod = products?.find((p) => p.id === addProductId);
    if (!prod) return;
    // Check duplicate product
    if (items.some((i) => i.product_id === addProductId)) {
      toast({ title: "Producto ya agregado", description: "Edita la cantidad en la línea existente.", variant: "destructive" });
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        product_id: addProductId,
        product_name: prod.name,
        product_unit: prod.unit,
        input_unit: addInputUnit || prod.unit,
        quantity: addQuantity,
        unit_cost: addUnitCost,
      },
    ]);
    setAddProductId("");
    setAddQuantity("");
    setAddUnitCost("");
  };

  const removeItem = (tempId: string) => setItems((prev) => prev.filter((i) => i.tempId !== tempId));

  const formTotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0);

  const saveInvoice = useMutation({
    mutationFn: async () => {
      if (!invoiceNumber.trim()) throw new Error("Número de factura requerido");
      if (items.length === 0) throw new Error("Agrega al menos un producto");

      if (editingInvoice) {
        // Update header
        const { error: hErr } = await supabase
          .from("purchase_invoices" as any)
          .update({
            invoice_number: invoiceNumber.trim(),
            supplier_name: supplierName.trim() || null,
            invoice_date: format(invoiceDate, "yyyy-MM-dd"),
          } as any)
          .eq("id", editingInvoice.id);
        if (hErr) throw hErr;

        // Delete old items, insert new
        await supabase.from("purchase_invoice_items" as any).delete().eq("invoice_id", editingInvoice.id);
        const itemRows = items.map((i) => ({
          invoice_id: editingInvoice.id,
          restaurant_id: restaurantId!,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost),
        }));
        const { error: iErr } = await supabase.from("purchase_invoice_items" as any).insert(itemRows as any);
        if (iErr) throw iErr;

        await logAudit({
          entityType: "purchase_invoice",
          entityId: editingInvoice.id,
          action: "UPDATE",
          after: { invoice_number: invoiceNumber, items: items.length, total: formTotal },
          metadata: { invoice_number: invoiceNumber, total_amount: formTotal },
        });
      } else {
        // Create header
        const { data: inv, error: hErr } = await supabase
          .from("purchase_invoices" as any)
          .insert({
            restaurant_id: restaurantId!,
            invoice_number: invoiceNumber.trim(),
            supplier_name: supplierName.trim() || null,
            invoice_date: format(invoiceDate, "yyyy-MM-dd"),
            created_by: user!.id,
          } as any)
          .select("id")
          .single();
        if (hErr) throw hErr;

        const newInv = inv as unknown as { id: string };
        const itemRows = items.map((i) => ({
          invoice_id: newInv.id,
          restaurant_id: restaurantId!,
          product_id: i.product_id,
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost),
        }));
        const { error: iErr } = await supabase.from("purchase_invoice_items" as any).insert(itemRows as any);
        if (iErr) throw iErr;

        await logAudit({
          entityType: "purchase_invoice",
          entityId: newInv.id,
          action: "CREATE",
          after: { invoice_number: invoiceNumber, items: items.length, total: formTotal },
          metadata: { invoice_number: invoiceNumber, total_amount: formTotal },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      setFormOpen(false);
      resetForm();
      toast({ title: editingInvoice ? "Factura actualizada" : "Factura guardada como borrador" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const postInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      // 1) Get invoice
      const { data: inv, error: invErr } = await supabase
        .from("purchase_invoices" as any)
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;
      const invoice = inv as unknown as Invoice;
      if (invoice.status === "posted") throw new Error("Esta factura ya fue posteada");
      if (invoice.posted_at) throw new Error("Esta factura ya fue posteada");

      // 2) Get items
      const { data: itemsData, error: itemsErr } = await supabase
        .from("purchase_invoice_items" as any)
        .select("*")
        .eq("invoice_id", invoiceId);
      if (itemsErr) throw itemsErr;
      const invoiceItems = itemsData as unknown as InvoiceItem[];
      if (!invoiceItems.length) throw new Error("La factura no tiene ítems");

      // 3) Snapshot product costs BEFORE movements
      const productIds = [...new Set(invoiceItems.map((i) => i.product_id))];
      const { data: productsBefore } = await supabase
        .from("products")
        .select("id, average_cost, last_unit_cost, current_stock")
        .in("id", productIds);
      const beforeMap = new Map((productsBefore ?? []).map((p) => [p.id, { average_cost: Number(p.average_cost), last_unit_cost: Number((p as any).last_unit_cost ?? 0), current_stock: Number(p.current_stock) }]));

      // 4) Create inventory_movements for each item
      const movements = invoiceItems.map((item) => ({
        product_id: item.product_id,
        user_id: user!.id,
        type: "entrada",
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.line_total,
        notes: `Factura: ${invoice.invoice_number}`,
        restaurant_id: invoice.restaurant_id,
        movement_date: invoice.invoice_date + "T12:00:00.000Z",
      }));

      const { error: movErr } = await supabase.from("inventory_movements").insert(movements);
      if (movErr) throw movErr;

      // 5) Update invoice status
      const { error: upErr } = await supabase
        .from("purchase_invoices" as any)
        .update({
          status: "posted",
          posted_by: user!.id,
          posted_at: new Date().toISOString(),
        } as any)
        .eq("id", invoiceId);
      if (upErr) throw upErr;

      // 6) Snapshot product costs AFTER and audit cost changes
      const { data: productsAfter } = await supabase
        .from("products")
        .select("id, average_cost, last_unit_cost")
        .in("id", productIds);
      const afterMap = new Map((productsAfter ?? []).map((p) => [p.id, { average_cost: Number(p.average_cost), last_unit_cost: Number((p as any).last_unit_cost ?? 0) }]));

      for (const item of invoiceItems) {
        const before = beforeMap.get(item.product_id);
        const after = afterMap.get(item.product_id);
        if (before && after && (before.average_cost !== after.average_cost || before.last_unit_cost !== after.last_unit_cost)) {
          await logAudit({
            entityType: "product",
            entityId: item.product_id,
            action: "COST_CHANGE",
            before: { average_cost: before.average_cost, last_unit_cost: before.last_unit_cost },
            after: { average_cost: after.average_cost, last_unit_cost: after.last_unit_cost },
            canRollback: false,
            metadata: {
              trigger: "INVOICE_COST_APPLIED",
              invoice_id: invoiceId,
              invoice_number: invoice.invoice_number,
              quantity: item.quantity,
              unit_cost: item.unit_cost,
            },
          });
        }
      }

      // 7) Audit invoice posting
      await logAudit({
        entityType: "purchase_invoice",
        entityId: invoiceId,
        action: "UPDATE",
        after: { status: "posted", items: invoiceItems.length, total: invoice.total_amount },
        metadata: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount, action: "POST_INVOICE" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setPostConfirmId(null);
      toast({ title: "Factura posteada", description: "Las entradas de inventario fueron generadas exitosamente." });
    },
    onError: (e: any) => {
      setPostConfirmId(null);
      toast({ title: "Error al postear", description: e.message, variant: "destructive" });
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.from("purchase_invoices" as any).delete().eq("id", invoiceId);
      if (error) throw error;
      await logAudit({ entityType: "purchase_invoice", entityId: invoiceId, action: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      setDeleteConfirmId(null);
      toast({ title: "Factura eliminada" });
    },
    onError: (e: any) => {
      setDeleteConfirmId(null);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSelectProduct = (id: string) => {
    setAddProductId(id);
    const prod = products?.find((p) => p.id === id);
    if (prod) setAddUnitCost(String(prod.average_cost || ""));
    setProductPopoverOpen(false);
    // Focus quantity field after a tick
    setTimeout(() => {
      const qtyInput = document.querySelector<HTMLInputElement>('[data-product-qty-input]');
      qtyInput?.focus();
      qtyInput?.click();
    }, 50);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Facturas de Compra</h1>
            <p className="text-muted-foreground">Gestión de entradas de inventario por factura</p>
          </div>
          {canCreate && (
            <Button onClick={openNewForm}>
              <Plus className="mr-2 h-4 w-4" /> Nueva Factura
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput className="pl-10" placeholder="Buscar por número o proveedor..." value={search} onChange={setSearch} keyboardLabel="Buscar factura" inputType="search" />
              </div>
              <div className="flex gap-2">
                {["all", "draft", "posted"].map((s) => (
                  <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
                    {s === "all" ? "Todos" : s === "draft" ? "Borrador" : "Posteada"}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Factura</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha Factura</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !filtered?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay facturas</TableCell></TableRow>
                ) : (
                  filtered.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.supplier_name || "—"}</TableCell>
                      <TableCell>{format(new Date(inv.invoice_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right font-mono">${Number(inv.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        {inv.status === "draft" ? (
                          <Badge variant="secondary">Borrador</Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">Posteada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profileMap.get(inv.created_by) || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewingInvoice(inv)} title="Ver detalle">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {inv.status === "draft" && canCreate && (
                            <Button variant="ghost" size="icon" onClick={() => openEditForm(inv)} title="Editar">
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.status === "draft" && canPost && (
                            <Button variant="ghost" size="icon" onClick={() => setPostConfirmId(inv.id)} title="Postear" className="text-success">
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.status === "draft" && canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(inv.id)} title="Eliminar" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* View Detail Dialog */}
      <Dialog open={!!viewingInvoice} onOpenChange={(v) => !v && setViewingInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Factura {viewingInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {viewingInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Proveedor:</span> {viewingInvoice.supplier_name || "—"}</div>
                <div><span className="text-muted-foreground">Fecha:</span> {format(new Date(viewingInvoice.invoice_date + "T12:00:00"), "dd/MM/yyyy")}</div>
                <div><span className="text-muted-foreground">Estado:</span> {viewingInvoice.status === "posted" ? "Posteada" : "Borrador"}</div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold">${Number(viewingInvoice.total_amount).toFixed(2)}</span></div>
                {viewingInvoice.posted_at && (
                  <div><span className="text-muted-foreground">Posteada:</span> {format(new Date(viewingInvoice.posted_at), "dd/MM/yyyy HH:mm")}</div>
                )}
                {viewingInvoice.posted_by && (
                  <div><span className="text-muted-foreground">Posteada por:</span> {profileMap.get(viewingInvoice.posted_by) || "—"}</div>
                )}
              </div>
              {viewingInvoice.status === "posted" && (
                <div className="rounded-md bg-success/10 border border-success/30 p-3 text-sm text-success flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span>Costos aplicados al inventario — los productos fueron actualizados con el costo unitario de esta factura.</span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Total Línea</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewItems?.map((item) => {
                    const prod = products?.find((p) => p.id === item.product_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{prod?.name ?? "?"} <span className="text-xs text-muted-foreground">({prod?.unit})</span></TableCell>
                        <TableCell className="text-right font-mono">{Number(item.quantity)}</TableCell>
                        <TableCell className="text-right font-mono">${Number(item.unit_cost).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-medium">${Number(item.line_total).toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) { setFormOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingInvoice ? "Editar Factura" : "Nueva Factura de Compra"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveInvoice.mutate(); }} className="space-y-6">
            {/* Header fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Nº Factura *</Label>
                <KioskTextInput value={invoiceNumber} onChange={setInvoiceNumber} placeholder="FAC-001" keyboardLabel="Número de factura" required />
              </div>
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <KioskTextInput value={supplierName} onChange={setSupplierName} placeholder="Nombre del proveedor" keyboardLabel="Proveedor" />
              </div>
              <div className="space-y-2">
                <Label>Fecha Factura *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(invoiceDate, "dd/MM/yyyy", { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={invoiceDate} onSelect={(d) => { if (d) setInvoiceDate(d); setDatePickerOpen(false); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Items section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Productos</Label>
              
              {/* Add item row */}
              <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Producto</Label>
                  <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-sm">
                        {addProductId ? products?.find((p) => p.id === addProductId)?.name ?? "..." : "Buscar producto..."}
                        <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar..." />
                        <CommandList>
                          <CommandEmpty>No encontrado.</CommandEmpty>
                          <CommandGroup>
                            {products?.map((p) => (
                              <CommandItem key={p.id} value={`${p.name} ${p.barcode ?? ""}`} onSelect={() => handleSelectProduct(p.id)}>
                                <Check className={cn("mr-2 h-4 w-4", addProductId === p.id ? "opacity-100" : "opacity-0")} />
                                {p.name} ({p.unit})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Cantidad</Label>
                  <NumericKeypadInput mode="decimal" value={addQuantity} onChange={setAddQuantity} min="0.01" keypadLabel="Cantidad" className="h-9" data-product-qty-input />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Costo Unit. *</Label>
                  <NumericKeypadInput mode="decimal" value={addUnitCost} onChange={setAddUnitCost} min="0.01" keypadLabel="Costo unitario" className="h-9" />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addItemToList} disabled={!addProductId || !addQuantity || !addUnitCost}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
                      return (
                        <TableRow key={item.tempId}>
                          <TableCell>{item.product_name} <span className="text-xs text-muted-foreground">({item.product_unit})</span></TableCell>
                          <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono">${Number(item.unit_cost).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono font-medium">${lineTotal.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.tempId)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">Total Factura:</TableCell>
                      <TableCell className="text-right font-mono text-lg font-bold">${formTotal.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => { setFormOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveInvoice.isPending || !invoiceNumber.trim() || items.length === 0}>
                {saveInvoice.isPending ? "Guardando..." : "Guardar Borrador"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Post Confirmation */}
      <AlertDialog open={!!postConfirmId} onOpenChange={(v) => !v && setPostConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar posteo de factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción aumentará el stock de los productos y <strong>no se puede deshacer</strong>. Los movimientos de entrada serán creados automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => postConfirmId && postInvoice.mutate(postConfirmId)} disabled={postInvoice.isPending}>
              {postInvoice.isPending ? "Posteando..." : "Confirmar Ingreso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará la factura borrador y todos sus ítems.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirmId && deleteInvoice.mutate(deleteConfirmId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
