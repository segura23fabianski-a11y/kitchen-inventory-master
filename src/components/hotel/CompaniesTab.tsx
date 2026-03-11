import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface CompanyForm { name: string; nit: string; contact_name: string; phone: string; email: string; address: string; active: boolean; }
const emptyForm: CompanyForm = { name: "", nit: "", contact_name: "", phone: "", email: "", address: "", active: true };

export default function CompaniesTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["hotel-companies"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_companies" as any).select("*").order("name"); if (error) throw error; return data as any[]; },
  });

  const filtered = companies?.filter((c: any) => `${c.name} ${c.nit || ""}`.toLowerCase().includes(search.toLowerCase()));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = { restaurant_id: restaurantId, name: form.name.trim(), nit: form.nit.trim() || null, contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, active: form.active };
      if (editId) { const { error } = await supabase.from("hotel_companies" as any).update(payload as any).eq("id", editId); if (error) throw error; }
      else { const { error } = await supabase.from("hotel_companies" as any).insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotel-companies"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast({ title: editId ? "Empresa actualizada" : "Empresa creada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("hotel_companies" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotel-companies"] }); setDeleteId(null); toast({ title: "Empresa eliminada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (c: any) => { setEditId(c.id); setForm({ name: c.name, nit: c.nit || "", contact_name: c.contact_name || "", phone: c.phone || "", email: c.email || "", address: c.address || "", active: c.active }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva Empresa</Button>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>NIT</TableHead><TableHead>Contacto</TableHead><TableHead>Estado</TableHead><TableHead className="w-24">Acciones</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           filtered?.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin resultados</TableCell></TableRow> :
           filtered?.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.nit || "—"}</TableCell>
              <TableCell>{c.contact_name || "—"}</TableCell>
              <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Activa" : "Inactiva"}</Badge></TableCell>
              <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nueva"} Empresa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>NIT</Label><Input value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contacto</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Activa</Label></div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>{saveMutation.isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
