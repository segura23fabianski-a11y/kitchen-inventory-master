import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { DollarSign, TrendingDown } from "lucide-react";

type Period = "day" | "week" | "month";

export default function Reports() {
  const [period, setPeriod] = useState<Period>("day");

  const { data: movements, isLoading } = useQuery({
    queryKey: ["report-salidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("created_at, total_cost")
        .eq("type", "salida")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    if (!movements?.length) return [];

    const grouped = new Map<string, number>();

    for (const m of movements) {
      const date = parseISO(m.created_at);
      let key: string;
      if (period === "day") {
        key = format(date, "yyyy-MM-dd");
      } else if (period === "week") {
        const ws = startOfWeek(date, { weekStartsOn: 1 });
        key = format(ws, "yyyy-MM-dd");
      } else {
        const ms = startOfMonth(date);
        key = format(ms, "yyyy-MM");
      }
      grouped.set(key, (grouped.get(key) ?? 0) + Number(m.total_cost));
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        let label: string;
        if (period === "day") {
          label = format(parseISO(key), "dd MMM", { locale: es });
        } else if (period === "week") {
          label = `Sem ${format(parseISO(key), "dd MMM", { locale: es })}`;
        } else {
          label = format(parseISO(key + "-01"), "MMM yyyy", { locale: es });
        }
        return { label, value: Math.round(value * 100) / 100 };
      });
  }, [movements, period]);

  const total = chartData.reduce((s, d) => s + d.value, 0);
  const avg = chartData.length > 0 ? total / chartData.length : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Reportes de Consumo</h1>
          <p className="text-muted-foreground">Valor consumido basado en salidas de inventario</p>
        </div>

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
      </div>
    </AppLayout>
  );
}
