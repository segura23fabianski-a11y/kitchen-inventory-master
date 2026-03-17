import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { convertToProductUnit } from "@/lib/unit-conversion";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, ChevronLeft, ChevronRight, ArrowLeft, Settings2 } from "lucide-react";
import { format, addDays, parseISO, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";

const SERVICE_TYPES = [
  { value: "desayuno", label: "Desayuno" },
  { value: "almuerzo", label: "Almuerzo" },
  { value: "cena", label: "Cena" },
  { value: "lonche", label: "Lonche" },
];

// ─── Components Tab (components + service templates) ────────────
function ComponentsConfig({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", sort_order: 0 });

  const { data: components = [], isLoading } = useQuery({
    queryKey: ["meal-components", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_components")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceTemplates = [] } = useQuery({
    queryKey: ["service-type-components", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_type_components" as any)
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from("meal_components")
          .update({ name: values.name, description: values.description, sort_order: values.sort_order })
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("meal_components")
          .insert({ ...values, restaurant_id: restaurantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meal-components"] });
      setDialogOpen(false);
      toast.success(editing ? "Componente actualizado" : "Componente creado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("meal_components").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal-components"] }),
  });

  const addToService = useMutation({
    mutationFn: async ({ serviceType, componentId }: { serviceType: string; componentId: string }) => {
      const existing = serviceTemplates.filter((t: any) => t.service_type === serviceType);
      const { error } = await supabase
        .from("service_type_components" as any)
        .insert({ restaurant_id: restaurantId, service_type: serviceType, component_id: componentId, sort_order: existing.length } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-type-components"] });
      toast.success("Componente asignado al servicio");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeFromService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_type_components" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-type-components"] });
      toast.success("Componente removido");
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", sort_order: components.length });
    setDialogOpen(true);
  };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || "", sort_order: c.sort_order });
    setDialogOpen(true);
  };

  const activeComponents = components.filter((c: any) => c.active);

  return (
    <div className="space-y-6">
      {/* Components list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Componentes de Servicio</h2>
          <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-1" />Nuevo Componente</Button>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orden</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : components.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No hay componentes. Crea el primero.</TableCell></TableRow>
              ) : (
                components.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.sort_order}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.description || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={c.active} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, active: v })} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Service Templates */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Plantillas por Servicio</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Asigna qué componentes lleva cada servicio. Al planear la minuta, estos componentes aparecerán automáticamente y solo tendrás que elegir la receta para cada uno.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SERVICE_TYPES.map((st) => {
            const assigned = serviceTemplates
              .filter((t: any) => t.service_type === st.value)
              .map((t: any) => ({ ...t, component: components.find((c: any) => c.id === t.component_id) }))
              .sort((a: any, b: any) => a.sort_order - b.sort_order);
            const assignedIds = new Set(assigned.map((a: any) => a.component_id));
            const available = activeComponents.filter((c: any) => !assignedIds.has(c.id));

            return (
              <Card key={st.value}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold">{st.label}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {assigned.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin componentes asignados</p>
                  )}
                  {assigned.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
                      <span className="text-sm font-medium">{a.component?.name || "?"}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFromService.mutate(a.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {available.length > 0 && (
                    <Select onValueChange={(componentId) => addToService.mutate({ serviceType: st.value, componentId })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="+ Agregar componente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nuevo"} Componente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ej: principal, bebida caliente" /></div>
            <div><Label>Descripción</Label><Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Orden</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.name.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate({ ...form, id: editing?.id })}>
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Plan List Tab ─────────────────────────────────────────────
function PlanList({ restaurantId, onSelect, onCreate }: { restaurantId: string; onSelect: (id: string) => void; onCreate: () => void }) {
  const qc = useQueryClient();
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["meal-plans", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meal_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meal-plans"] }); toast.success("Plan eliminado"); },
  });

  const statusLabel: Record<string, string> = { draft: "Borrador", active: "Activo", archived: "Archivado" };
  const statusColor: Record<string, string> = { draft: "secondary", active: "default", archived: "outline" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Planes de Minuta</h2>
        <Button onClick={onCreate} size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Minuta</Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : plans.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No hay minutas creadas.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {plans.map((p: any) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelect(p.id)}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{format(parseISO(p.start_date), "dd MMM yyyy", { locale: es })} — {format(parseISO(p.end_date), "dd MMM yyyy", { locale: es })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColor[p.status] as any}>{statusLabel[p.status] || p.status}</Badge>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Plan Dialog ────────────────────────────────────────
function CreatePlanDialog({ restaurantId, open, onClose, onCreated }: { restaurantId: string; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 6), "yyyy-MM-dd"));

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .insert({ restaurant_id: restaurantId, name, start_date: startDate, end_date: endDate, created_by: user!.id, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { toast.success("Minuta creada"); onCreated(id); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva Minuta</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nombre *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ej: Minuta Semana 11" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Inicio</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div><Label>Fin</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Plan Editor ───────────────────────────────────────────────
function PlanEditor({ planId, restaurantId, onBack }: { planId: string; restaurantId: string; onBack: () => void }) {
  const qc = useQueryClient();

  const { data: plan } = useQuery({
    queryKey: ["meal-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meal_plans").select("*").eq("id", planId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["meal-plan-services", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plan_services")
        .select("*, meal_plan_service_items(*, meal_components(*), recipes(name))")
        .eq("meal_plan_id", planId)
        .order("service_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: components = [] } = useQuery({
    queryKey: ["meal-components", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("meal_components").select("*").eq("restaurant_id", restaurantId).eq("active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceTemplates = [] } = useQuery({
    queryKey: ["service-type-components", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_type_components" as any)
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-list", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("id, name, recipe_type").eq("restaurant_id", restaurantId).eq("recipe_type", "food").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Group templates by service type
  const templatesByService = useMemo(() => {
    const map = new Map<string, any[]>();
    serviceTemplates.forEach((t: any) => {
      const arr = map.get(t.service_type) || [];
      arr.push(t);
      map.set(t.service_type, arr);
    });
    return map;
  }, [serviceTemplates]);

  const days = plan ? eachDayOfInterval({ start: parseISO(plan.start_date), end: parseISO(plan.end_date) }) : [];
  const [selectedDay, setSelectedDay] = useState(0);
  const currentDay = days[selectedDay];

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("meal_plans").update({ status }).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meal-plan", planId] }); toast.success("Estado actualizado"); },
  });

  if (!plan) return <p className="text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(plan.start_date), "dd MMM", { locale: es })} — {format(parseISO(plan.end_date), "dd MMM yyyy", { locale: es })}
          </p>
        </div>
        <Select value={plan.status} onValueChange={(v) => statusMutation.mutate(v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="archived">Archivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Day navigation */}
      {days.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button variant="ghost" size="icon" disabled={selectedDay === 0} onClick={() => setSelectedDay(d => d - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {days.map((day, i) => (
            <Button
              key={i}
              variant={i === selectedDay ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDay(i)}
              className="shrink-0"
            >
              {format(day, "EEE dd", { locale: es })}
            </Button>
          ))}
          <Button variant="ghost" size="icon" disabled={selectedDay === days.length - 1} onClick={() => setSelectedDay(d => d + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Services for current day */}
      {currentDay && (
        <div className="grid gap-4">
          {SERVICE_TYPES.map((st) => (
            <ServiceCard
              key={st.value}
              restaurantId={restaurantId}
              planId={planId}
              date={format(currentDay, "yyyy-MM-dd")}
              serviceType={st.value}
              serviceLabel={st.label}
              existingService={services.find((s: any) => s.service_date === format(currentDay, "yyyy-MM-dd") && s.service_type === st.value)}
              components={components}
              recipes={recipes}
              templateComponents={templatesByService.get(st.value) || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ restaurantId, planId, date, serviceType, serviceLabel, existingService, components, recipes, templateComponents }: any) {
  const qc = useQueryClient();
  const [servings, setServings] = useState<number>(existingService?.projected_servings || 0);

  const items: any[] = existingService?.meal_plan_service_items || [];

  // Build a map of component_id → existing item for quick lookup
  const itemByComponent = useMemo(() => {
    const map = new Map<string, any>();
    items.forEach((item: any) => map.set(item.component_id, item));
    return map;
  }, [items]);

  // Template components with their component details
  const templateRows = useMemo(() => {
    return templateComponents
      .map((tc: any) => {
        const comp = components.find((c: any) => c.id === tc.component_id);
        const existingItem = itemByComponent.get(tc.component_id);
        return {
          templateId: tc.id,
          componentId: tc.component_id,
          componentName: comp?.name || "?",
          sortOrder: tc.sort_order,
          existingItem,
          selectedRecipeId: existingItem?.recipe_id || "",
          selectedRecipeName: existingItem?.recipes?.name || "",
        };
      })
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }, [templateComponents, components, itemByComponent]);

  const upsertServiceMutation = useMutation({
    mutationFn: async (projected: number) => {
      if (existingService) {
        const { error } = await supabase.from("meal_plan_services").update({ projected_servings: projected }).eq("id", existingService.id);
        if (error) throw error;
        return existingService.id;
      } else {
        const { data, error } = await supabase
          .from("meal_plan_services")
          .insert({ meal_plan_id: planId, restaurant_id: restaurantId, service_date: date, service_type: serviceType, projected_servings: projected })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal-plan-services", planId] }),
  });

  // Upsert a recipe for a component: if item exists update, else insert
  const setRecipeMutation = useMutation({
    mutationFn: async ({ componentId, recipeId }: { componentId: string; recipeId: string }) => {
      // Ensure service exists
      let serviceId = existingService?.id;
      if (!serviceId) {
        const { data, error } = await supabase
          .from("meal_plan_services")
          .insert({ meal_plan_id: planId, restaurant_id: restaurantId, service_date: date, service_type: serviceType, projected_servings: servings || 1 })
          .select("id")
          .single();
        if (error) throw error;
        serviceId = data.id;
      }

      const existing = itemByComponent.get(componentId);
      if (existing) {
        if (recipeId) {
          const { error } = await supabase
            .from("meal_plan_service_items")
            .update({ recipe_id: recipeId })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // Clear recipe → delete the item
          const { error } = await supabase
            .from("meal_plan_service_items")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else if (recipeId) {
        const { error } = await supabase
          .from("meal_plan_service_items")
          .insert({
            meal_plan_service_id: serviceId,
            restaurant_id: restaurantId,
            component_id: componentId,
            recipe_id: recipeId,
            sort_order: templateComponents.findIndex((tc: any) => tc.component_id === componentId),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meal-plan-services", planId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hasTemplate = templateRows.length > 0;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{serviceLabel}</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Servicios:</Label>
            <Input
              type="number"
              className="w-20 h-8"
              value={servings || ""}
              onChange={(e) => setServings(Number(e.target.value))}
              onBlur={() => { if (servings > 0 && existingService) upsertServiceMutation.mutate(servings); }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {!hasTemplate ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            No hay plantilla configurada para {serviceLabel}. Ve a la pestaña <strong>Componentes</strong> para asignar componentes a este servicio.
          </p>
        ) : (
          templateRows.map((row: any) => (
            <div key={row.componentId} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Badge variant="outline" className="shrink-0 text-xs">{row.componentName}</Badge>
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  options={recipes.map((r: any) => ({ value: r.id, label: r.name }))}
                  value={row.selectedRecipeId}
                  onValueChange={(recipeId) => setRecipeMutation.mutate({ componentId: row.componentId, recipeId })}
                  placeholder={`¿Qué ${row.componentName.toLowerCase()} hoy?`}
                  searchPlaceholder="Buscar receta..."
                  triggerClassName="h-8 text-xs"
                  clearable
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─── Requirements Tab ──────────────────────────────────────────
function RequirementsView({ planId, restaurantId }: { planId: string; restaurantId: string }) {
  const { data: services = [] } = useQuery({
    queryKey: ["meal-plan-services", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plan_services")
        .select("*, meal_plan_service_items(recipe_id)")
        .eq("meal_plan_id", planId);
      if (error) throw error;
      return data;
    },
  });

  const recipeServingsMap = new Map<string, number>();
  services.forEach((s: any) => {
    s.meal_plan_service_items?.forEach((item: any) => {
      const prev = recipeServingsMap.get(item.recipe_id) || 0;
      recipeServingsMap.set(item.recipe_id, prev + (s.projected_servings || 0));
    });
  });
  const recipeIds = Array.from(recipeServingsMap.keys());

  const { data: ingredients = [] } = useQuery({
    queryKey: ["recipe-ingredients-bulk", recipeIds],
    queryFn: async () => {
      if (recipeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id, product_id, quantity, unit, products(name, unit, current_stock, average_cost)")
        .in("recipe_id", recipeIds);
      if (error) throw error;
      return data;
    },
    enabled: recipeIds.length > 0,
  });

  const productMap = new Map<string, { name: string; unit: string; required: number; stock: number; avgCost: number }>();

  ingredients.forEach((ing: any) => {
    const totalServings = recipeServingsMap.get(ing.recipe_id) || 0;
    const product = ing.products as any;
    if (!product) return;

    const qtyInProductUnit = convertToProductUnit(ing.quantity * totalServings, ing.unit, product.unit);
    const existing = productMap.get(ing.product_id);
    if (existing) {
      existing.required += qtyInProductUnit;
    } else {
      productMap.set(ing.product_id, {
        name: product.name,
        unit: product.unit,
        required: qtyInProductUnit,
        stock: product.current_stock || 0,
        avgCost: product.average_cost || 0,
      });
    }
  });

  const requirements = Array.from(productMap.entries()).map(([id, r]) => ({
    id,
    ...r,
    shortage: Math.max(0, r.required - r.stock),
    estimatedCost: r.required * r.avgCost,
  })).sort((a, b) => b.shortage - a.shortage);

  const totalCost = requirements.reduce((s, r) => s + r.estimatedCost, 0);
  const shortages = requirements.filter((r) => r.shortage > 0).length;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(requirements.map((r) => ({
      Producto: r.name,
      Unidad: r.unit,
      Requerido: +r.required.toFixed(2),
      "Stock Actual": +r.stock.toFixed(2),
      Faltante: +r.shortage.toFixed(2),
      "Costo Estimado": +r.estimatedCost.toFixed(0),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Requerimientos");
    XLSX.writeFile(wb, "requerimientos-minuta.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Requerimientos de Inventario</h2>
        <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-4 w-4 mr-1" />Excel</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-foreground">{requirements.length}</p><p className="text-xs text-muted-foreground">Productos requeridos</p></CardContent></Card>
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-destructive">{shortages}</p><p className="text-xs text-muted-foreground">Con faltante</p></CardContent></Card>
        <Card><CardContent className="py-4 text-center"><p className="text-2xl font-bold text-foreground">${totalCost.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground">Costo estimado total</p></CardContent></Card>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Requerido</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Faltante</TableHead>
              <TableHead className="text-right">Costo Est.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requirements.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No hay requerimientos. Asigna recetas en la minuta.</TableCell></TableRow>
            ) : (
              requirements.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-1 text-xs text-muted-foreground">({r.unit})</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.required.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{r.stock.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.shortage > 0 ? (
                      <span className="text-destructive font-semibold">{r.shortage.toFixed(2)}</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">${r.estimatedCost.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function MealPlanning() {
  const restaurantId = useRestaurantId();
  const [tab, setTab] = useState("plans");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!restaurantId) return <AppLayout><p className="text-muted-foreground">Cargando...</p></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Planeación por Minuta</h1>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelectedPlanId(null); }}>
          <TabsList>
            <TabsTrigger value="plans">Minutas</TabsTrigger>
            <TabsTrigger value="components">Componentes</TabsTrigger>
          </TabsList>

          <TabsContent value="components">
            <ComponentsConfig restaurantId={restaurantId} />
          </TabsContent>

          <TabsContent value="plans">
            {selectedPlanId ? (
              <Tabs defaultValue="editor">
                <TabsList className="mb-4">
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="requirements">Requerimientos</TabsTrigger>
                </TabsList>
                <TabsContent value="editor">
                  <PlanEditor planId={selectedPlanId} restaurantId={restaurantId} onBack={() => setSelectedPlanId(null)} />
                </TabsContent>
                <TabsContent value="requirements">
                  <RequirementsView planId={selectedPlanId} restaurantId={restaurantId} />
                </TabsContent>
              </Tabs>
            ) : (
              <PlanList restaurantId={restaurantId} onSelect={setSelectedPlanId} onCreate={() => setCreateOpen(true)} />
            )}
          </TabsContent>
        </Tabs>

        <CreatePlanDialog restaurantId={restaurantId} open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); setSelectedPlanId(id); }} />
      </div>
    </AppLayout>
  );
}
