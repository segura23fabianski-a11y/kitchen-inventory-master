import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, subDays, startOfDay, endOfDay, startOfMonth as monthStart } from "date-fns";
import { es } from "date-fns/locale";
import {
  DollarSign, TrendingUp, ChefHat, Package, CalendarClock, ArrowUpDown, AlertTriangle, CalendarIcon, Warehouse,
} from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { cn } from "@/lib/utils";

type Period = "day" | "week" | "month";

const CONSUMPTION_TYPES = ["salida", "transformacion", "pos_sale", "operational_consumption", "merma", "desperdicio"];

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--success))",
  "hsl(var(--destructive))", "hsl(var(--accent))", "hsl(220 15% 60%)",
  "hsl(280 60% 50%)", "hsl(180 50% 45%)",
];

function DateRangePicker({ from, to, onFromChange, onToChange }: {
  from: Date; to: Date; onFromChange: (d: Date) => void; onToChange: (d: Date) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(from, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={from} onSelect={(d) => d && onFromChange(d)} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-sm">—</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(to, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={to} onSelect={(d) => d && onToChange(d)} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function QuickRangeButtons({ onRange }: { onRange: (from: Date, to: Date) => void }) {
  const today = new Date();
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" onClick={() => onRange(startOfDay(today), endOfDay(today))}>Hoy</Button>
      <Button variant="ghost" size="sm" onClick={() => onRange(subDays(today, 7), today)}>7 días</Button>
      <Button variant="ghost" size="sm" onClick={() => onRange(subDays(today, 30), today)}>30 días</Button>
      <Button variant="ghost" size="sm" onClick={() => onRange(monthStart(today), today)}>Este mes</Button>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [costPeriod, setCostPeriod] = useState<Period>("day");
  const [activeTab, setActiveTab] = useState("overview");
  const [dateFrom, setDateFrom] = useState(() => subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState(() => new Date());

  const setRange = (from: Date, to: Date) => { setDateFrom(from); setDateTo(to); };
  const fromISO = format(dateFrom, "yyyy-MM-dd");
  const toISO = format(dateTo, "yyyy-MM-dd'T'23:59:59");

  // All consumption movements in range
  const { data: movements } = useQuery({
    queryKey: ["exec-movements", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, recipe_id, quantity, total_cost, unit_cost, movement_date, type")
        .in("type", CONSUMPTION_TYPES)
        .gte("movement_date", fromISO)
        .lte("movement_date", toISO)
        .order("movement_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Recipes with ingredients
  const { data: recipes } = useQuery({
    queryKey: ["exec-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_ingredients(product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Products
  const { data: products } = useQuery({
    queryKey: ["exec-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, min_stock, category_id, categories(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const productMap = useMemo(() => new Map(products?.map((p) => [p.id, p]) ?? []), [products]);

  // ─── KPIs ───
  const totalCost = useMemo(() => (movements ?? []).reduce((s, m) => s + Number(m.total_cost), 0), [movements]);

  const inventoryValue = useMemo(() =>
    (products ?? []).reduce((s, p) => s + Number(p.current_stock) * Number(p.average_cost), 0),
    [products]
  );

  const criticalStockCount = useMemo(() =>
    (products ?? []).filter((p) => Number(p.current_stock) <= Number(p.min_stock) && Number(p.min_stock) > 0).length,
    [products]
  );

  // ─── Cost by period ───
  const costByPeriod = useMemo(() => {
    if (!movements?.length) return [];
    const grouped = new Map<string, number>();
    for (const m of movements) {
      const date = parseISO(m.movement_date);
      let key: string;
      if (costPeriod === "day") key = format(date, "yyyy-MM-dd");
      else if (costPeriod === "week") key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      else key = format(startOfMonth(date), "yyyy-MM");
      grouped.set(key, (grouped.get(key) ?? 0) + Number(m.total_cost));
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        let label: string;
        if (costPeriod === "day") label = format(parseISO(key), "dd MMM", { locale: es });
        else if (costPeriod === "week") label = `Sem ${format(parseISO(key), "dd MMM", { locale: es })}`;
        else label = format(parseISO(key + "-01"), "MMM yyyy", { locale: es });
        return { label, value: Math.round(value) };
      });
  }, [movements, costPeriod]);

  // ─── Top 5 recipes ───
  const topRecipes = useMemo(() => {
    if (!movements?.length) return [];
    const costMap = new Map<string, number>();
    const countMap = new Map<string, number>();
    for (const m of movements) {
      if (!m.recipe_id) continue;
      costMap.set(m.recipe_id, (costMap.get(m.recipe_id) ?? 0) + Number(m.total_cost));
      countMap.set(m.recipe_id, (countMap.get(m.recipe_id) ?? 0) + 1);
    }
    const recipeNameMap = new Map(recipes?.map((r) => [r.id, r.name]) ?? []);
    return Array.from(costMap.entries())
      .map(([id, cost]) => ({
        id, name: recipeNameMap.get(id) ?? "Desconocida",
        totalCost: Math.round(cost), count: countMap.get(id) ?? 0,
        avgCost: Math.round(cost / (countMap.get(id) ?? 1)),
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);
  }, [movements, recipes]);

  // ─── Deviation ───
  const deviationData = useMemo(() => {
    if (!recipes?.length || !movements?.length) return [];
    const realCostMap = new Map<string, number>();
    const realCountMap = new Map<string, number>();
    for (const m of movements) {
      if (!m.recipe_id) continue;
      realCostMap.set(m.recipe_id, (realCostMap.get(m.recipe_id) ?? 0) + Number(m.total_cost));
      realCountMap.set(m.recipe_id, (realCountMap.get(m.recipe_id) ?? 0) + 1);
    }
    return recipes
      .map((r) => {
        const theoretical = (r.recipe_ingredients ?? []).reduce((sum, ing) => {
          const prod = productMap.get(ing.product_id);
          if (!prod) return sum;
          const qtyInProdUnit = convertToProductUnit(Number(ing.quantity), ing.unit, prod.unit);
          return sum + qtyInProdUnit * Number(prod.average_cost);
        }, 0);
        const totalReal = realCostMap.get(r.id) ?? 0;
        const ingredientCount = (r.recipe_ingredients ?? []).length;
        const rawMovements = realCountMap.get(r.id) ?? 0;
        const portions = ingredientCount > 0 ? Math.round(rawMovements / ingredientCount) : rawMovements;
        const avgReal = portions > 0 ? totalReal / portions : 0;
        const diff = portions > 0 ? avgReal - theoretical : 0;
        const diffPct = theoretical > 0 && portions > 0 ? (diff / theoretical) * 100 : 0;
        return { id: r.id, name: r.name, theoretical: Math.round(theoretical), avgReal: Math.round(avgReal), diff: Math.round(diff), diffPct: Math.round(diffPct * 10) / 10, portions };
      })
      .filter((r) => r.portions > 0)
      .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  }, [recipes, movements, productMap]);

  // ─── Top products ───
  const topProducts = useMemo(() => {
    if (!movements?.length) return [];
    const qtyMap = new Map<string, number>();
    const costMap = new Map<string, number>();
    for (const m of movements) {
      qtyMap.set(m.product_id, (qtyMap.get(m.product_id) ?? 0) + Number(m.quantity));
      costMap.set(m.product_id, (costMap.get(m.product_id) ?? 0) + Number(m.total_cost));
    }
    return Array.from(qtyMap.entries())
      .map(([id, qty]) => {
        const prod = productMap.get(id);
        return { id, name: prod?.name ?? "Desconocido", unit: prod?.unit ?? "", totalQty: Math.round(qty * 100) / 100, totalCost: Math.round(costMap.get(id) ?? 0) };
      })
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);
  }, [movements, productMap]);

  // ─── Inventory days ───
  const inventoryDays = useMemo(() => {
    if (!movements?.length || !products?.length) return [];
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const recentMovements = movements.filter((m) => parseISO(m.movement_date) > thirtyDaysAgo);
    const dailyConsumption = new Map<string, number>();
    for (const m of recentMovements) dailyConsumption.set(m.product_id, (dailyConsumption.get(m.product_id) ?? 0) + Number(m.quantity));
    const daySpan = Math.max(1, Math.round((now.getTime() - thirtyDaysAgo.getTime()) / 86400000));
    return products
      .map((p) => {
        const totalConsumed = dailyConsumption.get(p.id) ?? 0;
        const avgDaily = totalConsumed / daySpan;
        const daysRemaining = avgDaily > 0 ? Number(p.current_stock) / avgDaily : null;
        return { id: p.id, name: p.name, unit: p.unit, stock: Number(p.current_stock), avgDaily: Math.round(avgDaily * 100) / 100, daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null };
      })
      .filter((p) => p.avgDaily > 0)
      .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
  }, [movements, products]);

  // ─── Stock report ───
  const stockReport = useMemo(() => {
    if (!products?.length) return [];
    return products.map((p) => {
      const stock = Number(p.current_stock);
      const minStock = Number(p.min_stock);
      const value = stock * Number(p.average_cost);
      const status = stock <= 0 ? "sin_stock" : (minStock > 0 && stock <= minStock) ? "critico" : "ok";
      return { id: p.id, name: p.name, category: (p as any)?.categories?.name ?? "Sin categoría", stock, minStock, value: Math.round(value), unit: p.unit, status };
    }).sort((a, b) => {
      const order = { sin_stock: 0, critico: 1, ok: 2 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });
  }, [products]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard Ejecutivo</h1>
          <p className="text-muted-foreground">Resumen integral de costos, consumos y proyecciones</p>
        </div>

        {/* Date filters */}
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <QuickRangeButtons onRange={setRange} />
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Costo Total</CardTitle>
              <DollarSign className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">${totalCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total en consumos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Valor Inventario</CardTitle>
              <Warehouse className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">${inventoryValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Stock × Costo promedio</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Stock Crítico</CardTitle>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">{criticalStockCount}</div>
              <p className="text-xs text-muted-foreground">Productos bajo mínimo</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recetas Activas</CardTitle>
              <ChefHat className="h-5 w-5 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">{topRecipes.length}</div>
              <p className="text-xs text-muted-foreground">Con consumos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Inventario</CardTitle>
              <CalendarClock className="h-5 w-5 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">
                {inventoryDays.filter((p) => p.daysRemaining !== null && p.daysRemaining <= 7).length}
              </div>
              <p className="text-xs text-muted-foreground">≤7 días de stock</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="stock">Reporte de Stock</TabsTrigger>
            <TabsTrigger value="days">Días de Inventario</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="space-y-6">
              {/* Cost by period chart */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Costo de Producción por Período</CardTitle>
                    <Tabs value={costPeriod} onValueChange={(v) => setCostPeriod(v as Period)}>
                      <TabsList>
                        <TabsTrigger value="day">Día</TabsTrigger>
                        <TabsTrigger value="week">Semana</TabsTrigger>
                        <TabsTrigger value="month">Mes</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  {!costByPeriod.length ? (
                    <p className="text-center py-12 text-muted-foreground">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={costByPeriod}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                        <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Costo"]}
                          contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Top recipes */}
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><ChefHat className="h-5 w-5" /> Top 5 Recetas por Costo</CardTitle></CardHeader>
                  <CardContent>
                    {!topRecipes.length ? (
                      <p className="text-center py-8 text-muted-foreground">Sin consumos de recetas</p>
                    ) : (
                      <div className="space-y-3">
                        {topRecipes.map((r, i) => (
                          <div key={r.id} className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground" style={{ backgroundColor: COLORS[i] }}>{i + 1}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{r.name}</p>
                              <p className="text-xs text-muted-foreground">{r.count} consumos · Prom: ${r.avgCost.toLocaleString()}/u</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold font-heading">${r.totalCost.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Top products */}
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Productos con Mayor Consumo</CardTitle></CardHeader>
                  <CardContent>
                    {!topProducts.length ? (
                      <p className="text-center py-8 text-muted-foreground">Sin consumos</p>
                    ) : (
                      <div className="space-y-3">
                        {topProducts.slice(0, 8).map((p, i) => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <p className="text-sm font-medium truncate">{p.name}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold">{p.totalQty} {p.unit}</p>
                              <p className="text-xs text-muted-foreground">${p.totalCost.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Deviation */}
              {deviationData.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUpDown className="h-5 w-5" /> Desviación: Consumo Teórico vs Real</CardTitle></CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={deviationData.slice(0, 10).map((d) => ({ name: d.name, Teórico: d.theoretical, Real: d.avgReal }))} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={120} />
                          <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`}
                            contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                          <Legend />
                          <Bar dataKey="Teórico" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="Real" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Receta</TableHead>
                          <TableHead className="text-right">Teórico</TableHead>
                          <TableHead className="text-right">Real (prom.)</TableHead>
                          <TableHead className="text-right">Desviación</TableHead>
                          <TableHead className="text-right">Porciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deviationData.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right">${r.theoretical.toLocaleString()}</TableCell>
                            <TableCell className="text-right">${r.avgReal.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={r.diff > 0 ? "destructive" : "secondary"} className={r.diff < 0 ? "bg-success text-success-foreground" : ""}>
                                {r.diff > 0 ? "+" : ""}${r.diff.toLocaleString()} ({r.diffPct > 0 ? "+" : ""}{r.diffPct}%)
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{r.portions}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Stock Report Tab */}
          <TabsContent value="stock">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5" /> Reporte de Stock</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Stock Actual</TableHead>
                      <TableHead className="text-right">Stock Mínimo</TableHead>
                      <TableHead className="text-right">Valor en Inv.</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockReport.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.category}</TableCell>
                        <TableCell className="text-right">{p.stock} {p.unit}</TableCell>
                        <TableCell className="text-right">{p.minStock} {p.unit}</TableCell>
                        <TableCell className="text-right font-semibold">${p.value.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={p.status === "sin_stock" ? "destructive" : p.status === "critico" ? "outline" : "secondary"}
                            className={cn(
                              p.status === "critico" && "border-warning text-warning",
                              p.status === "ok" && "bg-success/10 text-success border-success/30"
                            )}>
                            {p.status === "sin_stock" ? "Sin stock" : p.status === "critico" ? "Crítico" : "OK"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Days Tab */}
          <TabsContent value="days">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Días Estimados de Inventario</CardTitle></CardHeader>
              <CardContent>
                {!inventoryDays.length ? (
                  <p className="text-center py-8 text-muted-foreground">Sin datos de consumo para estimar</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="text-right">Consumo Diario Prom.</TableHead>
                        <TableHead className="text-right">Días Restantes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryDays.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">{p.stock} {p.unit}</TableCell>
                          <TableCell className="text-right">{p.avgDaily} {p.unit}/día</TableCell>
                          <TableCell className="text-right">
                            {p.daysRemaining !== null ? (
                              <Badge variant={p.daysRemaining <= 3 ? "destructive" : p.daysRemaining <= 7 ? "outline" : "secondary"}
                                className={cn(
                                  p.daysRemaining <= 3 ? "" : p.daysRemaining <= 7 ? "border-warning text-warning" : "bg-success/10 text-success border-success/30"
                                )}>
                                {p.daysRemaining} días
                              </Badge>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
