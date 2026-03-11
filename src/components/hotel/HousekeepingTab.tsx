import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle, PlayCircle, Clock } from "lucide-react";

const TASK_TYPE_LABELS: Record<string, string> = { checkout_clean: "Limpieza Check-out", daily: "Limpieza Diaria", maintenance: "Mantenimiento" };
const STATUS_LABELS: Record<string, string> = { pending: "Pendiente", in_progress: "En Progreso", done: "Completada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = { pending: "outline", in_progress: "secondary", done: "default" };

export default function HousekeepingTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("pending");

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, newStatus, roomId }: { taskId: string; newStatus: string; roomId: string }) => {
      const updateData: any = { status: newStatus };
      if (newStatus === "done") updateData.completed_at = new Date().toISOString();

      const { error } = await supabase.from("housekeeping_tasks" as any).update(updateData).eq("id", taskId);
      if (error) throw error;

      // If checkout_clean task completed → room becomes available
      const task = tasks?.find((t: any) => t.id === taskId);
      if (newStatus === "done" && task?.task_type === "checkout_clean") {
        const { error: rErr } = await supabase.from("rooms" as any).update({ status: "available" } as any).eq("id", roomId);
        if (rErr) throw rErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["rooms-available"] });
      toast({ title: "Tarea actualizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

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
            <TableHead>Habitación</TableHead>
            <TableHead>Tipo Tarea</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Completada</TableHead>
            <TableHead className="w-32">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
          ) : tasks?.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin tareas</TableCell></TableRow>
          ) : tasks?.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">#{(t as any).rooms?.room_number || "—"}</TableCell>
              <TableCell>{TASK_TYPE_LABELS[t.task_type] || t.task_type}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANTS[t.status] || "secondary"}>{STATUS_LABELS[t.status] || t.status}</Badge></TableCell>
              <TableCell>{format(new Date(t.created_at), "dd/MM/yy HH:mm")}</TableCell>
              <TableCell>{t.completed_at ? format(new Date(t.completed_at), "dd/MM/yy HH:mm") : "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
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
    </div>
  );
}
