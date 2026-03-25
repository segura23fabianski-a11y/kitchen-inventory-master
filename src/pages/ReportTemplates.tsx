import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy, FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const REPORT_TYPES = [
  { value: "purchase_orders", label: "Pedidos de Compra" },
  { value: "invoices", label: "Facturas" },
  { value: "consumption", label: "Reportes de Consumo" },
  { value: "inventory", label: "Inventario" },
  { value: "kardex", label: "Kardex" },
  { value: "waste", label: "Desperdicios" },
  { value: "custom", label: "Personalizado" },
];

type Template = {
  id: string;
  name: string;
  report_type: string;
  document_code: string | null;
  version: string | null;
  company_name: string | null;
  company_nit: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  elaborated_by: string | null;
  approved_by: string | null;
  footer_text: string | null;
  legal_text: string | null;
  show_page_number: boolean;
  show_print_date: boolean;
  signature_name: string | null;
  signature_role: string | null;
  is_default: boolean;
  active: boolean;
  created_at: string;
};

const emptyForm = {
  name: "",
  report_type: "custom",
  document_code: "",
  version: "1.0",
  company_name: "",
  company_nit: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  logo_url: "",
  primary_color: "#E1AB18",
  elaborated_by: "",
  approved_by: "",
  footer_text: "",
  legal_text: "",
  show_page_number: true,
  show_print_date: true,
  signature_name: "",
  signature_role: "",
  is_default: false,
};

