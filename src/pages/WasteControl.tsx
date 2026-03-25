import { useState, useMemo } from "react";
import { fuzzyMatch } from "@/lib/search-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAudit } from "@/hooks/use-audit";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, ChevronsUpDown, CalendarIcon, Plus, AlertTriangle, TrendingDown, DollarSign, Package, Upload, Trash2, Search } from "lucide-react";
import { cn, formatCOP } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const WASTE_TYPES = [
  { value: "merma", label: "Merma" },
  { value: "desperdicio", label: "Desperdicio" },
  { value: "vencimiento", label: "Vencimiento" },
  { value: "daño", label: "Daño" },
] as const;

type WasteType = typeof WASTE_TYPES[number]["value"];

const wasteTypeColors: Record<string, string> = {
  merma: "hsl(38, 92%, 50%)",
  desperdicio: "hsl(0, 72%, 51%)",
  vencimiento: "hsl(270, 60%, 50%)",
  daño: "hsl(220, 60%, 50%)",
};

const wasteTypeBadge: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  merma: "secondary",
  desperdicio: "destructive",
  vencimiento: "outline",
  daño: "default",
};

export default function WasteControl() {
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { logAudit } = useAudit();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [wasteType, setWasteType] = useState<WasteType>("merma");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState(false);
  const [newCatalogReason, setNewCatalogReason] = useState("");
  const [notes, setNotes] = useState("");
  const [movementDate, setMovementDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);
  const [filterDateFromOpen, setFilterDateFromOpen] = useState(false);
  const [filterDateToOpen, setFilterDateToOpen] = useState(false);
  const [wasteSearch, setWasteSearch] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-waste"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, last_unit_cost, category_id, warehouse_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories-waste"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-waste"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const { data: reasonCatalog } = useQuery({
    queryKey: ["waste-reason-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_reason_catalog" as any)
        .select("id, waste_type, reason, active")
        .eq("active", true)
        .order("reason");
      if (error) throw error;
      return data as any[];
    },
  });

  const catalogReasonsForType = useMemo(
    () => (reasonCatalog ?? []).filter((r: any) => r.waste_type === wasteType),
    [reasonCatalog, wasteType]
  );

  const { data: wasteMovements, isLoading } = useQuery({
    queryKey: ["waste-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, product_id, movement_date, type, quantity, unit_cost, total_cost, notes, user_id, waste_reason, evidence_url, loss_value" as any)
        .in("type", ["merma", "desperdicio", "vencimiento", "daño"])
        .order("movement_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
  });

  const productMap = useMemo(() => new Map(products?.map((p) => [p.id, p]) ?? []), [products]);
  const categoryMap = useMemo(() => new Map(categories?.map((c) => [c.id, c.name]) ?? []), [categories]);
  const profileMap = useMemo(() => new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []), [profiles]);

  const selectedProduct = products?.find((p) => p.id === selectedProductId);

  const getUnitCost = (product: any) => {
    if (product.average_cost > 0) return product.average_cost;
    if (product.last_unit_cost > 0) return product.last_unit_cost;
    return 0;
  };

  // Submit waste movement
  const handleSubmit = async () => {
    if (!selectedProductId || !quantity || !reason.trim() || !user || !restaurantId) {
      toast({ title: "Campos obligatorios", description: "Selecciona producto, cantidad y motivo.", variant: "destructive" });
      return;
    }

    const product = productMap.get(selectedProductId);
    if (!product) return;

    const qty = parseFloat(quantity);
    if (qty <= 0) {
      toast({ title: "Cantidad inválida", description: "La cantidad debe ser mayor a 0.", variant: "destructive" });
      return;
    }

    if (qty > product.current_stock) {
      toast({ title: "Stock insuficiente", description: `Stock actual: ${product.current_stock} ${product.unit}`, variant: "destructive" });
      return;
    }

    const unitCost = getUnitCost(product);
    const lossValue = qty * unitCost;

    setSubmitting(true);
    try {
      let evidenceUrl: string | null = null;

      if (evidenceFile) {
        const ext = evidenceFile.name.split(".").pop();
        const path = `${restaurantId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("waste-evidence")
          .upload(path, evidenceFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("waste-evidence").getPublicUrl(path);
        evidenceUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("inventory_movements").insert({
        product_id: selectedProductId,
        user_id: user.id,
        restaurant_id: restaurantId,
        type: wasteType,
        quantity: qty,
        unit_cost: unitCost,
        total_cost: lossValue,
        notes: notes || reason,
        movement_date: movementDate.toISOString(),
        waste_reason: reason,
        evidence_url: evidenceUrl,
        loss_value: lossValue,
      } as any);

      if (error) throw error;

      await logAudit({
        entityType: "waste_movement",
        entityId: selectedProductId,
        action: "CREATE",
        after: {
          type: wasteType,
          product: product.name,
          quantity: qty,
          unit_cost: unitCost,
          loss_value: lossValue,
          reason,
        },
        metadata: {
          waste_type: wasteType,
          product_name: product.name,
          quantity: qty,
          unit_cost_applied: unitCost,
          loss_value: lossValue,
        },
      });

      toast({ title: "Pérdida registrada", description: `${product.name}: ${qty} ${product.unit} — Pérdida: {formatCOP(lossValue, 2)}` });

      // Reset
      setSelectedProductId("");
      setQuantity("");
      setReason("");
      setCustomReason(false);
      setNotes("");
      setEvidenceFile(null);
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["waste-movements"] });
      qc.invalidateQueries({ queryKey: ["products-waste"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Filter movements
  const filteredMovements = useMemo(() => {
    if (!wasteMovements) return [];
    let result = wasteMovements;
    if (filterType !== "all") result = result.filter((m) => m.type === filterType);
    if (filterDateFrom) {
      const from = format(filterDateFrom, "yyyy-MM-dd");
      result = result.filter((m) => m.movement_date >= from);
    }
    if (filterDateTo) {
      const to = format(filterDateTo, "yyyy-MM-dd") + "T23:59:59";
      result = result.filter((m) => m.movement_date <= to);
    }
    if (wasteSearch.trim()) {
      result = result.filter((m) => {
        const prod = productMap.get(m.product_id);
        return fuzzyMatch(prod?.name ?? "", wasteSearch);
      });
    }
    return result;
  }, [wasteMovements, filterType, filterDateFrom, filterDateTo, wasteSearch, productMap]);

  // KPIs
  const totalLoss = filteredMovements.reduce((s, m) => s + (m.loss_value ?? 0), 0);
  const totalItems = filteredMovements.length;

  // Total consumption for waste % calc
  const { data: totalConsumption } = useQuery({
    queryKey: ["total-consumption-waste"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("total_cost")
        .in("type", ["salida", "operational_consumption", "merma", "desperdicio", "vencimiento", "daño"]);
      if (error) throw error;
      return (data ?? []).reduce((s, m) => s + (m.total_cost ?? 0), 0);
    },
  });

  const wastePercentage = totalConsumption && totalConsumption > 0
    ? ((totalLoss / totalConsumption) * 100).toFixed(1)
    : "0.0";

  // Charts data
  const byTypeData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredMovements.forEach((m) => {
      map[m.type] = (map[m.type] ?? 0) + (m.loss_value ?? 0);
    });
    return WASTE_TYPES.map((t) => ({
      name: t.label,
      value: map[t.value] ?? 0,
      fill: wasteTypeColors[t.value],
    })).filter((d) => d.value > 0);
  }, [filteredMovements]);

  const topProducts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredMovements.forEach((m) => {
      map[m.product_id] = (map[m.product_id] ?? 0) + (m.loss_value ?? 0);
    });
    return Object.entries(map)
      .map(([id, value]) => ({ name: productMap.get(id)?.name ?? id.slice(0, 8), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredMovements, productMap]);

  const unitCostWarning = selectedProduct && getUnitCost(selectedProduct) === 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Desperdicios y Mermas</h1>
            <p className="text-sm text-muted-foreground">Control de pérdidas de inventario</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Registrar Pérdida</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar Pérdida</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Product selector */}
                <div className="space-y-2">
                  <Label>Producto *</Label>
                  <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between">
                        {selectedProduct?.name ?? "Seleccionar producto..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar producto..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados</CommandEmpty>
                          <CommandGroup>
                            {products?.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => {
                                  setSelectedProductId(p.id);
                                  setProductPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedProductId === p.id ? "opacity-100" : "opacity-0")} />
                                <span className="flex-1">{p.name}</span>
                                <span className="text-xs text-muted-foreground">{p.current_stock} {p.unit}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {unitCostWarning && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Producto sin costo unitario registrado
                    </p>
                  )}
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label>Cantidad *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0.00"
                    />
                    {selectedProduct && <span className="text-sm text-muted-foreground">{selectedProduct.unit}</span>}
                  </div>
                  {selectedProduct && quantity && parseFloat(quantity) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Pérdida estimada: <strong>{formatCOP((parseFloat(quantity) * getUnitCost(selectedProduct)), 2)}</strong>
                    </p>
                  )}
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label>Tipo de pérdida *</Label>
                  <Select value={wasteType} onValueChange={(v) => { setWasteType(v as WasteType); setReason(""); setCustomReason(false); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WASTE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label>Motivo *</Label>
                  {catalogReasonsForType.length > 0 && !customReason ? (
                    <div className="space-y-2">
                      <Select value={reason} onValueChange={setReason}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar motivo..." /></SelectTrigger>
                        <SelectContent>
                          {catalogReasonsForType.map((r: any) => (
                            <SelectItem key={r.id} value={r.reason}>{r.reason}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setCustomReason(true)}>
                        Escribir otro motivo
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe el motivo de la pérdida..." />
                      {catalogReasonsForType.length > 0 && (
                        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { setCustomReason(false); setReason(""); }}>
                          Elegir del catálogo
                        </Button>
                      )}
                    </div>
                  )}
                  {/* Add new reason to catalog */}
                  {customReason && reason.trim() && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={async () => {
                          if (!restaurantId) return;
                          await supabase.from("waste_reason_catalog" as any).insert({
                            restaurant_id: restaurantId,
                            waste_type: wasteType,
                            reason: reason.trim(),
                          } as any);
                          qc.invalidateQueries({ queryKey: ["waste-reason-catalog"] });
                          toast({ title: "Motivo guardado en catálogo" });
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Guardar en catálogo
                      </Button>
                    </div>
                  )}
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(movementDate, "PPP", { locale: es })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={movementDate} onSelect={(d) => { if (d) setMovementDate(d); setDateOpen(false); }} locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Observaciones</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
                </div>

                {/* Evidence */}
                <div className="space-y-2">
                  <Label>Evidencia (foto)</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                  />
                  {evidenceFile && <p className="text-xs text-muted-foreground">{evidenceFile.name}</p>}
                </div>

                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                  {submitting ? "Registrando..." : "Registrar Pérdida"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Tabs: Dashboard / Historial */}
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                      <DollarSign className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Total Perdido</p>
                      <p className="text-2xl font-bold text-foreground">{formatCOP(totalLoss, 2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                      <TrendingDown className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">% Desperdicio vs Consumo</p>
                      <p className="text-2xl font-bold text-foreground">{wastePercentage}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Registros</p>
                      <p className="text-2xl font-bold text-foreground">{totalItems}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Pérdidas por Tipo</CardTitle></CardHeader>
                <CardContent>
                  {byTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={byTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} {formatCOP((percent * 100), 0)}%`}>
                          {byTypeData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `{formatCOP(v, 2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-8">Sin datos</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Top 10 Productos con Mayor Pérdida</CardTitle></CardHeader>
                <CardContent>
                  {topProducts.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topProducts} layout="vertical" margin={{ left: 80 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                        <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => `{formatCOP(v, 2)}`} />
                        <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-8">Sin datos</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Buscar producto</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={wasteSearch} onChange={(e) => setWasteSearch(e.target.value)} placeholder="Nombre del producto..." className="pl-8 h-9" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {WASTE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Popover open={filterDateFromOpen} onOpenChange={setFilterDateFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Inicio"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateFrom} onSelect={(d) => { setFilterDateFrom(d ?? undefined); setFilterDateFromOpen(false); }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Popover open={filterDateToOpen} onOpenChange={setFilterDateToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Fin"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateTo} onSelect={(d) => { setFilterDateTo(d ?? undefined); setFilterDateToOpen(false); }} locale={es} />
                  </PopoverContent>
                </Popover>
              </div>
              {(filterDateFrom || filterDateTo || filterType !== "all" || wasteSearch) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterDateFrom(undefined); setFilterDateTo(undefined); setWasteSearch(""); }}>
                  Limpiar
                </Button>
              )}
            </div>

            {/* Summary row */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{filteredMovements.length} registros</span>
              <span className="font-medium text-destructive">Pérdida total: {formatCOP(totalLoss, 2)}</span>
            </div>

            {/* Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead className="text-right">Valor Pérdida</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Evidencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
                  ) : filteredMovements.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin registros de pérdidas</TableCell></TableRow>
                  ) : (
                    filteredMovements.map((m) => {
                      const prod = productMap.get(m.product_id);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs">{format(new Date(m.movement_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="font-medium text-sm">{prod?.name ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={wasteTypeBadge[m.type] ?? "secondary"}>
                              {WASTE_TYPES.find((t) => t.value === m.type)?.label ?? m.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{m.waste_reason ?? m.notes ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{m.quantity} {prod?.unit}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCOP((m.unit_cost ?? 0), 2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium text-destructive">{formatCOP((m.loss_value ?? 0), 2)}</TableCell>
                          <TableCell className="text-xs">{profileMap.get(m.user_id) ?? "—"}</TableCell>
                          <TableCell>
                            {m.evidence_url ? (
                              <a href={m.evidence_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">
                                Ver
                              </a>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
