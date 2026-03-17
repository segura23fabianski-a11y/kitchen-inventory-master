import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { format, startOfWeek, startOfMonth, parseISO, differenceInDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  DollarSign, TrendingUp, ChefHat, Package, CalendarClock, ArrowUpDown, AlertTriangle,
} from "lucide-react";
import { convertToProductUnit } from "@/lib/unit-conversion";

type Period = "day" | "week" | "month";

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

export default function ExecutiveDashboard() {
  const [costPeriod, setCostPeriod] = useState<Period>("day");

  // All salidas
  const { data: movements } = useQuery({
    queryKey: ["exec-salidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, recipe_id, quantity, total_cost, unit_cost, movement_date, type")
        .eq("type", "salida")
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
        .select("id, name, unit, current_stock, average_cost")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const productMap = useMemo(
    () => new Map(products?.map((p) => [p.id, p]) ?? []),
    [products]
  );

  // ─── 1. COSTO DE PRODUCCIÓN POR PERÍODO ───
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

  const totalCost = costByPeriod.reduce((s, d) => s + d.value, 0);

  // ─── 2. TOP 5 RECETAS CON MAYOR COSTO ───
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
        id,
        name: recipeNameMap.get(id) ?? "Desconocida",
        totalCost: Math.round(cost),
        count: countMap.get(id) ?? 0,
        avgCost: Math.round(cost / (countMap.get(id) ?? 1)),
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);
  }, [movements, recipes]);

  // ─── 3. DESVIACIÓN TEÓRICO VS REAL ───
  const deviationData = useMemo(() => {
    if (!recipes?.length || !movements?.length) return [];

    const realCostMap = new Map<string, number>();
    const realCountMap = new Map<string, number>();
    for (const m of movements) {
      if (!m.recipe_id) continue;
      realCostMap.set(m.recipe_id, (realCostMap.get(m.recipe_id) ?? 0) + Number(m.total_cost));
      // Count unique consumptions by grouping movements per recipe+timestamp
    }
    // Count movements per recipe
    for (const m of movements) {
      if (!m.recipe_id) continue;
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
        // Estimate portion count: total movements / ingredients per recipe
        const rawMovements = realCountMap.get(r.id) ?? 0;
        const portions = ingredientCount > 0 ? Math.round(rawMovements / ingredientCount) : rawMovements;
        const avgReal = portions > 0 ? totalReal / portions : 0;
        const diff = portions > 0 ? avgReal - theoretical : 0;
        const diffPct = theoretical > 0 && portions > 0 ? (diff / theoretical) * 100 : 0;

        return {
          id: r.id,
          name: r.name,
          theoretical: Math.round(theoretical),
          avgReal: Math.round(avgReal),
          diff: Math.round(diff),
          diffPct: Math.round(diffPct * 10) / 10,
          portions,
        };
      })
      .filter((r) => r.portions > 0)
      .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  }, [recipes, movements, productMap]);

  // ─── 4. PRODUCTOS CON MAYOR CONSUMO ───
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
        return {
          id,
          name: prod?.name ?? "Desconocido",
          unit: prod?.unit ?? "",
          totalQty: Math.round(qty * 100) / 100,
          totalCost: Math.round(costMap.get(id) ?? 0),
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);
  }, [movements, productMap]);

  // ─── 5. DÍAS ESTIMADOS DE INVENTARIO ───
  const inventoryDays = useMemo(() => {
    if (!movements?.length || !products?.length) return [];

    // Calculate daily average consumption over last 30 days
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const recentMovements = movements.filter((m) => isAfterDate(m.movement_date, thirtyDaysAgo));

    const dailyConsumption = new Map<string, number>();
    for (const m of recentMovements) {
      dailyConsumption.set(m.product_id, (dailyConsumption.get(m.product_id) ?? 0) + Number(m.quantity));
    }

    const daySpan = Math.max(
      1,
      differenceInDays(now, recentMovements.length > 0 ? parseISO(recentMovements[0].created_at) : thirtyDaysAgo)
    );

    return products
      .map((p) => {
        const totalConsumed = dailyConsumption.get(p.id) ?? 0;
        const avgDaily = totalConsumed / daySpan;
        const daysRemaining = avgDaily > 0 ? Number(p.current_stock) / avgDaily : null;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          stock: Number(p.current_stock),
          avgDaily: Math.round(avgDaily * 100) / 100,
          daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null,
        };
      })
      .filter((p) => p.avgDaily > 0)
      .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
  }, [movements, products]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard Ejecutivo</h1>
          <p className="text-muted-foreground">Resumen integral de costos, consumos y proyecciones</p>
        </div>

        {/* ─── KPI Summary ─── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Costo Total</CardTitle>
              <DollarSign className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">${totalCost.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total en salidas registradas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recetas Activas</CardTitle>
              <ChefHat className="h-5 w-5 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">{topRecipes.length}</div>
              <p className="text-xs text-muted-foreground">Con consumos registrados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Productos Consumidos</CardTitle>
              <Package className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">{topProducts.length}</div>
              <p className="text-xs text-muted-foreground">En el período</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Inventario</CardTitle>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading">
                {inventoryDays.filter((p) => p.daysRemaining !== null && p.daysRemaining <= 7).length}
              </div>
              <p className="text-xs text-muted-foreground">Productos con ≤7 días de stock</p>
            </CardContent>
          </Card>
        </div>

        {/* ─── 1. Costo de producción por período ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Costo de Producción por Período
              </CardTitle>
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
              <p className="text-center py-12 text-muted-foreground">Sin datos de consumo</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costByPeriod}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Costo"]}
                    contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ─── 2. Top 5 recetas con mayor costo ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5" /> Top 5 Recetas por Costo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!topRecipes.length ? (
                <p className="text-center py-8 text-muted-foreground">Sin consumos de recetas</p>
              ) : (
                <div className="space-y-3">
                  {topRecipes.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
                        style={{ backgroundColor: COLORS[i] }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.count} consumos · Prom: ${r.avgCost.toLocaleString()}/u</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold font-heading">${r.totalCost.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">total acum.</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── 4. Productos con mayor consumo ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Productos con Mayor Consumo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!topProducts.length ? (
                <p className="text-center py-8 text-muted-foreground">Sin consumos</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.slice(0, 8).map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
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

        {/* ─── 3. Desviación teórico vs real ─── */}
        {deviationData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5" /> Desviación: Consumo Teórico vs Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={deviationData.slice(0, 10).map((d) => ({
                      name: d.name,
                      Teórico: d.theoretical,
                      Real: d.avgReal,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={120} />
                    <Tooltip
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                      contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
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
                        <Badge
                          variant={r.diff > 0 ? "destructive" : "secondary"}
                          className={r.diff < 0 ? "bg-success text-success-foreground" : ""}
                        >
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

        {/* ─── 5. Días estimados de inventario ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Días Estimados de Inventario
            </CardTitle>
          </CardHeader>
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
                          <Badge
                            variant={p.daysRemaining <= 3 ? "destructive" : p.daysRemaining <= 7 ? "outline" : "secondary"}
                            className={
                              p.daysRemaining <= 3
                                ? ""
                                : p.daysRemaining <= 7
                                ? "border-warning text-warning"
                                : "bg-success/10 text-success border-success/30"
                            }
                          >
                            {p.daysRemaining} días
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function isAfterDate(dateStr: string, reference: Date): boolean {
  return parseISO(dateStr) > reference;
}
