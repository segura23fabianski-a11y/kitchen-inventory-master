import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { UserPlus } from "lucide-react";

const DOC_TYPES = ["CC", "CE", "TI", "PA", "NIT", "PEP", "PPT"];

interface GuestForm {
  document_type: string; document_number: string; first_name: string; last_name: string;
  nationality: string; phone: string; origin_city: string; origin_country: string;
  destination_city: string; destination_country: string; travel_reason: string;
}

const emptyForm: GuestForm = {
  document_type: "CC", document_number: "", first_name: "", last_name: "",
  nationality: "Colombia", phone: "", origin_city: "", origin_country: "Colombia",
  destination_city: "", destination_country: "Colombia", travel_reason: "",
};

interface QuickGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (guestId: string) => void;
  initialDocNumber?: string;
}

export default function QuickGuestDialog({ open, onOpenChange, onCreated, initialDocNumber }: QuickGuestDialogProps) {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<GuestForm>({ ...emptyForm, document_number: initialDocNumber || "" });
  const [duplicateGuest, setDuplicateGuest] = useState<any>(null);

  const resetForm = (docNum?: string) => {
    setForm({ ...emptyForm, document_number: docNum || "" });
    setDuplicateGuest(null);
  };

  // Check for duplicate document
  const checkDuplicate = async (docNumber: string) => {
    if (!docNumber.trim()) { setDuplicateGuest(null); return; }
    const { data } = await supabase
      .from("hotel_guests" as any)
      .select("id, first_name, last_name, document_number, document_type")
      .eq("document_number", docNumber.trim())
      .maybeSingle();
    setDuplicateGuest(data || null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      if (!form.first_name.trim() || !form.last_name.trim() || !form.document_number.trim())
        throw new Error("Nombre, apellido y documento son obligatorios");

      // Final duplicate check
      const { data: existing } = await supabase
        .from("hotel_guests" as any)
        .select("id")
        .eq("document_number", form.document_number.trim())
        .maybeSingle();
      if (existing) throw new Error("DUPLICATE:" + (existing as any).id);

      const payload: any = {
        restaurant_id: restaurantId,
        document_type: form.document_type,
        document_number: form.document_number.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        nationality: form.nationality.trim() || null,
        phone: form.phone.trim() || null,
        origin_city: form.origin_city.trim() || null,
        origin_country: form.origin_country.trim() || null,
        destination_city: form.destination_city.trim() || null,
        destination_country: form.destination_country.trim() || null,
        travel_reason: form.travel_reason.trim() || null,
      };

      const { data, error } = await supabase.from("hotel_guests" as any).insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (guestId) => {
      qc.invalidateQueries({ queryKey: ["hotel-guests"] });
      toast({ title: "Huésped creado" });
      resetForm();
      onOpenChange(false);
      onCreated(guestId);
    },
    onError: (e: any) => {
      if (e.message?.startsWith("DUPLICATE:")) {
        const existingId = e.message.split(":")[1];
        toast({ title: "Documento ya existe", description: "Se seleccionará el huésped existente." });
        resetForm();
        onOpenChange(false);
        onCreated(existingId);
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Crear Huésped Rápido
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Identificación</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo Doc. *</Label>
              <Select value={form.document_type} onValueChange={v => setForm({ ...form, document_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número Doc. *</Label>
              <Input
                value={form.document_number}
                onChange={e => setForm({ ...form, document_number: e.target.value })}
                onBlur={() => checkDuplicate(form.document_number)}
              />
            </div>
          </div>

          {duplicateGuest && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                ⚠ Ya existe un huésped con este documento
              </p>
              <p className="text-sm">
                {duplicateGuest.first_name} {duplicateGuest.last_name} ({duplicateGuest.document_type} {duplicateGuest.document_number})
              </p>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                  onCreated(duplicateGuest.id);
                }}
              >
                Seleccionar este huésped
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nombres *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Apellidos *</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>

          <p className="text-sm font-medium text-muted-foreground pt-2">Procedencia / Destino</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nacionalidad</Label><Input value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ciudad Origen</Label><Input value={form.origin_city} onChange={e => setForm({ ...form, origin_city: e.target.value })} /></div>
            <div><Label>País Origen</Label><Input value={form.origin_country} onChange={e => setForm({ ...form, origin_country: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ciudad Destino</Label><Input value={form.destination_city} onChange={e => setForm({ ...form, destination_city: e.target.value })} /></div>
            <div><Label>País Destino</Label><Input value={form.destination_country} onChange={e => setForm({ ...form, destination_country: e.target.value })} /></div>
          </div>
          <div><Label>Motivo de Viaje</Label><Input value={form.travel_reason} onChange={e => setForm({ ...form, travel_reason: e.target.value })} /></div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={!form.first_name.trim() || !form.last_name.trim() || !form.document_number.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Guardando..." : "Crear y Seleccionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
