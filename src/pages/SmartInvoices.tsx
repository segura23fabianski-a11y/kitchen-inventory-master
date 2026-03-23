import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { usePermissions } from "@/hooks/use-permissions";
import { useAudit } from "@/hooks/use-audit";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Search, Eye, Send, Trash2, AlertTriangle, Check, HelpCircle,
  FileText, Loader2, Sparkles, ArrowRight, RefreshCw, X, Brain, Mail,
  FileCode, FileArchive, ShieldAlert
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type SmartInvoice = {
  id: string;
  restaurant_id: string;
  pdf_url: string | null;
  status: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_detected: number | null;
  linked_invoice_id: string | null;
  created_by: string;
  created_at: string;
  notes: string | null;
  source: string;
  source_email_from: string | null;
  source_email_subject: string | null;
  xml_url: string | null;
  file_type: string;
  validation_warnings: string[] | null;
};

type SmartItem = {
  id: string;
  smart_invoice_id: string;
  raw_description: string | null;
  raw_quantity: string | null;
  raw_unit_price: string | null;
  raw_total: string | null;
  product_id: string | null;
  presentation_id: string | null;
  quantity_in_presentation: number | null;
  quantity_in_base_unit: number | null;
  unit_cost_per_base: number | null;
  line_total: number | null;
  match_status: string;
  match_confidence: number;
  needs_review: boolean;
  is_expense: boolean;
  notes: string | null;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "outline" },
  processing: { label: "Procesando…", variant: "secondary" },
  draft: { label: "Borrador", variant: "secondary" },
  validated: { label: "Validada", variant: "default" },
  posted: { label: "Posteada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

const MATCH_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  suggested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  unmatched: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

export default function SmartInvoices() {
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { hasPermission } = usePermissions();
  const { logAudit } = useAudit();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingInvoice, setEditingInvoice] = useState<SmartInvoice | null>(null);
  const [convertConfirmId, setConvertConfirmId] = useState<string | null>(null);

  const canView = hasPermission("purchases");
  const canCreate = hasPermission("purchases_create");

  // ─── Queries ───────────────────────────────────────────────
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["smart-invoices", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smart_invoices" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SmartInvoice[];
    },
    enabled: !!restaurantId,
  });

  const { data: editItems = [] } = useQuery({
    queryKey: ["smart-invoice-items", editingInvoice?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smart_invoice_items" as any)
        .select("*")
        .eq("smart_invoice_id", editingInvoice!.id)
        .order("created_at");
      if (error) throw error;
      return data as unknown as SmartItem[];
    },
    enabled: !!editingInvoice,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-smart"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, barcode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: presentations = [] } = useQuery({
    queryKey: ["all-presentations", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_presentations" as any)
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-smart", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, nit").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name]));

  const productOptions: SearchableSelectOption[] = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.unit})`,
    searchTerms: p.barcode || "",
  }));

  // ─── Filtered list ─────────────────────────────────────────
  const filtered = invoices.filter((inv) => {
    const matchSearch = !search || fuzzyMatch(buildHaystack(inv.invoice_number, inv.supplier_name), search);
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ─── Upload File (PDF, XML, ZIP) ────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!restaurantId || !user) throw new Error("No autorizado");
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
      const timestamp = Date.now();

      let pdfPath: string | null = null;
      let xmlPath: string | null = null;
      let fileType = ext;

      if (ext === "zip") {
        // Extract ZIP on client side using JSZip-like approach via edge function
        // For simplicity, upload the ZIP contents via the receive-invoice-email endpoint
        const base64 = await fileToBase64(file);
        const res = await supabase.functions.invoke("receive-invoice-email", {
          body: {
            restaurant_id: restaurantId,
            attachments: [{ base64, filename: file.name, content_type: file.type || "application/zip" }],
            created_by_user_id: user.id,
          },
          headers: { "x-webhook-secret": "DIRECT_UPLOAD" },
        });
        // For direct uploads, we bypass the webhook secret by handling it differently
        // Actually, let's handle ZIP directly here by reading the file
        throw new Error("Para archivos ZIP, usa la función de carga directa.");
      }

      if (ext === "xml") {
        xmlPath = `${restaurantId}/${timestamp}.xml`;
        const { error: upErr } = await supabase.storage.from("invoice-pdfs").upload(xmlPath, file, { contentType: "application/xml" });
        if (upErr) throw upErr;
        fileType = "xml";
      } else {
        pdfPath = `${restaurantId}/${timestamp}.${ext}`;
        const { error: upErr } = await supabase.storage.from("invoice-pdfs").upload(pdfPath, file);
        if (upErr) throw upErr;
        fileType = "pdf";
      }

      const { data: inv, error: invErr } = await supabase
        .from("smart_invoices" as any)
        .insert({
          restaurant_id: restaurantId,
          pdf_url: pdfPath,
          xml_url: xmlPath,
          file_type: fileType,
          status: "pending",
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (invErr) throw invErr;
      return (inv as any).id as string;
    },
    onSuccess: async (smartInvoiceId) => {
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
      toast({ title: "Archivo subido", description: "Iniciando análisis…" });
      parseMutation.mutate(smartInvoiceId);
    },
    onError: (e: any) => toast({ title: "Error al subir", description: e.message, variant: "destructive" }),
  });

  // ZIP upload mutation (handles extraction server-side)
  const uploadZipMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!restaurantId || !user) throw new Error("No autorizado");
      const timestamp = Date.now();
      
      // Read ZIP file and extract XML/PDF manually
      const { default: JSZip } = await import("jszip" as any).catch(() => ({ default: null }));
      
      if (!JSZip) {
        // Fallback: upload ZIP as-is and let the server handle it
        const path = `${restaurantId}/${timestamp}.zip`;
        const { error: upErr } = await supabase.storage.from("invoice-pdfs").upload(path, file);
        if (upErr) throw upErr;
        
        const { data: inv, error: invErr } = await supabase
          .from("smart_invoices" as any)
          .insert({
            restaurant_id: restaurantId,
            pdf_url: path,
            file_type: "zip",
            status: "pending",
            created_by: user.id,
          } as any)
          .select("id")
          .single();
        if (invErr) throw invErr;
        return (inv as any).id as string;
      }

      // Extract ZIP contents
      const zip = await JSZip.loadAsync(file);
      let xmlPath: string | null = null;
      let pdfPath: string | null = null;

      for (const [name, entry] of Object.entries(zip.files)) {
        if ((entry as any).dir) continue;
        const lower = name.toLowerCase();
        
        if (lower.endsWith(".xml") && !xmlPath) {
          const content = await (entry as any).async("uint8array");
          xmlPath = `${restaurantId}/${timestamp}-${name.replace(/\//g, "_")}`;
          const { error } = await supabase.storage.from("invoice-pdfs").upload(xmlPath, content, { contentType: "application/xml" });
          if (error) { console.error("XML upload from ZIP:", error); xmlPath = null; }
        } else if (lower.endsWith(".pdf") && !pdfPath) {
          const content = await (entry as any).async("uint8array");
          pdfPath = `${restaurantId}/${timestamp}-${name.replace(/\//g, "_")}`;
          const { error } = await supabase.storage.from("invoice-pdfs").upload(pdfPath, content, { contentType: "application/pdf" });
          if (error) { console.error("PDF upload from ZIP:", error); pdfPath = null; }
        }
      }

      if (!xmlPath && !pdfPath) throw new Error("No se encontraron archivos XML o PDF dentro del ZIP.");

      const { data: inv, error: invErr } = await supabase
        .from("smart_invoices" as any)
        .insert({
          restaurant_id: restaurantId,
          pdf_url: pdfPath,
          xml_url: xmlPath,
          file_type: "zip",
          status: "pending",
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (invErr) throw invErr;
      return (inv as any).id as string;
    },
    onSuccess: async (smartInvoiceId) => {
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
      toast({ title: "ZIP procesado", description: "Archivos extraídos. Iniciando análisis…" });
      parseMutation.mutate(smartInvoiceId);
    },
    onError: (e: any) => toast({ title: "Error al procesar ZIP", description: e.message, variant: "destructive" }),
  });

  // ─── AI Parse ──────────────────────────────────────────────
  const parseMutation = useMutation({
    mutationFn: async (smartInvoiceId: string) => {
      // Mark as processing
      await supabase.from("smart_invoices" as any).update({ status: "processing" } as any).eq("id", smartInvoiceId);
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });

      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: { smart_invoice_id: smartInvoiceId },
      });
      
      // Handle edge function errors with useful messages
      if (error) {
        // Try to extract the actual error message from the response
        const errorMsg = typeof error === 'object' && 'message' in error 
          ? error.message 
          : String(error);
        
        // If it's just the generic "non-2xx" error, provide a better message
        if (errorMsg.includes("non-2xx")) {
          throw new Error("Error al comunicarse con el servicio de análisis. Verifica que el PDF sea válido e intenta de nuevo.");
        }
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
      qc.invalidateQueries({ queryKey: ["smart-invoice-items"] });
      toast({
        title: "Factura analizada",
        description: `${data?.items_parsed ?? 0} líneas detectadas. Revisa el borrador.`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Error al analizar factura", description: e.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
    },
  });

  // ─── Update item match ────────────────────────────────────
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("smart_invoice_items" as any)
        .update(updates as any)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-invoice-items"] }),
  });

  // ─── Update smart invoice header ──────────────────────────
  const updateHeaderMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("smart_invoices" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-invoices"] }),
  });

  // ─── Convert to purchase invoice ──────────────────────────
  const convertMutation = useMutation({
    mutationFn: async (smartInvoiceId: string) => {
      const inv = invoices.find((i) => i.id === smartInvoiceId);
      if (!inv) throw new Error("Factura no encontrada");

      // Check all items are confirmed or marked as expense
      const items = (await supabase
        .from("smart_invoice_items" as any)
        .select("*")
        .eq("smart_invoice_id", smartInvoiceId)).data as unknown as SmartItem[] ?? [];

      const unresolved = items.filter((i) => i.needs_review && !i.is_expense);
      if (unresolved.length > 0) {
        throw new Error(`Hay ${unresolved.length} línea(s) sin validar. Revisa antes de convertir.`);
      }

      const inventoryItems = items.filter((i) => i.product_id && !i.is_expense);
      if (inventoryItems.length === 0) throw new Error("No hay líneas de inventario para convertir");

      if (!inv.invoice_number?.trim()) throw new Error("Falta el número de factura");

      // Create purchase_invoice
      const { data: newInv, error: hErr } = await supabase
        .from("purchase_invoices" as any)
        .insert({
          restaurant_id: restaurantId!,
          invoice_number: inv.invoice_number!.trim(),
          supplier_id: inv.supplier_id,
          supplier_name: inv.supplier_name,
          invoice_date: inv.invoice_date || format(new Date(), "yyyy-MM-dd"),
          created_by: user!.id,
        } as any)
        .select("id")
        .single();
      if (hErr) throw hErr;

      const invoiceId = (newInv as any).id;

      // Create purchase_invoice_items
      const invoiceItems = inventoryItems.map((item) => ({
        invoice_id: invoiceId,
        restaurant_id: restaurantId!,
        product_id: item.product_id!,
        quantity: item.quantity_in_base_unit || item.quantity_in_presentation || 0,
        unit_cost: item.unit_cost_per_base || 0,
      }));

      const { error: iErr } = await supabase.from("purchase_invoice_items" as any).insert(invoiceItems as any);
      if (iErr) throw iErr;

      // Update smart invoice status
      await supabase.from("smart_invoices" as any).update({
        status: "validated",
        linked_invoice_id: invoiceId,
        validated_by: user!.id,
        validated_at: new Date().toISOString(),
      } as any).eq("id", smartInvoiceId);

      // Learn aliases from confirmed matches
      for (const item of inventoryItems) {
        if (item.raw_description && item.product_id && item.match_status !== "unmatched") {
          const { error: aliasErr } = await supabase.from("invoice_product_aliases" as any).upsert({
            restaurant_id: restaurantId!,
            external_name: item.raw_description,
            product_id: item.product_id,
            presentation_id: item.presentation_id,
            supplier_id: inv.supplier_id,
            confidence: 1,
            times_used: 1,
          } as any, { onConflict: "restaurant_id,lower(external_name),COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid)" as any });
          // Silently fail on alias learning - not critical
          if (aliasErr) console.warn("Alias upsert warn:", aliasErr);
        }
      }

      await logAudit({
        entityType: "smart_invoice",
        entityId: smartInvoiceId,
        action: "CONVERT",
        after: { linked_invoice_id: invoiceId, items: inventoryItems.length },
      });

      return invoiceId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      setConvertConfirmId(null);
      setEditingInvoice(null);
      toast({ title: "Factura convertida", description: "Se creó un borrador en Facturas de Compra. Revisa y postea cuando esté listo." });
    },
    onError: (e: any) => {
      setConvertConfirmId(null);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // ─── Delete ────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("smart_invoices" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-invoices"] });
      toast({ title: "Factura eliminada" });
    },
  });

  // ─── Helpers ───────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  const getProductPresentations = (productId: string) =>
    presentations.filter((p: any) => p.product_id === productId);

  const handleProductMatch = (item: SmartItem, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const prods = getProductPresentations(productId);
    const qty = Number(item.raw_quantity) || item.quantity_in_presentation || 1;
    const total = Number(item.raw_total) || item.line_total || 0;

    updateItemMutation.mutate({
      itemId: item.id,
      updates: {
        product_id: productId,
        presentation_id: null,
        quantity_in_presentation: qty,
        quantity_in_base_unit: qty,
        unit_cost_per_base: qty > 0 ? total / qty : 0,
        match_status: "manual",
        match_confidence: 1,
        needs_review: false,
      },
    });
  };

  const handlePresentationMatch = (item: SmartItem, presentationId: string) => {
    const pres = presentations.find((p: any) => p.id === presentationId);
    if (!pres) return;

    const qty = item.quantity_in_presentation || Number(item.raw_quantity) || 1;
    const factor = Number((pres as any).conversion_factor);
    const qtyBase = qty * factor;
    const total = Number(item.raw_total) || item.line_total || 0;

    updateItemMutation.mutate({
      itemId: item.id,
      updates: {
        presentation_id: presentationId,
        quantity_in_base_unit: qtyBase,
        unit_cost_per_base: qtyBase > 0 ? total / qtyBase : 0,
      },
    });
  };

  const confirmItem = (itemId: string) => {
    updateItemMutation.mutate({
      itemId,
      updates: { match_status: "confirmed", needs_review: false },
    });
  };

  const markAsExpense = (itemId: string) => {
    updateItemMutation.mutate({
      itemId,
      updates: { is_expense: true, needs_review: false, match_status: "confirmed" },
    });
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
              <Brain className="h-7 w-7 text-primary" />
              Facturas Inteligentes
            </h1>
            <p className="text-muted-foreground">Sube un PDF y deja que la IA extraiga los datos automáticamente.</p>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending || parseMutation.isPending}>
                {uploadMutation.isPending || parseMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando…</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Subir PDF</>
                )}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput className="pl-10" placeholder="Buscar…" value={search} onChange={setSearch} keyboardLabel="Buscar" inputType="search" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {["all", "pending", "processing", "draft", "validated", "posted", "rejected"].map((s) => (
                  <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
                    {s === "all" ? "Todos" : STATUS_MAP[s]?.label ?? s}
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
                  <TableHead>Origen</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total Detectado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</TableCell></TableRow>
                ) : !filtered.length ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay facturas inteligentes. Sube un PDF para comenzar.
                  </TableCell></TableRow>
                ) : filtered.map((inv) => {
                  const st = STATUS_MAP[inv.status] || { label: inv.status, variant: "outline" as const };
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{inv.supplier_name || "—"}</TableCell>
                      <TableCell>
                        {inv.source === "email" ? (
                          <Badge variant="outline" className="gap-1 text-xs" title={inv.source_email_from || ""}>
                            <Mail className="h-3 w-3" /> Email
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Upload className="h-3 w-3" /> Manual
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{inv.invoice_date ? format(new Date(inv.invoice_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {inv.total_detected != null ? `$${Number(inv.total_detected).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profileMap.get(inv.created_by) || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inv.status === "draft" && (
                            <Button variant="ghost" size="icon" onClick={() => setEditingInvoice(inv)} title="Revisar borrador">
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.status === "pending" && (
                            <Button variant="ghost" size="icon" onClick={() => parseMutation.mutate(inv.id)} title="Analizar con IA" disabled={parseMutation.isPending}>
                              <Sparkles className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.status === "draft" && (
                            <Button variant="ghost" size="icon" onClick={() => parseMutation.mutate(inv.id)} title="Re-analizar" disabled={parseMutation.isPending}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          {["pending", "draft", "rejected"].includes(inv.status) && (
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(inv.id)} title="Eliminar">
                              <Trash2 className="h-4 w-4" />
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
      </div>

      {/* ─── Draft Editor Dialog ──────────────────────────────── */}
      <Dialog open={!!editingInvoice} onOpenChange={(v) => !v && setEditingInvoice(null)}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Revisar Factura Inteligente
            </DialogTitle>
          </DialogHeader>

          {editingInvoice && (
            <div className="space-y-6">
              {/* Header fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Nº Factura</Label>
                  <KioskTextInput
                    value={editingInvoice.invoice_number || ""}
                    onChange={(v) => {
                      setEditingInvoice({ ...editingInvoice, invoice_number: v });
                      updateHeaderMutation.mutate({ id: editingInvoice.id, updates: { invoice_number: v } });
                    }}
                    placeholder="Número…"
                    keyboardLabel="Nº Factura"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Proveedor</Label>
                  <SearchableSelect
                    options={suppliers.map((s) => ({ value: s.id, label: s.name, searchTerms: s.nit || "" }))}
                    value={editingInvoice.supplier_id || ""}
                    onValueChange={(v) => {
                      const sup = suppliers.find((s) => s.id === v);
                      setEditingInvoice({ ...editingInvoice, supplier_id: v, supplier_name: sup?.name || null });
                      updateHeaderMutation.mutate({ id: editingInvoice.id, updates: { supplier_id: v || null, supplier_name: sup?.name || null } });
                    }}
                    placeholder="Seleccionar proveedor…"
                    clearable
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha</Label>
                  <Input
                    type="date"
                    value={editingInvoice.invoice_date || ""}
                    onChange={(e) => {
                      setEditingInvoice({ ...editingInvoice, invoice_date: e.target.value });
                      updateHeaderMutation.mutate({ id: editingInvoice.id, updates: { invoice_date: e.target.value || null } });
                    }}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Detectado</Label>
                  <div className="h-9 flex items-center font-mono font-bold text-lg">
                    ${Number(editingInvoice.total_detected || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Stats */}
              {editItems.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" /> {editItems.length} líneas
                  </Badge>
                  <Badge className={cn("gap-1", MATCH_COLORS.confirmed)}>
                    <Check className="h-3 w-3" /> {editItems.filter((i) => i.match_status === "confirmed" || i.match_status === "manual").length} confirmadas
                  </Badge>
                  <Badge className={cn("gap-1", MATCH_COLORS.suggested)}>
                    <HelpCircle className="h-3 w-3" /> {editItems.filter((i) => i.match_status === "suggested").length} sugeridas
                  </Badge>
                  <Badge className={cn("gap-1", MATCH_COLORS.unmatched)}>
                    <AlertTriangle className="h-3 w-3" /> {editItems.filter((i) => i.match_status === "unmatched").length} sin match
                  </Badge>
                  {editItems.filter((i) => i.is_expense).length > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      💰 {editItems.filter((i) => i.is_expense).length} gastos (no inventario)
                    </Badge>
                  )}
                </div>
              )}

              {/* Items */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Líneas de la Factura</Label>
                <div className="space-y-3">
                  {editItems.map((item) => {
                    const prod = item.product_id ? products.find((p) => p.id === item.product_id) : null;
                    const itemPresentations = item.product_id ? getProductPresentations(item.product_id) : [];

                    return (
                      <Card key={item.id} className={cn("border-l-4", {
                        "border-l-green-500": item.match_status === "confirmed" || item.match_status === "manual",
                        "border-l-amber-500": item.match_status === "suggested",
                        "border-l-red-500": item.match_status === "unmatched",
                      }, item.is_expense && "opacity-60")}>
                        <CardContent className="p-3 space-y-3">
                          {/* Raw data */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.raw_description || "Sin descripción"}</p>
                              <p className="text-xs text-muted-foreground">
                                Cant: {item.raw_quantity} | P.Unit: ${item.raw_unit_price} | Total: ${item.raw_total}
                              </p>
                            </div>
                            <Badge className={cn("text-xs", MATCH_COLORS[item.match_status] || "")}>
                              {item.match_status === "confirmed" ? "✓ Confirmado" :
                               item.match_status === "suggested" ? "? Sugerido" :
                               item.match_status === "manual" ? "✓ Manual" : "✗ Sin match"}
                            </Badge>
                          </div>

                          {/* Match controls */}
                          {!item.is_expense && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5 items-end">
                              <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs">Producto</Label>
                                <SearchableSelect
                                  options={productOptions}
                                  value={item.product_id || ""}
                                  onValueChange={(v) => handleProductMatch(item, v)}
                                  placeholder="Vincular producto…"
                                  triggerClassName="h-8 text-xs"
                                />
                              </div>
                              {item.product_id && itemPresentations.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Presentación</Label>
                                  <Select
                                    value={item.presentation_id || "none"}
                                    onValueChange={(v) => v !== "none" && handlePresentationMatch(item, v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Unidad base" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Unidad base</SelectItem>
                                      {itemPresentations.map((p: any) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.name} (×{Number(p.conversion_factor)})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              <div className="space-y-1">
                                <Label className="text-xs">Cant. base ({prod?.unit || "?"})</Label>
                                <div className="h-8 flex items-center text-sm font-mono bg-muted/50 rounded px-2">
                                  {Number(item.quantity_in_base_unit || 0).toFixed(2)}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Costo/{prod?.unit || "unit"}</Label>
                                <div className="h-8 flex items-center text-sm font-mono bg-muted/50 rounded px-2">
                                  ${Number(item.unit_cost_per_base || 0).toFixed(4)}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 justify-end">
                            {item.needs_review && item.product_id && !item.is_expense && (
                              <Button size="sm" variant="outline" className="text-green-600 h-7 text-xs" onClick={() => confirmItem(item.id)}>
                                <Check className="h-3 w-3 mr-1" /> Confirmar
                              </Button>
                            )}
                            {!item.is_expense && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => markAsExpense(item.id)}>
                                No es inventario
                              </Button>
                            )}
                            {item.is_expense && (
                              <Badge variant="outline" className="text-xs">Marcado como gasto (no se importará)</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-between items-center border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  {editItems.filter((i) => i.needs_review && !i.is_expense).length > 0 ? (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      {editItems.filter((i) => i.needs_review && !i.is_expense).length} línea(s) pendientes de validación
                    </span>
                  ) : (
                    <span className="text-green-600 flex items-center gap-1">
                      <Check className="h-4 w-4" /> Todas las líneas validadas
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingInvoice(null)}>Cerrar</Button>
                  <Button
                    onClick={() => setConvertConfirmId(editingInvoice.id)}
                    disabled={editItems.filter((i) => i.needs_review && !i.is_expense).length > 0}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" /> Convertir a Factura
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert Confirmation */}
      <AlertDialog open={!!convertConfirmId} onOpenChange={(v) => !v && setConvertConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Convertir a factura de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará un borrador en Facturas de Compra con las líneas de inventario confirmadas.
              Las líneas marcadas como gasto serán excluidas. Podrás revisar y postear la factura desde el módulo de Compras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => convertConfirmId && convertMutation.mutate(convertConfirmId)}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending ? "Convirtiendo…" : "Convertir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
