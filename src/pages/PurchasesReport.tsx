import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { DollarSign, Package, Truck, Tag, TrendingUp, Search } from "lucide-react";

type ViewTab = "suppliers" | "products" | "categories" | "evolution";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"];

export default function PurchasesReport() {
  const restaurantId = useRestaurantId();
  const [tab, setTab] = useState<ViewTab>("suppliers");
  const [dateFrom, setDateFrom] = useState(() => format(subMonths(new Date(), 3), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Invoice items with joins
  const { data: invoiceItems, isLoading } = useQuery({
    queryKey: ["purchase-report-items", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select(`
          quantity, unit_cost, line_total,
          products:product_id(id, name, category_id, categories:category_id(name)),
          invoices:invoice_id(invoice_date, supplier_id, supplier_name, status, suppliers:supplier_id(name))
        `)
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`);
      if (error) throw error;
      return data as any[];
    },
  });

  // Suppliers for filter
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Categories for filter
  const { data: categories } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Filter items
  const filtered = useMemo(() => {
    if (!invoiceItems) return [];
    return invoiceItems.filter((item: any) => {
      // Only posted invoices
      if (item.invoices?.status !== "posted") return false;
      // Supplier filter
      if (filterSupplier !== "all" && item.invoices?.supplier_id !== filterSupplier) return false;
      // Category filter
      if (filterCategory !== "all" && item.products?.category_id !== filterCategory) return false;
      return true;
    });
  }, [invoiceItems, filterSupplier, filterCategory]);

  // Totals
  const totalPurchases = filtered.reduce((s: number, i: any) => s + Number(i.line_total ?? 0), 0);
  const totalItems = filtered.length;

  // By supplier
  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    filtered.forEach((item: any) => {
      const suppName = item.invoices?.suppliers?.name ?? item.invoices?.supplier_name ?? "Sin proveedor";
      const suppId = item.invoices?.supplier_id ?? suppName;
      const existing = map.get(suppId) ?? { name: suppName, total: 0, count: 0 };
      existing.total += Number(item.line_total ?? 0);
      existing.count += 1;
      map.set(suppId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // By product
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; totalQty: number; totalCost: number; supplier: string }>();
    filtered.forEach((item: any) => {
      const prodId = item.products?.id ?? "unknown";
      const prodName = item.products?.name ?? "Desconocido";
      const suppName = item.invoices?.suppliers?.name ?? item.invoices?.supplier_name ?? "";
      const existing = map.get(prodId) ?? { name: prodName, totalQty: 0, totalCost: 0, supplier: "" };
      existing.totalQty += Number(item.quantity ?? 0);
      existing.totalCost += Number(item.line_total ?? 0);
      // Track largest supplier
      if (!existing.supplier || Number(item.line_total ?? 0) > 0) existing.supplier = suppName;
      map.set(prodId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [filtered]);

  // By category
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    filtered.forEach((item: any) => {
      const catName = item.products?.categories?.name ?? "Sin categoría";
      const catId = item.products?.category_id ?? catName;
      const existing = map.get(catId) ?? { name: catName, total: 0, count: 0 };
      existing.total += Number(item.line_total ?? 0);
      existing.count += 1;
      map.set(catId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Monthly evolution
  const monthlyEvolution = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((item: any) => {
      const date = item.invoices?.invoice_date;
      if (!date) return;
      const month = format(parseISO(date), "yyyy-MM");
      map.set(month, (map.get(month) ?? 0) + Number(item.line_total ?? 0));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        label: format(parseISO(`${month}-01`), "MMM yyyy", { locale: es }),
        value: Math.round(value),
      }));
  }, [filtered]);

  const fmt = (v: number) => `$${v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const pieData = byCategory.slice(0, 8).map((c) => ({ name: c.name, value: Math.round(c.total) }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Reporte de Compras</h1>
          <p className="text-muted-foreground">Análisis de compras por proveedor, producto y categoría</p>
        </div>

        {/* Filters */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Proveedor</Label>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Compras</p>
              </div>
              <p className="font-heading text-2xl font-bold">{fmt(totalPurchases)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Líneas de Compra</p>
              </div>
              <p className="font-heading text-2xl font-bold">{totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Proveedores</p>
              </div>
              <p className="font-heading text-2xl font-bold">{bySupplier.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Categorías</p>
              </div>
              <p className="font-heading text-2xl font-bold">{byCategory.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
          <TabsList>
            <TabsTrigger value="suppliers" className="gap-1"><Truck className="h-3.5 w-3.5" /> Proveedores</TabsTrigger>
            <TabsTrigger value="products" className="gap-1"><Package className="h-3.5 w-3.5" /> Productos</TabsTrigger>
            <TabsTrigger value="categories" className="gap-1"><Tag className="h-3.5 w-3.5" /> Categorías</TabsTrigger>
            <TabsTrigger value="evolution" className="gap-1"><TrendingUp className="h-3.5 w-3.5" /> Evolución</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && <p className="text-center py-12 text-muted-foreground">Cargando...</p>}

        {/* Suppliers Tab */}
        {tab === "suppliers" && !isLoading && (
          <div className="space-y-6">
            {bySupplier.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Compras por Proveedor</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bySupplier.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => fmt(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={140} />
                      <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% del Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bySupplier.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(s.total)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {totalPurchases > 0 ? ((s.total / totalPurchases) * 100).toFixed(1) : 0}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Products Tab */}
        {tab === "products" && !isLoading && (
          <Card>
            <CardHeader><CardTitle>Productos Más Comprados</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead>Proveedor Principal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin datos</TableCell></TableRow>
                  ) : (
                    byProduct.slice(0, 30).map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono">{p.totalQty}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(p.totalCost)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.supplier || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Categories Tab */}
        {tab === "categories" && !isLoading && (
          <div className="grid gap-6 lg:grid-cols-2">
            {pieData.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Distribución por Categoría</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Evolution Tab */}
        {tab === "evolution" && !isLoading && (
          <Card>
            <CardHeader><CardTitle>Evolución Mensual de Compras</CardTitle></CardHeader>
            <CardContent>
              {monthlyEvolution.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">Sin datos en el rango seleccionado</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={monthlyEvolution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => fmt(v)} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: "var(--radius)", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Compras" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
