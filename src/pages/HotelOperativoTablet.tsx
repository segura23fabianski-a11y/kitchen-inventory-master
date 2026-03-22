import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useBranding } from "@/hooks/use-branding";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { LogOut, ArrowLeft, Sparkles, Shirt as ShirtIcon, Package, CheckCircle, PlayCircle, Check, AlertTriangle } from "lucide-react";

type Section = "home" | "housekeeping" | "laundry" | "linen";
type LaundryStep = 1 | 2 | 3;
type LinenStep = "list" | "select-item" | "select-movement" | "confirm";
type LinenMovementType = "to_rooms" | "to_laundry" | "from_laundry" | "damaged";

const LINEN_MOVEMENTS: { type: LinenMovementType; label: string; emoji: string; from: string; to: string }[] = [
  { type: "to_rooms", label: "Enviar a Habitaciones", emoji: "🛏", from: "available", to: "in_use" },
  { type: "to_laundry", label: "Enviar a Lavandería", emoji: "🧺", from: "in_use", to: "in_laundry" },
  { type: "from_laundry", label: "Recibir de Lavandería", emoji: "✅", from: "in_laundry", to: "available" },
  { type: "damaged", label: "Reportar Daño", emoji: "⚠", from: "any", to: "damaged" },
];

export default function HotelOperativoTablet() {
  const { user, signOut } = useAuth();
  const restaurantId = useRestaurantId();
  const branding = useBranding();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [section, setSection] = useState<Section>("home");
  const [checklistTaskId, setChecklistTaskId] = useState<string | null>(null);
  const [showChemicalPrompt, setShowChemicalPrompt] = useState<string | null>(null);

  // Laundry state
  const [laundryStep, setLaundryStep] = useState<LaundryStep>(1);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [laundryQty, setLaundryQty] = useState<string>("0");

  // Linen state
  const [linenStep, setLinenStep] = useState<LinenStep>("list");
  const [selectedLinen, setSelectedLinen] = useState<any>(null);
  const [selectedMovement, setSelectedMovement] = useState<LinenMovementType | null>(null);
  const [linenQty, setLinenQty] = useState<string>("1");

  // Profile name
  const { data: profile } = useQuery({
    queryKey: ["my-profile-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // ══════════════════════════════════════════
  // HOUSEKEEPING QUERIES
  // ══════════════════════════════════════════
  const { data: hkTasks, isLoading: hkLoading } = useQuery({
    queryKey: ["tablet-hk-tasks", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeping_tasks" as any)
        .select("*, rooms(room_number, room_types(name))")
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: section === "housekeeping",
  });

  const { data: staff } = useQuery({
    queryKey: ["tablet-staff"],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").eq("restaurant_id", restaurantId).eq("status", "active");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && section === "housekeeping",
  });

  const { data: checklistItems, refetch: refetchChecklist } = useQuery({
    queryKey: ["tablet-checklist", checklistTaskId],
    queryFn: async () => {
      if (!checklistTaskId) return [];
      const { data, error } = await supabase
        .from("housekeeping_task_items" as any)
        .select("*")
        .eq("housekeeping_task_id", checklistTaskId)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!checklistTaskId,
  });

  const { data: hkRecipes } = useQuery({
    queryKey: ["tablet-hk-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes")
        .select("id, name, recipe_type, recipe_ingredients(product_id, quantity, unit, products(name, unit, average_cost, current_stock))")
        .eq("recipe_type", "housekeeping").order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: section === "housekeeping",
  });

  // HK Mutations
  const startTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const updates: any = { status: "in_progress" };
      if (user) updates.assigned_to = user.id;
      const { error } = await supabase.from("housekeeping_tasks" as any).update(updates).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tablet-hk-tasks"] });
      toast({ title: "Tarea iniciada" });
    },
  });

  const toggleChecklistItem = useMutation({
    mutationFn: async ({ itemId, completed }: { itemId: string; completed: boolean }) => {
      const { error } = await supabase.from("housekeeping_task_items" as any).update({
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      } as any).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => refetchChecklist(),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const task = hkTasks?.find((t: any) => t.id === taskId);
      if (!task) throw new Error("Tarea no encontrada");
      const { error } = await supabase.from("housekeeping_tasks" as any).update({
        status: "done", completed_at: new Date().toISOString(),
      } as any).eq("id", taskId);
      if (error) throw error;

      const roomId = task.room_id;
      if (task.task_type === "checkout_clean") {
        await supabase.from("rooms" as any).update({ status: "available" } as any).eq("id", roomId);
      } else {
        const { data: activeStay } = await supabase.from("stays" as any)
          .select("id").eq("room_id", roomId).eq("status", "checked_in").maybeSingle();
        const newStatus = activeStay ? "occupied" : "available";
        await supabase.from("rooms" as any).update({ status: newStatus } as any).eq("id", roomId);
      }
    },
    onSuccess: (_, taskId) => {
      qc.invalidateQueries({ queryKey: ["tablet-hk-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-rooms"] });
      setChecklistTaskId(null);
      if (hkRecipes && hkRecipes.length > 0) {
        setShowChemicalPrompt(taskId);
      } else {
        toast({ title: "✅ Habitación lista" });
      }
    },
  });

  const registerChemicalMutation = useMutation({
    mutationFn: async ({ recipeId, taskId }: { recipeId: string; taskId: string }) => {
      if (!user || !restaurantId) throw new Error("Sin sesión");
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: recipeId, _user_id: user.id, _portions: 1, _notes: `Consumo housekeeping - Tarea ${taskId}`,
      });
      if (error) throw error;
      await supabase.from("housekeeping_tasks" as any).update({ recipe_id: recipeId } as any).eq("id", taskId);
    },
    onSuccess: () => {
      setShowChemicalPrompt(null);
      toast({ title: "✅ Consumo registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkedCount = checklistItems?.filter((i: any) => i.is_completed).length || 0;
  const totalItems = checklistItems?.length || 0;
  const allChecked = totalItems > 0 && checkedCount === totalItems;

  // ══════════════════════════════════════════
  // LAUNDRY QUERIES
  // ══════════════════════════════════════════
  const { data: laundryRecipes } = useQuery({
    queryKey: ["tablet-laundry-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes")
        .select("id, name, recipe_ingredients(product_id, quantity, unit, products(name, unit, average_cost, current_stock))")
        .eq("recipe_type", "laundry").order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: section === "laundry",
  });

  const laundryIngredients = useMemo(() => {
    if (!selectedRecipe || !laundryQty) return [];
    const qty = parseFloat(laundryQty) || 0;
    return (selectedRecipe.recipe_ingredients || []).map((ing: any) => {
      const needed = ing.quantity * qty;
      const stock = ing.products?.current_stock || 0;
      return { ...ing, needed, stock, sufficient: stock >= needed };
    });
  }, [selectedRecipe, laundryQty]);

  const laundryStockOk = laundryIngredients.length > 0 && laundryIngredients.every((i: any) => i.sufficient);

  const registerLaundryMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedRecipe) throw new Error("Datos incompletos");
      const qty = parseFloat(laundryQty) || 0;
      if (qty <= 0) throw new Error("Cantidad inválida");
      const { error } = await supabase.rpc("register_recipe_consumption", {
        _recipe_id: selectedRecipe.id, _user_id: user.id, _portions: qty,
        _notes: `Lavandería tablet - ${selectedRecipe.name} × ${qty}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "✅ Consumo de lavandería registrado" });
      setLaundryStep(1);
      setSelectedRecipe(null);
      setLaundryQty("0");
      setSection("home");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ══════════════════════════════════════════
  // LINEN QUERIES
  // ══════════════════════════════════════════
  const { data: linenItems, refetch: refetchLinen } = useQuery({
    queryKey: ["tablet-linen-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_linen_inventory" as any)
        .select("*").eq("active", true).order("item_name");
      if (error) throw error;
      return data as any[];
    },
    enabled: section === "linen",
  });

  const registerLinenMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLinen || !selectedMovement || !restaurantId) throw new Error("Datos incompletos");
      const qty = parseInt(linenQty) || 0;
      if (qty <= 0) throw new Error("Cantidad inválida");

      const mv = LINEN_MOVEMENTS.find(m => m.type === selectedMovement)!;
      const updates: any = {};

      if (selectedMovement === "to_rooms") {
        if (selectedLinen.available < qty) throw new Error("No hay suficiente en bodega");
        updates.available = selectedLinen.available - qty;
        updates.in_use = selectedLinen.in_use + qty;
      } else if (selectedMovement === "to_laundry") {
        if (selectedLinen.in_use < qty) throw new Error("No hay suficiente en habitaciones");
        updates.in_use = selectedLinen.in_use - qty;
        updates.in_laundry = selectedLinen.in_laundry + qty;
      } else if (selectedMovement === "from_laundry") {
        if (selectedLinen.in_laundry < qty) throw new Error("No hay suficiente en lavandería");
        updates.in_laundry = selectedLinen.in_laundry - qty;
        updates.available = selectedLinen.available + qty;
      } else if (selectedMovement === "damaged") {
        const totalAvail = selectedLinen.available + selectedLinen.in_use + selectedLinen.in_laundry;
        if (totalAvail < qty) throw new Error("No hay suficiente cantidad disponible");
        let remaining = qty;
        let newAvailable = selectedLinen.available;
        let newInUse = selectedLinen.in_use;
        let newInLaundry = selectedLinen.in_laundry;
        const deductAvail = Math.min(remaining, newAvailable);
        newAvailable -= deductAvail; remaining -= deductAvail;
        const deductUse = Math.min(remaining, newInUse);
        newInUse -= deductUse; remaining -= deductUse;
        newInLaundry -= remaining;
        updates.available = newAvailable;
        updates.in_use = newInUse;
        updates.in_laundry = newInLaundry;
        updates.damaged = selectedLinen.damaged + qty;
        updates.total_quantity = selectedLinen.total_quantity - qty;
      }

      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("hotel_linen_inventory" as any).update(updates as any).eq("id", selectedLinen.id);
      if (error) throw error;

      await supabase.from("hotel_linen_movements" as any).insert({
        restaurant_id: restaurantId,
        linen_id: selectedLinen.id,
        from_location: mv.from === "any" ? "mixed" : mv.from,
        to_location: mv.to,
        quantity: qty,
        created_by: user?.id,
        notes: `Tablet operativo - ${mv.label}`,
      } as any);
    },
    onSuccess: () => {
      toast({ title: "✅ Movimiento registrado" });
      refetchLinen();
      setLinenStep("list");
      setSelectedLinen(null);
      setSelectedMovement(null);
      setLinenQty("1");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const goHome = () => {
    setSection("home");
    setChecklistTaskId(null);
    setShowChemicalPrompt(null);
    setLaundryStep(1);
    setSelectedRecipe(null);
    setLinenStep("list");
    setSelectedLinen(null);
    setSelectedMovement(null);
  };

  const getStaffName = (userId: string | null) => {
    if (!userId) return null;
    return staff?.find(s => s.user_id === userId)?.full_name || null;
  };

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#E1AB18]/30 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {branding.logo_small_url ? (
            <img src={branding.logo_small_url} alt="Logo" className="h-8 w-8 object-contain" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-[#E1AB18] flex items-center justify-center text-white font-bold text-sm">FM</div>
          )}
          <span className="text-lg font-bold text-gray-900">Hotel Operativo</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{profile?.full_name || user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => signOut()} className="gap-1.5 border-gray-300">
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        {/* HOME */}
        {section === "home" && (
          <div className="grid grid-cols-3 gap-4 mt-8">
            {([
              { key: "housekeeping" as Section, emoji: "🧹", title: "HOUSEKEEPING", sub: "Ver tareas del día" },
              { key: "laundry" as Section, emoji: "🧺", title: "LAVANDERÍA", sub: "Registrar consumo" },
              { key: "linen" as Section, emoji: "🛏️", title: "LENCERÍA", sub: "Registrar artículos" },
            ]).map(btn => (
              <button
                key={btn.key}
                onClick={() => setSection(btn.key)}
                className="h-44 rounded-xl border-2 border-[#E1AB18] bg-white hover:bg-[#E1AB18]/5 transition-colors flex flex-col items-center justify-center gap-3 active:scale-[0.98]"
              >
                <span className="text-5xl">{btn.emoji}</span>
                <span className="text-xl font-bold text-gray-900">{btn.title}</span>
                <span className="text-sm text-gray-500">{btn.sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* HOUSEKEEPING - Task List */}
        {section === "housekeeping" && !checklistTaskId && !showChemicalPrompt && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={goHome} className="gap-2 h-14 px-6 text-base">
                <ArrowLeft className="h-5 w-5" /> ATRÁS
              </Button>
              <h2 className="text-2xl font-bold text-gray-900">🧹 Housekeeping</h2>
            </div>

            {hkLoading ? (
              <p className="text-center text-gray-500 py-12 text-lg">Cargando tareas...</p>
            ) : !hkTasks || hkTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <CheckCircle className="h-16 w-16 text-emerald-500" />
                <p className="text-2xl font-bold text-emerald-600">No hay habitaciones pendientes de aseo</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {hkTasks.map((task: any) => {
                  const isPending = task.status === "pending";
                  const assignedName = getStaffName(task.assigned_to);
                  return (
                    <div key={task.id} className="border-2 rounded-xl p-5 bg-white border-gray-200">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-3xl font-bold text-gray-900">#{task.rooms?.room_number}</p>
                          <p className="text-sm text-gray-500">{task.rooms?.room_types?.name}</p>
                        </div>
                        <Badge className={`text-sm px-3 py-1 ${isPending ? "bg-red-100 text-red-700 border-red-300" : "bg-yellow-100 text-yellow-700 border-yellow-300"}`}>
                          {isPending ? "🔴 PENDIENTE" : "🟡 EN PROGRESO"}
                        </Badge>
                      </div>
                      {assignedName && <p className="text-xs text-gray-400 mb-3">Responsable: {assignedName}</p>}
                      <div className="flex gap-2">
                        {isPending && (
                          <Button
                            className="flex-1 h-14 text-base gap-2 bg-[#E1AB18] hover:bg-[#c9991a] text-white"
                            onClick={() => startTaskMutation.mutate(task.id)}
                            disabled={startTaskMutation.isPending}
                          >
                            <PlayCircle className="h-5 w-5" /> INICIAR
                          </Button>
                        )}
                        {!isPending && (
                          <Button
                            className="flex-1 h-14 text-base gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => setChecklistTaskId(task.id)}
                          >
                            <Check className="h-5 w-5" /> COMPLETAR
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HOUSEKEEPING - Checklist */}
        {section === "housekeeping" && checklistTaskId && !showChemicalPrompt && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={() => setChecklistTaskId(null)} className="gap-2 h-14 px-6 text-base">
                <ArrowLeft className="h-5 w-5" /> ATRÁS
              </Button>
              <h2 className="text-2xl font-bold text-gray-900">
                Checklist — Hab #{hkTasks?.find((t: any) => t.id === checklistTaskId)?.rooms?.room_number}
              </h2>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{checkedCount} de {totalItems} completados</span>
                <span className="text-sm text-gray-500">{totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0}%</span>
              </div>
              <Progress value={totalItems > 0 ? (checkedCount / totalItems) * 100 : 0} className="h-3" />
            </div>

            <div className="space-y-2">
              {checklistItems?.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => toggleChecklistItem.mutate({ itemId: item.id, completed: !item.is_completed })}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                    item.is_completed ? "bg-emerald-50 border-emerald-300" : "bg-white border-gray-200 hover:border-[#E1AB18]"
                  }`}
                >
                  <Checkbox checked={item.is_completed} className="w-7 h-7 rounded" />
                  <span className={`text-lg ${item.is_completed ? "line-through text-gray-400" : "text-gray-900"}`}>
                    {item.item_name}
                  </span>
                </button>
              ))}
            </div>

            <Button
              className="w-full h-16 text-lg gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!allChecked || completeTaskMutation.isPending}
              onClick={() => completeTaskMutation.mutate(checklistTaskId)}
            >
              <Check className="h-6 w-6" /> MARCAR COMO LISTA
            </Button>
          </div>
        )}

        {/* HOUSEKEEPING - Chemical Prompt */}
        {section === "housekeeping" && showChemicalPrompt && (
          <div className="space-y-6 max-w-lg mx-auto mt-8">
            <h2 className="text-2xl font-bold text-gray-900 text-center">¿Registrar consumo de químicos?</h2>
            <div className="space-y-3">
              {hkRecipes?.map((r: any) => (
                <Button
                  key={r.id}
                  variant="outline"
                  className="w-full h-16 text-lg border-2 border-[#E1AB18] hover:bg-[#E1AB18]/10"
                  onClick={() => registerChemicalMutation.mutate({ recipeId: r.id, taskId: showChemicalPrompt })}
                  disabled={registerChemicalMutation.isPending}
                >
                  {r.name}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full h-14 text-base text-gray-500"
              onClick={() => { setShowChemicalPrompt(null); toast({ title: "✅ Habitación lista" }); }}
            >
              Omitir — No usar químicos
            </Button>
          </div>
        )}

        {/* LAUNDRY */}
        {section === "laundry" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={() => {
                if (laundryStep === 1) goHome();
                else { setLaundryStep((laundryStep - 1) as LaundryStep); }
              }} className="gap-2 h-14 px-6 text-base">
                <ArrowLeft className="h-5 w-5" /> ATRÁS
              </Button>
              <h2 className="text-2xl font-bold text-gray-900">🧺 Lavandería — Paso {laundryStep} de 3</h2>
            </div>

            {/* Step 1: Select recipe */}
            {laundryStep === 1 && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                {laundryRecipes?.length === 0 && (
                  <p className="col-span-2 text-center text-gray-500 py-12 text-lg">No hay recetas de lavandería configuradas</p>
                )}
                {laundryRecipes?.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRecipe(r); setLaundryStep(2); setLaundryQty("0"); }}
                    className="h-32 rounded-xl border-2 border-[#E1AB18] bg-white hover:bg-[#E1AB18]/5 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    <span className="text-xl font-bold text-gray-900">{r.name}</span>
                    <span className="text-sm text-gray-500">{r.recipe_ingredients?.length || 0} insumos</span>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Quantity */}
            {laundryStep === 2 && selectedRecipe && (
              <div className="max-w-md mx-auto space-y-6 mt-4">
                <p className="text-xl text-center text-gray-700 font-medium">¿Cuántas prendas lavó?</p>
                <p className="text-center text-sm text-gray-400">Receta: {selectedRecipe.name}</p>
                <NumericKeypadInput
                  value={laundryQty}
                  onChange={(e) => setLaundryQty(e.target.value)}
                  forceKeypad
                  maxDecimals={2}
                  keypadLabel="Cantidad"
                  className="text-center text-3xl h-16 font-bold"
                />

                {parseFloat(laundryQty) > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Insumos a descontar:</p>
                    {laundryIngredients.map((ing: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{ing.products?.name}</span>
                        <span className={ing.sufficient ? "text-gray-900 font-medium" : "text-red-600 font-medium"}>
                          {ing.needed.toFixed(2)} {ing.products?.unit} (stock: {ing.stock.toFixed(2)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full h-16 text-lg bg-[#E1AB18] hover:bg-[#c9991a] text-white"
                  disabled={parseFloat(laundryQty) <= 0}
                  onClick={() => setLaundryStep(3)}
                >
                  CONTINUAR
                </Button>
              </div>
            )}

            {/* Step 3: Confirm */}
            {laundryStep === 3 && selectedRecipe && (
              <div className="max-w-md mx-auto space-y-6 mt-4">
                <div className="bg-gray-50 rounded-xl p-6 space-y-3">
                  <h3 className="text-lg font-bold text-gray-900">Resumen</h3>
                  <div className="flex justify-between text-base">
                    <span className="text-gray-600">Receta:</span>
                    <span className="font-medium text-gray-900">{selectedRecipe.name}</span>
                  </div>
                  <div className="flex justify-between text-base">
                    <span className="text-gray-600">Cantidad:</span>
                    <span className="font-medium text-gray-900">{laundryQty} prendas</span>
                  </div>
                  <hr className="border-gray-200" />
                  <p className="text-sm font-semibold text-gray-700">Insumos a descontar:</p>
                  {laundryIngredients.map((ing: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{ing.products?.name}</span>
                      <span className={ing.sufficient ? "font-medium" : "text-red-600 font-medium"}>
                        {ing.needed.toFixed(2)} {ing.products?.unit}
                        {!ing.sufficient && " ⚠ INSUFICIENTE"}
                      </span>
                    </div>
                  ))}
                </div>

                {!laundryStockOk && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
                    <p className="text-red-700 font-medium">Stock insuficiente en uno o más productos</p>
                  </div>
                )}

                <Button
                  className="w-full h-16 text-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!laundryStockOk || registerLaundryMutation.isPending}
                  onClick={() => registerLaundryMutation.mutate()}
                >
                  {registerLaundryMutation.isPending ? "Registrando..." : "✓ CONFIRMAR CONSUMO"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* LINEN */}
        {section === "linen" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={() => {
                if (linenStep === "list") goHome();
                else if (linenStep === "select-item") setLinenStep("list");
                else if (linenStep === "select-movement") setLinenStep("select-item");
                else if (linenStep === "confirm") setLinenStep("select-movement");
              }} className="gap-2 h-14 px-6 text-base">
                <ArrowLeft className="h-5 w-5" /> ATRÁS
              </Button>
              <h2 className="text-2xl font-bold text-gray-900">🛏️ Lencería</h2>
            </div>

            {/* List */}
            {linenStep === "list" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  {linenItems?.map((item: any) => (
                    <div key={item.id} className="border-2 rounded-xl p-4 bg-white border-gray-200 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold text-gray-900">{item.item_name}</p>
                        <p className="text-xs text-gray-400">{item.category}</p>
                      </div>
                      <div className="flex gap-4 text-center">
                        <div>
                          <p className="text-lg font-bold text-emerald-600">{item.available}</p>
                          <p className="text-xs text-gray-400">Bodega</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-blue-600">{item.in_use}</p>
                          <p className="text-xs text-gray-400">Habitaciones</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-yellow-600">{item.in_laundry}</p>
                          <p className="text-xs text-gray-400">Lavandería</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!linenItems || linenItems.length === 0) && (
                    <p className="text-center text-gray-500 py-12 text-lg">No hay artículos de lencería registrados</p>
                  )}
                </div>
                <Button
                  className="w-full h-16 text-lg bg-[#E1AB18] hover:bg-[#c9991a] text-white"
                  onClick={() => setLinenStep("select-item")}
                >
                  REGISTRAR MOVIMIENTO
                </Button>
              </div>
            )}

            {/* Select item */}
            {linenStep === "select-item" && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                {linenItems?.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => { setSelectedLinen(item); setLinenStep("select-movement"); }}
                    className="h-28 rounded-xl border-2 border-[#E1AB18] bg-white hover:bg-[#E1AB18]/5 flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all"
                  >
                    <span className="text-lg font-bold text-gray-900">{item.item_name}</span>
                    <span className="text-xs text-gray-500">
                      Bodega: {item.available} | Hab: {item.in_use} | Lav: {item.in_laundry}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Select movement type */}
            {linenStep === "select-movement" && selectedLinen && (
              <div className="max-w-md mx-auto space-y-4 mt-4">
                <p className="text-center text-lg text-gray-700">
                  <span className="font-bold">{selectedLinen.item_name}</span> — ¿Qué movimiento?
                </p>
                {LINEN_MOVEMENTS.map(mv => (
                  <button
                    key={mv.type}
                    onClick={() => { setSelectedMovement(mv.type); setLinenQty("1"); setLinenStep("confirm"); }}
                    className="w-full h-16 rounded-xl border-2 border-gray-200 hover:border-[#E1AB18] bg-white flex items-center gap-4 px-6 text-left active:scale-[0.98] transition-all"
                  >
                    <span className="text-2xl">{mv.emoji}</span>
                    <span className="text-lg font-medium text-gray-900">{mv.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Confirm movement */}
            {linenStep === "confirm" && selectedLinen && selectedMovement && (
              <div className="max-w-md mx-auto space-y-6 mt-4">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-lg font-bold text-gray-900">{selectedLinen.item_name}</p>
                  <p className="text-sm text-gray-500">{LINEN_MOVEMENTS.find(m => m.type === selectedMovement)?.label}</p>
                </div>

                <div>
                  <p className="text-center text-lg text-gray-700 mb-3">¿Cuántas unidades?</p>
                  <NumericKeypadInput
                    value={linenQty}
                    onChange={(e) => setLinenQty(e.target.value)}
                    forceKeypad
                    maxDecimals={0}
                    keypadLabel="Cantidad"
                    className="text-center text-3xl h-16 font-bold"
                  />
                </div>

                <Button
                  className="w-full h-16 text-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={parseInt(linenQty) <= 0 || registerLinenMutation.isPending}
                  onClick={() => registerLinenMutation.mutate()}
                >
                  {registerLinenMutation.isPending ? "Registrando..." : "✓ CONFIRMAR"}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
