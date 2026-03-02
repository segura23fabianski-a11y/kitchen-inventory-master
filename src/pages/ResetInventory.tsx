import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEYWORD = "RESET";

export default function ResetInventory() {
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [reason, setReason] = useState("");
  const [includeCategories, setIncludeCategories] = useState(false);
  const [includeRecipes, setIncludeRecipes] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  // Fetch flag
  const { data: resetAllowed, isLoading: loadingFlag } = useQuery({
    queryKey: ["app-setting", "inventory_reset_allowed", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings" as any)
        .select("value")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "inventory_reset_allowed")
        .maybeSingle();
      return (data as any)?.value === true;
    },
    enabled: !!restaurantId,
  });

  // Toggle flag
  const toggleFlag = useMutation({
    mutationFn: async (enabled: boolean) => {
      // Upsert
      const { error } = await supabase.from("app_settings" as any).upsert(
        { restaurant_id: restaurantId, key: "inventory_reset_allowed", value: enabled, updated_at: new Date().toISOString() } as any,
        { onConflict: "restaurant_id,key" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-setting"] });
      toast({ title: "Bandera actualizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Execute reset
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reset-inventory", {
        body: { reason, includeCategories, includeRecipes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.counts as Record<string, number>;
    },
    onSuccess: (counts) => {
      setResult(counts);
      setShowConfirm(false);
      setKeyword("");
      setReason("");
      qc.invalidateQueries();
      toast({ title: "Reset completado" });
    },
    onError: (e: any) => {
      toast({ title: "Error en reset", description: e.message, variant: "destructive" });
      setShowConfirm(false);
    },
  });

  const canSubmit = resetAllowed && reason.trim().length >= 3 && keyword === KEYWORD;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Reset inicial de inventario</h1>

        {/* Warning banner */}
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-start gap-4 pt-6">
            <AlertTriangle className="h-8 w-8 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive text-lg">⚠️ ACCIÓN IRREVERSIBLE</p>
              <p className="text-sm text-muted-foreground mt-1">
                Esta acción eliminará TODOS los productos, movimientos de inventario y códigos/variantes de su restaurante.
                Solo debe usarse durante la etapa inicial de implementación para corregir datos mal cargados.
                <strong> Los datos NO se pueden recuperar.</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Flag control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5" /> Bandera de seguridad
            </CardTitle>
            <CardDescription>
              El reset solo se puede ejecutar cuando la bandera está activa. Se desactiva automáticamente tras un reset exitoso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingFlag ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <div className="flex items-center gap-4">
                <span className={`text-sm font-medium ${resetAllowed ? "text-destructive" : "text-muted-foreground"}`}>
                  {resetAllowed ? "ACTIVA — Reset permitido" : "INACTIVA — Reset bloqueado"}
                </span>
                <Button
                  size="sm"
                  variant={resetAllowed ? "outline" : "destructive"}
                  onClick={() => toggleFlag.mutate(!resetAllowed)}
                  disabled={toggleFlag.isPending}
                >
                  {resetAllowed ? "Desactivar" : "Activar"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result summary */}
        {result && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-base">Resumen del reset</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {Object.entries(result).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono font-semibold">{v}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurar reset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Motivo (obligatorio)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Datos iniciales cargados incorrectamente, reimportar catálogo"
                className="mt-1"
              />
            </div>

            <div className="space-y-3">
              <Label>Opciones adicionales</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="incCat"
                  checked={includeCategories}
                  onCheckedChange={(v) => setIncludeCategories(!!v)}
                />
                <label htmlFor="incCat" className="text-sm">También borrar categorías</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="incRec"
                  checked={includeRecipes}
                  onCheckedChange={(v) => setIncludeRecipes(!!v)}
                />
                <label htmlFor="incRec" className="text-sm">También borrar recetas e ingredientes</label>
              </div>
            </div>

            <div>
              <Label>Escriba <code className="bg-muted px-1 rounded font-bold">{KEYWORD}</code> para confirmar</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value.toUpperCase())}
                placeholder={KEYWORD}
                className="mt-1 max-w-xs font-mono"
              />
            </div>

            <Button
              variant="destructive"
              disabled={!canSubmit}
              onClick={() => setShowConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Ejecutar Reset
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Double confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Confirmar Reset de Inventario
            </DialogTitle>
            <DialogDescription>
              Está a punto de eliminar <strong>todos</strong> los productos, movimientos y códigos de su restaurante.
              {includeCategories && " También se borrarán las categorías."}
              {includeRecipes && " También se borrarán las recetas e ingredientes."}
              <br /><br />
              <strong>Esta acción NO se puede deshacer.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Ejecutando…" : "Sí, eliminar todo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
