import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Package, BedDouble } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  bedding: "Ropa de Cama", towels: "Toallas", pillows: "Almohadas/Cobijas", other: "Otro",
};

interface LinenForm {
  id?: string; item_name: string; category: string; total_quantity: number; condition_notes: string;
}
const emptyForm: LinenForm = { item_name: "", category: "bedding", total_quantity: 0, condition_notes: "" };

export default function LinenInventoryTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LinenForm>(emptyForm);
  const [assignDialog, setAssignDialog] = useState<any>(null);
  const [assignRoom, setAssignRoom] = useState("");
  const [assignQty, setAssignQty] = useState(1);

  const { data: linens, isLoading } = useQuery({
    queryKey: ["hotel-linen-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_linen_inventory" as any)
        .select("*").eq("active", true).order("category").order("item_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["linen-room-assignments", assignDialog?.id],
    queryFn: async () => {
      if (!assignDialog) return [];
      const { data, error } = await supabase.from("hotel_linen_room_assignments" as any)
        .select("*, rooms(room_number)").eq("linen_id", assignDialog.id).order("rooms(room_number)");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!assignDialog,
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms-for-linen"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any).select("id, room_number").order("room_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      if (!form.item_name.trim()) throw new Error("Nombre requerido");
      const payload: any = {
        restaurant_id: restaurantId,
        item_name: form.item_name.trim(),
        category: form.category,
        total_quantity: form.total_quantity,
        available: form.total_quantity, // initially all available
        condition_notes: form.condition_notes.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase.from("hotel_linen_inventory" as any).update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hotel_linen_inventory" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel-linen-inventory"] });
      setOpen(false);
      setForm(emptyForm);
      toast({ title: form.id ? "Artículo actualizado" : "Artículo creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !assignDialog || !assignRoom) throw new Error("Datos incompletos");
      const { error } = await supabase.from("hotel_linen_room_assignments" as any).insert({
        restaurant_id: restaurantId, linen_id: assignDialog.id, room_id: assignRoom, quantity: assignQty,
      } as any);
      if (error) throw error;
      // Update in_use count
      const { data: totalAssigned } = await supabase.from("hotel_linen_room_assignments" as any)
        .select("quantity").eq("linen_id", assignDialog.id);
      const inUse = (totalAssigned as any[])?.reduce((s, a) => s + a.quantity, 0) || 0;
      await supabase.from("hotel_linen_inventory" as any).update({
        in_use: inUse, available: Math.max(0, assignDialog.total_quantity - inUse - (assignDialog.in_laundry || 0)),
      } as any).eq("id", assignDialog.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linen-room-assignments"] });
      qc.invalidateQueries({ queryKey: ["hotel-linen-inventory"] });
      setAssignRoom("");
      setAssignQty(1);
      toast({ title: "Asignación creada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("hotel_linen_room_assignments" as any).delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linen-room-assignments"] });
      qc.invalidateQueries({ queryKey: ["hotel-linen-inventory"] });
      toast({ title: "Asignación eliminada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editItem = (item: any) => {
    setForm({ id: item.id, item_name: item.item_name, category: item.category, total_quantity: item.total_quantity, condition_notes: item.condition_notes || "" });
    setOpen(true);
  };

  const assignedRoomIds = assignments?.map((a: any) => a.room_id) || [];
  const availableRooms = rooms?.filter((r: any) => !assignedRoomIds.includes(r.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Inventario de Lencería Hotelera</h3>
        <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuevo Artículo</Button>
      </div>
      <p className="text-sm text-muted-foreground">Artículos reutilizables: sábanas, toallas, almohadas, cobijas. Los consumibles (químicos, amenities) se gestionan en el inventario operativo.</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artículo</TableHead><TableHead>Categoría</TableHead><TableHead>Total</TableHead>
            <TableHead>En Uso</TableHead><TableHead>En Lavandería</TableHead><TableHead>Disponible</TableHead>
            <TableHead className="w-36">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           linens?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin artículos</TableCell></TableRow> :
           linens?.map((l: any) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{l.item_name}</TableCell>
              <TableCell><Badge variant="outline">{CATEGORY_LABELS[l.category] || l.category}</Badge></TableCell>
              <TableCell>{l.total_quantity}</TableCell>
              <TableCell>{l.in_use}</TableCell>
              <TableCell>{l.in_laundry}</TableCell>
              <TableCell>
                <Badge variant={l.available > 0 ? "default" : "destructive"}>{l.available}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" title="Editar" onClick={() => editItem(l)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => { setAssignDialog(l); setAssignRoom(""); setAssignQty(1); }}>
                    <BedDouble className="h-4 w-4 mr-1" />Asignar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Editar Artículo" : "Nuevo Artículo de Lencería"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre *</Label><Input value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="Ej: Sábana doble blanca" /></div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bedding">Ropa de Cama</SelectItem>
                  <SelectItem value="towels">Toallas</SelectItem>
                  <SelectItem value="pillows">Almohadas/Cobijas</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad Total</Label><Input type="number" min={0} value={form.total_quantity} onChange={e => setForm({ ...form, total_quantity: +e.target.value })} /></div>
            <div><Label>Notas de Condición</Label><Input value={form.condition_notes} onChange={e => setForm({ ...form, condition_notes: e.target.value })} placeholder="Estado general..." /></div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.item_name.trim()}>
              {saveMutation.isPending ? "Guardando..." : form.id ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Assignment Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Asignar a Habitación — {assignDialog?.item_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Total: {assignDialog?.total_quantity} | En uso: {assignDialog?.in_use} | Disponible: {assignDialog?.available}
            </p>

            {/* Current assignments */}
            {assignments && assignments.length > 0 && (
              <div>
                <Label className="mb-2 block">Asignaciones Actuales</Label>
                <div className="space-y-1">
                  {assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
                      <span>Hab #{a.rooms?.room_number} — {a.quantity} und.</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeAssignmentMutation.mutate(a.id)}>Quitar</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Habitación</Label>
                <Select value={assignRoom} onValueChange={setAssignRoom}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {availableRooms?.map((r: any) => <SelectItem key={r.id} value={r.id}>#{r.room_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input type="number" min={1} value={assignQty} onChange={e => setAssignQty(+e.target.value)} />
              </div>
            </div>
            <Button className="w-full" onClick={() => assignMutation.mutate()} disabled={!assignRoom || assignMutation.isPending}>
              {assignMutation.isPending ? "Asignando..." : "Asignar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
