import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Pencil, Search } from "lucide-react";

const DOC_TYPES = ["CC", "CE", "TI", "PA", "NIT", "PEP", "PPT"];

interface GuestForm {
  document_type: string; document_number: string; first_name: string; last_name: string;
  nationality: string; birth_date: string; gender: string; profession: string;
  phone: string; email: string; origin_city: string; origin_country: string;
  destination_city: string; destination_country: string; travel_reason: string;
}
const emptyForm: GuestForm = {
  document_type: "CC", document_number: "", first_name: "", last_name: "",
  nationality: "Colombia", birth_date: "", gender: "", profession: "",
  phone: "", email: "", origin_city: "", origin_country: "Colombia",
  destination_city: "", destination_country: "Colombia", travel_reason: "",
};

export default function GuestsTab() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GuestForm>(emptyForm);

  const { data: guests, isLoading } = useQuery({
    queryKey: ["hotel-guests"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_guests" as any).select("*").order("last_name"); if (error) throw error; return data as any[]; },
  });

  const filtered = guests?.filter((g: any) =>
    fuzzyMatch(buildHaystack(g.first_name, g.last_name, g.document_number), search)
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload: any = { restaurant_id: restaurantId };
      Object.entries(form).forEach(([k, v]) => { payload[k] = typeof v === "string" ? (v.trim() || null) : v; });
      payload.document_type = form.document_type;
      payload.document_number = form.document_number.trim();
      payload.first_name = form.first_name.trim();
      payload.last_name = form.last_name.trim();
      if (editId) {
        const { error } = await supabase.from("hotel_guests" as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hotel_guests" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hotel-guests"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast({ title: editId ? "Huésped actualizado" : "Huésped registrado" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (g: any) => {
    setEditId(g.id);
    setForm({
      document_type: g.document_type, document_number: g.document_number, first_name: g.first_name, last_name: g.last_name,
      nationality: g.nationality || "Colombia", birth_date: g.birth_date || "", gender: g.gender || "", profession: g.profession || "",
      phone: g.phone || "", email: g.email || "", origin_city: g.origin_city || "", origin_country: g.origin_country || "Colombia",
      destination_city: g.destination_city || "", destination_country: g.destination_country || "Colombia", travel_reason: g.travel_reason || "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar huésped..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nuevo Huésped</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>Documento</TableHead><TableHead>Nombre</TableHead><TableHead>Nacionalidad</TableHead><TableHead>Teléfono</TableHead><TableHead className="w-16"></TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
           filtered?.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin resultados</TableCell></TableRow> :
           filtered?.map((g: any) => (
            <TableRow key={g.id}>
              <TableCell>{g.document_type} {g.document_number}</TableCell>
              <TableCell className="font-medium">{g.first_name} {g.last_name}</TableCell>
              <TableCell>{g.nationality || "—"}</TableCell>
              <TableCell>{g.phone || "—"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Nuevo"} Huésped</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Datos de Identificación</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo Doc. *</Label>
                <Select value={form.document_type} onValueChange={v => setForm({ ...form, document_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Número Doc. *</Label><Input value={form.document_number} onChange={e => setForm({ ...form, document_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nombres *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
              <div><Label>Apellidos *</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
            </div>

            <p className="text-sm font-medium text-muted-foreground pt-2">Datos Personales (TRA)</p>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Nacionalidad</Label><Input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></div>
              <div><Label>Fecha Nac.</Label><Input type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} /></div>
              <div><Label>Género</Label>
                <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Femenino</SelectItem><SelectItem value="O">Otro</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Profesión</Label><Input value={form.profession} onChange={e => setForm({ ...form, profession: e.target.value })} /></div>
              <div><Label>Motivo Viaje</Label><Input value={form.travel_reason} onChange={e => setForm({ ...form, travel_reason: e.target.value })} /></div>
            </div>

            <p className="text-sm font-medium text-muted-foreground pt-2">Procedencia / Destino</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Ciudad Origen</Label><Input value={form.origin_city} onChange={e => setForm({ ...form, origin_city: e.target.value })} /></div>
              <div><Label>País Origen</Label><Input value={form.origin_country} onChange={e => setForm({ ...form, origin_country: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Ciudad Destino</Label><Input value={form.destination_city} onChange={e => setForm({ ...form, destination_city: e.target.value })} /></div>
              <div><Label>País Destino</Label><Input value={form.destination_country} onChange={e => setForm({ ...form, destination_country: e.target.value })} /></div>
            </div>

            <p className="text-sm font-medium text-muted-foreground pt-2">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            </div>

            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.first_name.trim() || !form.last_name.trim() || !form.document_number.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
