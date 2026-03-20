import { useState } from "react";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Search, Pencil, Trash2, Truck, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface SupplierForm {
  name: string;
  nit: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
}

const emptyForm: SupplierForm = { name: "", nit: "", contact_name: "", phone: "", email: "", notes: "", active: true };

export default function Suppliers() {
  const restaurantId = useRestaurantId();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("suppliers_create");
  const { logAudit } = useAudit();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        nit: form.nit.trim() || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        active: form.active,
      };
      if (editId) {
        const { error } = await supabase.from("suppliers" as any).update(payload as any).eq("id", editId);
        if (error) throw error;
        await logAudit({ entityType: "supplier", entityId: editId, action: "UPDATE", after: payload });
      } else {
        const { data, error } = await supabase.from("suppliers" as any).insert(payload as any).select("id").single();
        if (error) throw error;
        await logAudit({ entityType: "supplier", entityId: (data as any).id, action: "CREATE", after: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: editId ? "Proveedor actualizado" : "Proveedor creado" });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers" as any).delete().eq("id", id);
      if (error) throw error;
      await logAudit({ entityType: "supplier", entityId: id, action: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Proveedor eliminado" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      nit: s.nit || "",
      contact_name: s.contact_name || "",
      phone: s.phone || "",
      email: s.email || "",
      notes: s.notes || "",
      active: s.active,
    });
    setOpen(true);
  };

  const filtered = suppliers?.filter((s: any) => {
    if (!fuzzyMatch(buildHaystack(s.name, s.nit, s.contact_name), search)) return false;
    if (filterActive === "active" && !s.active) return false;
    if (filterActive === "inactive" && s.active) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Proveedores</h1>
            <p className="text-muted-foreground text-sm">Gestiona tus proveedores y sus datos de contacto.</p>
          </div>
          {canCreate && (
            <Button onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo Proveedor
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
                {filterActive !== "all" && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterActive("all")}>
                    <X className="mr-1 h-3 w-3" /> Limpiar
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>NIT</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Estado</TableHead>
                    {canCreate && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : !filtered?.length ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin proveedores</TableCell></TableRow>
                  ) : filtered.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell>{s.nit || "—"}</TableCell>
                      <TableCell>{s.contact_name || "—"}</TableCell>
                      <TableCell>{s.phone || "—"}</TableCell>
                      <TableCell>{s.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.active ? "default" : "secondary"}>
                          {s.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      {canCreate && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditId(null); setForm(emptyForm); } else setOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>NIT / RUC</Label>
                <Input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contacto</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Activo</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.name.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
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
