import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check, ChevronsUpDown, CalendarIcon, Download, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { cn, formatCOP } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";

const PRICE_ALERT_THRESHOLD = 15; // % above average triggers alert

interface InvoiceItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    supplier_name: string | null;
    status: string;
  };
}

export default function PriceHistory() {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  // Products
  const { data: products } = useQuery({
    queryKey: ["price-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, average_cost, last_unit_cost, category_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // All posted invoice items (join invoice for date/supplier)
  const { data: allItems } = useQuery({
    queryKey: ["price-invoice-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select("id, product_id, quantity, unit_cost, line_total, invoice_id")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Invoices
  const { data: invoices } = useQuery({
    queryKey: ["price-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("id, invoice_number, invoice_date, supplier_name, status")
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // Product suppliers
  const { data: productSuppliers } = useQuery({
    queryKey: ["price-product-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_suppliers")
        .select("id, product_id, supplier_id, last_unit_cost, is_primary, suppliers(id, name)");
      if (error) throw error;
      return data;
    },
  });

  // Categories
  const { data: categories } = useQuery({
    queryKey: ["price-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name");
      return data ?? [];
    },
  });

  // Maps
  const invoiceMap = useMemo(
    () => new Map(invoices?.map((inv) => [inv.id, inv]) ?? []),
    [invoices]
  );

  const selectedProduct = products?.find((p) => p.id === selectedProductId);

  // Merge items with invoice data, filter to posted only
  const enrichedItems = useMemo((): InvoiceItem[] => {
    if (!allItems || !invoiceMap.size) return [];
    return allItems
      .filter((item) => invoiceMap.has(item.invoice_id))
      .map((item) => ({
        ...item,
        invoice: invoiceMap.get(item.invoice_id)!,
      }));
  }, [allItems, invoiceMap]);

  // Items for selected product
  const productItems = useMemo(() => {
    if (!selectedProductId) return [];
    let items = enrichedItems.filter((i) => i.product_id === selectedProductId);
    if (filterSupplier !== "all") {
      items = items.filter((i) => i.invoice.supplier_name === filterSupplier);
    }
    if (dateFrom) {
      const from = format(dateFrom, "yyyy-MM-dd");
      items = items.filter((i) => i.invoice.invoice_date >= from);
    }
    if (dateTo) {
      const to = format(dateTo, "yyyy-MM-dd");
      items = items.filter((i) => i.invoice.invoice_date <= to);
    }
    return items.sort((a, b) => a.invoice.invoice_date.localeCompare(b.invoice.invoice_date));
  }, [enrichedItems, selectedProductId, filterSupplier, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    if (productItems.length === 0) return null;
    const costs = productItems.map((i) => i.unit_cost);
    const avg = costs.reduce((s, c) => s + c, 0) / costs.length;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const last = costs[costs.length - 1];
    const prev = costs.length > 1 ? costs[costs.length - 2] : last;
    const variation = prev > 0 ? ((last - prev) / prev) * 100 : 0;
    const vsAvg = avg > 0 ? ((last - avg) / avg) * 100 : 0;
    return { avg, min, max, last, prev, variation, vsAvg, count: costs.length };
  }, [productItems]);

  // Unique suppliers for this product
  const productSupplierNames = useMemo(() => {
    const set = new Set<string>();
    enrichedItems
      .filter((i) => i.product_id === selectedProductId && i.invoice.supplier_name)
      .forEach((i) => set.add(i.invoice.supplier_name!));
    return Array.from(set).sort();
  }, [enrichedItems, selectedProductId]);

  // Supplier comparison
  const supplierComparison = useMemo(() => {
    if (!selectedProductId) return [];
    const map: Record<string, { costs: number[]; lastDate: string }> = {};
    enrichedItems
      .filter((i) => i.product_id === selectedProductId)
      .forEach((i) => {
        const name = i.invoice.supplier_name ?? "Sin proveedor";
        if (!map[name]) map[name] = { costs: [], lastDate: "" };
        map[name].costs.push(i.unit_cost);
        if (i.invoice.invoice_date > map[name].lastDate) map[name].lastDate = i.invoice.invoice_date;
      });
    return Object.entries(map).map(([supplier, v]) => {
      const avg = v.costs.reduce((s, c) => s + c, 0) / v.costs.length;
      return {
        supplier,
        lastCost: v.costs[v.costs.length - 1],
        avgCost: avg,
        minCost: Math.min(...v.costs),
        maxCost: Math.max(...v.costs),
        lastDate: v.lastDate,
        purchases: v.costs.length,
      };
    }).sort((a, b) => a.avgCost - b.avgCost);
  }, [enrichedItems, selectedProductId]);

  // Chart data - line chart
  const lineChartData = useMemo(
    () => productItems.map((i) => ({
      date: format(new Date(i.invoice.invoice_date), "dd/MM/yy"),
      costo: i.unit_cost,
      supplier: i.invoice.supplier_name ?? "",
    })),
    [productItems]
  );

  // Chart data - bar comparison by supplier
  const barChartData = useMemo(
    () => supplierComparison.map((s) => ({
      name: s.supplier.length > 15 ? s.supplier.slice(0, 15) + "…" : s.supplier,
      "Último": s.lastCost,
      "Promedio": s.avgCost,
      "Mínimo": s.minCost,
    })),
    [supplierComparison]
  );

  // Price alert
  const priceAlert = stats && stats.vsAvg > PRICE_ALERT_THRESHOLD;

  // Export
  const exportExcel = () => {
    // History sheet
    const historyRows = productItems.map((i) => ({
      Fecha: i.invoice.invoice_date,
      Factura: i.invoice.invoice_number,
      Proveedor: i.invoice.supplier_name ?? "",
      Cantidad: i.quantity,
      "Costo Unitario": i.unit_cost,
      "Costo Total": i.line_total,
    }));
    const ws1 = XLSX.utils.json_to_sheet(historyRows);

    // Supplier comparison sheet
    const compRows = supplierComparison.map((s) => ({
      Proveedor: s.supplier,
      "Último Costo": s.lastCost,
      "Costo Promedio": s.avgCost,
      "Costo Mínimo": s.minCost,
      "Costo Máximo": s.maxCost,
      "Última Compra": s.lastDate,
      Compras: s.purchases,
    }));
    const ws2 = XLSX.utils.json_to_sheet(compRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Historial");
    XLSX.utils.book_append_sheet(wb, ws2, "Proveedores");
    XLSX.writeFile(wb, `historico_precios_${selectedProduct?.name ?? "producto"}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Histórico de Precios</h1>
            <p className="text-sm text-muted-foreground">Evolución y comparación de precios de compra</p>
          </div>
          {selectedProductId && productItems.length > 0 && (
            <Button variant="outline" onClick={exportExcel}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
          )}
        </div>

        {/* Product selector + filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Producto</Label>
            <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[280px] justify-between">
                  {selectedProduct?.name ?? "Seleccionar producto..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar producto..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados</CommandEmpty>
                    <CommandGroup>
                      {products?.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => {
                            setSelectedProductId(p.id);
                            setProductPopoverOpen(false);
                            setFilterSupplier("all");
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedProductId === p.id ? "opacity-100" : "opacity-0")} />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedProductId && (
            <>
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {productSupplierNames.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[130px] justify-start text-left text-xs">
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Inicio"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d ?? undefined); setDateFromOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[130px] justify-start text-left text-xs">
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fin"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d ?? undefined); setDateToOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>

        {!selectedProductId && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <DollarSign className="mx-auto h-12 w-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">Selecciona un producto para ver su histórico de precios</p>
              <p className="text-sm">Podrás ver la evolución de costos, comparar proveedores y detectar variaciones</p>
            </CardContent>
          </Card>
        )}

        {selectedProductId && (
          <>
            {/* KPIs */}
            {stats && (
              <div className="grid gap-4 md:grid-cols-5">
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Último Precio</p>
                    <p className="text-xl font-bold text-foreground">{formatCOP(stats.last, 2)}</p>
                    {priceAlert && (
                      <Badge variant="destructive" className="mt-1 text-xs">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Precio elevado
                      </Badge>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Promedio Histórico</p>
                    <p className="text-xl font-bold text-foreground">{formatCOP(stats.avg, 2)}</p>
                    <p className="text-xs text-muted-foreground">{stats.count} compras</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Mínimo</p>
                    <p className="text-xl font-bold text-success">{formatCOP(stats.min, 2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Máximo</p>
                    <p className="text-xl font-bold text-destructive">{formatCOP(stats.max, 2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Variación vs Anterior</p>
                    <div className="flex items-center gap-1">
                      {stats.variation > 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      ) : stats.variation < 0 ? (
                        <ArrowDownRight className="h-4 w-4 text-success" />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}
                      <p className={cn(
                        "text-xl font-bold",
                        stats.variation > 0 ? "text-destructive" : stats.variation < 0 ? "text-success" : "text-foreground"
                      )}>
                        {stats.variation > 0 ? "+" : ""}{stats.variation.toFixed(1)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="chart" className="space-y-4">
              <TabsList>
                <TabsTrigger value="chart">Evolución</TabsTrigger>
                <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>

              {/* Line chart */}
              <TabsContent value="chart">
                <Card>
                  <CardHeader><CardTitle className="text-base">Evolución del Costo Unitario</CardTitle></CardHeader>
                  <CardContent>
                    {lineChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={lineChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                          <Tooltip
                            formatter={(v: number) => `{formatCOP(v, 2)}`}
                            labelFormatter={(label) => `Fecha: ${label}`}
                            contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="costo"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 4, fill: "hsl(var(--primary))" }}
                            name="Costo Unitario"
                          />
                          {stats && (
                            <Line
                              type="monotone"
                              dataKey={() => stats.avg}
                              stroke="hsl(var(--muted-foreground))"
                              strokeDasharray="5 5"
                              strokeWidth={1}
                              dot={false}
                              name="Promedio"
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-center text-sm text-muted-foreground py-12">Sin datos de compra para este producto</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Supplier comparison */}
              <TabsContent value="suppliers" className="space-y-4">
                {barChartData.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Comparación por Proveedor</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={barChartData} margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => `{formatCOP(v, 2)}`} />
                          <Legend />
                          <Bar dataKey="Último" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Promedio" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Mínimo" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader><CardTitle className="text-base">Detalle por Proveedor</CardTitle></CardHeader>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Último Costo</TableHead>
                        <TableHead className="text-right">Promedio</TableHead>
                        <TableHead className="text-right">Mínimo</TableHead>
                        <TableHead className="text-right">Máximo</TableHead>
                        <TableHead className="text-right">Compras</TableHead>
                        <TableHead>Última Compra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierComparison.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                      ) : (
                        supplierComparison.map((s) => {
                          const isBest = s.avgCost === Math.min(...supplierComparison.map((x) => x.avgCost));
                          return (
                            <TableRow key={s.supplier}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{s.supplier}</span>
                                  {isBest && <Badge variant="outline" className="text-xs text-success border-success">Mejor precio</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono">{formatCOP(s.lastCost, 2)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCOP(s.avgCost, 2)}</TableCell>
                              <TableCell className="text-right font-mono text-success">{formatCOP(s.minCost, 2)}</TableCell>
                              <TableCell className="text-right font-mono text-destructive">{formatCOP(s.maxCost, 2)}</TableCell>
                              <TableCell className="text-right">{s.purchases}</TableCell>
                              <TableCell className="text-xs">{s.lastDate}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              {/* History table */}
              <TabsContent value="history">
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Factura</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                        <TableHead>Variación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productItems.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin compras registradas</TableCell></TableRow>
                      ) : (
                        productItems.map((item, idx) => {
                          const prevCost = idx > 0 ? productItems[idx - 1].unit_cost : item.unit_cost;
                          const change = prevCost > 0 ? ((item.unit_cost - prevCost) / prevCost) * 100 : 0;
                          const isHigh = stats && stats.avg > 0 && ((item.unit_cost - stats.avg) / stats.avg) * 100 > PRICE_ALERT_THRESHOLD;
                          return (
                            <TableRow key={item.id} className={isHigh ? "bg-destructive/5" : ""}>
                              <TableCell className="text-sm">{item.invoice.invoice_date}</TableCell>
                              <TableCell className="font-medium text-sm">{item.invoice.invoice_number}</TableCell>
                              <TableCell className="text-sm">{item.invoice.supplier_name ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                              <TableCell className="text-right font-mono font-medium">{formatCOP(item.unit_cost, 2)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCOP(item.line_total, 2)}</TableCell>
                              <TableCell>
                                {idx === 0 ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <span className={cn(
                                    "text-xs font-medium flex items-center gap-0.5",
                                    change > 0 ? "text-destructive" : change < 0 ? "text-success" : "text-muted-foreground"
                                  )}>
                                    {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : change < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                                    {change > 0 ? "+" : ""}{change.toFixed(1)}%
                                  </span>
                                )}
                                {isHigh && <Badge variant="destructive" className="text-[10px] ml-1">Alto</Badge>}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
