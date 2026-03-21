import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, CheckCircle, PlayCircle, Clock, ClipboardList, Beaker, UserCircle, Wand2, FileDown, Settings2, Trash2, GripVertical, Shirt, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TASK_TYPE_LABELS: Record<string, string> = {
  checkout_clean: "Limpieza Check-out",
  daily_clean: "Limpieza Diaria",
  daily: "Limpieza Diaria",
  maintenance: "Mantenimiento",
};
const STATUS_LABELS: Record<string, string> = { pending: "Pendiente", in_progress: "En Progreso", done: "Completada" };
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = { pending: "outline", in_progress: "secondary", done: "default" };

interface NewTaskForm {
  room_id: string;
  task_type: string;
  priority: string;
  assigned_to: string;
  notes: string;
}
const emptyTaskForm: NewTaskForm = { room_id: "", task_type: "daily_clean", priority: "normal", assigned_to: "", notes: "" };

export default function HousekeepingTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("pending");
  const [checklistTask, setChecklistTask] = useState<any>(null);
  const [consumptionDialog, setConsumptionDialog] = useState<any>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<NewTaskForm>(emptyTaskForm);
  const [assignDialog, setAssignDialog] = useState<{ taskId: string; currentAssignee: string | null } | null>(null);
  const [assignValue, setAssignValue] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("daily_clean");
  const [laundryCollectionItems, setLaundryCollectionItems] = useState<Record<string, number>>({});
  // Fetch all rooms for task creation
  const { data: allRooms } = useQuery({
    queryKey: ["rooms-all-housekeeping"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any)
        .select("id, room_number, room_types(name)").order("room_number");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch staff (active profiles in same restaurant)
  const { data: staff } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.from("profiles")
        .select("user_id, full_name")
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["housekeeping-tasks", filterStatus],
    queryFn: async () => {
      let q = supabase.from("housekeeping_tasks" as any)
        .select("*, rooms(room_number, room_types(name))")
        .order("created_at", { ascending: false }).limit(100);
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

  // ── Checklist Templates ──
  const { data: checklistTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ["housekeeping-checklist-templates", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.from("housekeeping_checklist_templates" as any)
        .select("*").eq("restaurant_id", restaurantId).order("task_type").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  const addTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId || !newTemplateName.trim()) throw new Error("Nombre requerido");
      const maxOrder = (checklistTemplates || []).filter((t: any) => t.task_type === newTemplateType).length;
      const { error } = await supabase.from("housekeeping_checklist_templates" as any).insert({
        restaurant_id: restaurantId, item_name: newTemplateName.trim(), task_type: newTemplateType, sort_order: maxOrder, active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { refetchTemplates(); setNewTemplateName(""); toast({ title: "Ítem de plantilla agregado" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("housekeeping_checklist_templates" as any).update({ active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchTemplates(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("housekeeping_checklist_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refetchTemplates(); toast({ title: "Ítem eliminado" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getStaffName = (userId: string | null) => {
    if (!userId) return null;
    return staff?.find(s => s.user_id === userId)?.full_name || null;
  };

  // ── Create manual task ──
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      if (!taskForm.room_id) throw new Error("Seleccione habitación");

      const { data: hTask, error } = await supabase.from("housekeeping_tasks" as any).insert({
        restaurant_id: restaurantId,
        room_id: taskForm.room_id,
        task_type: taskForm.task_type,
        priority: taskForm.priority,
        assigned_to: taskForm.assigned_to || null,
        notes: taskForm.notes.trim() || null,
        status: "pending",
      } as any).select("id").single();
      if (error) throw error;

      // Create checklist items from templates
      const taskId = (hTask as any).id;
      const { data: templates } = await supabase.from("housekeeping_checklist_templates" as any)
        .select("item_name, sort_order")
        .eq("task_type", taskForm.task_type)
        .eq("active", true)
        .order("sort_order");

      const defaultItems = ["Cama tendida", "Baño limpio", "Amenities repuestos", "Basura retirada", "Piso limpio", "Toallas verificadas"];
      const items = (templates && (templates as any[]).length > 0)
        ? (templates as any[]).map((t: any) => ({
            housekeeping_task_id: taskId, restaurant_id: restaurantId,
            item_name: t.item_name, sort_order: t.sort_order,
          }))
        : defaultItems.map((name, i) => ({
            housekeeping_task_id: taskId, restaurant_id: restaurantId,
            item_name: name, sort_order: i,
          }));

      await supabase.from("housekeeping_task_items" as any).insert(items as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      setNewTaskOpen(false);
      setTaskForm(emptyTaskForm);
      toast({ title: "Tarea creada con checklist" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Assign staff ──
  const assignMutation = useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string | null }) => {
      const { error } = await supabase.from("housekeeping_tasks" as any)
        .update({ assigned_to: userId } as any).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      setAssignDialog(null);
      toast({ title: "Responsable actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
      qc.invalidateQueries({ queryKey: ["dashboard-rooms"] });
      toast({ title: "Tarea actualizada" });
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
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: recipeId, _user_id: user.id, _portions: 1, _notes: `Consumo housekeeping - Tarea ${taskId}`,
      });
      if (error) throw error;
      await supabase.from("housekeeping_tasks" as any).update({ recipe_id: recipeId } as any).eq("id", taskId);
    },
    onSuccess: () => {
      setConsumptionDialog(null);
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      toast({ title: "Consumo de químicos registrado" });
    },
    onError: (e: any) => toast({ title: "Error al registrar consumo", description: e.message, variant: "destructive" }),
  });

  const allChecked = checklistItems?.length > 0 && checklistItems.every((i: any) => i.is_completed);
  const checkedCount = checklistItems?.filter((i: any) => i.is_completed).length || 0;

  // ── Auto-generate daily tasks for occupied rooms ──
  const autoGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Sin restaurante");
      // Get occupied rooms (status = 'occupied')
      const { data: occupiedRooms, error: rErr } = await supabase
        .from("rooms" as any)
        .select("id, room_number, room_types(name)")
        .eq("status", "occupied");
      if (rErr) throw rErr;
      if (!occupiedRooms || (occupiedRooms as any[]).length === 0) throw new Error("No hay habitaciones ocupadas actualmente");

      // Check today's existing daily tasks to avoid duplicates
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: existingToday } = await supabase
        .from("housekeeping_tasks" as any)
        .select("room_id")
        .eq("task_type", "daily_clean")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);

      const existingRoomIds = new Set((existingToday as any[] || []).map((t: any) => t.room_id));
      const roomsToCreate = (occupiedRooms as any[]).filter((r: any) => !existingRoomIds.has(r.id));

      if (roomsToCreate.length === 0) throw new Error("Ya se generaron las tareas diarias para todas las habitaciones ocupadas hoy");

      // Get checklist templates
      const { data: templates } = await supabase.from("housekeeping_checklist_templates" as any)
        .select("item_name, sort_order")
        .eq("task_type", "daily_clean")
        .eq("active", true)
        .order("sort_order");

      const defaultItems = ["Cama tendida", "Baño limpio", "Amenities repuestos", "Basura retirada", "Piso limpio", "Toallas verificadas"];

      let created = 0;
      for (const room of roomsToCreate) {
        const { data: hTask, error: tErr } = await supabase.from("housekeeping_tasks" as any).insert({
          restaurant_id: restaurantId,
          room_id: room.id,
          task_type: "daily_clean",
          priority: "normal",
          status: "pending",
          notes: `Limpieza diaria generada automáticamente — ${format(new Date(), "dd/MM/yyyy")}`,
        } as any).select("id").single();
        if (tErr) continue;

        const taskId = (hTask as any).id;
        const items = (templates && (templates as any[]).length > 0)
          ? (templates as any[]).map((t: any) => ({
              housekeeping_task_id: taskId, restaurant_id: restaurantId,
              item_name: t.item_name, sort_order: t.sort_order,
            }))
          : defaultItems.map((name, i) => ({
              housekeeping_task_id: taskId, restaurant_id: restaurantId,
              item_name: name, sort_order: i,
            }));
        await supabase.from("housekeeping_task_items" as any).insert(items as any);
        created++;
      }
      return created;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["housekeeping-tasks"] });
      toast({ title: `${count} tarea(s) de limpieza diaria creada(s)`, description: "Para todas las habitaciones ocupadas" });
    },
    onError: (e: any) => toast({ title: "Info", description: e.message, variant: "destructive" }),
  });

  // ── Export PDF report ──
  const exportPdf = async () => {
    const pendingTasks = tasks?.filter((t: any) => t.status === "pending" || t.status === "in_progress") || [];
    if (pendingTasks.length === 0) {
      toast({ title: "Sin tareas pendientes para exportar", variant: "destructive" });
      return;
    }

    // Fetch active stays with guest shift info for all rooms that have tasks
    const roomIds = [...new Set(pendingTasks.map((t: any) => t.room_id))];
    const { data: activeStays } = await supabase.from("stays" as any)
      .select("room_id, stay_guests(shift_label, shift_start, shift_end, hotel_guests(first_name, last_name))")
      .eq("status", "checked_in")
      .in("room_id", roomIds);

    // Build a map: room_id -> guest shift info
    const shiftMap: Record<string, string> = {};
    if (activeStays) {
      for (const stay of activeStays as any[]) {
        const guestsWithShifts = stay.stay_guests?.filter((sg: any) => sg.shift_label || sg.shift_start) || [];
        if (guestsWithShifts.length > 0) {
          shiftMap[stay.room_id] = guestsWithShifts.map((sg: any) => {
            const name = sg.hotel_guests ? `${sg.hotel_guests.first_name} ${sg.hotel_guests.last_name}` : "";
            const time = sg.shift_start ? `${sg.shift_start}${sg.shift_end ? `-${sg.shift_end}` : ""}` : "";
            return `${name}: ${sg.shift_label || ""}${time ? ` (${time})` : ""}`.trim();
          }).join(" | ");
        }
      }
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const today = format(new Date(), "EEEE dd 'de' MMMM 'de' yyyy", { locale: es });

    // Header
    doc.setFillColor(30, 64, 120);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("REPORTE DE HOUSEKEEPING", pageW / 2, 10, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(today, pageW / 2, 17, { align: "center" });

    let y = 28;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.text(`Total tareas: ${pendingTasks.length}`, margin, y);
    y += 6;

    const rows = pendingTasks.map((t: any) => [
      `#${t.rooms?.room_number || "—"}`,
      t.rooms?.room_types?.name || "—",
      TASK_TYPE_LABELS[t.task_type] || t.task_type,
      t.priority === "high" ? "ALTA" : "Normal",
      getStaffName(t.assigned_to) || "Sin asignar",
      shiftMap[t.room_id] || "Sin turno",
      STATUS_LABELS[t.status] || t.status,
      "", // checkbox column
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Hab.", "Tipo Hab.", "Tipo Tarea", "Prioridad", "Responsable", "Turnos Huéspedes", "Estado", "✓"]],
      body: rows,
      margin: { left: margin, right: margin },
      theme: "grid",
      headStyles: { fillColor: [30, 64, 120], textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", halign: "center" },
      bodyStyles: { fontSize: 7, textColor: [30, 30, 30], cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { halign: "center", cellWidth: 14, fontStyle: "bold" },
        1: { cellWidth: 22 },
        2: { cellWidth: 26 },
        3: { halign: "center", cellWidth: 16 },
        4: { cellWidth: 28 },
        5: { cellWidth: "auto", fontStyle: "italic" },
        6: { halign: "center", cellWidth: 18 },
        7: { halign: "center", cellWidth: 12 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 3 && data.cell.raw === "ALTA") {
          data.cell.styles.textColor = [200, 30, 30];
          data.cell.styles.fontStyle = "bold";
        }
        // Highlight shift info
        if (data.section === "body" && data.column.index === 5 && data.cell.raw !== "Sin turno") {
          data.cell.styles.textColor = [20, 80, 160];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // Legend about shifts
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text("⚠ IMPORTANTE: Respetar los turnos de los huéspedes. No ingresar a la habitación mientras estén descansando.", margin, y);
    y += 8;

    // Signature area
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    const sigW = (pageW - margin * 2 - 10) / 2;
    doc.line(margin, y + 15, margin + sigW, y + 15);
    doc.line(margin + sigW + 10, y + 15, pageW - margin, y + 15);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("Firma Supervisora / Ama de llaves", margin + sigW / 2, y + 19, { align: "center" });
    doc.text("Firma Recepción", margin + sigW + 10 + sigW / 2, y + 19, { align: "center" });

    // Footer
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, margin, doc.internal.pageSize.getHeight() - 10);

    doc.save(`Housekeeping_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg font-semibold text-foreground">Housekeeping</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => autoGenerateMutation.mutate()} disabled={autoGenerateMutation.isPending}>
            <Wand2 className="h-4 w-4 mr-1" />{autoGenerateMutation.isPending ? "Generando..." : "Generar Tareas del Día"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <FileDown className="h-4 w-4 mr-1" />Exportar PDF
          </Button>
          <Button size="sm" onClick={() => { setTaskForm(emptyTaskForm); setNewTaskOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Nueva Tarea
          </Button>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="in_progress">En Progreso</SelectItem>
              <SelectItem value="done">Completadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Checklist Templates Management ── */}
      <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />Plantillas de Checklist
            <Badge variant="secondary" className="ml-1">{checklistTemplates?.filter((t: any) => t.active).length || 0}</Badge>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Estos ítems se copian automáticamente al checklist de cada nueva tarea de limpieza según su tipo.
            </p>
            {/* Add new template */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Nombre del ítem</Label>
                <Input value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)} placeholder="Ej: Limpiar espejos" />
              </div>
              <div className="w-44">
                <Label className="text-xs">Tipo de tarea</Label>
                <Select value={newTemplateType} onValueChange={setNewTemplateType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily_clean">Limpieza Diaria</SelectItem>
                    <SelectItem value="checkout_clean">Limpieza Check-out</SelectItem>
                    <SelectItem value="maintenance">Mantenimiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={() => addTemplateMutation.mutate()} disabled={!newTemplateName.trim() || addTemplateMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />Agregar
              </Button>
            </div>
            {/* List templates grouped by type */}
            {["daily_clean", "checkout_clean", "maintenance"].map(type => {
              const items = (checklistTemplates || []).filter((t: any) => t.task_type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{TASK_TYPE_LABELS[type]}</p>
                  {items.map((tpl: any) => (
                    <div key={tpl.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className={`flex-1 text-sm ${!tpl.active ? "line-through text-muted-foreground" : "text-foreground"}`}>{tpl.item_name}</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => toggleTemplateMutation.mutate({ id: tpl.id, active: !tpl.active })}>
                        {tpl.active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-1 text-destructive hover:text-destructive"
                        onClick={() => deleteTemplateMutation.mutate(tpl.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
            {(!checklistTemplates || checklistTemplates.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-2">No hay plantillas. Se usarán ítems por defecto al crear tareas.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Habitación</TableHead>
            <TableHead>Tipo Tarea</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Completada</TableHead>
            <TableHead className="w-48">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
          ) : tasks?.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin tareas</TableCell></TableRow>
          ) : tasks?.map((t: any) => {
            const assigneeName = getStaffName(t.assigned_to);
            return (
              <TableRow key={t.id}>
                <TableCell className="font-medium">#{t.rooms?.room_number || "—"}</TableCell>
                <TableCell>{TASK_TYPE_LABELS[t.task_type] || t.task_type}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[t.status] || "secondary"}>{STATUS_LABELS[t.status] || t.status}</Badge></TableCell>
                <TableCell>
                  {t.priority === "high" ? <Badge variant="destructive">Alta</Badge> : <span className="text-sm text-muted-foreground">Normal</span>}
                </TableCell>
                <TableCell>
                  <button
                    className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                    onClick={() => { setAssignDialog({ taskId: t.id, currentAssignee: t.assigned_to }); setAssignValue(t.assigned_to || ""); }}
                    title="Asignar/reasignar"
                  >
                    <UserCircle className="h-3.5 w-3.5" />
                    {assigneeName || <span className="text-muted-foreground italic">Sin asignar</span>}
                  </button>
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
            );
          })}
        </TableBody>
      </Table>

      {/* ── New Task Dialog ── */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva Tarea de Housekeeping</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Habitación *</Label>
              <Select value={taskForm.room_id} onValueChange={v => setTaskForm({ ...taskForm, room_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar habitación..." /></SelectTrigger>
                <SelectContent>
                  {allRooms?.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>#{r.room_number} — {r.room_types?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Tarea</Label>
              <Select value={taskForm.task_type} onValueChange={v => setTaskForm({ ...taskForm, task_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily_clean">Limpieza Diaria</SelectItem>
                  <SelectItem value="checkout_clean">Limpieza Check-out</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsable (opcional)</Label>
              <Select value={taskForm.assigned_to || "unassigned"} onValueChange={v => setTaskForm({ ...taskForm, assigned_to: v === "unassigned" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Sin asignar</SelectItem>
                  {staff?.map(s => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={taskForm.notes} onChange={e => setTaskForm({ ...taskForm, notes: e.target.value })} placeholder="Observaciones..." />
            </div>
            <Button className="w-full" onClick={() => createTaskMutation.mutate()} disabled={!taskForm.room_id || createTaskMutation.isPending}>
              {createTaskMutation.isPending ? "Creando..." : "Crear Tarea"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Staff Dialog ── */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Asignar Responsable</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={assignValue || "unassigned"} onValueChange={v => setAssignValue(v === "unassigned" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {staff?.map(s => (
                  <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={() => {
              if (assignDialog) assignMutation.mutate({ taskId: assignDialog.taskId, userId: assignValue || null });
            }} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Checklist Dialog ── */}
      <Dialog open={!!checklistTask} onOpenChange={() => setChecklistTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Checklist — Hab #{checklistTask?.rooms?.room_number || "—"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground mb-3">
              {TASK_TYPE_LABELS[checklistTask?.task_type] || checklistTask?.task_type} • {checkedCount}/{checklistItems?.length || 0} completados
              {checklistTask?.assigned_to && (
                <span className="ml-2">• Responsable: {getStaffName(checklistTask.assigned_to) || "—"}</span>
              )}
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

      {/* ── Chemical Consumption Suggestion Dialog ── */}
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
