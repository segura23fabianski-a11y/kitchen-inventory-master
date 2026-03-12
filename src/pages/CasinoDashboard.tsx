import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { usePermissions } from "@/hooks/use-permissions";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import {
  DollarSign, TrendingUp, TrendingDown, Utensils, Coffee, Sun, Moon, Cookie,
  Activity, AlertCircle, CheckCircle, MinusCircle,
} from "lucide-react";

export default function CasinoDashboard() {
  const restaurantId = useRestaurantId();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // Today's combo executions (variable combos = services like lunch, breakfast)
  const { data: todayCombos } = useQuery({
    queryKey: ["casino-combos-today", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_execution_logs" as any)
        .select("*, recipes:recipe_id(name, description)")
        .gte("executed_at", `${todayStr}T00:00:00`)
        .lte("executed_at", `${todayStr}T23:59:59`)
        .order("executed_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Today's production runs (fixed recipes)
  const { data: todayRuns } = useQuery({
    queryKey: ["casino-runs-today", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_production_runs")
        .select("*, recipes:recipe_id(name, description)")
        .eq("production_date", todayStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Variable components for theoretical cost of combos
  const { data: variableComponents } = useQuery({
    queryKey: ["casino-variable-components"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_variable_components" as any)
        .select("recipe_id, average_component_cost");
      if (error) throw error;
      return data as any[];
    },
  });

  // Today's inventory exits (salidas)
  const { data: todaySalidas } = useQuery({
    queryKey: ["casino-salidas-today", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("total_cost")
        .eq("type", "salida")
        .gte("movement_date", `${todayStr}T00:00:00`)
        .lte("movement_date", `${todayStr}T23:59:59`);
      if (error) throw error;
      return data;
    },
  });

  // Today's POS orders (sales)
  const { data: todayOrders } = useQuery({
    queryKey: ["casino-orders-today", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_orders")
        .select("total, status, service_period")
        .gte("created_at", `${todayStr}T00:00:00`)
        .lte("created_at", `${todayStr}T23:59:59`)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Calculations
  const totalSales = useMemo(() => {
    return todayOrders?.reduce((s, o) => s + Number(o.total), 0) ?? 0;
  }, [todayOrders]);

  const totalRealCost = useMemo(() => {
    return todaySalidas?.reduce((s, m) => s + Number(m.total_cost), 0) ?? 0;
  }, [todaySalidas]);

  const profit = totalSales - totalRealCost;
  const marginPct = totalSales > 0 ? (profit / totalSales) * 100 : 0;

  // Production by service type (infer from recipe name patterns)
  const serviceBreakdown = useMemo(() => {
    const counts: Record<string, { qty: number; cost: number }> = {
      desayuno: { qty: 0, cost: 0 },
      almuerzo: { qty: 0, cost: 0 },
      cena: { qty: 0, cost: 0 },
      lonche: { qty: 0, cost: 0 },
      otro: { qty: 0, cost: 0 },
    };

    const classify = (name: string): string => {
      const lower = name.toLowerCase();
      if (lower.includes("desayuno")) return "desayuno";
      if (lower.includes("almuerzo") || lower.includes("lunch")) return "almuerzo";
      if (lower.includes("cena")) return "cena";
      if (lower.includes("lonche") || lower.includes("snack") || lower.includes("merienda")) return "lonche";
      return "otro";
    };

    todayCombos?.forEach((c: any) => {
      const recipeName = c.recipes?.name ?? "";
      const cat = classify(recipeName);
      counts[cat].qty += Number(c.servings);
      counts[cat].cost += Number(c.total_cost);
    });

    todayRuns?.forEach((r: any) => {
      const recipeName = r.recipes?.name ?? "";
      const cat = classify(recipeName);
      counts[cat].qty += Number(r.quantity_produced);
      counts[cat].cost += Number(r.actual_total_cost);
    });

    return counts;
  }, [todayCombos, todayRuns]);

  // Menu profitability table
  const menuRows = useMemo(() => {
    const rows: any[] = [];

    todayCombos?.forEach((c: any) => {
      rows.push({
        name: c.recipes?.name ?? "Combo",
        qty: Number(c.servings),
        realUnit: Number(c.unit_cost),
        realTotal: Number(c.total_cost),
        theoreticalUnit: null, // combos don't have theoretical
        source: "combo",
      });
    });

    todayRuns?.forEach((r: any) => {
      rows.push({
        name: r.recipes?.name ?? "Producción",
        qty: Number(r.quantity_produced),
        realUnit: Number(r.actual_unit_cost),
        realTotal: Number(r.actual_total_cost),
        theoreticalUnit: Number(r.theoretical_unit_cost),
        source: "production",
      });
    });

    return rows;
  }, [todayCombos, todayRuns]);

  // Sales by service period
  const salesByPeriod = useMemo(() => {
    const map: Record<string, number> = {};
    todayOrders?.forEach((o) => {
      const p = o.service_period ?? "otro";
      map[p] = (map[p] ?? 0) + Number(o.total);
    });
    return map;
  }, [todayOrders]);

  const fmt = (v: number) => `$${v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const serviceConfig = [
    { key: "desayuno", label: "Desayunos", icon: Coffee, color: "text-amber-600" },
    { key: "almuerzo", label: "Almuerzos", icon: Sun, color: "text-orange-600" },
    { key: "cena", label: "Cenas", icon: Moon, color: "text-indigo-600" },
    { key: "lonche", label: "Lonches", icon: Cookie, color: "text-pink-600" },
  ];

  const getTrafficLight = (theoreticalUnit: number | null, realUnit: number): "green" | "yellow" | "red" => {
    if (theoreticalUnit === null || theoreticalUnit === 0) return "green";
    const deviation = ((realUnit - theoreticalUnit) / theoreticalUnit) * 100;
    if (deviation <= 5) return "green";
    if (deviation <= 15) return "yellow";
    return "red";
  };

  const TrafficIcon = ({ status }: { status: "green" | "yellow" | "red" }) => {
    if (status === "green") return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (status === "yellow") return <MinusCircle className="h-4 w-4 text-amber-500" />;
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Rentabilidad del Día</h1>
          <p className="text-muted-foreground">
            {format(today, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Ventas del día</p>
              </div>
              <p className="font-heading text-2xl font-bold">{fmt(totalSales)}</p>
              {Object.keys(salesByPeriod).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {Object.entries(salesByPeriod).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Costo real del día</p>
              </div>
              <p className="font-heading text-2xl font-bold text-destructive">{fmt(totalRealCost)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Utilidad del día</p>
              </div>
              <p className={`font-heading text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {fmt(profit)}
              </p>
              {totalSales > 0 && (
                <p className="text-xs text-muted-foreground">Margen: {marginPct.toFixed(1)}%</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Servicios producidos</p>
              </div>
              <p className="font-heading text-2xl font-bold">
                {Object.values(serviceBreakdown).reduce((s, v) => s + v.qty, 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Production by service */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {serviceConfig.map((svc) => {
            const data = serviceBreakdown[svc.key];
            const Icon = svc.icon;
            return (
              <Card key={svc.key}>
                <CardContent className="pt-4 pb-3 px-4 text-center">
                  <Icon className={`h-6 w-6 mx-auto mb-1 ${svc.color}`} />
                  <p className="text-xs text-muted-foreground">{svc.label}</p>
                  <p className="font-heading text-xl font-bold">{data.qty}</p>
                  {data.cost > 0 && (
                    <p className="text-xs text-muted-foreground">{fmt(data.cost)} costo</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Menu profitability table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5" /> Rentabilidad por Menú / Producción
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Menú / Receta</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Teórico Unit.</TableHead>
                  <TableHead className="text-right">Real Unit.</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-right">Desviación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {menuRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Sin producción registrada hoy
                    </TableCell>
                  </TableRow>
                ) : (
                  menuRows.map((row, i) => {
                    const light = getTrafficLight(row.theoreticalUnit, row.realUnit);
                    const deviation = row.theoreticalUnit
                      ? row.realUnit - row.theoreticalUnit
                      : null;
                    return (
                      <TableRow key={i}>
                        <TableCell><TrafficIcon status={light} /></TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right font-mono">{row.qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.theoreticalUnit ? fmt(row.theoreticalUnit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">{fmt(row.realUnit)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(row.realTotal)}</TableCell>
                        <TableCell className="text-right">
                          {deviation !== null ? (
                            <Badge
                              variant={deviation > 0 ? "destructive" : "secondary"}
                              className={deviation <= 0 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : ""}
                            >
                              {deviation > 0 ? "+" : ""}{fmt(deviation)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Variable</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-green-600" /> Dentro del objetivo (≤5%)</span>
          <span className="flex items-center gap-1"><MinusCircle className="h-3.5 w-3.5 text-amber-500" /> Ligera desviación (5-15%)</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Fuera del objetivo (&gt;15%)</span>
        </div>
      </div>
    </AppLayout>
  );
}
