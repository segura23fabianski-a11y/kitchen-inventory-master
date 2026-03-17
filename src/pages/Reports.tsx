import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { DollarSign, TrendingDown, ChefHat, ArrowUpDown } from "lucide-react";

type Period = "day" | "week" | "month";
type ReportTab = "consumption" | "recipes";

export default function Reports() {
  const [period, setPeriod] = useState<Period>("day");
  const [tab, setTab] = useState<ReportTab>("consumption");

  // Salidas for consumption chart
  const { data: movements, isLoading } = useQuery({
    queryKey: ["report-salidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("movement_date, total_cost")
        .eq("type", "salida")
        .order("movement_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Recipes with ingredients for theoretical cost
  const { data: recipes } = useQuery({
    queryKey: ["recipes-with-ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_ingredients(product_id, quantity)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Products for cost lookup
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Salidas linked to recipes for real cost
  const { data: recipeSalidas } = useQuery({
    queryKey: ["report-recipe-salidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("recipe_id, total_cost")
        .eq("type", "salida")
        .not("recipe_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) ?? []);

  // Consumption chart data
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

  // Recipe comparison data
  const recipeData = useMemo(() => {
    if (!recipes?.length) return [];

    const realCostMap = new Map<string, number>();
    const realCountMap = new Map<string, number>();
    for (const s of recipeSalidas ?? []) {
      if (s.recipe_id) {
        realCostMap.set(s.recipe_id, (realCostMap.get(s.recipe_id) ?? 0) + Number(s.total_cost));
        realCountMap.set(s.recipe_id, (realCountMap.get(s.recipe_id) ?? 0) + 1);
      }
    }

    return recipes.map((r) => {
      const theoretical = (r.recipe_ingredients ?? []).reduce((sum, ing) => {
        const prod = productMap.get(ing.product_id);
        return sum + (prod ? Number(prod.average_cost) * Number(ing.quantity) : 0);
      }, 0);
      const totalReal = realCostMap.get(r.id) ?? 0;
      const count = realCountMap.get(r.id) ?? 0;
      const avgReal = count > 0 ? totalReal / count : 0;
      const diff = count > 0 ? avgReal - theoretical : 0;
      const diffPct = theoretical > 0 && count > 0 ? (diff / theoretical) * 100 : 0;
      return {
        id: r.id,
        name: r.name,
        theoretical: Math.round(theoretical * 100) / 100,
        avgReal: Math.round(avgReal * 100) / 100,
        totalReal: Math.round(totalReal * 100) / 100,
        count,
        diff: Math.round(diff * 100) / 100,
        diffPct: Math.round(diffPct * 10) / 10,
      };
    });
  }, [recipes, recipeSalidas, productMap]);

  const chartRecipeData = recipeData
    .filter((r) => r.count > 0 || r.theoretical > 0)
    .map((r) => ({ name: r.name, Teórico: r.theoretical, "Real (prom.)": r.avgReal }));

  const total = chartData.reduce((s, d) => s + d.value, 0);
  const avg = chartData.length > 0 ? total / chartData.length : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Reportes de Consumo</h1>
          <p className="text-muted-foreground">Análisis de salidas de inventario y costos por receta</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
          <TabsList>
            <TabsTrigger value="consumption" className="gap-1"><TrendingDown className="h-4 w-4" /> Consumo</TabsTrigger>
            <TabsTrigger value="recipes" className="gap-1"><ChefHat className="h-4 w-4" /> Costo por Receta</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "consumption" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" /> Total consumido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-heading text-2xl font-bold">${total.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-4 w-4" /> Promedio por {period === "day" ? "día" : period === "week" ? "semana" : "mes"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-heading text-2xl font-bold">${avg.toFixed(2)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
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
          </>
        )}

        {tab === "recipes" && (
          <>
            {chartRecipeData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Costo Teórico vs Real por Receta</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartRecipeData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" width={120} />
                      <Tooltip
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Legend />
                      <Bar dataKey="Teórico" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Real (prom.)" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4" /> Detalle por receta
                </CardTitle>
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
                    {!recipeData.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin recetas</TableCell>
                      </TableRow>
                    ) : (
                      recipeData.map((r) => (
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
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {r.count > 0 ? `$${r.totalReal.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
