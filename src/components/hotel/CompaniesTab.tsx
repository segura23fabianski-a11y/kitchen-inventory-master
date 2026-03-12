import { useState } from "react";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Pencil, Trash2, Search, DollarSign, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface CompanyForm { name: string; nit: string; contact_name: string; phone: string; email: string; address: string; active: boolean; }
const emptyForm: CompanyForm = { name: "", nit: "", contact_name: "", phone: "", email: "", address: "", active: true };

interface RateForm { room_type_id: string; rate_per_night: number; includes_laundry: boolean; includes_housekeeping: boolean; includes_breakfast: boolean; notes: string; active: boolean; }
const emptyRateForm: RateForm = { room_type_id: "", rate_per_night: 0, includes_laundry: true, includes_housekeeping: true, includes_breakfast: false, notes: "", active: true };

export default function CompaniesTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Rates state
  const [ratesCompany, setRatesCompany] = useState<any>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateEditId, setRateEditId] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState<RateForm>(emptyRateForm);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["hotel-companies"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_companies" as any).select("*").order("name"); if (error) throw error; return data as any[]; },
  });

  const { data: roomTypes } = useQuery({
    queryKey: ["room-types-for-rates"],
    queryFn: async () => { const { data, error } = await supabase.from("room_types" as any).select("id, name, base_rate").eq("active", true).order("name"); if (error) throw error; return data as any[]; },
  });

  const { data: companyRates } = useQuery({
    queryKey: ["company-rates", ratesCompany?.id],
    queryFn: async () => {
      if (!ratesCompany) return [];
      const { data, error } = await supabase.from("company_rates" as any).select("*, room_types(name, base_rate)").eq("company_id", ratesCompany.id).order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!ratesCompany,
  });

  const filtered = companies?.filter((c: any) => fuzzyMatch(buildHaystack(c.name, c.nit), search));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = { restaurant_id: restaurantId, name: form.name.trim(), nit: form.nit.trim() || null, contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, active: form.active };
      if (editId) { const { error } = await supabase.from("hotel_companies" as any).update(payload as any).eq("id", editId); if (error) throw error; }
      else { const { error } = await supabase.from("hotel_companies" as any).insert(payload as any); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotel-companies"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast({ title: editId ? "Empresa actualizada" : "Empresa creada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("hotel_companies" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotel-companies"] }); setDeleteId(null); toast({ title: "Empresa eliminada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveRateMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !ratesCompany) throw new Error("Sin restaurante o empresa");
      const payload = {
        restaurant_id: restaurantId, company_id: ratesCompany.id,
        room_type_id: rateForm.room_type_id, rate_per_night: rateForm.rate_per_night,
        includes_laundry: rateForm.includes_laundry, includes_housekeeping: rateForm.includes_housekeeping,
        includes_breakfast: rateForm.includes_breakfast, notes: rateForm.notes.trim() || null, active: rateForm.active,
      };
      if (rateEditId) {
        const { error } = await supabase.from("company_rates" as any).update(payload as any).eq("id", rateEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_rates" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["company-rates", ratesCompany?.id] }); setRateOpen(false); setRateEditId(null); setRateForm(emptyRateForm); toast({ title: rateEditId ? "Tarifa actualizada" : "Tarifa creada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("company_rates" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["company-rates", ratesCompany?.id] }); toast({ title: "Tarifa eliminada" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (c: any) => { setEditId(c.id); setForm({ name: c.name, nit: c.nit || "", contact_name: c.contact_name || "", phone: c.phone || "", email: c.email || "", address: c.address || "", active: c.active }); setOpen(true); };

  const openRateEdit = (r: any) => {
    setRateEditId(r.id);
    setRateForm({ room_type_id: r.room_type_id, rate_per_night: r.rate_per_night, includes_laundry: r.includes_laundry, includes_housekeeping: r.includes_housekeeping, includes_breakfast: r.includes_breakfast, notes: r.notes || "", active: r.active });
    setRateOpen(true);
  };

  const usedRoomTypeIds = companyRates?.filter((r: any) => r.id !== rateEditId).map((r: any) => r.room_type_id) || [];
  const availableRoomTypes = roomTypes?.filter((rt: any) => !usedRoomTypeIds.includes(rt.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva Empresa</Button>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>NIT</TableHead><TableHead>Contacto</TableHead><TableHead>Estado</TableHead><TableHead className="w-32">Acciones</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           filtered?.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin resultados</TableCell></TableRow> :
           filtered?.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.nit || "—"}</TableCell>
              <TableCell>{c.contact_name || "—"}</TableCell>
              <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Activa" : "Inactiva"}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" title="Tarifas corporativas" onClick={() => setRatesCompany(c)}><DollarSign className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ── Company Form Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nueva"} Empresa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>NIT</Label><Input value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contacto</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Activa</Label></div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>{saveMutation.isPending ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Corporate Rates Dialog ── */}
      <Dialog open={!!ratesCompany} onOpenChange={() => setRatesCompany(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tarifas Corporativas — {ratesCompany?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setRateEditId(null); setRateForm(emptyRateForm); setRateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Nueva Tarifa
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo Habitación</TableHead>
                  <TableHead>Tarifa/Noche</TableHead>
                  <TableHead>Incluye</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyRates?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin tarifas corporativas configuradas</TableCell></TableRow>
                ) : companyRates?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.room_types?.name || "—"}</TableCell>
                    <TableCell>${r.rate_per_night?.toLocaleString()}</TableCell>
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
                        <Button variant="ghost" size="icon" onClick={() => openRateEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteRateMutation.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {companyRates && companyRates.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Tarifa base de referencia: {roomTypes?.map((rt: any) => `${rt.name}: $${rt.base_rate?.toLocaleString()}`).join(" · ")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Rate Form Dialog ── */}
      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{rateEditId ? "Editar" : "Nueva"} Tarifa Corporativa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo de Habitación *</Label>
              <Select value={rateForm.room_type_id} onValueChange={v => setRateForm({ ...rateForm, room_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(rateEditId ? roomTypes : availableRoomTypes)?.map((rt: any) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name} (base: ${rt.base_rate?.toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tarifa por Noche *</Label>
              <Input type="number" min={0} value={rateForm.rate_per_night} onChange={e => setRateForm({ ...rateForm, rate_per_night: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Incluye en el paquete</Label>
              <div className="flex items-center gap-2">
                <Checkbox checked={rateForm.includes_laundry} onCheckedChange={v => setRateForm({ ...rateForm, includes_laundry: !!v })} id="inc-laundry" />
                <label htmlFor="inc-laundry" className="text-sm">Lavandería</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={rateForm.includes_housekeeping} onCheckedChange={v => setRateForm({ ...rateForm, includes_housekeeping: !!v })} id="inc-hk" />
                <label htmlFor="inc-hk" className="text-sm">Housekeeping / Camarería</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={rateForm.includes_breakfast} onCheckedChange={v => setRateForm({ ...rateForm, includes_breakfast: !!v })} id="inc-bkf" />
                <label htmlFor="inc-bkf" className="text-sm">Desayuno</label>
              </div>
            </div>
            <div><Label>Notas</Label><Input value={rateForm.notes} onChange={e => setRateForm({ ...rateForm, notes: e.target.value })} placeholder="Observaciones del convenio..." /></div>
            <div className="flex items-center gap-2"><Switch checked={rateForm.active} onCheckedChange={v => setRateForm({ ...rateForm, active: v })} /><Label>Activa</Label></div>
            <Button className="w-full" onClick={() => saveRateMutation.mutate()} disabled={!rateForm.room_type_id || rateForm.rate_per_night <= 0 || saveRateMutation.isPending}>
              {saveRateMutation.isPending ? "Guardando..." : "Guardar Tarifa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
