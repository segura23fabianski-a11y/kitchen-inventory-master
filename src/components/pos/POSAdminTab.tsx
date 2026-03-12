import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, AlertTriangle, ShieldCheck, Filter } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function POSAdminTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyTest, setOnlyTest] = useState(true);

  // Count test records
  const { data: stats } = useQuery({
    queryKey: ["pos-test-stats", restaurantId, dateFrom, dateTo, onlyTest],
    queryFn: async () => {
      let q = supabase
        .from("pos_orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId!);

      if (onlyTest) {
        q = q.eq("is_test_record", true);
      }
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");

      const { count, error } = await q;
      if (error) throw error;
      return { count: count || 0 };
    },
    enabled: !!restaurantId,
  });

  const purge = useMutation({
    mutationFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data, error } = await supabase.functions.invoke("purge-pos-test-data", {
        body: {
          restaurant_id: restaurantId,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          only_test: onlyTest,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-test-stats"] });
      toast.success(`Se eliminaron ${data?.deleted_orders ?? 0} pedidos y ${data?.deleted_items ?? 0} ítems de prueba`);
      setConfirmOpen(false);
      setConfirmText("");
    },
    onError: (e: any) => toast.error(e.message || "Error al purgar datos"),
  });

  const handlePurge = () => {
    if (confirmText !== "ELIMINAR") return;
    purge.mutate();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" /> Administración POS
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Limpieza de datos de prueba
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Esta herramienta elimina permanentemente pedidos POS y sus ítems asociados. 
              Use filtros para limitar el alcance. Los pedidos marcados como prueba (is_test_record) se eliminan de forma segura.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Desde</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyTest}
                  onChange={e => setOnlyTest(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Solo registros de prueba</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm px-3 py-1">
              <Filter className="h-3.5 w-3.5 mr-1" />
              {stats?.count ?? "..."} pedidos coinciden
            </Badge>
            <Button
              variant="destructive"
              disabled={(stats?.count ?? 0) === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar pedidos
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar eliminación
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Vas a eliminar <strong>{stats?.count ?? 0}</strong> pedidos POS 
                {onlyTest ? " marcados como prueba" : " (TODOS los que coincidan)"}.
              </p>
              <p>Esta acción <strong>no se puede revertir</strong>.</p>
              <p>Escribe <strong>ELIMINAR</strong> para confirmar:</p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmText !== "ELIMINAR" || purge.isPending}
              onClick={handlePurge}
            >
              {purge.isPending ? "Eliminando..." : "Confirmar eliminación"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
