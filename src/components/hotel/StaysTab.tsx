import { useState, useCallback, useEffect } from "react";
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
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, LogIn, LogOut, Eye, X, Camera, Building2, AlertTriangle, UserPlus, Building, Trash2, ArrowRightLeft, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import SignaturePad from "./SignaturePad";
import QuickGuestDialog from "./QuickGuestDialog";
import QuickCompanyDialog from "./QuickCompanyDialog";

const STATUS_LABELS: Record<string, string> = { checked_in: "Hospedado", checked_out: "Check-out", cancelled: "Cancelada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = { checked_in: "default", checked_out: "secondary", cancelled: "destructive" };
const CHECKOUT_LABELS: Record<string, string> = { normal: "Normal", unnotified: "Salida no notificada" };

interface StayForm {
  room_id: string; company_id: string; contract_id: string; primary_guest_id: string;
  companion_ids: string[];
  expected_check_out: string; rate_per_night: number; payment_method: string; notes: string;
  source_rate: string;
}
const emptyForm: StayForm = { room_id: "", company_id: "", contract_id: "", primary_guest_id: "", companion_ids: [], expected_check_out: "", rate_per_night: 0, payment_method: "", notes: "", source_rate: "standard" };

export default function StaysTab() {
  const restaurantId = useRestaurantId();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const isRecepcionista = hasRole("recepcionista");
  const canSeeCorporateRates = isAdmin || !isRecepcionista;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StayForm>(emptyForm);
  const [detailStay, setDetailStay] = useState<any>(null);
  const [signatureStay, setSignatureStay] = useState<{ stayId: string; guestId: string; guestName: string } | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [rateInfo, setRateInfo] = useState("");
  const [checkoutDialog, setCheckoutDialog] = useState<{ stayId: string; type: string } | null>(null);
  const [quickGuestOpen, setQuickGuestOpen] = useState(false);
  const [quickGuestTarget, setQuickGuestTarget] = useState<"primary" | "companion">("primary");
  const [quickCompanyOpen, setQuickCompanyOpen] = useState(false);
  const [deleteStayId, setDeleteStayId] = useState<string | null>(null);
  const [addGuestToActiveStay, setAddGuestToActiveStay] = useState(false);
  const [pendingAddGuest, setPendingAddGuest] = useState<{ guestId: string; guestName: string } | null>(null);
  const [pendingPartialCheckout, setPendingPartialCheckout] = useState<{ sgId: string; guestId: string; guestName: string; isPrimary: boolean } | null>(null);
  const [pendingRoomChange, setPendingRoomChange] = useState<{ newRoomId: string; newRoomNumber: string } | null>(null);
  const [roomChangeSelectValue, setRoomChangeSelectValue] = useState("");
  const [editStay, setEditStay] = useState<any>(null);
  const [editForm, setEditForm] = useState<{
    rate_per_night: number; source_rate: string; company_id: string; contract_id: string;
    payment_method: string; notes: string; expected_check_out: string;
  }>({ rate_per_night: 0, source_rate: "standard", company_id: "", contract_id: "", payment_method: "", notes: "", expected_check_out: "" });

  const { data: rooms } = useQuery({
    queryKey: ["rooms-for-checkin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any).select("id, room_number, room_type_id, room_types(name, base_rate, rate_single, rate_double, rate_triple, max_occupancy)").eq("status", "available").order("room_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: allRooms } = useQuery({
    queryKey: ["all-rooms-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any).select("id, room_number, status, room_type_id, room_types(name, base_rate, rate_single, rate_double, rate_triple, max_occupancy)").order("room_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: guests } = useQuery({
    queryKey: ["hotel-guests"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_guests" as any).select("id, first_name, last_name, document_number, document_type").order("last_name"); if (error) throw error; return data as any[]; },
  });

  const { data: companies } = useQuery({
    queryKey: ["hotel-companies-active"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_companies" as any).select("id, name, nit").eq("active", true).order("name"); if (error) throw error; return data as any[]; },
  });

  // Build searchable options
  const guestOptions: SearchableSelectOption[] = (guests || []).map((g: any) => ({
    value: g.id,
    label: `${g.first_name} ${g.last_name} (${g.document_type || ""} ${g.document_number})`,
    searchTerms: `${g.document_number} ${g.first_name} ${g.last_name}`,
  }));

  const companyOptions: SearchableSelectOption[] = [
    { value: "none", label: "Ninguna" },
    ...(companies || []).map((c: any) => ({
      value: c.id,
      label: `${c.name}${c.nit ? ` (NIT: ${c.nit})` : ""}`,
      searchTerms: `${c.nit || ""} ${c.name}`,
    })),
  ];

  const { data: allCompanyRates } = useQuery({
    queryKey: ["all-company-rates"],
    queryFn: async () => { const { data, error } = await supabase.from("company_rates" as any).select("*").eq("active", true); if (error) throw error; return data as any[]; },
  });

  const { data: contracts } = useQuery({
    queryKey: ["hotel-contracts-active"],
    queryFn: async () => { const { data, error } = await supabase.from("contracts").select("id, name, code, company_id").eq("active", true).order("name"); if (error) throw error; return data as any[]; },
  });

  // Contracts filtered by selected company
  const companyContracts = contracts?.filter((c: any) => c.company_id === form.company_id) || [];

  const { data: stays, isLoading } = useQuery({
    queryKey: ["stays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stays" as any).select("*, rooms(room_number, room_type_id, room_types(name, max_occupancy)), hotel_companies(name), contracts(name, code), stay_guests(*, hotel_guests(first_name, last_name, document_number))").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const selectedRoom = rooms?.find((r: any) => r.id === form.room_id);
  const maxOccupancy = selectedRoom?.room_types?.max_occupancy || 99;
  const totalGuests = 1 + form.companion_ids.length;
  const overCapacity = totalGuests > maxOccupancy;
  const availableCompanions = guests?.filter((g: any) => g.id !== form.primary_guest_id && !form.companion_ids.includes(g.id));

  // Helper: get rate based on number of guests
  const getOccupancyRate = (roomType: any, numGuests: number): number => {
    if (!roomType) return 0;
    if (numGuests >= 3) return roomType.rate_triple || roomType.rate_double || roomType.rate_single || roomType.base_rate || 0;
    if (numGuests === 2) return roomType.rate_double || roomType.rate_single || roomType.base_rate || 0;
    return roomType.rate_single || roomType.base_rate || 0;
  };

  // Auto-detect corporate rate based on occupancy, or standard rate
  useEffect(() => {
    if (!form.room_id || !selectedRoom) return;
    const roomType = selectedRoom.room_types;
    const hasCorporate = form.company_id && form.company_id !== "none";
    const roomTypeId = selectedRoom.room_type_id;

    if (hasCorporate && allCompanyRates) {
      // Get all company rates for this company
      const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === form.company_id);

      if (companyRates.length > 0) {
        // Occupancy-based corporate rate:
        // 1 person → use the cheapest company rate (typically sencilla)
        // 2+ persons → use the rate for the actual room type
        let selectedCorpRate: any;
        if (totalGuests === 1) {
          // Find the cheapest corporate rate for this company (single person rate)
          selectedCorpRate = companyRates.reduce((min: any, cr: any) =>
            cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
        } else {
          // Use the rate for the actual room type
          selectedCorpRate = companyRates.find((cr: any) => cr.room_type_id === roomTypeId);
        }

        if (selectedCorpRate) {
          setForm(prev => ({ ...prev, rate_per_night: selectedCorpRate.rate_per_night, source_rate: "corporate" }));
          if (canSeeCorporateRates) {
            const includes: string[] = [];
            if (selectedCorpRate.includes_laundry) includes.push("Lavandería");
            if (selectedCorpRate.includes_housekeeping) includes.push("Housekeeping");
            if (selectedCorpRate.includes_breakfast) includes.push("Desayuno");
            setRateInfo(`Tarifa corporativa para ${totalGuests} persona${totalGuests > 1 ? "s" : ""}: $${selectedCorpRate.rate_per_night.toLocaleString()}/noche. Incluye: ${includes.join(", ") || "nada adicional"}`);
          } else {
            setRateInfo("Tarifa corporativa aplicada automáticamente");
          }
          return;
        } else {
          setRateInfo(canSeeCorporateRates ? "⚠ Sin tarifa corporativa para este tipo. Se usa tarifa por ocupación." : "");
        }
      } else {
        setRateInfo(canSeeCorporateRates ? "⚠ Sin tarifa corporativa para esta empresa. Se usa tarifa por ocupación." : "");
      }
    } else {
      setRateInfo("");
    }

    // Apply occupancy-based standard rate
    const autoRate = getOccupancyRate(roomType, totalGuests);
    setForm(prev => ({ ...prev, rate_per_night: autoRate, source_rate: "standard" }));
    if (!hasCorporate && autoRate > 0) {
      setRateInfo(`Tarifa para ${totalGuests} persona${totalGuests > 1 ? "s" : ""}: $${autoRate.toLocaleString()}/noche`);
    }
  }, [form.company_id, form.room_id, form.companion_ids.length, allCompanyRates, selectedRoom, totalGuests]);

  const addCompanion = (guestId: string) => {
    if (form.companion_ids.length + 1 >= maxOccupancy) {
      toast({ title: "Capacidad máxima alcanzada", variant: "destructive" });
      return;
    }
    setForm({ ...form, companion_ids: [...form.companion_ids, guestId] });
  };
  const removeCompanion = (guestId: string) => setForm({ ...form, companion_ids: form.companion_ids.filter(id => id !== guestId) });
  const handleRoomChange = (roomId: string) => {
    const room = rooms?.find((r: any) => r.id === roomId);
    const autoRate = getOccupancyRate(room?.room_types, totalGuests);
    setForm(prev => ({ ...prev, room_id: roomId, rate_per_night: autoRate }));
  };
  const handleCompanyChange = (companyId: string) => setForm(prev => ({ ...prev, company_id: companyId, contract_id: "" }));

  // Twin validation: if room is twin type and company is set, all companions must be from same company
  // This is enforced by only allowing companions when validated

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !user) throw new Error("Sin restaurante o usuario");
      if (!form.room_id || !form.primary_guest_id) throw new Error("Seleccione habitación y huésped");
      if (overCapacity) throw new Error("Excede la capacidad máxima de la habitación");
      if (form.company_id && form.company_id !== "none" && !form.company_id) throw new Error("Empresa es obligatoria para estancias corporativas");

      const rate = form.rate_per_night || selectedRoom?.room_types?.base_rate || 0;
      const { data: stay, error } = await supabase.from("stays" as any).insert({
        restaurant_id: restaurantId, room_id: form.room_id,
        company_id: form.company_id && form.company_id !== "none" ? form.company_id : null,
        contract_id: form.contract_id || null,
        expected_check_out: form.expected_check_out || null,
        rate_per_night: rate, payment_method: form.payment_method || null,
        notes: form.notes.trim() || null, created_by: user.id,
        source_rate: form.source_rate, checkout_type: "normal",
      } as any).select("id").single();
      if (error) throw error;
      const stayId = (stay as any).id;

      const { error: gErr } = await supabase.from("stay_guests" as any).insert({ stay_id: stayId, guest_id: form.primary_guest_id, is_primary: true } as any);
      if (gErr) throw gErr;

      if (form.companion_ids.length > 0) {
        const companions = form.companion_ids.map(gid => ({ stay_id: stayId, guest_id: gid, is_primary: false }));
        const { error: cErr } = await supabase.from("stay_guests" as any).insert(companions as any);
        if (cErr) throw cErr;
      }

      const { error: rErr } = await supabase.from("rooms" as any).update({ status: "occupied" } as any).eq("id", form.room_id);
      if (rErr) throw rErr;
      return stayId;
    },
    onSuccess: (stayId) => {
      qc.invalidateQueries({ queryKey: ["stays"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-for-checkin"] });
      setOpen(false);
      const savedForm = { ...form };
      setForm(emptyForm);
      setRateInfo("");
      toast({ title: "Check-in registrado", description: savedForm.source_rate === "corporate" ? "Tarifa corporativa aplicada" : undefined });
      const primaryGuest = guests?.find((g: any) => g.id === savedForm.primary_guest_id);
      if (primaryGuest && stayId) {
        setSignatureStay({ stayId, guestId: savedForm.primary_guest_id, guestName: `${primaryGuest.first_name} ${primaryGuest.last_name}` });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkOutMutation = useMutation({
    mutationFn: async ({ stayId, checkoutType }: { stayId: string; checkoutType: string }) => {
      const stay = stays?.find((s: any) => s.id === stayId);
      if (!stay) throw new Error("Estancia no encontrada");

      const checkIn = new Date(stay.check_in_at);
      const now = new Date();
      const nights = Math.max(1, Math.ceil((now.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
      const total = nights * (stay.rate_per_night || 0);

      const { error } = await supabase.from("stays" as any).update({
        check_out_at: now.toISOString(), status: "checked_out",
        total_amount: total, checkout_type: checkoutType,
      } as any).eq("id", stayId);
      if (error) throw error;

      const { error: rErr } = await supabase.from("rooms" as any).update({ status: "cleaning" } as any).eq("id", stay.room_id);
      if (rErr) throw rErr;

      // Auto-create housekeeping task with checklist items
      if (stay.restaurant_id) {
        const { data: hTask, error: hErr } = await supabase.from("housekeeping_tasks" as any).insert({
          restaurant_id: stay.restaurant_id, room_id: stay.room_id, stay_id: stayId,
          task_type: "checkout_clean", status: "pending", priority: "high",
          notes: checkoutType === "unnotified"
            ? `Salida NO notificada - Hab #${stay.rooms?.room_number || ""}`
            : `Limpieza post check-out - Hab #${stay.rooms?.room_number || ""}`,
        } as any).select("id").single();

        if (!hErr && hTask) {
          // Create default checklist items
          const taskId = (hTask as any).id;
          const defaultItems = [
            "Cama tendida", "Baño limpio", "Amenities repuestos",
            "Basura retirada", "Piso limpio", "Toallas verificadas",
          ];
          // Try templates first
          const { data: templates } = await supabase.from("housekeeping_checklist_templates" as any)
            .select("item_name, sort_order")
            .eq("task_type", "checkout_clean")
            .eq("active", true)
            .order("sort_order");

          const items = (templates && (templates as any[]).length > 0)
            ? (templates as any[]).map((t: any) => ({
                housekeeping_task_id: taskId, restaurant_id: stay.restaurant_id,
                item_name: t.item_name, sort_order: t.sort_order,
              }))
            : defaultItems.map((name, i) => ({
                housekeeping_task_id: taskId, restaurant_id: stay.restaurant_id,
                item_name: name, sort_order: i,
              }));

          await supabase.from("housekeeping_task_items" as any).insert(items as any);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stays"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-for-checkin"] });
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      setCheckoutDialog(null);
      toast({ title: "Check-out completado", description: "Se creó tarea de limpieza con checklist." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveSignature = useCallback(async (dataUrl: string) => {
    if (!signatureStay || !restaurantId) return;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const path = `signatures/${signatureStay.stayId}/${signatureStay.guestId}.png`;
      const { error: upErr } = await supabase.storage.from("hotel-documents").upload(path, blob, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("hotel-documents").getPublicUrl(path);
      const { error } = await supabase.from("guest_signatures" as any).insert({
        restaurant_id: restaurantId, stay_id: signatureStay.stayId, guest_id: signatureStay.guestId, signature_url: urlData.publicUrl,
      } as any);
      if (error) throw error;
      toast({ title: "Firma guardada" });
      setSignatureStay(null);
    } catch (e: any) {
      toast({ title: "Error guardando firma", description: e.message, variant: "destructive" });
    }
  }, [signatureStay, restaurantId, toast]);

  const uploadDocumentPhoto = useCallback(async (file: File, stayId: string, guestId: string) => {
    if (!restaurantId) return;
    setDocUploading(true);
    try {
      const path = `documents/${stayId}/${guestId}_${Date.now()}.${file.name.split(".").pop()}`;
      const { error: upErr } = await supabase.storage.from("hotel-documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("hotel-documents").getPublicUrl(path);
      const { data: existing } = await supabase.from("guest_signatures" as any).select("id").eq("stay_id", stayId).eq("guest_id", guestId).maybeSingle();
      if ((existing as any)?.id) {
        await supabase.from("guest_signatures" as any).update({ document_photo_url: urlData.publicUrl } as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("guest_signatures" as any).insert({ restaurant_id: restaurantId, stay_id: stayId, guest_id: guestId, document_photo_url: urlData.publicUrl } as any);
      }
      toast({ title: "Foto de documento guardada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDocUploading(false);
    }
  }, [restaurantId, toast]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Estancias</h3>
        <Button size="sm" onClick={() => { setForm(emptyForm); setRateInfo(""); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuevo Check-in</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Habitación</TableHead><TableHead>Huésped</TableHead><TableHead>Huéspedes</TableHead>
            <TableHead>Empresa</TableHead><TableHead>Contrato</TableHead><TableHead>Tarifa</TableHead><TableHead>Check-in</TableHead>
            <TableHead>Estado</TableHead><TableHead>Novedad</TableHead><TableHead>Total</TableHead>
            <TableHead className="w-32">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           stays?.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Sin estancias</TableCell></TableRow> :
           stays?.map((s: any) => {
            const primary = s.stay_guests?.find((sg: any) => sg.is_primary);
            const guestName = primary?.hotel_guests ? `${primary.hotel_guests.first_name} ${primary.hotel_guests.last_name}` : "—";
            const guestCount = s.stay_guests?.length || 0;
            const isCorporate = s.source_rate === "corporate";
            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.rooms?.room_number || "—"}</TableCell>
                <TableCell>{guestName}</TableCell>
                <TableCell><Badge variant="outline">{guestCount}</Badge></TableCell>
                <TableCell>{s.hotel_companies?.name || "—"}</TableCell>
                <TableCell>{s.contracts?.name || "—"}</TableCell>
                <TableCell>
                  {canSeeCorporateRates ? (
                    <div className="flex items-center gap-1">
                      <span>${(s.rate_per_night || 0).toLocaleString()}</span>
                      {isCorporate && <Badge variant="outline" className="text-xs"><Building2 className="h-3 w-3 mr-0.5" />Corp</Badge>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>{format(new Date(s.check_in_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[s.status] || "secondary"}>{STATUS_LABELS[s.status] || s.status}</Badge></TableCell>
                <TableCell>
                  {s.checkout_type === "unnotified" && (
                    <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-0.5" />No notificada</Badge>
                  )}
                </TableCell>
                <TableCell>{canSeeCorporateRates ? `$${(s.total_amount || 0).toLocaleString()}` : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {s.status === "checked_in" && (
                      <>
                        <Button variant="ghost" size="icon" title="Check-out normal" onClick={() => setCheckoutDialog({ stayId: s.id, type: "normal" })}>
                          <LogOut className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Salida no notificada" onClick={() => setCheckoutDialog({ stayId: s.id, type: "unnotified" })}>
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" title="Ver detalle" onClick={() => setDetailStay(s)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" title="Editar (Admin)" onClick={() => {
                        setEditStay(s);
                        setEditForm({
                          rate_per_night: s.rate_per_night || 0,
                          source_rate: s.source_rate || "standard",
                          company_id: s.company_id || "",
                          contract_id: s.contract_id || "",
                          payment_method: s.payment_method || "",
                          notes: s.notes || "",
                          expected_check_out: s.expected_check_out ? s.expected_check_out.slice(0, 16) : "",
                        });
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" title="Eliminar (Admin)" onClick={() => setDeleteStayId(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* ── Checkout Confirmation Dialog ── */}
      <Dialog open={!!checkoutDialog} onOpenChange={() => setCheckoutDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {checkoutDialog?.type === "unnotified" ? "⚠ Salida No Notificada" : "Confirmar Check-out"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {checkoutDialog?.type === "unnotified" && (
              <p className="text-sm text-muted-foreground">
                El huésped se fue sin avisar. Se registrará como salida no notificada.
              </p>
            )}
            {(() => {
              const stay = stays?.find((s: any) => s.id === checkoutDialog?.stayId);
              if (!stay) return null;
              const checkIn = new Date(stay.check_in_at);
              const now = new Date();
              const nights = Math.max(1, Math.ceil((now.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
              const total = nights * (stay.rate_per_night || 0);
              return (
                <div className="text-sm space-y-1 rounded-md border p-3 bg-muted/50">
                  <p><span className="font-medium">Noches:</span> {nights}</p>
                  <p><span className="font-medium">Tarifa:</span> ${stay.rate_per_night?.toLocaleString()}/noche</p>
                  <p><span className="font-medium">Total:</span> ${total.toLocaleString()}</p>
                </div>
              );
            })()}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCheckoutDialog(null)}>Cancelar</Button>
              <Button
                className="flex-1"
                variant={checkoutDialog?.type === "unnotified" ? "destructive" : "default"}
                disabled={checkOutMutation.isPending}
                onClick={() => {
                  if (checkoutDialog) checkOutMutation.mutate({ stayId: checkoutDialog.stayId, checkoutType: checkoutDialog.type });
                }}
              >
                {checkOutMutation.isPending ? "Procesando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Check-in Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle><LogIn className="h-5 w-5 inline mr-2" />Nuevo Check-in</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* 1. Room */}
            <div>
              <Label>Habitación *</Label>
              <SearchableSelect
                options={(rooms || []).map((r: any) => ({
                  value: r.id,
                  label: `#${r.room_number} — ${r.room_types?.name} (máx ${r.room_types?.max_occupancy})`,
                  searchTerms: r.room_number,
                }))}
                value={form.room_id}
                onValueChange={handleRoomChange}
                placeholder="Buscar habitación..."
                searchPlaceholder="Número o tipo..."
                emptyMessage="Sin habitaciones disponibles"
              />
            </div>

            {/* 2. Primary Guest */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Huésped Titular *</Label>
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => { setQuickGuestTarget("primary"); setQuickGuestOpen(true); }}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Crear nuevo
                </Button>
              </div>
              <SearchableSelect
                options={guestOptions}
                value={form.primary_guest_id}
                onValueChange={v => setForm({ ...form, primary_guest_id: v })}
                placeholder="Buscar por nombre o documento..."
                searchPlaceholder="Nombre, apellido o documento..."
                emptyMessage="Sin resultados. Cree un nuevo huésped."
                clearable
              />
            </div>

            {/* 3. Company */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Empresa (opcional)</Label>
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => setQuickCompanyOpen(true)}
                >
                  <Building className="h-3.5 w-3.5" /> Crear nueva
                </Button>
              </div>
              <SearchableSelect
                options={companyOptions}
                value={form.company_id || "none"}
                onValueChange={handleCompanyChange}
                placeholder="Buscar empresa o NIT..."
                searchPlaceholder="Nombre o NIT..."
                emptyMessage="Sin resultados. Cree una nueva empresa."
              />
            </div>

            {/* 3b. Contract (only when company selected) */}
            {form.company_id && form.company_id !== "none" && companyContracts.length > 0 && (
              <div>
                <Label>Contrato / Frente</Label>
                <SearchableSelect
                  options={[
                    { value: "none", label: "Sin contrato específico" },
                    ...companyContracts.map((c: any) => ({
                      value: c.id,
                      label: `${c.name}${c.code ? ` (${c.code})` : ""}`,
                      searchTerms: `${c.code || ""} ${c.name}`,
                    })),
                  ]}
                  value={form.contract_id || "none"}
                  onValueChange={(v) => setForm(prev => ({ ...prev, contract_id: v === "none" ? "" : v }))}
                  placeholder="Seleccionar contrato..."
                  searchPlaceholder="Nombre o código..."
                  emptyMessage="Sin contratos para esta empresa"
                />
              </div>
            )}

            {/* 4. Companions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Acompañantes</Label>
                <div className="flex items-center gap-2">
                  {form.room_id && <span className="text-xs text-muted-foreground">{totalGuests}/{maxOccupancy}</span>}
                  {totalGuests < maxOccupancy && form.primary_guest_id && (
                    <Button
                      type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => { setQuickGuestTarget("companion"); setQuickGuestOpen(true); }}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Crear nuevo
                    </Button>
                  )}
                </div>
              </div>
              {form.companion_ids.map(cid => {
                const g = guests?.find((g: any) => g.id === cid);
                return (
                  <div key={cid} className="flex items-center gap-2 mb-1 text-sm rounded-md border px-2 py-1">
                    <span className="flex-1 truncate">{g ? `${g.first_name} ${g.last_name} (${g.document_number})` : cid}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeCompanion(cid)}><X className="h-3 w-3" /></Button>
                  </div>
                );
              })}
              {totalGuests < maxOccupancy && form.primary_guest_id && (
                <SearchableSelect
                  options={(availableCompanions || []).map((g: any) => ({
                    value: g.id,
                    label: `${g.first_name} ${g.last_name} (${g.document_number})`,
                    searchTerms: `${g.document_number} ${g.first_name} ${g.last_name}`,
                  }))}
                  value=""
                  onValueChange={addCompanion}
                  placeholder="Agregar acompañante..."
                  searchPlaceholder="Buscar por nombre o documento..."
                  emptyMessage="Sin resultados. Cree un nuevo huésped."
                />
              )}
              {overCapacity && <p className="text-sm text-destructive mt-1">Excede la capacidad máxima ({maxOccupancy})</p>}
            </div>

            {/* 5. Rate & Checkout */}
            <div className={canSeeCorporateRates ? "grid grid-cols-2 gap-3" : ""}>
              {canSeeCorporateRates && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Label>Tarifa/Noche</Label>
                    {form.source_rate === "corporate" && <Badge variant="outline" className="text-xs"><Building2 className="h-3 w-3 mr-0.5" />Corporativa</Badge>}
                  </div>
                  <Input type="number" value={form.rate_per_night} onChange={e => setForm({ ...form, rate_per_night: +e.target.value })} disabled={form.source_rate === "corporate"} />
                </div>
              )}
              <div><Label>Check-out Esperado</Label><Input type="datetime-local" value={form.expected_check_out} onChange={e => setForm({ ...form, expected_check_out: e.target.value })} /></div>
            </div>
            {rateInfo && (
              <p className={`text-xs ${form.source_rate === "corporate" ? "text-primary" : "text-amber-600"}`}>{rateInfo}</p>
            )}

            {/* Guest count & rate summary */}
            {form.room_id && form.primary_guest_id && (
              <div className="rounded-md border p-3 bg-muted/50 space-y-1 text-sm">
                <p><span className="font-medium">Huéspedes:</span> {totalGuests} persona{totalGuests > 1 ? "s" : ""}</p>
                {canSeeCorporateRates && (
                  <p><span className="font-medium">Tarifa aplicada:</span> ${form.rate_per_night.toLocaleString()}/noche (tarifa para {totalGuests} persona{totalGuests > 1 ? "s" : ""})</p>
                )}
                {canSeeCorporateRates && form.source_rate === "corporate" && <p className="text-xs text-primary">Tarifa corporativa</p>}
                {!canSeeCorporateRates && form.source_rate === "corporate" && <p className="text-xs text-primary">✓ Tarifa corporativa aplicada</p>}
              </div>
            )}

            <div><Label>Método de Pago</Label><Input value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} placeholder="Efectivo, tarjeta, transferencia..." /></div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

            {/* 6. Confirm */}
            <Button className="w-full" onClick={() => checkInMutation.mutate()} disabled={!form.room_id || !form.primary_guest_id || overCapacity || checkInMutation.isPending}>
              <LogIn className="h-4 w-4 mr-2" />{checkInMutation.isPending ? "Registrando..." : "Registrar Check-in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Quick Guest Dialog ── */}
      <QuickGuestDialog
        open={quickGuestOpen}
        onOpenChange={(v) => { setQuickGuestOpen(v); if (!v) setAddGuestToActiveStay(false); }}
        onCreated={async (guestId) => {
          if (addGuestToActiveStay && detailStay?.id) {
            // Add guest directly to the active stay
            try {
              await supabase.from("stay_guests" as any).insert({
                stay_id: detailStay.id, guest_id: guestId, is_primary: false,
              } as any);
              const currentCount = (detailStay.stay_guests?.length || 0) + 1;

              // Recalculate rate
              const { data: roomData } = await supabase.from("rooms" as any)
                .select("room_type_id, room_types(rate_single, rate_double, rate_triple, base_rate)")
                .eq("id", detailStay.room_id).single();
              const roomType = (roomData as any)?.room_types;

              let newRate = detailStay.rate_per_night;
              const isCorporate = detailStay.source_rate === "corporate";

              if (isCorporate && detailStay.company_id && allCompanyRates) {
                const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === detailStay.company_id);
                if (currentCount === 1) {
                  const cheapest = companyRates.reduce((min: any, cr: any) =>
                    cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
                  if (cheapest) newRate = cheapest.rate_per_night;
                } else {
                  const matched = companyRates.find((cr: any) => cr.room_type_id === (roomData as any)?.room_type_id);
                  if (matched) newRate = matched.rate_per_night;
                }
              } else if (roomType) {
                newRate = getOccupancyRate(roomType, currentCount);
              }

              await supabase.from("stays" as any).update({ rate_per_night: newRate } as any).eq("id", detailStay.id);
              qc.invalidateQueries({ queryKey: ["stays"] });
              const { data: refreshed } = await supabase.from("stays" as any)
                .select("*, rooms(room_number, room_type_id, room_types(name, max_occupancy)), hotel_companies(name), contracts(name, code), stay_guests(*, hotel_guests(first_name, last_name, document_number))")
                .eq("id", detailStay.id).single();
              setDetailStay(refreshed);
              toast({ title: "Huésped creado y agregado", description: `Tarifa actualizada a $${newRate.toLocaleString()}/noche` });
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
            setAddGuestToActiveStay(false);
          } else if (quickGuestTarget === "primary") {
            setForm(prev => ({ ...prev, primary_guest_id: guestId }));
          } else {
            addCompanion(guestId);
          }
        }}
      />

      {/* ── Quick Company Dialog ── */}
      <QuickCompanyDialog
        open={quickCompanyOpen}
        onOpenChange={setQuickCompanyOpen}
        onCreated={(companyId) => {
          setForm(prev => ({ ...prev, company_id: companyId }));
        }}
      />

      {/* ── Signature Dialog ── */}
      <Dialog open={!!signatureStay} onOpenChange={() => setSignatureStay(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Firma y Documento — {signatureStay?.guestName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <SignaturePad onSave={saveSignature} />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Foto del documento</p>
              <Input type="file" accept="image/*" capture="environment" disabled={docUploading}
                onChange={e => { const file = e.target.files?.[0]; if (file && signatureStay) uploadDocumentPhoto(file, signatureStay.stayId, signatureStay.guestId); }} />
              {docUploading && <p className="text-sm text-muted-foreground">Subiendo...</p>}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setSignatureStay(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailStay} onOpenChange={() => setDetailStay(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalle de Estancia</DialogTitle></DialogHeader>
          {detailStay && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Habitación:</span> #{detailStay.rooms?.room_number} ({detailStay.rooms?.room_types?.name})</p>
              <p><span className="font-medium">Check-in:</span> {format(new Date(detailStay.check_in_at), "PPpp", { locale: es })}</p>
              {detailStay.check_out_at && <p><span className="font-medium">Check-out:</span> {format(new Date(detailStay.check_out_at), "PPpp", { locale: es })}</p>}
              {canSeeCorporateRates && (
                <p>
                  <span className="font-medium">Tarifa:</span> ${detailStay.rate_per_night?.toLocaleString()}/noche
                  {detailStay.source_rate === "corporate" && <Badge variant="outline" className="ml-2 text-xs"><Building2 className="h-3 w-3 mr-0.5" />Corporativa</Badge>}
                </p>
              )}
              {canSeeCorporateRates && <p><span className="font-medium">Total:</span> ${detailStay.total_amount?.toLocaleString()}</p>}
              {detailStay.hotel_companies?.name && <p><span className="font-medium">Empresa:</span> {detailStay.hotel_companies.name}</p>}
              {detailStay.contracts?.name && <p><span className="font-medium">Contrato:</span> {detailStay.contracts.name}{detailStay.contracts.code ? ` (${detailStay.contracts.code})` : ""}</p>}
              {detailStay.payment_method && <p><span className="font-medium">Pago:</span> {detailStay.payment_method}</p>}
              {detailStay.checkout_type === "unnotified" && (
                <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Salida no notificada</Badge>
              )}

              <p className="font-medium pt-2">Huéspedes ({detailStay.stay_guests?.length || 0}):</p>
              {detailStay.stay_guests?.map((sg: any) => (
                <div key={sg.id} className="ml-2 flex items-center gap-2 flex-wrap">
                  <span>• {sg.hotel_guests?.first_name} {sg.hotel_guests?.last_name} ({sg.hotel_guests?.document_number})</span>
                  {sg.is_primary && <Badge variant="outline" className="text-xs">Titular</Badge>}
                  {detailStay.status === "checked_in" && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                        setSignatureStay({ stayId: detailStay.id, guestId: sg.guest_id, guestName: `${sg.hotel_guests?.first_name} ${sg.hotel_guests?.last_name}` });
                      }}>
                        <Camera className="h-3 w-3 mr-1" />Firma
                      </Button>
                      {/* Partial checkout: any guest can leave if there are 2+ guests */}
                      {detailStay.stay_guests.length > 1 && (
                        <Button
                          variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive"
                          onClick={() => setPendingPartialCheckout({
                            sgId: sg.id, guestId: sg.guest_id, isPrimary: sg.is_primary,
                            guestName: `${sg.hotel_guests?.first_name} ${sg.hotel_guests?.last_name}`,
                          })}
                        >
                          <LogOut className="h-3 w-3 mr-1" />Salida parcial
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* Add guest to active stay */}
              {detailStay.status === "checked_in" && (() => {
                const currentCount = detailStay.stay_guests?.length || 0;
                const maxOcc = detailStay.rooms?.room_types?.max_occupancy || 2;

                if (currentCount < maxOcc) {
                  const existingGuestIds = detailStay.stay_guests?.map((sg: any) => sg.guest_id) || [];
                  const addableGuests = guests?.filter((g: any) => !existingGuestIds.includes(g.id));

                  return (
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Agregar huésped a la estancia</Label>
                        <Button
                          type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => { setAddGuestToActiveStay(true); setQuickGuestTarget("companion"); setQuickGuestOpen(true); }}
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Crear nuevo
                        </Button>
                      </div>
                      <SearchableSelect
                        options={(addableGuests || []).map((g: any) => ({
                          value: g.id,
                          label: `${g.first_name} ${g.last_name} (${g.document_number})`,
                          searchTerms: `${g.document_number} ${g.first_name} ${g.last_name}`,
                        }))}
                        value=""
                        onValueChange={(guestId) => {
                          const g = guests?.find((g: any) => g.id === guestId);
                          setPendingAddGuest({ guestId, guestName: g ? `${g.first_name} ${g.last_name}` : guestId });
                        }}
                        placeholder="Buscar huésped por nombre o documento..."
                        searchPlaceholder="Nombre, apellido o documento..."
                        emptyMessage="Sin resultados"
                      />
                    </div>
                  );
                }
                return null;
              })()}

              {/* Change room for active stay */}
              {detailStay.status === "checked_in" && (() => {
                const currentGuestCount = detailStay.stay_guests?.length || 1;
                const availableForChange = allRooms?.filter((r: any) =>
                  r.id !== detailStay.room_id && r.status === "available" && (r.room_types?.max_occupancy || 2) >= currentGuestCount
                ) || [];

                return (
                  <div className="pt-2 border-t space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1"><ArrowRightLeft className="h-3.5 w-3.5" />Cambiar de habitación</Label>
                    <SearchableSelect
                      options={availableForChange.map((r: any) => ({
                        value: r.id,
                        label: `#${r.room_number} — ${r.room_types?.name} (máx ${r.room_types?.max_occupancy})`,
                        searchTerms: r.room_number,
                      }))}
                      value={roomChangeSelectValue}
                      onValueChange={(roomId) => {
                        const room = allRooms?.find((r: any) => r.id === roomId);
                        setRoomChangeSelectValue(roomId);
                        setPendingRoomChange({ newRoomId: roomId, newRoomNumber: room?.room_number || "" });
                      }}
                      placeholder="Seleccionar nueva habitación..."
                      searchPlaceholder="Número o tipo..."
                      emptyMessage="Sin habitaciones disponibles para el número de huéspedes"
                    />
                  </div>
                );
              })()}

              {detailStay.notes && <p><span className="font-medium">Notas:</span> {detailStay.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* ── Confirm Add Guest Dialog ── */}
      <AlertDialog open={!!pendingAddGuest} onOpenChange={() => setPendingAddGuest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Agregar huésped a la estancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se agregará a <span className="font-semibold">{pendingAddGuest?.guestName}</span> a la habitación #{detailStay?.rooms?.room_number}. La tarifa por noche se recalculará automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!pendingAddGuest || !detailStay) return;
              try {
                await supabase.from("stay_guests" as any).insert({
                  stay_id: detailStay.id, guest_id: pendingAddGuest.guestId, is_primary: false,
                } as any);
                const newGuestCount = (detailStay.stay_guests?.length || 0) + 1;
                const { data: roomData } = await supabase.from("rooms" as any)
                  .select("room_type_id, room_types(rate_single, rate_double, rate_triple, base_rate)")
                  .eq("id", detailStay.room_id).single();
                const roomType = (roomData as any)?.room_types;
                let newRate = detailStay.rate_per_night;
                const isCorporate = detailStay.source_rate === "corporate";
                if (isCorporate && detailStay.company_id && allCompanyRates) {
                  const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === detailStay.company_id);
                  if (newGuestCount === 1) {
                    const cheapest = companyRates.reduce((min: any, cr: any) => cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
                    if (cheapest) newRate = cheapest.rate_per_night;
                  } else {
                    const matched = companyRates.find((cr: any) => cr.room_type_id === (roomData as any)?.room_type_id);
                    if (matched) newRate = matched.rate_per_night;
                  }
                } else if (roomType) {
                  newRate = getOccupancyRate(roomType, newGuestCount);
                }
                await supabase.from("stays" as any).update({ rate_per_night: newRate } as any).eq("id", detailStay.id);
                qc.invalidateQueries({ queryKey: ["stays"] });
                const { data: refreshed } = await supabase.from("stays" as any)
                  .select("*, rooms(room_number, room_type_id, room_types(name, max_occupancy)), hotel_companies(name), contracts(name, code), stay_guests(*, hotel_guests(first_name, last_name, document_number))")
                  .eq("id", detailStay.id).single();
                setDetailStay(refreshed);
                toast({ title: "Huésped agregado", description: `Tarifa actualizada a $${newRate.toLocaleString()}/noche (${newGuestCount} persona${newGuestCount > 1 ? "s" : ""})` });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
              setPendingAddGuest(null);
            }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Partial Checkout Dialog ── */}
      <AlertDialog open={!!pendingPartialCheckout} onOpenChange={() => setPendingPartialCheckout(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salida parcial de huésped?</AlertDialogTitle>
            <AlertDialogDescription>
              Se retirará a <span className="font-semibold">{pendingPartialCheckout?.guestName}</span>{pendingPartialCheckout?.isPrimary ? " (titular)" : ""} de la habitación #{detailStay?.rooms?.room_number}. La tarifa por noche se recalculará automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              if (!pendingPartialCheckout || !detailStay) return;
              try {
                // If removing the primary, promote another guest to primary
                if (pendingPartialCheckout.isPrimary) {
                  const otherGuest = detailStay.stay_guests?.find((sg: any) => sg.id !== pendingPartialCheckout.sgId);
                  if (otherGuest) {
                    await supabase.from("stay_guests" as any).update({ is_primary: true } as any).eq("id", otherGuest.id);
                  }
                }
                await supabase.from("stay_guests" as any).delete().eq("id", pendingPartialCheckout.sgId);
                const newGuestCount = detailStay.stay_guests.length - 1;
                const { data: roomData } = await supabase.from("rooms" as any)
                  .select("room_type_id, room_types(rate_single, rate_double, rate_triple, base_rate)")
                  .eq("id", detailStay.room_id).single();
                const roomType = (roomData as any)?.room_types;
                let newRate = detailStay.rate_per_night;
                const isCorporate = detailStay.source_rate === "corporate";
                if (isCorporate && detailStay.company_id && allCompanyRates) {
                  const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === detailStay.company_id);
                  if (newGuestCount === 1) {
                    const cheapest = companyRates.reduce((min: any, cr: any) => cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
                    if (cheapest) newRate = cheapest.rate_per_night;
                  } else {
                    const matched = companyRates.find((cr: any) => cr.room_type_id === (roomData as any)?.room_type_id);
                    if (matched) newRate = matched.rate_per_night;
                  }
                } else if (roomType) {
                  newRate = getOccupancyRate(roomType, newGuestCount);
                }
                await supabase.from("stays" as any).update({ rate_per_night: newRate } as any).eq("id", detailStay.id);
                qc.invalidateQueries({ queryKey: ["stays"] });
                const { data: refreshed } = await supabase.from("stays" as any)
                  .select("*, rooms(room_number, room_type_id, room_types(name, max_occupancy)), hotel_companies(name), contracts(name, code), stay_guests(*, hotel_guests(first_name, last_name, document_number))")
                  .eq("id", detailStay.id).single();
                setDetailStay(refreshed);
                toast({ title: "Huésped retirado", description: `Tarifa actualizada a $${newRate.toLocaleString()}/noche (${newGuestCount} persona${newGuestCount > 1 ? "s" : ""})` });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
              setPendingPartialCheckout(null);
            }}>Confirmar salida</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm Room Change Dialog ── */}
      <AlertDialog open={!!pendingRoomChange} onOpenChange={() => { setPendingRoomChange(null); setRoomChangeSelectValue(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar de habitación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se moverán los huéspedes de la habitación #{detailStay?.rooms?.room_number} a la habitación #{pendingRoomChange?.newRoomNumber}. La habitación anterior quedará en limpieza y la tarifa se recalculará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!pendingRoomChange || !detailStay) return;
              try {
                const oldRoomId = detailStay.room_id;
                const newRoomId = pendingRoomChange.newRoomId;
                const guestCount = detailStay.stay_guests?.length || 1;

                // Get new room type for rate recalculation
                const { data: newRoomData } = await supabase.from("rooms" as any)
                  .select("room_type_id, room_types(rate_single, rate_double, rate_triple, base_rate)")
                  .eq("id", newRoomId).single();
                const newRoomType = (newRoomData as any)?.room_types;

                let newRate = detailStay.rate_per_night;
                const isCorporate = detailStay.source_rate === "corporate";

                if (isCorporate && detailStay.company_id && allCompanyRates) {
                  const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === detailStay.company_id);
                  if (guestCount === 1) {
                    const cheapest = companyRates.reduce((min: any, cr: any) => cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
                    if (cheapest) newRate = cheapest.rate_per_night;
                  } else {
                    const matched = companyRates.find((cr: any) => cr.room_type_id === (newRoomData as any)?.room_type_id);
                    if (matched) newRate = matched.rate_per_night;
                  }
                } else if (newRoomType) {
                  newRate = getOccupancyRate(newRoomType, guestCount);
                }

                // Update stay with new room and rate
                const { error } = await supabase.from("stays" as any)
                  .update({ room_id: newRoomId, rate_per_night: newRate } as any)
                  .eq("id", detailStay.id);
                if (error) throw error;

                // Set old room to cleaning
                await supabase.from("rooms" as any).update({ status: "cleaning" } as any).eq("id", oldRoomId);
                // Set new room to occupied
                await supabase.from("rooms" as any).update({ status: "occupied" } as any).eq("id", newRoomId);

                // Create housekeeping task for old room
                if (detailStay.restaurant_id) {
                  await supabase.from("housekeeping_tasks" as any).insert({
                    restaurant_id: detailStay.restaurant_id, room_id: oldRoomId,
                    task_type: "checkout_clean", status: "pending", priority: "normal",
                    notes: `Limpieza por cambio de habitación - Hab #${detailStay.rooms?.room_number}`,
                  } as any);
                }

                qc.invalidateQueries({ queryKey: ["stays"] });
                qc.invalidateQueries({ queryKey: ["rooms"] });
                qc.invalidateQueries({ queryKey: ["rooms-for-checkin"] });
                qc.invalidateQueries({ queryKey: ["all-rooms-list"] });
                qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });

                // Refresh detail
                const { data: refreshed } = await supabase.from("stays" as any)
                  .select("*, rooms(room_number, room_type_id, room_types(name, max_occupancy)), hotel_companies(name), contracts(name, code), stay_guests(*, hotel_guests(first_name, last_name, document_number))")
                  .eq("id", detailStay.id).single();
                setDetailStay(refreshed);
                toast({ title: "Habitación cambiada", description: `Movido a habitación #${pendingRoomChange.newRoomNumber}. Tarifa: $${newRate.toLocaleString()}/noche` });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
              setPendingRoomChange(null);
              setRoomChangeSelectValue("");
            }}>Confirmar cambio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Stay Dialog (Admin) ── */}
      <Dialog open={!!editStay} onOpenChange={() => setEditStay(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle><Pencil className="h-5 w-5 inline mr-2" />Editar Estancia</DialogTitle></DialogHeader>
          {editStay && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
                <p><span className="font-medium">Habitación:</span> #{editStay.rooms?.room_number} ({editStay.rooms?.room_types?.name})</p>
                <p><span className="font-medium">Check-in:</span> {format(new Date(editStay.check_in_at), "PPpp", { locale: es })}</p>
                <p><span className="font-medium">Estado:</span> <Badge variant={STATUS_VARIANTS[editStay.status] || "secondary"}>{STATUS_LABELS[editStay.status] || editStay.status}</Badge></p>
              </div>

              {/* Company */}
              <div>
                <Label>Empresa</Label>
                <SearchableSelect
                  options={companyOptions}
                  value={editForm.company_id || "none"}
                  onValueChange={(v) => setEditForm(prev => ({ ...prev, company_id: v === "none" ? "" : v, contract_id: "" }))}
                  placeholder="Buscar empresa o NIT..."
                  searchPlaceholder="Nombre o NIT..."
                  emptyMessage="Sin resultados"
                />
              </div>

              {/* Contract */}
              {editForm.company_id && (() => {
                const editContracts = contracts?.filter((c: any) => c.company_id === editForm.company_id) || [];
                if (editContracts.length === 0) return null;
                return (
                  <div>
                    <Label>Contrato / Frente</Label>
                    <SearchableSelect
                      options={[
                        { value: "none", label: "Sin contrato específico" },
                        ...editContracts.map((c: any) => ({
                          value: c.id,
                          label: `${c.name}${c.code ? ` (${c.code})` : ""}`,
                          searchTerms: `${c.code || ""} ${c.name}`,
                        })),
                      ]}
                      value={editForm.contract_id || "none"}
                      onValueChange={(v) => setEditForm(prev => ({ ...prev, contract_id: v === "none" ? "" : v }))}
                      placeholder="Seleccionar contrato..."
                      searchPlaceholder="Nombre o código..."
                      emptyMessage="Sin contratos"
                    />
                  </div>
                );
              })()}

              {/* Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tarifa/Noche ($)</Label>
                  <Input type="number" value={editForm.rate_per_night} onChange={e => setEditForm(prev => ({ ...prev, rate_per_night: +e.target.value }))} />
                </div>
                <div>
                  <Label>Tipo de Tarifa</Label>
                  <Select value={editForm.source_rate} onValueChange={v => setEditForm(prev => ({ ...prev, source_rate: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Estándar</SelectItem>
                      <SelectItem value="corporate">Corporativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Auto-apply corporate rate button */}
              {editForm.company_id && allCompanyRates && (() => {
                const companyRates = allCompanyRates.filter((cr: any) => cr.company_id === editForm.company_id);
                if (companyRates.length === 0) return null;
                const guestCount = editStay.stay_guests?.length || 1;
                const roomTypeId = editStay.rooms?.room_type_id;
                let suggestedRate: any;
                if (guestCount === 1) {
                  suggestedRate = companyRates.reduce((min: any, cr: any) => cr.rate_per_night < min.rate_per_night ? cr : min, companyRates[0]);
                } else {
                  suggestedRate = companyRates.find((cr: any) => cr.room_type_id === roomTypeId);
                }
                if (!suggestedRate) return null;
                return (
                  <Button type="button" variant="outline" size="sm" className="w-full text-xs"
                    onClick={() => setEditForm(prev => ({ ...prev, rate_per_night: suggestedRate.rate_per_night, source_rate: "corporate" }))}>
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    Aplicar tarifa corporativa: ${suggestedRate.rate_per_night.toLocaleString()}/noche ({guestCount} persona{guestCount > 1 ? "s" : ""})
                  </Button>
                );
              })()}

              {/* Expected checkout */}
              <div>
                <Label>Check-out Esperado</Label>
                <Input type="datetime-local" value={editForm.expected_check_out} onChange={e => setEditForm(prev => ({ ...prev, expected_check_out: e.target.value }))} />
              </div>

              {/* Payment method */}
              <div>
                <Label>Método de Pago</Label>
                <Input value={editForm.payment_method} onChange={e => setEditForm(prev => ({ ...prev, payment_method: e.target.value }))} placeholder="Efectivo, tarjeta, transferencia..." />
              </div>

              {/* Notes */}
              <div>
                <Label>Notas</Label>
                <Input value={editForm.notes} onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))} />
              </div>

              <Button className="w-full" onClick={async () => {
                try {
                  const updateData: any = {
                    rate_per_night: editForm.rate_per_night,
                    source_rate: editForm.source_rate,
                    company_id: editForm.company_id || null,
                    contract_id: editForm.contract_id || null,
                    payment_method: editForm.payment_method.trim() || null,
                    notes: editForm.notes.trim() || null,
                    expected_check_out: editForm.expected_check_out || null,
                  };
                  const { error } = await supabase.from("stays" as any).update(updateData).eq("id", editStay.id);
                  if (error) throw error;
                  qc.invalidateQueries({ queryKey: ["stays"] });
                  toast({ title: "Estancia actualizada", description: `Tarifa: $${editForm.rate_per_night.toLocaleString()}/noche` });
                  setEditStay(null);
                } catch (e: any) {
                  toast({ title: "Error", description: e.message, variant: "destructive" });
                }
              }}>
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Stay Dialog (Admin) ── */}
      <AlertDialog open={!!deleteStayId} onOpenChange={() => setDeleteStayId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar estancia?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará la estancia y sus registros asociados. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!deleteStayId) return;
              try {
                // Get room_id before deleting
                const { data: stayData } = await supabase.from("stays").select("room_id, status").eq("id", deleteStayId).single();
                await supabase.from("stay_guests").delete().eq("stay_id", deleteStayId);
                await supabase.from("guest_signatures").delete().eq("stay_id", deleteStayId);
                const { error } = await supabase.from("stays").delete().eq("id", deleteStayId);
                if (error) throw error;
                // Release room if stay was active
                if (stayData?.room_id && stayData.status === "checked_in") {
                  await supabase.from("rooms").update({ status: "available" }).eq("id", stayData.room_id);
                  qc.invalidateQueries({ queryKey: ["rooms"] });
                }
                qc.invalidateQueries({ queryKey: ["stays"] });
                toast({ title: "Estancia eliminada y habitación liberada" });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
              setDeleteStayId(null);
            }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
