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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCOP } from "@/lib/utils";

interface RoomTypeForm {
  name: string;
  description: string;
  base_rate: number;
  rate_single: number;
  rate_double: number;
  rate_triple: number;
  max_occupancy: number;
  active: boolean;
}

const emptyForm: RoomTypeForm = { name: "", description: "", base_rate: 0, rate_single: 0, rate_double: 0, rate_triple: 0, max_occupancy: 2, active: true };

export default function RoomTypesTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomTypeForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: types, isLoading } = useQuery({
    queryKey: ["room-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_types" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = {
        restaurant_id: restaurantId, name: form.name.trim(), description: form.description.trim(),
        base_rate: form.base_rate, rate_single: form.rate_single, rate_double: form.rate_double, rate_triple: form.rate_triple,
        max_occupancy: form.max_occupancy, active: form.active,
      };
      if (editId) {
        const { error } = await supabase.from("room_types" as any).update(payload as any).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("room_types" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["room-types"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast({ title: editId ? "Tipo actualizado" : "Tipo creado" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("room_types" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["room-types"] }); setDeleteId(null); toast({ title: "Tipo eliminado" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (t: any) => {
    setEditId(t.id);
    setForm({
      name: t.name, description: t.description || "", base_rate: t.base_rate,
      rate_single: t.rate_single || 0, rate_double: t.rate_double || 0, rate_triple: t.rate_triple || 0,
      max_occupancy: t.max_occupancy, active: t.active,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Tipos de Habitación</h3>
        <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuevo Tipo</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tarifa 1 pers.</TableHead>
            <TableHead>Tarifa 2 pers.</TableHead>
            <TableHead>Tarifa 3 pers.</TableHead>
            <TableHead>Capacidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-24">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           types?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No hay tipos registrados</TableCell></TableRow> :
           types?.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>${(t.rate_single || 0).toLocaleString()}</TableCell>
              <TableCell>${(t.rate_double || 0).toLocaleString()}</TableCell>
              <TableCell>{t.max_occupancy >= 3 ? `{formatCOP((t.rate_triple || 0))}` : "—"}</TableCell>
              <TableCell>{t.max_occupancy} personas</TableCell>
              <TableCell><Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Activo" : "Inactivo"}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nuevo"} Tipo de Habitación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Descripción</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Capacidad Máx.</Label><Input type="number" min={1} value={form.max_occupancy} onChange={e => setForm({ ...form, max_occupancy: +e.target.value })} /></div>
              <div><Label>Tarifa Base (legacy)</Label><Input type="number" value={form.base_rate} onChange={e => setForm({ ...form, base_rate: +e.target.value })} /></div>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium text-foreground">Tarifas por Ocupación</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tarifa 1 persona</Label><Input type="number" value={form.rate_single} onChange={e => setForm({ ...form, rate_single: +e.target.value })} /></div>
                <div><Label>Tarifa 2 personas</Label><Input type="number" value={form.rate_double} onChange={e => setForm({ ...form, rate_double: +e.target.value })} /></div>
              </div>
              {form.max_occupancy >= 3 && (
                <div><Label>Tarifa 3 personas</Label><Input type="number" value={form.rate_triple} onChange={e => setForm({ ...form, rate_triple: +e.target.value })} /></div>
              )}
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Activo</Label></div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>{saveMutation.isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar tipo?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
