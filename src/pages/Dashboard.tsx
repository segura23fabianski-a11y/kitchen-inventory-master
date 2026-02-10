import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";
import AppLayout from "@/components/AppLayout";

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

  const totalProducts = products?.length ?? 0;
  const lowStock = products?.filter((p) => Number(p.current_stock) <= Number(p.min_stock)).length ?? 0;
  const totalEntries = recentMovements?.filter((m) => m.type === "entrada").length ?? 0;
  const totalExits = recentMovements?.filter((m) => m.type === "salida").length ?? 0;

  const stats = [
    { label: "Total Productos", value: totalProducts, icon: Archive, color: "text-primary" },
    { label: "Stock Bajo", value: lowStock, icon: AlertTriangle, color: "text-destructive" },
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

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Productos con Stock Bajo</CardTitle>
            </CardHeader>
            <CardContent>
              {products?.filter((p) => Number(p.current_stock) <= Number(p.min_stock)).length === 0 ? (
                <p className="text-sm text-muted-foreground">Todo en orden 👍</p>
              ) : (
                <div className="space-y-3">
                  {products
                    ?.filter((p) => Number(p.current_stock) <= Number(p.min_stock))
                    .map((p) => (
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
