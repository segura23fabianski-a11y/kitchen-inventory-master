import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUS_LABELS: Record<string, string> = { available: "Disponible", occupied: "Ocupada", maintenance: "Mantenimiento", cleaning: "Limpieza" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = { available: "default", occupied: "destructive", maintenance: "outline", cleaning: "secondary" };

interface RoomForm { room_number: string; floor: string; room_type_id: string; status: string; notes: string; }
const emptyForm: RoomForm = { room_number: "", floor: "", room_type_id: "", status: "available", notes: "" };

export default function RoomsTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: roomTypes } = useQuery({
    queryKey: ["room-types"],
    queryFn: async () => { const { data, error } = await supabase.from("room_types" as any).select("id, name").eq("active", true).order("name"); if (error) throw error; return data as any[]; },
  });

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => { const { data, error } = await supabase.from("rooms" as any).select("*, room_types(name)").order("room_number"); if (error) throw error; return data as any[]; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = { restaurant_id: restaurantId, room_number: form.room_number.trim(), floor: form.floor.trim(), room_type_id: form.room_type_id, status: form.status, notes: form.notes.trim() };
      if (editId) {
        const { error } = await supabase.from("rooms" as any).update(payload as any).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rooms" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast({ title: editId ? "Habitación actualizada" : "Habitación creada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("rooms" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rooms"] }); setDeleteId(null); toast({ title: "Habitación eliminada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (r: any) => { setEditId(r.id); setForm({ room_number: r.room_number, floor: r.floor || "", room_type_id: r.room_type_id, status: r.status, notes: r.notes || "" }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Habitaciones</h3>
        <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva Habitación</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>Número</TableHead><TableHead>Piso</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead className="w-24">Acciones</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           rooms?.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No hay habitaciones</TableCell></TableRow> :
           rooms?.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.room_number}</TableCell>
              <TableCell>{r.floor || "—"}</TableCell>
              <TableCell>{(r as any).room_types?.name || "—"}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANTS[r.status] || "secondary"}>{STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nueva"} Habitación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Número *</Label><Input value={form.room_number} onChange={e => setForm({ ...form, room_number: e.target.value })} /></div>
              <div><Label>Piso</Label><Input value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} /></div>
            </div>
            <div><Label>Tipo de Habitación *</Label>
              <Select value={form.room_type_id} onValueChange={v => setForm({ ...form, room_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{roomTypes?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Estado</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.room_number.trim() || !form.room_type_id || saveMutation.isPending}>{saveMutation.isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar habitación?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
