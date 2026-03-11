import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Shirt, Bed } from "lucide-react";

const TYPE_LABELS: Record<string, string> = { hotel_linen: "Ropa de Cama/Hotel", guest_personal: "Ropa Personal Huésped" };
const STATUS_LABELS: Record<string, string> = { pending: "Pendiente", washing: "Lavando", ready: "Lista", delivered: "Entregada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = { pending: "outline", washing: "secondary", ready: "default", delivered: "secondary" };

const LINEN_ITEMS = ["Sábanas", "Fundas de almohada", "Cobija", "Protector de colchón", "Toallas de baño", "Toallas de mano", "Toallas de piso"];
const PERSONAL_ITEMS = ["Camisas", "Pantalones", "Ropa interior", "Medias", "Overol", "Otro"];

interface LaundryItem { name: string; quantity: number; }
interface LaundryForm {
  laundry_type: string; room_id: string; stay_id: string; company_id: string; guest_id: string;
  items: LaundryItem[]; notes: string;
}
const emptyForm: LaundryForm = { laundry_type: "hotel_linen", room_id: "", stay_id: "", company_id: "", guest_id: "", items: [], notes: "" };

export default function LaundryTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LaundryForm>(emptyForm);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["laundry-orders", filterStatus, filterType],
    queryFn: async () => {
      let q = supabase.from("laundry_orders" as any)
        .select("*, rooms(room_number), hotel_companies(name), hotel_guests(first_name, last_name)")
        .order("created_at", { ascending: false }).limit(100);
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      if (filterType !== "all") q = q.eq("laundry_type", filterType);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: activeStays } = useQuery({
    queryKey: ["active-stays-for-laundry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stays" as any)
        .select("id, room_id, company_id, rooms(room_number), hotel_companies(name), stay_guests(guest_id, is_primary, hotel_guests(id, first_name, last_name))")
        .eq("status", "checked_in").order("check_in_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms-all-laundry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any).select("id, room_number").order("room_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const addItem = (name: string) => {
    const existing = form.items.find(i => i.name === name);
    if (existing) {
      setForm({ ...form, items: form.items.map(i => i.name === name ? { ...i, quantity: i.quantity + 1 } : i) });
    } else {
      setForm({ ...form, items: [...form.items, { name, quantity: 1 }] });
    }
  };

  const removeItem = (name: string) => setForm({ ...form, items: form.items.filter(i => i.name !== name) });
  const updateQty = (name: string, qty: number) => {
    if (qty <= 0) return removeItem(name);
    setForm({ ...form, items: form.items.map(i => i.name === name ? { ...i, quantity: qty } : i) });
  };

  const handleStayChange = (stayId: string) => {
    const stay = activeStays?.find((s: any) => s.id === stayId);
    setForm(prev => ({
      ...prev, stay_id: stayId,
      room_id: stay?.room_id || "", company_id: stay?.company_id || "",
    }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin restaurante o usuario");
      if (form.items.length === 0) throw new Error("Agregue al menos un artículo");

      const { error } = await supabase.from("laundry_orders" as any).insert({
        restaurant_id: restaurantId,
        laundry_type: form.laundry_type,
        stay_id: form.stay_id || null,
        room_id: form.room_id || null,
        company_id: form.company_id || null,
        guest_id: form.guest_id || null,
        items: form.items,
        notes: form.notes.trim() || null,
        created_by: user.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laundry-orders"] });
      setOpen(false);
      setForm(emptyForm);
      toast({ title: "Orden de lavandería creada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, newStatus }: { orderId: string; newStatus: string }) => {
      const updateData: any = { status: newStatus };
      if (newStatus === "delivered") updateData.completed_at = new Date().toISOString();
      const { error } = await supabase.from("laundry_orders" as any).update(updateData).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laundry-orders"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const suggestedItems = form.laundry_type === "hotel_linen" ? LINEN_ITEMS : PERSONAL_ITEMS;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h3 className="text-lg font-semibold text-foreground">Lavandería</h3>
        <div className="flex gap-2 items-center">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="hotel_linen">Ropa de Hotel</SelectItem>
              <SelectItem value="guest_personal">Ropa Personal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="washing">Lavando</SelectItem>
              <SelectItem value="ready">Lista</SelectItem>
              <SelectItem value="delivered">Entregada</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva Orden</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Habitación</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Huésped</TableHead>
            <TableHead>Artículos</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="w-44">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           orders?.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin órdenes</TableCell></TableRow> :
           orders?.map((o: any) => {
            const items = (o.items as LaundryItem[]) || [];
            const totalPieces = items.reduce((s, i) => s + i.quantity, 0);
            return (
              <TableRow key={o.id}>
                <TableCell>
                  <Badge variant="outline" className="gap-1">
                    {o.laundry_type === "hotel_linen" ? <Bed className="h-3 w-3" /> : <Shirt className="h-3 w-3" />}
                    {TYPE_LABELS[o.laundry_type] || o.laundry_type}
                  </Badge>
                </TableCell>
                <TableCell>#{o.rooms?.room_number || "—"}</TableCell>
                <TableCell>{o.hotel_companies?.name || "—"}</TableCell>
                <TableCell>{o.hotel_guests ? `${o.hotel_guests.first_name} ${o.hotel_guests.last_name}` : "—"}</TableCell>
                <TableCell>{totalPieces} piezas</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status] || o.status}</Badge></TableCell>
                <TableCell>{format(new Date(o.created_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {o.status === "pending" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ orderId: o.id, newStatus: "washing" })}>Lavar</Button>
                    )}
                    {o.status === "washing" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ orderId: o.id, newStatus: "ready" })}>Lista</Button>
                    )}
                    {o.status === "ready" && (
                      <Button variant="default" size="sm" onClick={() => updateStatusMutation.mutate({ orderId: o.id, newStatus: "delivered" })}>Entregar</Button>
                    )}
                    {o.status === "delivered" && <span className="text-xs text-muted-foreground">Entregada</span>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* New Order Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Orden de Lavandería</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Lavandería</Label>
              <Select value={form.laundry_type} onValueChange={v => setForm({ ...form, laundry_type: v, items: [] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel_linen"><Bed className="h-3.5 w-3.5 inline mr-1" />Ropa de Cama / Hotel</SelectItem>
                  <SelectItem value="guest_personal"><Shirt className="h-3.5 w-3.5 inline mr-1" />Ropa Personal Huésped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Estancia Activa (opcional)</Label>
              <Select value={form.stay_id} onValueChange={handleStayChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar estancia..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin estancia</SelectItem>
                  {activeStays?.map((s: any) => {
                    const primary = s.stay_guests?.find((sg: any) => sg.is_primary);
                    const name = primary?.hotel_guests ? `${primary.hotel_guests.first_name} ${primary.hotel_guests.last_name}` : "";
                    return <SelectItem key={s.id} value={s.id}>Hab #{s.rooms?.room_number} — {name} {s.hotel_companies?.name ? `(${s.hotel_companies.name})` : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {!form.stay_id && (
              <div>
                <Label>Habitación</Label>
                <Select value={form.room_id} onValueChange={v => setForm({ ...form, room_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{rooms?.map((r: any) => <SelectItem key={r.id} value={r.id}>#{r.room_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {form.laundry_type === "guest_personal" && form.stay_id && (
              <div>
                <Label>Huésped</Label>
                <Select value={form.guest_id} onValueChange={v => setForm({ ...form, guest_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar huésped..." /></SelectTrigger>
                  <SelectContent>
                    {activeStays?.find((s: any) => s.id === form.stay_id)?.stay_guests?.map((sg: any) => (
                      <SelectItem key={sg.guest_id} value={sg.guest_id}>
                        {sg.hotel_guests?.first_name} {sg.hotel_guests?.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="mb-2 block">Artículos</Label>
              <div className="flex flex-wrap gap-1 mb-3">
                {suggestedItems.map(name => (
                  <Button key={name} type="button" variant="outline" size="sm" className="text-xs" onClick={() => addItem(name)}>+ {name}</Button>
                ))}
              </div>
              {form.items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Agregue artículos</p>
              ) : (
                <div className="space-y-2">
                  {form.items.map(item => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{item.name}</span>
                      <Input type="number" className="w-16" min={1} value={item.quantity}
                        onChange={e => updateQty(item.name, +e.target.value)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.name)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={form.items.length === 0 || createMutation.isPending}>
              {createMutation.isPending ? "Creando..." : "Crear Orden"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
