import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, BedDouble, Utensils, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatCOP } from "@/lib/utils";

/* ── Hotel Rate Form ── */
interface HotelRateForm { company_id: string; room_type_id: string; rate_per_night: number; includes_laundry: boolean; includes_housekeeping: boolean; includes_breakfast: boolean; notes: string; active: boolean; }
const emptyHotelRate: HotelRateForm = { company_id: "", room_type_id: "", rate_per_night: 0, includes_laundry: true, includes_housekeeping: true, includes_breakfast: false, notes: "", active: true };

/* ── Food Rate Labels ── */
const CONSUMPTION_MODE_LABELS: Record<string, string> = { dine_in: "En mesa", takeaway: "Para llevar", corporate_charge: "Cargo corporativo" };

const SERVICE_TYPE_LABELS: Record<string, string> = {
  breakfast: "Desayuno",
  lunch: "Almuerzo",
  dinner: "Cena",
  snack: "Lonche",
};

export default function CorporateRatesTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // ── Hotel rate state ──
  const [hotelOpen, setHotelOpen] = useState(false);
  const [hotelEditId, setHotelEditId] = useState<string | null>(null);
  const [hotelForm, setHotelForm] = useState<HotelRateForm>(emptyHotelRate);

  // ── Food rate state ──
  const [foodOpen, setFoodOpen] = useState(false);
  const [foodEditId, setFoodEditId] = useState<string | null>(null);
  const [foodMenuItemId, setFoodMenuItemId] = useState("");
  const [foodCompanyId, setFoodCompanyId] = useState("");
  const [foodMode, setFoodMode] = useState("dine_in");
  const [foodPrice, setFoodPrice] = useState("");
  const [foodActive, setFoodActive] = useState(true);
  const [foodFrom, setFoodFrom] = useState("");
  const [foodTo, setFoodTo] = useState("");

  // ── Service rate state ──
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcEditId, setSvcEditId] = useState<string | null>(null);
  const [svcCompanyId, setSvcCompanyId] = useState("");
  const [svcContractId, setSvcContractId] = useState("");
  const [svcServiceType, setSvcServiceType] = useState("lunch");
  const [svcRate, setSvcRate] = useState("");
  const [svcActive, setSvcActive] = useState(true);
  const [svcNotes, setSvcNotes] = useState("");

  // ── Shared queries ──
  const { data: companies = [] } = useQuery({
    queryKey: ["hotel-companies", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_companies").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  // ── Hotel queries ──
  const { data: roomTypes = [] } = useQuery({
    queryKey: ["room-types-for-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_types" as any).select("id, name, base_rate").eq("active", true).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: hotelRates = [], isLoading: hotelLoading } = useQuery({
    queryKey: ["all-company-rates", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_rates" as any).select("*, room_types(name, base_rate), hotel_companies(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  // ── Food queries ──
  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("id, name, category, price").eq("restaurant_id", restaurantId!).eq("active", true).order("category").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: foodRates = [], isLoading: foodLoading } = useQuery({
    queryKey: ["service-rates", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_rates").select("*, menu_items(name), hotel_companies(name)").eq("restaurant_id", restaurantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  // ── Service rate queries ──
  const { data: allContracts = [] } = useQuery({
    queryKey: ["all-contracts", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id, name, code, company_id, hotel_companies(name)").eq("restaurant_id", restaurantId!).eq("active", true).order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  const { data: serviceRates = [], isLoading: svcLoading } = useQuery({
    queryKey: ["contract-service-rates-all", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("contract_service_rates" as any).select("*, hotel_companies(name), contracts(name, code)").eq("restaurant_id", restaurantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  const svcContractsForCompany = allContracts.filter(c => c.company_id === svcCompanyId);

  // ── Hotel mutations ──
  const saveHotelRate = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = {
        restaurant_id: restaurantId, company_id: hotelForm.company_id, room_type_id: hotelForm.room_type_id,
        rate_per_night: hotelForm.rate_per_night, includes_laundry: hotelForm.includes_laundry,
        includes_housekeeping: hotelForm.includes_housekeeping, includes_breakfast: hotelForm.includes_breakfast,
        notes: hotelForm.notes.trim() || null, active: hotelForm.active,
      };
      if (hotelEditId) {
        const { error } = await supabase.from("company_rates" as any).update(payload as any).eq("id", hotelEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_rates" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-company-rates"] }); setHotelOpen(false); setHotelEditId(null); setHotelForm(emptyHotelRate); toast.success(hotelEditId ? "Tarifa actualizada" : "Tarifa creada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteHotelRate = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("company_rates" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-company-rates"] }); toast.success("Tarifa eliminada"); },
  });

  // ── Food mutations ──
  const saveFoodRate = useMutation({
    mutationFn: async () => {
      const payload: any = {
        restaurant_id: restaurantId!, menu_item_id: foodMenuItemId,
        company_id: foodCompanyId && foodCompanyId !== "none" ? foodCompanyId : null,
        consumption_mode: foodMode, price: parseFloat(foodPrice) || 0, active: foodActive,
        effective_from: foodFrom || null, effective_to: foodTo || null,
      };
      if (foodEditId) {
        const { error } = await supabase.from("service_rates").update(payload).eq("id", foodEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_rates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-rates"] }); closeFoodDialog(); toast.success(foodEditId ? "Tarifa actualizada" : "Tarifa creada"); },
    onError: () => toast.error("Error al guardar tarifa"),
  });

  const deleteFoodRate = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("service_rates").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-rates"] }); toast.success("Tarifa eliminada"); },
  });

  // ── Service rate mutations ──
  const saveServiceRate = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !svcCompanyId) throw new Error("Selecciona una empresa");
      const payload: any = {
        restaurant_id: restaurantId,
        company_id: svcCompanyId,
        contract_id: svcContractId && svcContractId !== "none" ? svcContractId : null,
        service_type: svcServiceType,
        rate: parseFloat(svcRate) || 0,
        active: svcActive,
        notes: svcNotes.trim() || null,
      };
      if (svcEditId) {
        const { error } = await supabase.from("contract_service_rates" as any).update(payload).eq("id", svcEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contract_service_rates" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-service-rates"] });
      qc.invalidateQueries({ queryKey: ["contract-service-rates-all"] });
      closeSvcDialog();
      toast.success(svcEditId ? "Tarifa actualizada" : "Tarifa creada");
    },
    onError: (e: any) => toast.error(e.message || "Error al guardar tarifa"),
  });

  const deleteServiceRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_service_rates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-service-rates"] });
      qc.invalidateQueries({ queryKey: ["contract-service-rates-all"] });
      toast.success("Tarifa eliminada");
    },
  });

  const openEditHotel = (r: any) => {
    setHotelEditId(r.id);
    setHotelForm({ company_id: r.company_id, room_type_id: r.room_type_id, rate_per_night: r.rate_per_night, includes_laundry: r.includes_laundry, includes_housekeeping: r.includes_housekeeping, includes_breakfast: r.includes_breakfast, notes: r.notes || "", active: r.active });
    setHotelOpen(true);
  };

  const closeFoodDialog = () => { setFoodOpen(false); setFoodEditId(null); setFoodMenuItemId(""); setFoodCompanyId(""); setFoodMode("dine_in"); setFoodPrice(""); setFoodActive(true); setFoodFrom(""); setFoodTo(""); };

  const openEditFood = (rate: any) => {
    setFoodEditId(rate.id); setFoodMenuItemId(rate.menu_item_id); setFoodCompanyId(rate.company_id || "none");
    setFoodMode(rate.consumption_mode); setFoodPrice(String(rate.price)); setFoodActive(rate.active);
    setFoodFrom(rate.effective_from || ""); setFoodTo(rate.effective_to || ""); setFoodOpen(true);
  };

  const closeSvcDialog = () => {
    setSvcOpen(false); setSvcEditId(null); setSvcCompanyId(""); setSvcContractId(""); setSvcServiceType("lunch"); setSvcRate(""); setSvcActive(true); setSvcNotes("");
  };

  const openEditSvc = (r: any) => {
    setSvcEditId(r.id); setSvcCompanyId(r.company_id); setSvcContractId(r.contract_id || "none");
    setSvcServiceType(r.service_type); setSvcRate(String(r.rate)); setSvcActive(r.active); setSvcNotes(r.notes || "");
    setSvcOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* ══════ SERVICE RATES SECTION (CORPORATE POS) ══════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Tarifas por Servicio (POS Corporativo)</h2>
              <p className="text-xs text-muted-foreground">
                Define el precio por tipo de servicio contratado (desayuno, almuerzo, cena, lonche) por empresa y contrato.
                El POS Corporativo usa estas tarifas para calcular el total: cantidad × tarifa del servicio.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setSvcOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Nueva Tarifa
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead className="text-right">Tarifa</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {svcLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : serviceRates.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin tarifas de servicio configuradas. El POS Corporativo no podrá calcular precios.</TableCell></TableRow>
            ) : serviceRates.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.hotel_companies?.name || "—"}</TableCell>
                <TableCell>
                  {r.contracts?.name ? (
                    <Badge variant="outline">{r.contracts.name}{r.contracts.code ? ` (${r.contracts.code})` : ""}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">General</span>
                  )}
                </TableCell>
                <TableCell><Badge variant="secondary">{SERVICE_TYPE_LABELS[r.service_type] || r.service_type}</Badge></TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatCOP(r.rate)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{r.notes || "—"}</TableCell>
                <TableCell><Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Activa" : "Inactiva"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditSvc(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteServiceRate.mutate(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <hr className="border-border" />

      {/* ══════ HOTEL RATES SECTION ══════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tarifas Hoteleras</h2>
          </div>
          <Button size="sm" onClick={() => { setHotelEditId(null); setHotelForm(emptyHotelRate); setHotelOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Nueva Tarifa
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Tipo Habitación</TableHead>
              <TableHead className="text-right">Tarifa/Noche</TableHead>
              <TableHead>Incluye</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {hotelLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : hotelRates.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin tarifas hoteleras configuradas</TableCell></TableRow>
            ) : hotelRates.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.hotel_companies?.name || "—"}</TableCell>
                <TableCell>{r.room_types?.name || "—"}</TableCell>
                <TableCell className="text-right font-mono">${r.rate_per_night?.toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.includes_laundry && <Badge variant="outline" className="text-xs">Lavandería</Badge>}
                    {r.includes_housekeeping && <Badge variant="outline" className="text-xs">Housekeeping</Badge>}
                    {r.includes_breakfast && <Badge variant="outline" className="text-xs">Desayuno</Badge>}
                  </div>
                </TableCell>
                <TableCell><Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Activa" : "Inactiva"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditHotel(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteHotelRate.mutate(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <hr className="border-border" />

      {/* ══════ FOOD RATES SECTION (POS Restaurante) ══════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Tarifas de Alimentación (POS Restaurante)</h2>
              <p className="text-xs text-muted-foreground">Precios diferenciados por producto, empresa y modalidad de consumo para ventas individuales.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setFoodOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Nueva Tarifa
          </Button>
        </div>
        <div className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
          <strong>Prioridad:</strong> 1) Empresa + modalidad → 2) Empresa general → 3) Modalidad → 4) Precio base del menú
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ítem del menú</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Modalidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {foodLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : foodRates.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin tarifas de alimentación. Se usará el precio base del menú.</TableCell></TableRow>
            ) : foodRates.map((rate: any) => (
              <TableRow key={rate.id}>
                <TableCell className="font-medium">{rate.menu_items?.name || "—"}</TableCell>
                <TableCell>{rate.hotel_companies?.name ? <Badge variant="outline">{rate.hotel_companies.name}</Badge> : <span className="text-muted-foreground text-xs">General</span>}</TableCell>
                <TableCell><Badge variant="secondary">{CONSUMPTION_MODE_LABELS[rate.consumption_mode] || rate.consumption_mode}</Badge></TableCell>
                <TableCell className="text-right font-mono">{formatCOP(rate.price)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{rate.effective_from || rate.effective_to ? `${rate.effective_from || "—"} → ${rate.effective_to || "—"}` : "Permanente"}</TableCell>
                <TableCell><Badge variant={rate.active ? "default" : "secondary"}>{rate.active ? "Activa" : "Inactiva"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditFood(rate)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteFoodRate.mutate(rate.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* ── Hotel Rate Dialog ── */}
      <Dialog open={hotelOpen} onOpenChange={setHotelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{hotelEditId ? "Editar" : "Nueva"} Tarifa Hotelera</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Empresa *</Label>
              <Select value={hotelForm.company_id} onValueChange={v => setHotelForm({ ...hotelForm, company_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Habitación *</Label>
              <Select value={hotelForm.room_type_id} onValueChange={v => setHotelForm({ ...hotelForm, room_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{roomTypes.map((rt: any) => <SelectItem key={rt.id} value={rt.id}>{rt.name} (base: ${rt.base_rate?.toLocaleString()})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarifa por Noche *</Label>
              <Input type="number" min={0} value={hotelForm.rate_per_night} onChange={e => setHotelForm({ ...hotelForm, rate_per_night: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Incluye en el paquete</Label>
              <div className="flex items-center gap-2"><Checkbox checked={hotelForm.includes_laundry} onCheckedChange={v => setHotelForm({ ...hotelForm, includes_laundry: !!v })} id="h-laundry" /><label htmlFor="h-laundry" className="text-sm">Lavandería</label></div>
              <div className="flex items-center gap-2"><Checkbox checked={hotelForm.includes_housekeeping} onCheckedChange={v => setHotelForm({ ...hotelForm, includes_housekeeping: !!v })} id="h-hk" /><label htmlFor="h-hk" className="text-sm">Housekeeping</label></div>
              <div className="flex items-center gap-2"><Checkbox checked={hotelForm.includes_breakfast} onCheckedChange={v => setHotelForm({ ...hotelForm, includes_breakfast: !!v })} id="h-bkf" /><label htmlFor="h-bkf" className="text-sm">Desayuno</label></div>
            </div>
            <div><Label>Notas</Label><Input value={hotelForm.notes} onChange={e => setHotelForm({ ...hotelForm, notes: e.target.value })} placeholder="Observaciones del convenio..." /></div>
            <div className="flex items-center gap-2"><Switch checked={hotelForm.active} onCheckedChange={v => setHotelForm({ ...hotelForm, active: v })} /><Label>Activa</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHotelOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveHotelRate.mutate()} disabled={!hotelForm.company_id || !hotelForm.room_type_id || hotelForm.rate_per_night <= 0 || saveHotelRate.isPending}>
              {saveHotelRate.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Food Rate Dialog ── */}
      <Dialog open={foodOpen} onOpenChange={v => !v && closeFoodDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{foodEditId ? "Editar" : "Nueva"} Tarifa de Alimentación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ítem del menú</Label>
              <Select value={foodMenuItemId} onValueChange={setFoodMenuItemId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ítem..." /></SelectTrigger>
                <SelectContent>{menuItems.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.category}) — Base: {formatCOP(item.price)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa (opcional)</Label>
              <Select value={foodCompanyId} onValueChange={setFoodCompanyId}>
                <SelectTrigger><SelectValue placeholder="General (todas)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (todas)</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modalidad de consumo</Label>
              <Select value={foodMode} onValueChange={setFoodMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dine_in">En mesa</SelectItem>
                  <SelectItem value="takeaway">Para llevar</SelectItem>
                  <SelectItem value="corporate_charge">Cargo corporativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Precio</Label><Input type="number" value={foodPrice} onChange={e => setFoodPrice(e.target.value)} placeholder="0" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Vigente desde</Label><Input type="date" value={foodFrom} onChange={e => setFoodFrom(e.target.value)} /></div>
              <div><Label>Vigente hasta</Label><Input type="date" value={foodTo} onChange={e => setFoodTo(e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={foodActive} onCheckedChange={setFoodActive} /><Label>Activa</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeFoodDialog}>Cancelar</Button>
            <Button onClick={() => saveFoodRate.mutate()} disabled={!foodMenuItemId}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Service Rate Dialog ── */}
      <Dialog open={svcOpen} onOpenChange={v => !v && closeSvcDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{svcEditId ? "Editar" : "Nueva"} Tarifa por Servicio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Empresa *</Label>
              <Select value={svcCompanyId} onValueChange={v => { setSvcCompanyId(v); setSvcContractId(""); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {svcCompanyId && svcContractsForCompany.length > 0 && (
              <div>
                <Label>Contrato (opcional — dejar vacío para tarifa general de la empresa)</Label>
                <Select value={svcContractId || "none"} onValueChange={v => setSvcContractId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="General (todos)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General (todos los contratos)</SelectItem>
                    {svcContractsForCompany.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Tipo de Servicio *</Label>
              <Select value={svcServiceType} onValueChange={setSvcServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Desayuno</SelectItem>
                  <SelectItem value="lunch">Almuerzo</SelectItem>
                  <SelectItem value="dinner">Cena</SelectItem>
                  <SelectItem value="snack">Lonche</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarifa por servicio *</Label>
              <Input type="number" min={0} value={svcRate} onChange={e => setSvcRate(e.target.value)} placeholder="Ej: 30000" />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={svcNotes} onChange={e => setSvcNotes(e.target.value)} placeholder="Observaciones..." className="h-16 resize-none" />
            </div>
            <div className="flex items-center gap-2"><Switch checked={svcActive} onCheckedChange={setSvcActive} /><Label>Activa</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSvcDialog}>Cancelar</Button>
            <Button onClick={() => saveServiceRate.mutate()} disabled={!svcCompanyId || !svcRate || saveServiceRate.isPending}>
              {saveServiceRate.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
