import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Undo2, Eye, Clock, User, Filter } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ENTITY_LABELS: Record<string, string> = {
  product: "Producto",
  recipe: "Receta",
  recipe_ingredient: "Ingrediente",
  product_code: "Código",
  category: "Categoría",
  inventory_movement: "Movimiento",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
  ADD_CODE: "Código agregado",
  REMOVE_CODE: "Código eliminado",
  COST_CHANGE: "Cambio de costo",
  ROLLBACK: "Reversión",
  PRODUCT_COST_REVALUATION: "Revalorización de costo de producto",
  INVENTORY_RESET: "Reset de inventario",
  BACKDATED_MOVEMENT: "Movimiento con fecha retroactiva",
  TRANSFORMATION_RUN: "Transformación de producto",
  WASTE_REGISTERED: "Registro de desperdicio",
  MEAL_PLAN_CREATED: "Planeación de minuta creada",
  MEAL_PLAN_UPDATED: "Planeación de minuta actualizada",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-500/10 text-blue-700 border-blue-200",
  DELETE: "bg-red-500/10 text-red-700 border-red-200",
  ADD_CODE: "bg-purple-500/10 text-purple-700 border-purple-200",
  REMOVE_CODE: "bg-orange-500/10 text-orange-700 border-orange-200",
  COST_CHANGE: "bg-amber-500/10 text-amber-700 border-amber-200",
  ROLLBACK: "bg-slate-500/10 text-slate-700 border-slate-200",
  PRODUCT_COST_REVALUATION: "bg-amber-500/10 text-amber-700 border-amber-200",
  INVENTORY_RESET: "bg-red-500/10 text-red-700 border-red-200",
  BACKDATED_MOVEMENT: "bg-amber-500/10 text-amber-700 border-amber-200",
  TRANSFORMATION_RUN: "bg-blue-500/10 text-blue-700 border-blue-200",
  WASTE_REGISTERED: "bg-red-500/10 text-red-700 border-red-200",
  MEAL_PLAN_CREATED: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  MEAL_PLAN_UPDATED: "bg-blue-500/10 text-blue-700 border-blue-200",
};

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [detailEvent, setDetailEvent] = useState<any>(null);
  const [rollbackEvent, setRollbackEvent] = useState<any>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Reset page when filters change
  const handleEntityFilter = useCallback((v: string) => { setEntityFilter(v); setPage(1); }, []);
  const handleActionFilter = useCallback((v: string) => { setActionFilter(v); setPage(1); }, []);
  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const { data: countData } = useQuery({
    queryKey: ["audit-events-count", entityFilter, actionFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("audit_events" as any)
        .select("id", { count: "exact", head: true });

      if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalCount = countData ?? 0;

  const { data: events, isLoading } = useQuery({
    queryKey: ["audit-events", entityFilter, actionFilter, page, pageSize],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("audit_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (entityFilter !== "all") {
        query = query.eq("entity_type", entityFilter);
      }
      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

  const rollbackMutation = useMutation({
    mutationFn: async ({ eventId, reason }: { eventId: string; reason: string }) => {
      const { data, error } = await supabase.functions.invoke("rollback-audit-event", {
        body: { event_id: eventId, reason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-events"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      setRollbackEvent(null);
      setRollbackReason("");
      toast({ title: "Cambio revertido exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = events?.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const userName = profileMap.get(e.performed_by)?.toLowerCase() || "";
    const entityLabel = ENTITY_LABELS[e.entity_type]?.toLowerCase() || "";
    return userName.includes(q) || entityLabel.includes(q) || e.entity_id?.includes(q);
  });

  const renderDiff = (before: any, after: any) => {
    if (!before && !after) return <p className="text-muted-foreground text-sm">Sin datos</p>;

    const allKeys = new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]);

    // Filter out irrelevant fields
    const skipFields = ["id", "created_at", "updated_at", "restaurant_id"];
    const relevantKeys = [...allKeys].filter((k) => !skipFields.includes(k));

    const changedKeys = relevantKeys.filter((k) => {
      const b = before?.[k];
      const a = after?.[k];
      return JSON.stringify(b) !== JSON.stringify(a);
    });

    if (changedKeys.length === 0 && before && after) {
      return <p className="text-muted-foreground text-sm">Sin cambios detectados</p>;
    }

    return (
      <div className="space-y-2">
        {(before && after ? changedKeys : relevantKeys).map((key) => (
          <div key={key} className="rounded-md border p-2 text-sm">
            <span className="font-medium text-foreground">{key}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {before && (
                <div className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  <span className="text-xs font-medium">Antes:</span>{" "}
                  {JSON.stringify(before[key]) ?? "—"}
                </div>
              )}
              {after && (
                <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <span className="text-xs font-medium">Después:</span>{" "}
                  {JSON.stringify(after[key]) ?? "—"}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Auditoría</h1>
          <p className="text-muted-foreground">Historial de cambios con opción de reversión</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder="Buscar por usuario o entidad..." value={search} onChange={(e) => handleSearch(e.target.value)} />
          </div>
          <Select value={entityFilter} onValueChange={handleEntityFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Entidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Acción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !filtered?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin eventos de auditoría</TableCell></TableRow>
                ) : (
                  filtered.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {format(new Date(ev.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{profileMap.get(ev.performed_by) || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ENTITY_LABELS[ev.entity_type] || ev.entity_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[ev.action] || ""}`}>
                          {ACTION_LABELS[ev.action] || ev.action}
                        </span>
                      </TableCell>
                      <TableCell>
                        {ev.rollback_applied && (
                          <Badge variant="secondary" className="text-xs">Revertido</Badge>
                        )}
                        {ev.action === "ROLLBACK" && (
                          <Badge variant="secondary" className="text-xs">Reversión</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailEvent(ev)} title="Ver detalle">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {ev.can_rollback && !ev.rollback_applied && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700" onClick={() => setRollbackEvent(ev)} title="Revertir">
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!detailEvent} onOpenChange={(o) => { if (!o) setDetailEvent(null); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">Detalle del Evento</DialogTitle>
            </DialogHeader>
            {detailEvent && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Entidad</Label>
                    <p>{ENTITY_LABELS[detailEvent.entity_type] || detailEvent.entity_type}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Acción</Label>
                    <p>{ACTION_LABELS[detailEvent.action] || detailEvent.action}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Usuario</Label>
                    <p>{profileMap.get(detailEvent.performed_by) || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <p>{format(new Date(detailEvent.created_at), "dd MMM yyyy, HH:mm:ss", { locale: es })}</p>
                  </div>
                </div>
                {detailEvent.metadata?.reason && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Motivo</Label>
                    <p className="text-sm">{detailEvent.metadata.reason}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Cambios (Antes → Después)</Label>
                  {renderDiff(detailEvent.before, detailEvent.after)}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rollback Confirmation Dialog */}
        <Dialog open={!!rollbackEvent} onOpenChange={(o) => { if (!o) { setRollbackEvent(null); setRollbackReason(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading text-amber-600 flex items-center gap-2">
                <Undo2 className="h-5 w-5" /> Confirmar Reversión
              </DialogTitle>
            </DialogHeader>
            {rollbackEvent && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Estás a punto de revertir un cambio de tipo <strong>{ACTION_LABELS[rollbackEvent.action]}</strong> en{" "}
                  <strong>{ENTITY_LABELS[rollbackEvent.entity_type]}</strong>.
                  Se restaurarán los valores previos al cambio.
                </p>
                <div className="space-y-2">
                  <Label>Motivo (opcional)</Label>
                  <Textarea
                    value={rollbackReason}
                    onChange={(e) => setRollbackReason(e.target.value)}
                    placeholder="¿Por qué se revierte este cambio?"
                    maxLength={500}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setRollbackEvent(null); setRollbackReason(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => rollbackMutation.mutate({ eventId: rollbackEvent.id, reason: rollbackReason })}
                    disabled={rollbackMutation.isPending}
                  >
                    {rollbackMutation.isPending ? "Revirtiendo..." : "Confirmar Reversión"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
