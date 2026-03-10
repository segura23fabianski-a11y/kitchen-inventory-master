import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Palette, Type, Image, Save, Package } from "lucide-react";

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-input" />
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#000000" className="font-mono" />
        {value && <Button variant="ghost" size="sm" onClick={() => onChange("")}>Limpiar</Button>}
      </div>
    </div>
  );
}

function ImageUpload({ label, currentUrl, onUpload, restaurantId, field }: { label: string; currentUrl: string | null; onUpload: (url: string) => void; restaurantId: string; field: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${restaurantId}/${field}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onUpload(data.publicUrl);
      toast.success(`${label} subido`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="h-12 w-12 rounded border border-border object-contain bg-muted" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-border bg-muted"><Image className="h-5 w-5 text-muted-foreground" /></div>
        )}
        <div className="flex-1 space-y-1">
          <Input value={currentUrl || ""} onChange={(e) => onUpload(e.target.value)} placeholder="URL de la imagen" className="text-sm" />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" />{uploading ? "Subiendo..." : "Subir archivo"}
          </Button>
        </div>
        {currentUrl && <Button variant="ghost" size="sm" onClick={() => onUpload("")}>Quitar</Button>}
      </div>
    </div>
  );
}

export default function BrandingPage() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["branding-admin", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branding_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const [form, setForm] = useState({
    app_name: "",
    logo_url: "",
    logo_small_url: "",
    favicon_url: "",
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    login_background_url: "",
  });

  const [initialized, setInitialized] = useState(false);
  if (existing && !initialized) {
    setForm({
      app_name: existing.app_name || "",
      logo_url: existing.logo_url || "",
      logo_small_url: existing.logo_small_url || "",
      favicon_url: existing.favicon_url || "",
      primary_color: existing.primary_color || "",
      secondary_color: existing.secondary_color || "",
      accent_color: existing.accent_color || "",
      login_background_url: existing.login_background_url || "",
    });
    setInitialized(true);
  }

  const set = (key: keyof typeof form) => (value: string) => setForm((p) => ({ ...p, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        restaurant_id: restaurantId!,
        app_name: form.app_name || null,
        logo_url: form.logo_url || null,
        logo_small_url: form.logo_small_url || null,
        favicon_url: form.favicon_url || null,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        accent_color: form.accent_color || null,
        login_background_url: form.login_background_url || null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await supabase.from("branding_settings").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branding_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branding"] });
      qc.invalidateQueries({ queryKey: ["branding-admin"] });
      qc.invalidateQueries({ queryKey: ["branding-settings"] });
      toast.success("Branding guardado. Recarga la página para ver los cambios completos.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!restaurantId) return <AppLayout><p className="text-muted-foreground">Cargando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configuración Visual</h1>
            <p className="text-muted-foreground">Personaliza la apariencia de tu aplicación</p>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1" />{saveMutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>

        {/* Nombre */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Type className="h-4 w-4" />Identidad</CardTitle>
            <CardDescription>Nombre visible de la aplicación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Nombre de la App</Label>
              <Input value={form.app_name} onChange={(e) => set("app_name")(e.target.value)} placeholder="Inventario (por defecto)" />
            </div>
          </CardContent>
        </Card>

        {/* Logos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Image className="h-4 w-4" />Logos</CardTitle>
            <CardDescription>Imágenes de marca para sidebar, header y login</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUpload label="Logo Principal" currentUrl={form.logo_url} onUpload={set("logo_url")} restaurantId={restaurantId} field="logo" />
            <ImageUpload label="Logo Pequeño (Sidebar)" currentUrl={form.logo_small_url} onUpload={set("logo_small_url")} restaurantId={restaurantId} field="logo-small" />
            <ImageUpload label="Favicon" currentUrl={form.favicon_url} onUpload={set("favicon_url")} restaurantId={restaurantId} field="favicon" />
            <ImageUpload label="Fondo de Login" currentUrl={form.login_background_url} onUpload={set("login_background_url")} restaurantId={restaurantId} field="login-bg" />
          </CardContent>
        </Card>

        {/* Colores */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" />Colores</CardTitle>
            <CardDescription>Personaliza los colores del sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ColorInput label="Color Primario" value={form.primary_color} onChange={set("primary_color")} />
            <ColorInput label="Color Secundario" value={form.secondary_color} onChange={set("secondary_color")} />
            <ColorInput label="Color de Acento" value={form.accent_color} onChange={set("accent_color")} />
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista Previa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border p-6 space-y-4">
              <div className="flex items-center gap-3">
                {form.logo_small_url ? (
                  <img src={form.logo_small_url} alt="Logo" className="h-8 w-8 rounded object-contain" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: form.primary_color || "hsl(var(--primary))" }}>
                    <Package className="h-4 w-4 text-white" />
                  </div>
                )}
                <span className="font-heading text-base font-semibold">{form.app_name || "Inventario"}</span>
              </div>
              <div className="flex gap-3">
                <button className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: form.primary_color || "hsl(var(--primary))" }}>Botón Primario</button>
                <button className="rounded-lg px-4 py-2 text-sm font-medium border" style={{ borderColor: form.accent_color || "hsl(var(--accent))", color: form.accent_color || "hsl(var(--accent))" }}>Botón Acento</button>
              </div>
              {form.login_background_url && (
                <div className="relative h-32 rounded-lg overflow-hidden">
                  <img src={form.login_background_url} alt="Login BG" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <span className="text-sm font-medium">Fondo de Login</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
