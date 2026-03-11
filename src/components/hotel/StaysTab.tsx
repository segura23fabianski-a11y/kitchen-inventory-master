import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, LogIn, LogOut, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = { checked_in: "Hospedado", checked_out: "Check-out", cancelled: "Cancelada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = { checked_in: "default", checked_out: "secondary", cancelled: "destructive" };

interface StayForm {
  room_id: string; company_id: string; guest_id: string;
  expected_check_out: string; rate_per_night: number; payment_method: string; notes: string;
}
const emptyForm: StayForm = { room_id: "", company_id: "", guest_id: "", expected_check_out: "", rate_per_night: 0, payment_method: "", notes: "" };

export default function StaysTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StayForm>(emptyForm);
  const [detailStay, setDetailStay] = useState<any>(null);

  const { data: rooms } = useQuery({
    queryKey: ["rooms-available"],
    queryFn: async () => { const { data, error } = await supabase.from("rooms" as any).select("id, room_number, room_types(name, base_rate)").eq("status", "available").order("room_number"); if (error) throw error; return data as any[]; },
  });

  const { data: guests } = useQuery({
    queryKey: ["hotel-guests"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_guests" as any).select("id, first_name, last_name, document_number").order("last_name"); if (error) throw error; return data as any[]; },
  });

  const { data: companies } = useQuery({
    queryKey: ["hotel-companies-active"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_companies" as any).select("id, name").eq("active", true).order("name"); if (error) throw error; return data as any[]; },
  });

  const { data: stays, isLoading } = useQuery({
    queryKey: ["stays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stays" as any).select("*, rooms(room_number, room_types(name)), hotel_companies(name), stay_guests(*, hotel_guests(first_name, last_name, document_number))").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin restaurante o usuario");
      if (!form.room_id || !form.guest_id) throw new Error("Seleccione habitación y huésped");

      const selectedRoom = rooms?.find((r: any) => r.id === form.room_id);
      const rate = form.rate_per_night || selectedRoom?.room_types?.base_rate || 0;

      // Create stay
      const { data: stay, error } = await supabase.from("stays" as any).insert({
        restaurant_id: restaurantId, room_id: form.room_id,
        company_id: form.company_id || null,
        expected_check_out: form.expected_check_out || null,
        rate_per_night: rate, payment_method: form.payment_method || null,
        notes: form.notes.trim() || null, created_by: user.id,
      } as any).select("id").single();
      if (error) throw error;

      // Add primary guest
      const { error: gErr } = await supabase.from("stay_guests" as any).insert({ stay_id: (stay as any).id, guest_id: form.guest_id, is_primary: true } as any);
      if (gErr) throw gErr;

      // Update room status
      const { error: rErr } = await supabase.from("rooms" as any).update({ status: "occupied" } as any).eq("id", form.room_id);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stays"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-available"] });
      setOpen(false); setForm(emptyForm);
      toast({ title: "Check-in registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (stayId: string) => {
      const stay = stays?.find((s: any) => s.id === stayId);
      if (!stay) throw new Error("Estancia no encontrada");

      // Calculate total
      const checkIn = new Date(stay.check_in_at);
      const now = new Date();
      const nights = Math.max(1, Math.ceil((now.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
      const total = nights * (stay.rate_per_night || 0);

      const { error } = await supabase.from("stays" as any).update({ check_out_at: now.toISOString(), status: "checked_out", total_amount: total } as any).eq("id", stayId);
      if (error) throw error;

      // Room to cleaning
      const { error: rErr } = await supabase.from("rooms" as any).update({ status: "cleaning" } as any).eq("id", stay.room_id);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stays"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-available"] });
      toast({ title: "Check-out completado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleRoomChange = (roomId: string) => {
    const room = rooms?.find((r: any) => r.id === roomId);
    setForm({ ...form, room_id: roomId, rate_per_night: room?.room_types?.base_rate || form.rate_per_night });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Estancias</h3>
        <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuevo Check-in</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>Habitación</TableHead><TableHead>Huésped</TableHead><TableHead>Empresa</TableHead><TableHead>Check-in</TableHead><TableHead>Estado</TableHead><TableHead>Total</TableHead><TableHead className="w-24">Acciones</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           stays?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin estancias</TableCell></TableRow> :
           stays?.map((s: any) => {
            const primary = s.stay_guests?.find((sg: any) => sg.is_primary);
            const guestName = primary?.hotel_guests ? `${primary.hotel_guests.first_name} ${primary.hotel_guests.last_name}` : "—";
            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.rooms?.room_number || "—"}</TableCell>
                <TableCell>{guestName}</TableCell>
                <TableCell>{s.hotel_companies?.name || "—"}</TableCell>
                <TableCell>{format(new Date(s.check_in_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[s.status] || "secondary"}>{STATUS_LABELS[s.status] || s.status}</Badge></TableCell>
                <TableCell>${(s.total_amount || 0).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {s.status === "checked_in" && (
                      <Button variant="ghost" size="icon" title="Check-out" onClick={() => checkOutMutation.mutate(s.id)}>
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Ver detalle" onClick={() => setDetailStay(s)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Check-in Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Check-in</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Habitación *</Label>
              <Select value={form.room_id} onValueChange={handleRoomChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar habitación..." /></SelectTrigger>
                <SelectContent>{rooms?.map((r: any) => <SelectItem key={r.id} value={r.id}>#{r.room_number} — {r.room_types?.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Huésped Principal *</Label>
              <Select value={form.guest_id} onValueChange={v => setForm({ ...form, guest_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar huésped..." /></SelectTrigger>
                <SelectContent>{guests?.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.first_name} {g.last_name} ({g.document_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Empresa (opcional)</Label>
              <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Ninguna</SelectItem>{companies?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tarifa/Noche</Label><Input type="number" value={form.rate_per_night} onChange={e => setForm({ ...form, rate_per_night: +e.target.value })} /></div>
              <div><Label>Check-out Esperado</Label><Input type="datetime-local" value={form.expected_check_out} onChange={e => setForm({ ...form, expected_check_out: e.target.value })} /></div>
            </div>
            <div><Label>Método de Pago</Label><Input value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} placeholder="Efectivo, tarjeta, transferencia..." /></div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button className="w-full" onClick={() => checkInMutation.mutate()} disabled={!form.room_id || !form.guest_id || checkInMutation.isPending}>
              <LogIn className="h-4 w-4 mr-2" />{checkInMutation.isPending ? "Registrando..." : "Registrar Check-in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailStay} onOpenChange={() => setDetailStay(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle de Estancia</DialogTitle></DialogHeader>
          {detailStay && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Habitación:</span> #{detailStay.rooms?.room_number} ({detailStay.rooms?.room_types?.name})</p>
              <p><span className="font-medium">Check-in:</span> {format(new Date(detailStay.check_in_at), "PPpp", { locale: es })}</p>
              {detailStay.check_out_at && <p><span className="font-medium">Check-out:</span> {format(new Date(detailStay.check_out_at), "PPpp", { locale: es })}</p>}
              <p><span className="font-medium">Tarifa:</span> ${detailStay.rate_per_night?.toLocaleString()}/noche</p>
              <p><span className="font-medium">Total:</span> ${detailStay.total_amount?.toLocaleString()}</p>
              {detailStay.hotel_companies?.name && <p><span className="font-medium">Empresa:</span> {detailStay.hotel_companies.name}</p>}
              <p className="font-medium pt-2">Huéspedes:</p>
              {detailStay.stay_guests?.map((sg: any) => (
                <p key={sg.id} className="ml-2">• {sg.hotel_guests?.first_name} {sg.hotel_guests?.last_name} ({sg.hotel_guests?.document_number}) {sg.is_primary && <Badge variant="outline" className="ml-1">Principal</Badge>}</p>
              ))}
              {detailStay.notes && <p><span className="font-medium">Notas:</span> {detailStay.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
