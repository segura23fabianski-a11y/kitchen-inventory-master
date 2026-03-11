import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Building2 } from "lucide-react";

interface CompanyForm {
  name: string; nit: string; contact_name: string; phone: string; email: string; address: string;
}
const emptyForm: CompanyForm = { name: "", nit: "", contact_name: "", phone: "", email: "", address: "" };

interface QuickCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (companyId: string) => void;
}

export default function QuickCompanyDialog({ open, onOpenChange, onCreated }: QuickCompanyDialogProps) {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [duplicateCompany, setDuplicateCompany] = useState<any>(null);

  const resetForm = () => { setForm(emptyForm); setDuplicateCompany(null); };

  const checkDuplicateNit = async (nit: string) => {
    if (!nit.trim()) { setDuplicateCompany(null); return; }
    const { data } = await supabase
      .from("hotel_companies" as any)
      .select("id, name, nit")
      .eq("nit", nit.trim())
      .maybeSingle();
    setDuplicateCompany(data || null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      if (!form.name.trim()) throw new Error("El nombre es obligatorio");

      // Check NIT duplicate
      if (form.nit.trim()) {
        const { data: existing } = await supabase
          .from("hotel_companies" as any)
          .select("id")
          .eq("nit", form.nit.trim())
          .maybeSingle();
        if (existing) throw new Error("DUPLICATE:" + (existing as any).id);
      }

      const payload: any = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        nit: form.nit.trim() || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        active: true,
      };

      const { data, error } = await supabase.from("hotel_companies" as any).insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (companyId) => {
      qc.invalidateQueries({ queryKey: ["hotel-companies"] });
      qc.invalidateQueries({ queryKey: ["hotel-companies-active"] });
      toast({ title: "Empresa creada" });
      resetForm();
      onOpenChange(false);
      onCreated(companyId);
    },
    onError: (e: any) => {
      if (e.message?.startsWith("DUPLICATE:")) {
        const existingId = e.message.split(":")[1];
        toast({ title: "NIT ya existe", description: "Se seleccionará la empresa existente." });
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Crear Empresa Rápida
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>NIT</Label>
            <Input
              value={form.nit}
              onChange={e => setForm({ ...form, nit: e.target.value })}
              onBlur={() => checkDuplicateNit(form.nit)}
            />
          </div>

          {duplicateCompany && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                ⚠ Ya existe una empresa con este NIT
              </p>
              <p className="text-sm">{duplicateCompany.name} (NIT: {duplicateCompany.nit})</p>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                  onCreated(duplicateCompany.id);
                }}
              >
                Seleccionar esta empresa
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contacto</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Dirección</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Guardando..." : "Crear y Seleccionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
