import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, startOfDay, endOfDay, subDays, startOfMonth as monthStart } from "date-fns";
import { es } from "date-fns/locale";
import { DollarSign, TrendingDown, ChefHat, ArrowUpDown, AlertTriangle, CalendarIcon, Package, Percent, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { convertToProductUnit } from "@/lib/unit-conversion";

type Period = "day" | "week" | "month";

const CONSUMPTION_TYPES = ["salida", "transformacion", "merma", "pos_sale", "operational_consumption", "desperdicio"];
const WASTE_TYPES = ["merma", "desperdicio"];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(220 15% 60%)",
  "hsl(280 60% 50%)",
  "hsl(180 50% 45%)",
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

export default function Reports() {
  const [period, setPeriod] = useState<Period>("day");
  const [tab, setTab] = useState("general");
  const [dateFrom, setDateFrom] = useState(() => subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState(() => new Date());
  const [recipeSearch, setRecipeSearch] = useState("");

  const setRange = (from: Date, to: Date) => { setDateFrom(from); setDateTo(to); };

  const fromISO = format(dateFrom, "yyyy-MM-dd");
  const toISO = format(dateTo, "yyyy-MM-dd'T'23:59:59");

  // All consumption movements in range
  const { data: movements, isLoading } = useQuery({
    queryKey: ["report-consumption", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, recipe_id, quantity, total_cost, unit_cost, movement_date, type, waste_reason")
        .in("type", CONSUMPTION_TYPES)
        .gte("movement_date", fromISO)
        .lte("movement_date", toISO)
        .order("movement_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Products with categories
  const { data: products } = useQuery({
    queryKey: ["report-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, average_cost, category_id, categories(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Recipes with ingredients (include unit for conversion)
  const { data: recipes } = useQuery({
    queryKey: ["report-recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_ingredients(product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const productMap = useMemo(() => new Map(products?.map((p) => [p.id, p]) ?? []), [products]);

  // ─── KPIs ───
  const totalConsumed = useMemo(() => (movements ?? []).reduce((s, m) => s + Number(m.total_cost), 0), [movements]);

  const daysInRange = useMemo(() => {
    const diff = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000));
    return diff;
  }, [dateFrom, dateTo]);

  const avgDaily = totalConsumed / daysInRange;

  const topProduct = useMemo(() => {
    if (!movements?.length) return null;
    const map = new Map<string, number>();
    for (const m of movements) map.set(m.product_id, (map.get(m.product_id) ?? 0) + Number(m.total_cost));
    let best = { id: "", cost: 0 };
    for (const [id, cost] of map) if (cost > best.cost) best = { id, cost };
    return productMap.get(best.id);
  }, [movements, productMap]);

  const wasteTotal = useMemo(() =>
    (movements ?? []).filter((m) => WASTE_TYPES.includes(m.type)).reduce((s, m) => s + Number(m.total_cost), 0),
    [movements]
  );
  const wastePct = totalConsumed > 0 ? (wasteTotal / totalConsumed) * 100 : 0;

  // ─── TAB 1: General consumption chart ───
  const chartData = useMemo(() => {
    if (!movements?.length) return [];
    const grouped = new Map<string, number>();
    for (const m of movements) {
      const date = parseISO(m.movement_date);
      let key: string;
      if (period === "day") key = format(date, "yyyy-MM-dd");
      else if (period === "week") key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      else key = format(startOfMonth(date), "yyyy-MM");
      grouped.set(key, (grouped.get(key) ?? 0) + Number(m.total_cost));
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        let label: string;
        if (period === "day") label = format(parseISO(key), "dd MMM", { locale: es });
        else if (period === "week") label = `Sem ${format(parseISO(key), "dd MMM", { locale: es })}`;
        else label = format(parseISO(key + "-01"), "MMM yyyy", { locale: es });
        return { label, value: Math.round(value * 100) / 100 };
      });
  }, [movements, period]);

  // ─── TAB 2: By category ───
  const categoryData = useMemo(() => {
    if (!movements?.length) return [];
    const map = new Map<string, number>();
    for (const m of movements) {
      const prod = productMap.get(m.product_id);
      const catName = (prod as any)?.categories?.name ?? "Sin categoría";
      map.set(catName, (map.get(catName) ?? 0) + Number(m.total_cost));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [movements, productMap]);

  // ─── TAB 3: Waste ───
  const wasteMovements = useMemo(() => (movements ?? []).filter((m) => WASTE_TYPES.includes(m.type)), [movements]);

  const wasteByDay = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const m of wasteMovements) {
      const key = format(parseISO(m.movement_date), "yyyy-MM-dd");
      grouped.set(key, (grouped.get(key) ?? 0) + Number(m.total_cost));
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ label: format(parseISO(key), "dd MMM", { locale: es }), value: Math.round(value) }));
  }, [wasteMovements]);

  const topWasteProducts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of wasteMovements) map.set(m.product_id, (map.get(m.product_id) ?? 0) + Number(m.total_cost));
    return Array.from(map.entries())
      .map(([id, cost]) => ({ name: productMap.get(id)?.name ?? "Desconocido", cost: Math.round(cost) }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [wasteMovements, productMap]);

  // ─── TAB 4: Recipe cost ───
  // Count services (portions) not individual ingredient movements
  const recipeData = useMemo(() => {
    if (!recipes?.length) return [];
    const realCostMap = new Map<string, number>();
    const realCountMap = new Map<string, number>();
    for (const s of movements ?? []) {
      if (s.recipe_id) {
        realCostMap.set(s.recipe_id, (realCostMap.get(s.recipe_id) ?? 0) + Number(s.total_cost));
        realCountMap.set(s.recipe_id, (realCountMap.get(s.recipe_id) ?? 0) + 1);
      }
    }
    return recipes.map((r) => {
      // Theoretical cost with unit conversion
      const theoretical = (r.recipe_ingredients ?? []).reduce((sum, ing) => {
        const prod = productMap.get(ing.product_id);
        if (!prod) return sum;
        const qtyInProdUnit = convertToProductUnit(Number(ing.quantity), ing.unit, prod.unit);
        return sum + qtyInProdUnit * Number(prod.average_cost);
      }, 0);
      const totalReal = realCostMap.get(r.id) ?? 0;
      // Each service generates one movement per ingredient, so divide by ingredient count
      const ingredientCount = (r.recipe_ingredients ?? []).length;
      const rawMovements = realCountMap.get(r.id) ?? 0;
      const count = ingredientCount > 0 ? Math.round(rawMovements / ingredientCount) : rawMovements;
      const avgReal = count > 0 ? totalReal / count : 0;
      const diff = count > 0 ? avgReal - theoretical : 0;
      const diffPct = theoretical > 0 && count > 0 ? (diff / theoretical) * 100 : 0;
      return { id: r.id, name: r.name, theoretical: Math.round(theoretical * 100) / 100, avgReal: Math.round(avgReal * 100) / 100, totalReal: Math.round(totalReal * 100) / 100, count, diff: Math.round(diff * 100) / 100, diffPct: Math.round(diffPct * 10) / 10 };
    });
  }, [recipes, movements, productMap]);

  const filteredRecipeData = useMemo(() => {
    if (!recipeSearch) return recipeData;
    const q = recipeSearch.toLowerCase();
    return recipeData.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipeData, recipeSearch]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Reportes de Consumo</h1>
          <p className="text-muted-foreground">Análisis integral de consumos, desperdicios y costos por receta</p>
        </div>

        {/* Date filters */}
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <QuickRangeButtons onRange={setRange} />
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-4 w-4" /> Total consumido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">${totalConsumed.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Promedio diario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">${avgDaily.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Package className="h-4 w-4" /> Más consumido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-lg font-bold truncate">{topProduct?.name ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Percent className="h-4 w-4" /> Mermas / Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">{wastePct.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">${wasteTotal.toFixed(2)} en mermas</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="general" className="gap-1"><TrendingDown className="h-4 w-4" /> General</TabsTrigger>
            <TabsTrigger value="category" className="gap-1"><Package className="h-4 w-4" /> Por Categoría</TabsTrigger>
            <TabsTrigger value="waste" className="gap-1"><AlertTriangle className="h-4 w-4" /> Desperdicios</TabsTrigger>
            <TabsTrigger value="recipes" className="gap-1"><ChefHat className="h-4 w-4" /> Costo por Receta</TabsTrigger>
          </TabsList>

          {/* TAB 1: General */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle>Consumo por período</CardTitle>
                  <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                    <TabsList>
                      <TabsTrigger value="day">Día</TabsTrigger>
                      <TabsTrigger value="week">Semana</TabsTrigger>
                      <TabsTrigger value="month">Mes</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-12 text-muted-foreground">Cargando...</p>
                ) : !chartData.length ? (
                  <p className="text-center py-12 text-muted-foreground">Sin datos de consumo</p>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toFixed(2)}`, "Consumo"]}
                        contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: By category */}
          <TabsContent value="category">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Distribución por Categoría</CardTitle></CardHeader>
                <CardContent>
                  {!categoryData.length ? (
                    <p className="text-center py-12 text-muted-foreground">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <PieChart>
                        <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Detalle por Categoría</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                        <TableHead className="text-right">% del Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryData.map((c) => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">${c.value.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{totalConsumed > 0 ? ((c.value / totalConsumed) * 100).toFixed(1) : 0}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 3: Waste */}
          <TabsContent value="waste">
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Desperdicios</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-heading text-2xl font-bold text-destructive">${wasteTotal.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">% sobre Consumo Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-heading text-2xl font-bold">{wastePct.toFixed(1)}%</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Tendencia de Desperdicios</CardTitle></CardHeader>
                <CardContent>
                  {!wasteByDay.length ? (
                    <p className="text-center py-12 text-muted-foreground">Sin datos de desperdicios</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={wasteByDay}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                        <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                        <Tooltip formatter={(v: number) => [`$${v}`, "Desperdicio"]}
                          contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        <Line type="monotone" dataKey="value" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Productos Más Desperdiciados</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Costo Desperdiciado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!topWasteProducts.length ? (
                        <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Sin desperdicios</TableCell></TableRow>
                      ) : topWasteProducts.map((p) => (
                        <TableRow key={p.name}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right text-destructive font-semibold">${p.cost.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: Recipe cost */}
          <TabsContent value="recipes">
            <div className="space-y-4">
              <div className="flex items-center gap-2 max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar receta..." value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ArrowUpDown className="h-4 w-4" /> Detalle por receta</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receta</TableHead>
                        <TableHead className="text-right">Costo Teórico</TableHead>
                        <TableHead className="text-right">Costo Real (prom.)</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead className="text-right">Consumos</TableHead>
                        <TableHead className="text-right">Total Real</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!filteredRecipeData.length ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin recetas</TableCell></TableRow>
                      ) : filteredRecipeData.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right">${r.theoretical.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            {r.count > 0 ? `$${r.avgReal.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.count > 0 ? (
                              <Badge variant={r.diff > 0 ? "destructive" : "secondary"} className={r.diff < 0 ? "bg-success text-success-foreground" : ""}>
                                {r.diff > 0 ? "+" : ""}{r.diff.toFixed(2)} ({r.diffPct > 0 ? "+" : ""}{r.diffPct}%)
                              </Badge>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.count > 0 ? `$${r.totalReal.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
