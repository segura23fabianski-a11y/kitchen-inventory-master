import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Plus, Eye, X, LogIn, Trash2, CalendarPlus, Building2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import QuickCompanyDialog from "./QuickCompanyDialog";
import { formatCOP } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  checked_in: "Check-in realizado",
  cancelled: "Cancelada",
  no_show: "No Show",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  confirmed: "default",
  checked_in: "secondary",
  cancelled: "destructive",
  no_show: "destructive",
};

interface ReservationForm {
  company_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  check_in_date: string;
  check_out_date: string;
  notes: string;
  items: { room_type_id: string; quantity: number; rate_applied: number | null; notes: string }[];
}

const emptyForm: ReservationForm = {
  company_id: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  check_in_date: "",
  check_out_date: "",
  notes: "",
  items: [{ room_type_id: "", quantity: 1, rate_applied: null, notes: "" }],
};

interface ReservationsTabProps {
  onConvertToCheckin?: () => void;
}

export default function ReservationsTab({ onConvertToCheckin }: ReservationsTabProps) {
  const restaurantId = useRestaurantId();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ReservationForm>({ ...emptyForm });
  const [detailRes, setDetailRes] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [search, setSearch] = useState("");
  const [quickCompanyOpen, setQuickCompanyOpen] = useState(false);
  const [deleteResId, setDeleteResId] = useState<string | null>(null);

  const { data: roomTypes } = useQuery({
    queryKey: ["reservation-room-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_types").select("id, name, base_rate, max_occupancy").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["reservation-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_companies").select("id, name, nit").eq("active", true).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: companyRates } = useQuery({
    queryKey: ["reservation-company-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_rates").select("*").eq("active", true);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations" as any)
        .select("*, hotel_companies(name), reservation_items(*, room_types(name))")
        .order("check_in_date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Room availability query - count rooms per type
  const { data: roomCounts } = useQuery({
    queryKey: ["room-counts-by-type"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("id, room_type_id").order("room_type_id");
      if (error) throw error;
      // Group by room_type_id
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        counts[r.room_type_id] = (counts[r.room_type_id] || 0) + 1;
      });
      return counts;
    },
  });

  const companyOptions: SearchableSelectOption[] = [
    { value: "none", label: "Sin empresa" },
    ...(companies || []).map((c: any) => ({
      value: c.id,
      label: `${c.name}${c.nit ? ` (NIT: ${c.nit})` : ""}`,
      searchTerms: `${c.nit || ""} ${c.name}`,
    })),
  ];

  // Auto-apply corporate rate when company + room type change
  const applyRate = (companyId: string, roomTypeId: string) => {
    if (!companyId || companyId === "none" || !roomTypeId) return null;
    const rate = companyRates?.find((r: any) => r.company_id === companyId && r.room_type_id === roomTypeId);
    return rate ? rate.rate_per_night : null;
  };

  const updateItem = (index: number, field: string, value: any) => {
    const items = [...form.items];
    items[index] = { ...items[index], [field]: value };
    // Auto-apply rate when room_type changes
    if (field === "room_type_id") {
      const rate = applyRate(form.company_id, value);
      if (rate !== null) {
        items[index].rate_applied = rate;
      } else {
        const rt = roomTypes?.find(r => r.id === value);
        items[index].rate_applied = rt?.base_rate || null;
      }
    }
    setForm({ ...form, items });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { room_type_id: "", quantity: 1, rate_applied: null, notes: "" }] });
  };

  const removeItem = (index: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  // When company changes, recalculate all item rates
  const handleCompanyChange = (companyId: string) => {
    const items = form.items.map(item => {
      if (!item.room_type_id) return item;
      const rate = applyRate(companyId, item.room_type_id);
      if (rate !== null) {
        return { ...item, rate_applied: rate };
      }
      const rt = roomTypes?.find(r => r.id === item.room_type_id);
      return { ...item, rate_applied: rt?.base_rate || null };
    });
    setForm({ ...form, company_id: companyId, items });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin contexto");
      if (!form.check_in_date || !form.check_out_date) throw new Error("Fechas requeridas");
      if (form.items.some(i => !i.room_type_id || i.quantity < 1)) throw new Error("Items incompletos");

      const { data: res, error } = await supabase.from("reservations" as any).insert({
        restaurant_id: restaurantId,
        company_id: form.company_id && form.company_id !== "none" ? form.company_id : null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        status: "confirmed",
        notes: form.notes || null,
        created_by: user.id,
      } as any).select("id").single() as { data: any; error: any };
      if (error) throw error;

      const items = form.items.map(item => ({
        reservation_id: (res as any).id,
        restaurant_id: restaurantId,
        room_type_id: item.room_type_id,
        quantity: item.quantity,
        rate_applied: item.rate_applied,
        notes: item.notes || null,
      }));
      const { error: itemErr } = await supabase.from("reservation_items" as any).insert(items as any);
      if (itemErr) throw itemErr;
    },
    onSuccess: () => {
      toast({ title: "Reserva creada" });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      setOpen(false);
      setForm({ ...emptyForm });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("reservations" as any).update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Estado actualizado" });
      qc.invalidateQueries({ queryKey: ["reservations"] });
      setDetailRes(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Availability check for a given date range
  const getReservedCountForType = (roomTypeId: string, checkIn: string, checkOut: string, excludeResId?: string) => {
    if (!reservations) return 0;
    return reservations
      .filter((r: any) =>
        r.status !== "cancelled" && r.status !== "no_show" && r.status !== "checked_in" &&
        r.id !== excludeResId &&
        r.check_in_date < checkOut && r.check_out_date > checkIn
      )
      .reduce((sum: number, r: any) => {
        const items = r.reservation_items || [];
        return sum + items.filter((i: any) => i.room_type_id === roomTypeId).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
      }, 0);
  };

  const filteredReservations = useMemo(() => {
    if (!reservations) return [];
    return reservations.filter((r: any) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterCompany !== "all" && r.company_id !== filterCompany) return false;
      if (search) {
        const q = search.toLowerCase();
        return (r.contact_name || "").toLowerCase().includes(q) ||
          (r.hotel_companies?.name || "").toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [reservations, filterStatus, filterCompany, search]);

  const totalRooms = (res: any) => (res.reservation_items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Reservas</h2>
        <Button onClick={() => { setForm({ ...emptyForm }); setOpen(true); }}>
          <CalendarPlus className="h-4 w-4 mr-1" /> Nueva Reserva
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar contacto, empresa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las empresas</SelectItem>
            {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Cargando reservas...</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Empresa / Contacto</TableHead>
                <TableHead>Habitaciones</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No hay reservas</TableCell></TableRow>
              ) : filteredReservations.map((res: any) => (
                <TableRow key={res.id}>
                  <TableCell>{format(new Date(res.check_in_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</TableCell>
                  <TableCell>{format(new Date(res.check_out_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{res.hotel_companies?.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{res.contact_name || ""}</div>
                  </TableCell>
                  <TableCell>
                    {(res.reservation_items || []).map((item: any, idx: number) => (
                      <div key={idx} className="text-sm">
                        {item.quantity}x {item.room_types?.name || "?"}{item.rate_applied ? ` (${formatCOP(Number(item.rate_applied))})` : ""}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[res.status] || "outline"}>
                      {STATUS_LABELS[res.status] || res.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => setDetailRes(res)} title="Ver detalle">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(res.status === "pending" || res.status === "confirmed") && (
                      <Button variant="ghost" size="icon" onClick={() => updateStatusMutation.mutate({ id: res.id, status: "cancelled" })} title="Cancelar">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {(res.status === "confirmed") && (
                      <Button variant="ghost" size="icon" onClick={() => {
                        updateStatusMutation.mutate({ id: res.id, status: "checked_in" });
                        onConvertToCheckin?.();
                      }} title="Convertir a Check-in">
                        <LogIn className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteResId(res.id)} title="Eliminar (Admin)">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailRes} onOpenChange={() => setDetailRes(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Reserva</DialogTitle></DialogHeader>
          {detailRes && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Entrada:</span> {format(new Date(detailRes.check_in_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</div>
                <div><span className="text-muted-foreground">Salida:</span> {format(new Date(detailRes.check_out_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</div>
                <div><span className="text-muted-foreground">Empresa:</span> {detailRes.hotel_companies?.name || "—"}</div>
                <div><span className="text-muted-foreground">Estado:</span> <Badge variant={STATUS_VARIANTS[detailRes.status] || "outline"}>{STATUS_LABELS[detailRes.status]}</Badge></div>
                <div><span className="text-muted-foreground">Contacto:</span> {detailRes.contact_name || "—"}</div>
                <div><span className="text-muted-foreground">Teléfono:</span> {detailRes.contact_phone || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Email:</span> {detailRes.contact_email || "—"}</div>
              </div>
              <div className="border-t pt-2">
                <div className="font-medium mb-1">Habitaciones reservadas</div>
                {(detailRes.reservation_items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1 border-b last:border-b-0">
                    <span>{item.quantity}x {item.room_types?.name}</span>
                    <span>{item.rate_applied ? `${formatCOP(Number(item.rate_applied))} / noche` : "Sin tarifa"}</span>
                  </div>
                ))}
              </div>
              {detailRes.notes && <div className="border-t pt-2"><span className="text-muted-foreground">Notas:</span> {detailRes.notes}</div>}

              <div className="flex gap-2 pt-2">
                {detailRes.status === "pending" && (
                  <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: detailRes.id, status: "confirmed" })}>Confirmar</Button>
                )}
                {detailRes.status === "confirmed" && (
                  <>
                    <Button size="sm" onClick={() => {
                      updateStatusMutation.mutate({ id: detailRes.id, status: "checked_in" });
                      onConvertToCheckin?.();
                    }}>
                      <LogIn className="h-4 w-4 mr-1" /> Convertir a Check-in
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: detailRes.id, status: "no_show" })}>No Show</Button>
                  </>
                )}
                {(detailRes.status === "pending" || detailRes.status === "confirmed") && (
                  <Button size="sm" variant="destructive" onClick={() => updateStatusMutation.mutate({ id: detailRes.id, status: "cancelled" })}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Reserva</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de entrada *</Label>
                <Input type="date" value={form.check_in_date} onChange={e => setForm({ ...form, check_in_date: e.target.value })} />
              </div>
              <div>
                <Label>Fecha de salida *</Label>
                <Input type="date" value={form.check_out_date} onChange={e => setForm({ ...form, check_out_date: e.target.value })} />
              </div>
            </div>

            {/* Company */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Empresa</Label>
                <Button variant="ghost" size="sm" onClick={() => setQuickCompanyOpen(true)}>
                  <Building2 className="h-3.5 w-3.5 mr-1" /> Nueva empresa
                </Button>
              </div>
              <SearchableSelect
                options={companyOptions}
                value={form.company_id || "none"}
                onValueChange={handleCompanyChange}
                placeholder="Buscar empresa..."
              />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Contacto</Label>
                <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Nombre" />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="Teléfono" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="Email" />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-medium">Habitaciones</Label>
                <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Agregar tipo</Button>
              </div>
              {form.items.map((item, idx) => {
                const totalForType = roomCounts?.[item.room_type_id] || 0;
                const reservedForType = item.room_type_id && form.check_in_date && form.check_out_date
                  ? getReservedCountForType(item.room_type_id, form.check_in_date, form.check_out_date)
                  : 0;
                const availableForType = totalForType - reservedForType;

                return (
                  <div key={idx} className="flex items-end gap-2 mb-2 p-2 border rounded-md">
                    <div className="flex-1">
                      <Label className="text-xs">Tipo de habitación *</Label>
                      <Select value={item.room_type_id || "placeholder"} onValueChange={v => v !== "placeholder" && updateItem(idx, "room_type_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="placeholder" disabled>Seleccionar...</SelectItem>
                          {roomTypes?.map(rt => (
                            <SelectItem key={rt.id} value={rt.id}>
                              {rt.name} (Base: {formatCOP(rt.base_rate)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Label className="text-xs">Cant. *</Label>
                      <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">Tarifa/noche</Label>
                      <Input type="number" min={0} value={item.rate_applied ?? ""} onChange={e => updateItem(idx, "rate_applied", e.target.value ? Number(e.target.value) : null)} />
                    </div>
                    {item.room_type_id && (
                      <div className="text-xs text-muted-foreground pb-2 w-16 text-center">
                        <span className={availableForType < item.quantity ? "text-destructive font-medium" : ""}>
                          Disp: {availableForType}
                        </span>
                      </div>
                    )}
                    {form.items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones..." />
            </div>

            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Guardando..." : "Crear Reserva"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <QuickCompanyDialog
        open={quickCompanyOpen}
        onOpenChange={setQuickCompanyOpen}
        onCreated={(id) => {
          setForm({ ...form, company_id: id });
          qc.invalidateQueries({ queryKey: ["reservation-companies"] });
        }}
      />

      {/* Delete Reservation Dialog (Admin) */}
      <AlertDialog open={!!deleteResId} onOpenChange={() => setDeleteResId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reserva?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará la reserva y sus ítems. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!deleteResId) return;
              try {
                await supabase.from("reservation_items").delete().eq("reservation_id", deleteResId);
                const { error } = await supabase.from("reservations").delete().eq("id", deleteResId);
                if (error) throw error;
                qc.invalidateQueries({ queryKey: ["reservations"] });
                toast({ title: "Reserva eliminada" });
                if (detailRes?.id === deleteResId) setDetailRes(null);
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
              setDeleteResId(null);
            }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
