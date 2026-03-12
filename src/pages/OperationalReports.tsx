import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Download, DollarSign, TrendingUp, Layers, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import * as XLSX from "xlsx";

const CONSUMPTION_TYPES = [
  "salida", "pos_sale", "operational_consumption", "merma", "desperdicio", "vencimiento", "daño",
];

const AREA_COLORS = [
  "hsl(25, 85%, 55%)", "hsl(200, 70%, 50%)", "hsl(142, 60%, 40%)",
  "hsl(270, 60%, 55%)", "hsl(38, 92%, 50%)", "hsl(350, 65%, 50%)",
  "hsl(180, 50%, 45%)", "hsl(320, 55%, 50%)", "hsl(60, 70%, 45%)",
  "hsl(220, 60%, 50%)",
];

interface MovementRow {
  id: string;
  product_id: string;
  movement_date: string;
  type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  user_id: string;
  recipe_id: string | null;
  service_id: string | null;
  loss_value?: number;
}

function getArea(m: MovementRow, servicesMap: Map<string, string>, recipesMap: Map<string, { name: string; type: string }>): string {
  // Waste types → Desperdicios
  if (["merma", "desperdicio", "vencimiento", "daño"].includes(m.type)) return "Desperdicios / Mermas";
  // Service-based
  if (m.service_id && servicesMap.has(m.service_id)) return servicesMap.get(m.service_id)!;
  // Recipe-based
  if (m.recipe_id && recipesMap.has(m.recipe_id)) {
    const recipe = recipesMap.get(m.recipe_id)!;
    if (recipe.type === "laundry") return "Lavandería";
    if (recipe.type === "housekeeping") return "Housekeeping";
    return "Cocina";
  }
  // POS sales
  if (m.type === "pos_sale") return "Ventas POS";
  // Salida with no service/recipe → Cocina general
  if (m.type === "salida") return "Cocina";
  if (m.type === "operational_consumption") return "Operaciones (sin servicio)";
  return "Otros";
}

