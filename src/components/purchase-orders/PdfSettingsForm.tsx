import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, Palette } from "lucide-react";

interface PdfSettingsRow {
  id: string;
  restaurant_id: string;
  document_code: string | null;
  version: string | null;
  format_date: string | null;
  company_name: string | null;
  company_nit: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  logo_url: string | null;
  footer_contact_text: string | null;
  approved_by_name: string | null;
  signature_image_url: string | null;
  observations_default: string | null;
  show_taxes: boolean;
  primary_color: string | null;
}

export default function PdfSettingsForm() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["pdf-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_pdf_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data as PdfSettingsRow | null;
    },
    enabled: !!restaurantId,
  });

  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      setForm({ show_taxes: true, primary_color: "#214C99" });
    }
  }, [existing]);

  const update = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      const payload = {
        restaurant_id: restaurantId,
        document_code: form.document_code || null,
        version: form.version || null,
        format_date: form.format_date || null,
        company_name: form.company_name || null,
        company_nit: form.company_nit || null,
        company_address: form.company_address || null,
        company_phone: form.company_phone || null,
        company_email: form.company_email || null,
        logo_url: form.logo_url || null,
        footer_contact_text: form.footer_contact_text || null,
        approved_by_name: form.approved_by_name || null,
        signature_image_url: form.signature_image_url || null,
        observations_default: form.observations_default || null,
        show_taxes: form.show_taxes ?? true,
        primary_color: form.primary_color || null,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from("purchase_order_pdf_settings")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("purchase_order_pdf_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdf-settings"] });
      toast({ title: "Configuración de PDF guardada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm p-4">Cargando configuración...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Plantilla PDF — Orden de Compra
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Document metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Código del formato</Label>
            <Input value={form.document_code || ""} onChange={(e) => update("document_code", e.target.value)} placeholder="FO-CO-001" />
          </div>
          <div>
            <Label>Versión</Label>
            <Input value={form.version || ""} onChange={(e) => update("version", e.target.value)} placeholder="01" />
          </div>
          <div>
            <Label>Fecha del formato</Label>
            <Input value={form.format_date || ""} onChange={(e) => update("format_date", e.target.value)} placeholder="2024-01-01" />
          </div>
        </div>

        {/* Company info */}
        <div>
          <h4 className="font-semibold text-sm mb-2 text-foreground">Datos de la empresa</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Nombre empresa</Label>
              <Input value={form.company_name || ""} onChange={(e) => update("company_name", e.target.value)} />
            </div>
            <div>
              <Label>NIT</Label>
              <Input value={form.company_nit || ""} onChange={(e) => update("company_nit", e.target.value)} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.company_address || ""} onChange={(e) => update("company_address", e.target.value)} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.company_phone || ""} onChange={(e) => update("company_phone", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Correo</Label>
              <Input value={form.company_email || ""} onChange={(e) => update("company_email", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Visual */}
        <div>
          <h4 className="font-semibold text-sm mb-2 text-foreground">Apariencia</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>URL del logo</Label>
              <Input value={form.logo_url || ""} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Color principal (hex)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.primary_color || "#214C99"}
                  onChange={(e) => update("primary_color", e.target.value)}
                  className="w-12 h-9 p-1"
                />
                <Input value={form.primary_color || "#214C99"} onChange={(e) => update("primary_color", e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Taxes */}
        <div className="flex items-center gap-3">
          <Switch checked={form.show_taxes ?? true} onCheckedChange={(v) => update("show_taxes", v)} />
          <Label>Mostrar columnas de impuestos (IVA, ICO, Otro)</Label>
        </div>

        {/* Approval */}
        <div>
          <h4 className="font-semibold text-sm mb-2 text-foreground">Aprobación y firma</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Nombre de quien aprueba</Label>
              <Input value={form.approved_by_name || ""} onChange={(e) => update("approved_by_name", e.target.value)} />
            </div>
            <div>
              <Label>URL imagen de firma</Label>
              <Input value={form.signature_image_url || ""} onChange={(e) => update("signature_image_url", e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Footer / Observations */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Observaciones predeterminadas</Label>
            <Textarea value={form.observations_default || ""} onChange={(e) => update("observations_default", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Texto de contacto en pie de página</Label>
            <Textarea
              value={form.footer_contact_text || ""}
              onChange={(e) => update("footer_contact_text", e.target.value)}
              rows={2}
              placeholder="Si tiene preguntas relacionadas con esta orden, comuníquese con ..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {save.isPending ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
