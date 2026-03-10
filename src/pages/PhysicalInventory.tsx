import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardCheck, Eye, Trash2, CheckCircle2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";

const statusLabels: Record<string, string> = { draft: "Borrador", review: "En revisión", approved: "Aprobado" };
const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = { draft: "secondary", review: "outline", approved: "default" };

export default function PhysicalInventory() {
  const { user, hasRole } = useAuth();
  const { logAudit } = useAudit();
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formWarehouse, setFormWarehouse] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Queries
  const { data: counts, isLoading } = useQuery({
    queryKey: ["physical-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_counts")
        .select("*, warehouses(name), categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: countItems } = useQuery({
    queryKey: ["physical-count-items", selectedCountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_count_items")
        .select("*, products(name, unit)")
        .eq("count_id", selectedCountId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCountId,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []), [profiles]);

  const selectedCount = counts?.find((c) => c.id === selectedCountId);
  const isDraft = selectedCount?.status === "draft";
  const isReview = selectedCount?.status === "review";
  const isApproved = selectedCount?.status === "approved";

  // Create count
  const createCount = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin contexto");
      if (!formName.trim()) throw new Error("Nombre requerido");

      // 1. Create the count
      const { data: count, error } = await supabase
        .from("physical_counts")
        .insert({
          restaurant_id: restaurantId,
          name: formName.trim(),
          warehouse_id: formWarehouse || null,
          category_id: formCategory || null,
          notes: formNotes || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // 2. Load products matching filters
      let query = supabase.from("products").select("id, current_stock");
      if (formWarehouse) query = query.eq("warehouse_id", formWarehouse);
      if (formCategory) query = query.eq("category_id", formCategory);
      const { data: products, error: pErr } = await query.order("name");
      if (pErr) throw pErr;

      if (products && products.length > 0) {
        const items = products.map((p) => ({
          count_id: count.id,
          product_id: p.id,
          system_stock: Number(p.current_stock),
        }));
        const { error: iErr } = await supabase.from("physical_count_items").insert(items);
        if (iErr) throw iErr;
      }

      await logAudit("physical_count", count.id, "CREATE_PHYSICAL_COUNT", null, { name: formName, products_count: products?.length ?? 0 });

      return count;
    },
    onSuccess: (count) => {
      toast({ title: "Conteo creado", description: `${count.name} con sus productos cargados.` });
      setCreateOpen(false);
      setFormName("");
      setFormWarehouse("");
      setFormCategory("");
      setFormNotes("");
      setSelectedCountId(count.id);
      qc.invalidateQueries({ queryKey: ["physical-counts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Update counted_stock for an item
  const updateItem = useMutation({
    mutationFn: async ({ itemId, countedStock }: { itemId: string; countedStock: number | null }) => {
      const difference = countedStock != null ? countedStock - (countItems?.find((i) => i.id === itemId)?.system_stock ?? 0) : null;
      const { error } = await supabase
        .from("physical_count_items")
        .update({ counted_stock: countedStock, difference })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["physical-count-items", selectedCountId] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Move to review
  const moveToReview = useMutation({
    mutationFn: async () => {
      const uncounted = countItems?.filter((i) => i.counted_stock === null);
      if (uncounted && uncounted.length > 0) throw new Error(`Hay ${uncounted.length} producto(s) sin contar`);
      const { error } = await supabase.from("physical_counts").update({ status: "review" }).eq("id", selectedCountId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "En revisión" });
      qc.invalidateQueries({ queryKey: ["physical-counts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Approve and generate adjustments
  const approveCount = useMutation({
    mutationFn: async () => {
      if (!user || !restaurantId || !selectedCountId) throw new Error("Sin contexto");
      if (!isAdmin) throw new Error("Solo admin puede aprobar");

      const itemsWithDiff = countItems?.filter((i) => i.difference != null && i.difference !== 0) ?? [];

      // Generate adjustment movements
      for (const item of itemsWithDiff) {
        const { error } = await supabase.from("inventory_movements").insert({
          product_id: item.product_id,
          restaurant_id: restaurantId,
          user_id: user.id,
          type: "ajuste",
          quantity: item.counted_stock!,
          unit_cost: 0,
          total_cost: 0,
          notes: `Conciliación inventario físico: ${selectedCount?.name}`,
        });
        if (error) throw error;
      }

      // Mark approved
      const { error } = await supabase
        .from("physical_counts")
        .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
        .eq("id", selectedCountId);
      if (error) throw error;

      await logAudit("physical_count", selectedCountId, "APPROVE_PHYSICAL_COUNT", null, {
        name: selectedCount?.name,
        adjusted_products: itemsWithDiff.length,
        total_products: countItems?.length ?? 0,
      });
    },
    onSuccess: () => {
      toast({ title: "Conteo aprobado", description: "Ajustes de inventario generados automáticamente." });
      qc.invalidateQueries({ queryKey: ["physical-counts"] });
      qc.invalidateQueries({ queryKey: ["physical-count-items", selectedCountId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete draft count
  const deleteCount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("physical_counts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Conteo eliminado" });
      if (selectedCountId) setSelectedCountId(null);
      qc.invalidateQueries({ queryKey: ["physical-counts"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Summary stats for detail view
  const summary = useMemo(() => {
    if (!countItems) return { total: 0, counted: 0, withDiff: 0, positive: 0, negative: 0 };
    const counted = countItems.filter((i) => i.counted_stock != null).length;
    const withDiff = countItems.filter((i) => i.difference != null && i.difference !== 0).length;
    const positive = countItems.filter((i) => (i.difference ?? 0) > 0).length;
    const negative = countItems.filter((i) => (i.difference ?? 0) < 0).length;
    return { total: countItems.length, counted, withDiff, positive, negative };
  }, [countItems]);

  // ==================== DETAIL VIEW ====================
  if (selectedCountId && selectedCount) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedCountId(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-heading text-2xl font-bold text-foreground">{selectedCount.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedCount.count_date), "dd/MM/yyyy", { locale: es })}
                  {" · "}Creado por {profileMap.get(selectedCount.created_by) || "—"}
                </p>
              </div>
              <Badge variant={statusVariant[selectedCount.status]}>{statusLabels[selectedCount.status]}</Badge>
            </div>
            <div className="flex gap-2">
              {isDraft && (
                <Button onClick={() => moveToReview.mutate()} disabled={moveToReview.isPending}>
                  Enviar a revisión
                </Button>
              )}
              {isReview && isAdmin && (
                <Button onClick={() => approveCount.mutate()} disabled={approveCount.isPending} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Aprobar y ajustar
                </Button>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-heading text-lg font-bold">{summary.total}</p></CardContent></Card>
            <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Contados</p><p className="font-heading text-lg font-bold">{summary.counted}</p></CardContent></Card>
            <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Con diferencia</p><p className="font-heading text-lg font-bold">{summary.withDiff}</p></CardContent></Card>
            <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Sobrantes</p><p className="font-heading text-lg font-bold text-emerald-600">{summary.positive}</p></CardContent></Card>
            <Card><CardContent className="pt-3 pb-3"><p className="text-xs text-muted-foreground">Faltantes</p><p className="font-heading text-lg font-bold text-destructive">{summary.negative}</p></CardContent></Card>
          </div>

          {/* Items table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Stock Sistema</TableHead>
                    <TableHead className="text-right">Conteo Real</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countItems?.map((item) => (
                    <TableRow key={item.id} className={item.difference && item.difference !== 0 ? (item.difference > 0 ? "bg-emerald-50/50" : "bg-destructive/5") : ""}>
                      <TableCell className="font-medium">{(item as any).products?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{(item as any).products?.unit ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(item.system_stock).toLocaleString("es-CO")}</TableCell>
                      <TableCell className="text-right">
                        {isDraft ? (
                          <Input
                            type="number"
                            step="any"
                            className="w-24 ml-auto text-right h-8"
                            value={item.counted_stock ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              updateItem.mutate({ itemId: item.id, countedStock: val });
                            }}
                          />
                        ) : (
                          item.counted_stock != null ? Number(item.counted_stock).toLocaleString("es-CO") : "—"
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${(item.difference ?? 0) > 0 ? "text-emerald-600" : (item.difference ?? 0) < 0 ? "text-destructive" : ""}`}>
                        {item.difference != null ? (item.difference > 0 ? "+" : "") + Number(item.difference).toLocaleString("es-CO") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Inventario Físico</h1>
            <p className="text-sm text-muted-foreground">Conteos, comparación y conciliación de inventario</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Conteo
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>
            ) : !counts?.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <ClipboardCheck className="h-10 w-10 opacity-40" />
                <p>No hay conteos registrados</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Bodega</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado por</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedCountId(c.id)}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{format(new Date(c.count_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{(c as any).warehouses?.name ?? "Todas"}</TableCell>
                      <TableCell>{(c as any).categories?.name ?? "Todas"}</TableCell>
                      <TableCell><Badge variant={statusVariant[c.status]}>{statusLabels[c.status]}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profileMap.get(c.created_by) || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedCountId(c.id)}><Eye className="h-4 w-4" /></Button>
                          {c.status === "draft" && isAdmin && (
                            <Button variant="ghost" size="icon" onClick={() => deleteCount.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Conteo Físico</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre *</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Conteo semanal cocina" />
              </div>
              <div>
                <label className="text-sm font-medium">Bodega (opcional)</label>
                <Select value={formWarehouse} onValueChange={setFormWarehouse}>
                  <SelectTrigger><SelectValue placeholder="Todas las bodegas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {warehouses?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Categoría (opcional)</label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Notas</label>
                <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Observaciones..." />
              </div>
              <Button onClick={() => createCount.mutate()} disabled={createCount.isPending || !formName.trim()} className="w-full">
                Crear conteo y cargar productos
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
