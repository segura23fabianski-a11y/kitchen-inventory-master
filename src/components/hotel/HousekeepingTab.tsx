import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle, PlayCircle, Clock, ClipboardList, Beaker } from "lucide-react";

const TASK_TYPE_LABELS: Record<string, string> = { checkout_clean: "Limpieza Check-out", daily: "Limpieza Diaria", daily_clean: "Limpieza Diaria", maintenance: "Mantenimiento" };
const STATUS_LABELS: Record<string, string> = { pending: "Pendiente", in_progress: "En Progreso", done: "Completada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = { pending: "outline", in_progress: "secondary", done: "default" };

export default function HousekeepingTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("pending");
  const [checklistTask, setChecklistTask] = useState<any>(null);
  const [consumptionDialog, setConsumptionDialog] = useState<any>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["housekeeping-tasks", filterStatus],
    queryFn: async () => {
      let q = supabase.from("housekeeping_tasks" as any).select("*, rooms(room_number, room_types(name))").order("created_at", { ascending: false }).limit(100);
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: checklistItems, refetch: refetchChecklist } = useQuery({
    queryKey: ["housekeeping-checklist", checklistTask?.id],
    queryFn: async () => {
      if (!checklistTask) return [];
      const { data, error } = await supabase.from("housekeeping_task_items" as any)
        .select("*").eq("housekeeping_task_id", checklistTask.id).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!checklistTask,
  });

  // Fetch operational recipes for housekeeping type
  const { data: housekeepingRecipes } = useQuery({
    queryKey: ["housekeeping-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes")
        .select("id, name, recipe_type, recipe_ingredients(product_id, quantity, unit, products(name, unit, average_cost, current_stock))")
        .eq("recipe_type", "housekeeping").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, completed }: { itemId: string; completed: boolean }) => {
      const { error } = await supabase.from("housekeeping_task_items" as any).update({
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      } as any).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => refetchChecklist(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, roomId }: { taskId: string; newStatus: string; roomId: string }) => {
      const updateData: any = { status: newStatus };
      if (newStatus === "done") updateData.completed_at = new Date().toISOString();
      const { error } = await supabase.from("housekeeping_tasks" as any).update(updateData).eq("id", taskId);
      if (error) throw error;
      const task = tasks?.find((t: any) => t.id === taskId);
      if (newStatus === "done" && (task?.task_type === "checkout_clean" || task?.task_type === "daily_clean")) {
        const { error: rErr } = await supabase.from("rooms" as any).update({ status: "available" } as any).eq("id", roomId);
        if (rErr) throw rErr;
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-available"] });
      qc.invalidateQueries({ queryKey: ["rooms-for-checkin"] });
      toast({ title: "Tarea actualizada" });
      // If task completed, suggest chemical consumption
      if (variables.newStatus === "done" && housekeepingRecipes && housekeepingRecipes.length > 0) {
        const task = tasks?.find((t: any) => t.id === variables.taskId);
        setConsumptionDialog(task);
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const registerConsumptionMutation = useMutation({
    mutationFn: async ({ recipeId, taskId }: { recipeId: string; taskId: string }) => {
      if (!user || !restaurantId) throw new Error("Sin sesión");
      // Use the existing RPC to register recipe consumption (1 portion = 1 room)
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: recipeId, _user_id: user.id, _portions: 1, _notes: `Consumo housekeeping - Tarea ${taskId}`,
      });
      if (error) throw error;
      // Link recipe to task
      await supabase.from("housekeeping_tasks" as any).update({ recipe_id: recipeId } as any).eq("id", taskId);
    },
    onSuccess: () => {
      setConsumptionDialog(null);
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      toast({ title: "Consumo de químicos registrado", description: "Los insumos se descontaron del inventario operativo." });
    },
    onError: (e: any) => toast({ title: "Error al registrar consumo", description: e.message, variant: "destructive" }),
  });

  const allChecked = checklistItems?.length > 0 && checklistItems.every((i: any) => i.is_completed);
  const checkedCount = checklistItems?.filter((i: any) => i.is_completed).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <h3 className="text-lg font-semibold text-foreground">Housekeeping</h3>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="in_progress">En Progreso</SelectItem>
            <SelectItem value="done">Completadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Habitación</TableHead><TableHead>Tipo Tarea</TableHead><TableHead>Estado</TableHead>
            <TableHead>Prioridad</TableHead><TableHead>Fecha</TableHead><TableHead>Completada</TableHead>
            <TableHead className="w-44">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
          ) : tasks?.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin tareas</TableCell></TableRow>
          ) : tasks?.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">#{(t as any).rooms?.room_number || "—"}</TableCell>
              <TableCell>{TASK_TYPE_LABELS[t.task_type] || t.task_type}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANTS[t.status] || "secondary"}>{STATUS_LABELS[t.status] || t.status}</Badge></TableCell>
              <TableCell>
                {t.priority === "high" ? <Badge variant="destructive">Alta</Badge> : <span className="text-sm text-muted-foreground">Normal</span>}
              </TableCell>
              <TableCell>{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</TableCell>
              <TableCell>{t.completed_at ? format(new Date(t.completed_at), "dd/MM/yy HH:mm") : "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setChecklistTask(t)}>
                    <ClipboardList className="h-4 w-4 mr-1" />Checklist
                  </Button>
                  {t.status === "pending" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatusMutation.mutate({ taskId: t.id, newStatus: "in_progress", roomId: t.room_id })}>
                      <PlayCircle className="h-4 w-4 mr-1" />Iniciar
                    </Button>
                  )}
                  {t.status === "in_progress" && (
                    <Button variant="default" size="sm" onClick={() => updateStatusMutation.mutate({ taskId: t.id, newStatus: "done", roomId: t.room_id })}>
                      <CheckCircle className="h-4 w-4 mr-1" />Completar
                    </Button>
                  )}
                  {t.status === "done" && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Hecho</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Checklist Dialog */}
      <Dialog open={!!checklistTask} onOpenChange={() => setChecklistTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Checklist — Hab #{checklistTask?.rooms?.room_number || "—"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground mb-3">
              {TASK_TYPE_LABELS[checklistTask?.task_type] || checklistTask?.task_type} • {checkedCount}/{checklistItems?.length || 0} completados
            </p>
            {checklistItems?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin ítems de checklist</p>
            ) : (
              checklistItems?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-muted/50">
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={(checked) => toggleItemMutation.mutate({ itemId: item.id, completed: !!checked })}
                    disabled={checklistTask?.status === "done"}
                  />
                  <span className={`flex-1 text-sm ${item.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.item_name}
                  </span>
                  {item.completed_at && (
                    <span className="text-xs text-muted-foreground">{format(new Date(item.completed_at), "HH:mm")}</span>
                  )}
                </div>
              ))
            )}
          </div>
          {checklistTask?.status === "in_progress" && allChecked && (
            <Button className="w-full mt-2" onClick={() => {
              updateStatusMutation.mutate({ taskId: checklistTask.id, newStatus: "done", roomId: checklistTask.room_id });
              setChecklistTask(null);
            }}>
              <CheckCircle className="h-4 w-4 mr-2" />Marcar como Completada
            </Button>
          )}
          {checklistTask?.notes && (
            <p className="text-xs text-muted-foreground mt-2"><span className="font-medium">Notas:</span> {checklistTask.notes}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Chemical Consumption Suggestion Dialog */}
      <Dialog open={!!consumptionDialog} onOpenChange={() => setConsumptionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="h-5 w-5" />Registrar Consumo de Químicos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              La tarea de limpieza de Hab #{consumptionDialog?.rooms?.room_number} fue completada.
              ¿Desea registrar el consumo de químicos desde una receta operativa?
            </p>
            <p className="text-xs text-muted-foreground">
              Los insumos se descontarán del inventario operativo actual (detergente, cloro, desinfectante, etc.)
            </p>

            {housekeepingRecipes && housekeepingRecipes.length > 0 ? (
              <div className="space-y-2">
                {housekeepingRecipes.map((r: any) => {
                  const ingredients = r.recipe_ingredients || [];
                  return (
                    <div key={r.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.name}</span>
                        <Button size="sm" onClick={() => registerConsumptionMutation.mutate({ recipeId: r.id, taskId: consumptionDialog.id })}
                          disabled={registerConsumptionMutation.isPending}>
                          Registrar
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {ingredients.map((ing: any) => (
                          <p key={ing.product_id}>
                            • {ing.products?.name}: {ing.quantity} {ing.unit}
                            {ing.products?.current_stock !== undefined && (
                              <span className={ing.products.current_stock < ing.quantity ? "text-destructive ml-1" : "ml-1"}>
                                (stock: {ing.products.current_stock})
                              </span>
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay recetas operativas de tipo "housekeeping". Puede crearlas en el módulo de Recetas.
              </p>
            )}

            <Button variant="outline" className="w-full" onClick={() => setConsumptionDialog(null)}>
              Omitir / Registrar después
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