export default function OperationalReports() {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [filterService, setFilterService] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  // Data queries
  const { data: movements, isLoading } = useQuery({
    queryKey: ["op-report-movements", dateFrom, dateTo],
    queryFn: async () => {
      const from = format(dateFrom, "yyyy-MM-dd");
      const to = format(dateTo, "yyyy-MM-dd") + "T23:59:59";
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, product_id, movement_date, type, quantity, unit_cost, total_cost, notes, user_id, recipe_id, service_id, loss_value" as any)
        .in("type", CONSUMPTION_TYPES)
        .gte("movement_date", from)
        .lte("movement_date", to)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MovementRow[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["op-report-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, category_id, warehouse_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["op-report-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name");
      return data ?? [];
    },
  });

  const { data: services } = useQuery({
    queryKey: ["op-report-services"],
    queryFn: async () => {
      const { data } = await supabase.from("operational_services").select("id, name");
      return data ?? [];
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ["op-report-recipes"],
    queryFn: async () => {
      const { data } = await supabase.from("recipes").select("id, name, recipe_type");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["op-report-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  // Maps
  const productMap = useMemo(() => new Map(products?.map((p) => [p.id, p]) ?? []), [products]);
  const categoryMap = useMemo(() => new Map(categories?.map((c) => [c.id, c.name]) ?? []), [categories]);
  const servicesMap = useMemo(() => new Map(services?.map((s) => [s.id, s.name]) ?? []), [services]);
  const recipesMap = useMemo(
    () => new Map(recipes?.map((r) => [r.id, { name: r.name, type: r.recipe_type }]) ?? []),
    [recipes]
  );
  const profileMap = useMemo(() => new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []), [profiles]);

  // Unique areas for filter
  const allAreas = useMemo(() => {
    const set = new Set<string>();
    // Always include all operational services from catalog
    services?.forEach((s) => set.add(s.name));
    // Also include derived areas from movements (Cocina, Desperdicios, etc.)
    movements?.forEach((m) => set.add(getArea(m, servicesMap, recipesMap)));
    return Array.from(set).sort();
  }, [movements, services, servicesMap, recipesMap]);

  // Filtered movements
  const filtered = useMemo(() => {
    if (!movements) return [];
    let result = movements;
    if (filterService !== "all") {
      result = result.filter((m) => getArea(m, servicesMap, recipesMap) === filterService);
    }
    if (filterCategory !== "all") {
      result = result.filter((m) => {
        const prod = productMap.get(m.product_id);
        return prod?.category_id === filterCategory;
      });
    }
    return result;
  }, [movements, filterService, filterCategory, servicesMap, recipesMap, productMap]);

  // ─── Aggregations ───
  const totalCost = filtered.reduce((s, m) => s + (m.total_cost ?? 0), 0);
  const totalMovements = filtered.length;

  // By area
  const byArea = useMemo(() => {
    const map: Record<string, { cost: number; qty: number; count: number }> = {};
    filtered.forEach((m) => {
      const area = getArea(m, servicesMap, recipesMap);
      if (!map[area]) map[area] = { cost: 0, qty: 0, count: 0 };
      map[area].cost += m.total_cost ?? 0;
      map[area].qty += m.quantity ?? 0;
      map[area].count += 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [filtered, servicesMap, recipesMap]);

  // By product (for detail table)
  const byProduct = useMemo(() => {
    const map: Record<string, { area: string; qty: number; cost: number; count: number }> = {};
    filtered.forEach((m) => {
      const area = getArea(m, servicesMap, recipesMap);
      const key = `${m.product_id}__${area}`;
      if (!map[key]) map[key] = { area, qty: 0, cost: 0, count: 0 };
      map[key].qty += m.quantity ?? 0;
      map[key].cost += m.total_cost ?? 0;
      map[key].count += 1;
    });
    return Object.entries(map)
      .map(([key, v]) => {
        const productId = key.split("__")[0];
        const prod = productMap.get(productId);
        return {
          productId,
          productName: prod?.name ?? "—",
          unit: prod?.unit ?? "",
          category: prod?.category_id ? categoryMap.get(prod.category_id) ?? "" : "",
          ...v,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }, [filtered, servicesMap, recipesMap, productMap, categoryMap]);

  // Top 10 products overall
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; cost: number }> = {};
    filtered.forEach((m) => {
      const prod = productMap.get(m.product_id);
      const name = prod?.name ?? m.product_id.slice(0, 8);
      if (!map[m.product_id]) map[m.product_id] = { name, cost: 0 };
      map[m.product_id].cost += m.total_cost ?? 0;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [filtered, productMap]);

  // Pie data
  const pieData = useMemo(
    () => byArea.map((a, i) => ({ ...a, fill: AREA_COLORS[i % AREA_COLORS.length] })),
    [byArea]
  );

  // Export
  const exportExcel = () => {
    const rows = byProduct.map((r) => ({
      Área: r.area,
      Producto: r.productName,
      Categoría: r.category,
      Unidad: r.unit,
      "Cantidad Total": r.qty,
      "Costo Total": r.cost,
      Movimientos: r.count,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consumo por Área");

    // Summary sheet
    const summaryRows = byArea.map((a) => ({
      "Área / Servicio": a.name,
      "Costo Total": a.cost,
      "Cantidad Total": a.qty,
      Movimientos: a.count,
    }));
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

    XLSX.writeFile(wb, `reporte_operativo_${format(dateFrom, "yyyyMMdd")}_${format(dateTo, "yyyyMMdd")}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Reportes por Área / Servicio</h1>
            <p className="text-sm text-muted-foreground">
              Análisis de consumo por centro de operación • {format(dateFrom, "dd MMM", { locale: es })} – {format(dateTo, "dd MMM yyyy", { locale: es })}
            </p>
          </div>
          <Button variant="outline" onClick={exportExcel}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {format(dateFrom, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { if (d) setDateFrom(d); setDateFromOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[140px] justify-start text-left text-xs">
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {format(dateTo, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { if (d) setDateTo(d); setDateToOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">Área / Servicio</Label>
            <SearchableSelect
              options={[{ value: "all", label: "Todas las áreas" }, ...allAreas.map((a) => ({ value: a, label: a }))]}
              value={filterService}
              onValueChange={setFilterService}
              placeholder="Todas las áreas"
              searchPlaceholder="Buscar área..."
              triggerClassName="w-[180px]"
            />
          </div>
          <div>
            <Label className="text-xs">Categoría</Label>
            <SearchableSelect
              options={[{ value: "all", label: "Todas" }, ...(categories?.map((c) => ({ value: c.id, label: c.name })) ?? [])]}
              value={filterCategory}
              onValueChange={setFilterCategory}
              placeholder="Todas"
              searchPlaceholder="Buscar categoría..."
              triggerClassName="w-[160px]"
            />
          </div>
          {(filterService !== "all" || filterCategory !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterService("all"); setFilterCategory("all"); }}>
              Limpiar
            </Button>
          )}
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Costo Total Consumido</p>
                  <p className="text-2xl font-bold text-foreground">${totalCost.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Layers className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Áreas Activas</p>
                  <p className="text-2xl font-bold text-foreground">{byArea.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Movimientos</p>
                  <p className="text-2xl font-bold text-foreground">{totalMovements}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Resumen por Área</TabsTrigger>
            <TabsTrigger value="detail">Detalle por Producto</TabsTrigger>
            <TabsTrigger value="top">Top Productos</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Bar chart */}
              <Card>
                <CardHeader><CardTitle className="text-base">Costo por Área / Servicio</CardTitle></CardHeader>
                <CardContent>
                  {byArea.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byArea} layout="vertical" margin={{ left: 100 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => `$${v.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`} />
                        <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Costo" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-12">Sin datos en el período</p>
                  )}
                </CardContent>
              </Card>

              {/* Pie chart */}
              <Card>
                <CardHeader><CardTitle className="text-base">Participación por Área</CardTitle></CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="cost"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `$${v.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground py-12">Sin datos</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Summary table */}
            <Card>
              <CardHeader><CardTitle className="text-base">Consumo por Área / Servicio</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área / Servicio</TableHead>
                    <TableHead className="text-right">Movimientos</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead className="text-right">% del Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byArea.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                  ) : (
                    byArea.map((a, i) => (
                      <TableRow key={a.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: AREA_COLORS[i % AREA_COLORS.length] }} />
                            <span className="font-medium">{a.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{a.count}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${a.cost.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalCost > 0 ? ((a.cost / totalCost) * 100).toFixed(1) : 0}%
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {byArea.length > 0 && (
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totalMovements}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${totalCost.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Detail by product */}
          <TabsContent value="detail">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consumo por Producto y Área</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead className="text-right">Movimientos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                  ) : (
                    byProduct.slice(0, 100).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{r.area}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.productName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="text-right font-mono">{r.qty.toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{r.unit}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${r.cost.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Top products */}
          <TabsContent value="top" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Productos Más Consumidos</CardTitle></CardHeader>
              <CardContent>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topProducts} layout="vertical" margin={{ left: 120 }}>
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `$${v.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`} />
                      <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Costo" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-12">Sin datos</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
