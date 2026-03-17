import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Archive, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Bell, TrendingUp, ChefHat } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { subDays, parseISO, isAfter } from "date-fns";

export default function Dashboard() {
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: recentMovements } = useQuery({
    queryKey: ["recent-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, products(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // All salidas for anomaly detection
  const { data: allSalidas } = useQuery({
    queryKey: ["all-salidas-for-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, recipe_id, quantity, total_cost, movement_date")
        .eq("type", "salida")
        .order("movement_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ["recipes-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const lowStockProducts = products?.filter((p) => Number(p.current_stock) <= Number(p.min_stock)) ?? [];

  // Anomaly detection: compare last 7 days average daily consumption vs overall average
  const anomalies = useMemo(() => {
    if (!allSalidas?.length || !products?.length) return { products: [], recipes: [] };

    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);
    const thirtyDaysAgo = subDays(now, 30);

    // Product anomalies
    const productAnomalies: { id: string; name: string; recentAvg: number; historicAvg: number; ratio: number }[] = [];
    const byProduct = new Map<string, typeof allSalidas>();
    for (const s of allSalidas) {
      const arr = byProduct.get(s.product_id) ?? [];
      arr.push(s);
      byProduct.set(s.product_id, arr);
    }

    for (const [pid, entries] of byProduct) {
      const historic = entries.filter((e) => isAfter(parseISO(e.movement_date), thirtyDaysAgo));
      const recent = entries.filter((e) => isAfter(parseISO(e.movement_date), sevenDaysAgo));
      if (historic.length < 3) continue; // need minimum data

      const historicDailyAvg = historic.reduce((s, e) => s + Number(e.quantity), 0) / 30;
      const recentDailyAvg = recent.reduce((s, e) => s + Number(e.quantity), 0) / 7;

      if (historicDailyAvg > 0 && recentDailyAvg > historicDailyAvg * 1.5) {
        const prod = products.find((p) => p.id === pid);
        if (prod) {
          productAnomalies.push({
            id: pid,
            name: prod.name,
            recentAvg: Math.round(recentDailyAvg * 100) / 100,
            historicAvg: Math.round(historicDailyAvg * 100) / 100,
            ratio: Math.round((recentDailyAvg / historicDailyAvg) * 100) / 100,
          });
        }
      }
    }

    // Recipe anomalies
    const recipeAnomalies: { id: string; name: string; recentAvg: number; historicAvg: number; ratio: number }[] = [];
    const byRecipe = new Map<string, typeof allSalidas>();
    for (const s of allSalidas) {
      if (!s.recipe_id) continue;
      const arr = byRecipe.get(s.recipe_id) ?? [];
      arr.push(s);
      byRecipe.set(s.recipe_id, arr);
    }

    const recipeMap = new Map(recipes?.map((r) => [r.id, r.name]) ?? []);

    for (const [rid, entries] of byRecipe) {
      const historic = entries.filter((e) => isAfter(parseISO(e.created_at), thirtyDaysAgo));
      const recent = entries.filter((e) => isAfter(parseISO(e.created_at), sevenDaysAgo));
      if (historic.length < 3) continue;

      const historicDailyAvg = historic.reduce((s, e) => s + Number(e.total_cost), 0) / 30;
      const recentDailyAvg = recent.reduce((s, e) => s + Number(e.total_cost), 0) / 7;

      if (historicDailyAvg > 0 && recentDailyAvg > historicDailyAvg * 1.5) {
        recipeAnomalies.push({
          id: rid,
          name: recipeMap.get(rid) ?? "Receta desconocida",
          recentAvg: Math.round(recentDailyAvg * 100) / 100,
          historicAvg: Math.round(historicDailyAvg * 100) / 100,
          ratio: Math.round((recentDailyAvg / historicDailyAvg) * 100) / 100,
        });
      }
    }

    return {
      products: productAnomalies.sort((a, b) => b.ratio - a.ratio),
      recipes: recipeAnomalies.sort((a, b) => b.ratio - a.ratio),
    };
  }, [allSalidas, products, recipes]);

  const totalAlerts = lowStockProducts.length + anomalies.products.length + anomalies.recipes.length;
  const totalProducts = products?.length ?? 0;
  const totalEntries = recentMovements?.filter((m) => m.type === "entrada").length ?? 0;
  const totalExits = recentMovements?.filter((m) => m.type === "salida").length ?? 0;

  const stats = [
    { label: "Total Productos", value: totalProducts, icon: Archive, color: "text-primary" },
    { label: "Alertas Activas", value: totalAlerts, icon: Bell, color: totalAlerts > 0 ? "text-destructive" : "text-success" },
    { label: "Entradas Recientes", value: totalEntries, icon: ArrowDownCircle, color: "text-success" },
    { label: "Salidas Recientes", value: totalExits, icon: ArrowUpCircle, color: "text-warning" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Resumen del inventario del restaurante</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-heading">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerts Section */}
        {totalAlerts > 0 && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-destructive" /> Alertas
                <Badge variant="destructive">{totalAlerts}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Low stock alerts */}
              {lowStockProducts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-destructive" /> Stock bajo mínimo
                  </p>
                  <div className="space-y-2">
                    {lowStockProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{(p as any).categories?.name ?? "Sin categoría"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-destructive">{Number(p.current_stock)} {p.unit}</p>
                          <p className="text-xs text-muted-foreground">Mín: {Number(p.min_stock)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product anomalies */}
              {anomalies.products.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-warning" /> Consumo anormal por producto
                  </p>
                  <div className="space-y-2">
                    {anomalies.products.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Promedio diario últimos 7 días: {a.recentAvg} vs histórico: {a.historicAvg}
                          </p>
                        </div>
                        <Badge className="bg-warning text-warning-foreground">{a.ratio}x</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recipe anomalies */}
              {anomalies.recipes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <ChefHat className="h-4 w-4 text-warning" /> Consumo anormal por receta
                  </p>
                  <div className="space-y-2">
                    {anomalies.recipes.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Costo diario últimos 7 días: ${a.recentAvg} vs histórico: ${a.historicAvg}
                          </p>
                        </div>
                        <Badge className="bg-warning text-warning-foreground">{a.ratio}x</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Productos con Stock Bajo</CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todo en orden 👍</p>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{(p as any).categories?.name ?? "Sin categoría"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-destructive">{Number(p.current_stock)} {p.unit}</p>
                        <p className="text-xs text-muted-foreground">Mín: {Number(p.min_stock)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Movimientos Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {!recentMovements?.length ? (
                <p className="text-sm text-muted-foreground">Sin movimientos aún</p>
              ) : (
                <div className="space-y-3">
                  {recentMovements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.type === "entrada" ? (
                          <ArrowDownCircle className="h-4 w-4 text-success" />
                        ) : m.type === "salida" ? (
                          <ArrowUpCircle className="h-4 w-4 text-warning" />
                        ) : (
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{(m as any).products?.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{m.type}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold">
                        {m.type === "entrada" ? "+" : m.type === "salida" ? "-" : ""}
                        {Number(m.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
