import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function POSTablesTab() {
  const { restaurantId } = useRestaurant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [active, setActive] = useState(true);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["pos-tables", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_tables")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        restaurant_id: restaurantId!,
        name: name.trim(),
        zone: zone.trim(),
        capacity: parseInt(capacity) || 4,
        active,
      };
      if (editId) {
        const { error } = await supabase.from("pos_tables").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pos_tables").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-tables"] });
      toast.success(editId ? "Mesa actualizada" : "Mesa creada");
      closeDialog();
    },
    onError: () => toast.error("Error al guardar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-tables"] });
      toast.success("Mesa eliminada");
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setZone("");
    setCapacity("4");
    setActive(true);
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setName(t.name);
    setZone(t.zone || "");
    setCapacity(String(t.capacity));
    setActive(t.active);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mesas</h2>
        <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Mesa</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Zona</TableHead>
            <TableHead>Capacidad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map(t => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.zone || "—"}</TableCell>
              <TableCell>{t.capacity}</TableCell>
              <TableCell>
                <Badge variant={t.status === "available" ? "default" : "destructive"}>
                  {t.status === "available" ? "Disponible" : "Ocupada"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && tables.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No hay mesas registradas</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Mesa" : "Nueva Mesa"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mesa 1" /></div>
            <div><Label>Zona</Label><Input value={zone} onChange={e => setZone(e.target.value)} placeholder="Ej: Terraza" /></div>
            <div><Label>Capacidad</Label><Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} /><Label>Activa</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
