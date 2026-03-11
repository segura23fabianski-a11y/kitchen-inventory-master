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
import { Plus, Edit, ArrowRightLeft } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  bedding: "Ropa de Cama",
  towels: "Toallas",
  pillows: "Almohadas/Cobijas",
  other: "Otro",
};

const LOCATION_LABELS: Record<string, string> = {
  available: "En Bodega",
  in_use: "En Habitaciones",
  in_laundry: "En Lavandería",
  damaged: "Dañados",
};

interface LinenForm {
  id?: string;
  item_name: string;
  category: string;
  total_quantity: number;
  condition_notes: string;
}
const emptyForm: LinenForm = { item_name: "", category: "bedding", total_quantity: 0, condition_notes: "" };

interface TransferForm {
  linen: any;
  from: string;
  to: string;
  quantity: number;
}

export default function LinenInventoryTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LinenForm>(emptyForm);
  const [transferDialog, setTransferDialog] = useState<TransferForm | null>(null);

  const { data: linens, isLoading } = useQuery({
    queryKey: ["hotel-linen-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_linen_inventory")
        .select("*")
        .eq("active", true)
        .order("category")
        .order("item_name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      if (!form.item_name.trim()) throw new Error("Nombre requerido");

      const payload = {
        restaurant_id: restaurantId,
        item_name: form.item_name.trim(),
        category: form.category,
        total_quantity: form.total_quantity,
        available: form.total_quantity,
        condition_notes: form.condition_notes.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase.from("hotel_linen_inventory").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hotel_linen_inventory").insert(payload);
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

  const transferMutation = useMutation({
    mutationFn: async (t: TransferForm) => {
      if (t.quantity <= 0) throw new Error("Cantidad debe ser mayor a 0");
      const currentFrom = t.linen[t.from] as number;
      if (t.quantity > currentFrom) throw new Error(`Solo hay ${currentFrom} en ${LOCATION_LABELS[t.from]}`);

      const update: Record<string, number> = {
        [t.from]: currentFrom - t.quantity,
        [t.to]: (t.linen[t.to] as number) + t.quantity,
      };

      const { error } = await supabase
        .from("hotel_linen_inventory")
        .update(update)
        .eq("id", t.linen.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotel-linen-inventory"] });
      setTransferDialog(null);
      toast({ title: "Transferencia realizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editItem = (item: any) => {
    setForm({
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      total_quantity: item.total_quantity,
      condition_notes: item.condition_notes || "",
    });
    setOpen(true);
  };

  const openTransfer = (linen: any) => {
    setTransferDialog({ linen, from: "available", to: "in_use", quantity: 1 });
  };

  const transferLocations = ["available", "in_use", "in_laundry", "damaged"];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Inventario de Lencería Hotelera</h3>
        <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />Nuevo Artículo
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Textiles y dotación reutilizable: sábanas, fundas, toallas, almohadas, cobijas.
        Los consumibles (químicos, amenities) se gestionan en el inventario operativo.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artículo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>En Bodega</TableHead>
            <TableHead>En Habitaciones</TableHead>
            <TableHead>En Lavandería</TableHead>
            <TableHead>Dañados</TableHead>
            <TableHead className="w-28">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
          ) : linens?.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin artículos</TableCell></TableRow>
          ) : linens?.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{l.item_name}</TableCell>
              <TableCell><Badge variant="outline">{CATEGORY_LABELS[l.category] || l.category}</Badge></TableCell>
              <TableCell>{l.total_quantity}</TableCell>
              <TableCell>
                <Badge variant={l.available > 0 ? "default" : "secondary"}>{l.available}</Badge>
              </TableCell>
              <TableCell>{l.in_use}</TableCell>
              <TableCell>{l.in_laundry}</TableCell>
              <TableCell>
                {(l as any).damaged > 0 ? (
                  <Badge variant="destructive">{(l as any).damaged}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" title="Editar" onClick={() => editItem(l)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" title="Transferir" onClick={() => openTransfer(l)}>
                    <ArrowRightLeft className="h-4 w-4" />
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
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Artículo" : "Nuevo Artículo de Lencería"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="Ej: Sábana doble blanca" />
            </div>
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
            <div>
              <Label>Cantidad Total</Label>
              <Input type="number" min={0} value={form.total_quantity} onChange={e => setForm({ ...form, total_quantity: +e.target.value })} />
            </div>
            <div>
              <Label>Notas de Condición</Label>
              <Input value={form.condition_notes} onChange={e => setForm({ ...form, condition_notes: e.target.value })} placeholder="Estado general..." />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.item_name.trim()}>
              {saveMutation.isPending ? "Guardando..." : form.id ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!transferDialog} onOpenChange={() => setTransferDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transferir — {transferDialog?.linen?.item_name}</DialogTitle>
          </DialogHeader>
          {transferDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Mover unidades entre ubicaciones (bodega, habitaciones, lavandería, dañados).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desde</Label>
                  <Select
                    value={transferDialog.from}
                    onValueChange={v => setTransferDialog({ ...transferDialog, from: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {transferLocations.filter(l => l !== transferDialog.to).map(loc => (
                        <SelectItem key={loc} value={loc}>
                          {LOCATION_LABELS[loc]} ({transferDialog.linen[loc] ?? 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hacia</Label>
                  <Select
                    value={transferDialog.to}
                    onValueChange={v => setTransferDialog({ ...transferDialog, to: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {transferLocations.filter(l => l !== transferDialog.from).map(loc => (
                        <SelectItem key={loc} value={loc}>
                          {LOCATION_LABELS[loc]} ({transferDialog.linen[loc] ?? 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  max={transferDialog.linen[transferDialog.from] ?? 0}
                  value={transferDialog.quantity}
                  onChange={e => setTransferDialog({ ...transferDialog, quantity: +e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Disponible en {LOCATION_LABELS[transferDialog.from]}: {transferDialog.linen[transferDialog.from] ?? 0}
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => transferMutation.mutate(transferDialog)}
                disabled={transferMutation.isPending || transferDialog.quantity <= 0 || transferDialog.from === transferDialog.to}
              >
                {transferMutation.isPending ? "Transfiriendo..." : "Transferir"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