export default function ReportTemplates() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [tab, setTab] = useState("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["report-templates", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any as Template[];
    },
    enabled: !!restaurantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, restaurant_id: restaurantId! };
      // Clean empty strings to null
      Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
      payload.name = form.name.trim();
      if (!payload.name) throw new Error("Nombre requerido");

      if (editId) {
        const { error } = await supabase.from("report_templates" as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("report_templates" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success(editId ? "Plantilla actualizada" : "Plantilla creada");
      setEditId(null);
      setForm(emptyForm);
      setTab("list");
    },
    onError: (e: any) => toast.error(e.message || "Error al guardar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success("Plantilla eliminada");
      setDeleteId(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (t: Template) => {
      const { id, created_at, ...rest } = t as any;
      const { error } = await supabase.from("report_templates" as any).insert({
        ...rest,
        name: `${t.name} (copia)`,
        is_default: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      toast.success("Plantilla duplicada");
    },
  });

  const openEdit = (t: Template) => {
    setEditId(t.id);
    setForm({
      name: t.name,
      report_type: t.report_type,
      document_code: t.document_code || "",
      version: t.version || "1.0",
      company_name: t.company_name || "",
      company_nit: t.company_nit || "",
      company_address: t.company_address || "",
      company_phone: t.company_phone || "",
      company_email: t.company_email || "",
      logo_url: t.logo_url || "",
      primary_color: t.primary_color || "#E1AB18",
      elaborated_by: t.elaborated_by || "",
      approved_by: t.approved_by || "",
      footer_text: t.footer_text || "",
      legal_text: t.legal_text || "",
      show_page_number: t.show_page_number,
      show_print_date: t.show_print_date,
      signature_name: t.signature_name || "",
      signature_role: t.signature_role || "",
      is_default: t.is_default,
    });
    setTab("editor");
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setTab("editor");
  };

  const upd = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Plantillas de Reportes</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list">Mis Plantillas</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Plantilla</Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{REPORT_TYPES.find(r => r.value === t.report_type)?.label || t.report_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(t.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        {t.is_default && <Badge>Predeterminada</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => duplicateMutation.mutate(t)}><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && templates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No hay plantillas creadas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="editor" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editId ? "Editar Plantilla" : "Nueva Plantilla"}</h2>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim()} className="gap-1">
                <Save className="h-4 w-4" />Guardar
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Section A - Document ID */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Identificación del Documento</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Código</Label><Input value={form.document_code} onChange={e => upd("document_code", e.target.value)} placeholder="FT-001" /></div>
                    <div><Label>Versión</Label><Input value={form.version} onChange={e => upd("version", e.target.value)} placeholder="1.0" /></div>
                  </div>
                  <div><Label>Nombre de plantilla *</Label><Input value={form.name} onChange={e => upd("name", e.target.value)} placeholder="Plantilla general" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Elaboró</Label><Input value={form.elaborated_by} onChange={e => upd("elaborated_by", e.target.value)} /></div>
                    <div><Label>Aprobó</Label><Input value={form.approved_by} onChange={e => upd("approved_by", e.target.value)} /></div>
                  </div>
                  <div>
                    <Label>Tipo de reporte</Label>
                    <Select value={form.report_type} onValueChange={v => upd("report_type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REPORT_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Section B - Header */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Encabezado</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Logo (URL)</Label><Input value={form.logo_url} onChange={e => upd("logo_url", e.target.value)} placeholder="https://..." /></div>
                  <div><Label>Nombre de la empresa</Label><Input value={form.company_name} onChange={e => upd("company_name", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>NIT</Label><Input value={form.company_nit} onChange={e => upd("company_nit", e.target.value)} /></div>
                    <div>
                      <Label>Color principal</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={form.primary_color} onChange={e => upd("primary_color", e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                        <Input value={form.primary_color} onChange={e => upd("primary_color", e.target.value)} className="flex-1" />
                      </div>
                    </div>
                  </div>
                  <div><Label>Dirección</Label><Input value={form.company_address} onChange={e => upd("company_address", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Teléfono</Label><Input value={form.company_phone} onChange={e => upd("company_phone", e.target.value)} /></div>
                    <div><Label>Email</Label><Input value={form.company_email} onChange={e => upd("company_email", e.target.value)} /></div>
                  </div>
                </CardContent>
              </Card>

              {/* Section C - Footer */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Pie de Página</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Texto del pie</Label><Textarea value={form.footer_text} onChange={e => upd("footer_text", e.target.value)} rows={2} /></div>
                  <div><Label>Texto legal / observaciones</Label><Textarea value={form.legal_text} onChange={e => upd("legal_text", e.target.value)} rows={2} /></div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2"><Switch checked={form.show_page_number} onCheckedChange={v => upd("show_page_number", v)} /><Label>Número de página</Label></div>
                    <div className="flex items-center gap-2"><Switch checked={form.show_print_date} onCheckedChange={v => upd("show_print_date", v)} /><Label>Fecha de impresión</Label></div>
                    <div className="flex items-center gap-2"><Switch checked={form.is_default} onCheckedChange={v => upd("is_default", v)} /><Label>Predeterminada</Label></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Firma — Nombre</Label><Input value={form.signature_name} onChange={e => upd("signature_name", e.target.value)} /></div>
                    <div><Label>Firma — Cargo</Label><Input value={form.signature_role} onChange={e => upd("signature_role", e.target.value)} /></div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Vista Previa</CardTitle></CardHeader>
                <CardContent>
                  <div className="border rounded-md p-4 space-y-3 text-xs" style={{ borderColor: form.primary_color }}>
                    <div className="flex items-start justify-between border-b pb-2" style={{ borderColor: form.primary_color }}>
                      <div>
                        {form.logo_url && <img src={form.logo_url} alt="Logo" className="h-10 mb-1 object-contain" />}
                        <p className="font-bold text-sm">{form.company_name || "Nombre de la empresa"}</p>
                        {form.company_nit && <p className="text-muted-foreground">NIT: {form.company_nit}</p>}
                        {form.company_address && <p className="text-muted-foreground">{form.company_address}</p>}
                      </div>
                      <div className="text-right">
                        {form.document_code && <p className="font-mono">{form.document_code}</p>}
                        {form.version && <p className="text-muted-foreground">v{form.version}</p>}
                      </div>
                    </div>
                    <div className="h-16 bg-muted/30 rounded flex items-center justify-center text-muted-foreground">
                      [Contenido del reporte]
                    </div>
                    <div className="border-t pt-2 text-[10px] text-muted-foreground" style={{ borderColor: form.primary_color }}>
                      {form.footer_text && <p>{form.footer_text}</p>}
                      {form.legal_text && <p className="italic">{form.legal_text}</p>}
                      <div className="flex justify-between mt-1">
                        {form.show_page_number && <span>Pág. 1 de 1</span>}
                        {form.show_print_date && <span>Impreso: {format(new Date(), "dd/MM/yyyy HH:mm")}</span>}
                      </div>
                      {form.signature_name && (
                        <div className="mt-3 text-center">
                          <div className="border-t border-foreground/30 w-32 mx-auto mb-1" />
                          <p className="font-medium">{form.signature_name}</p>
                          {form.signature_role && <p>{form.signature_role}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
