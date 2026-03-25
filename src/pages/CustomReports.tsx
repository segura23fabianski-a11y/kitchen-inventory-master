import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCOP, formatNumber } from "@/lib/utils";
import { Play, Download, Save, Trash2, Plus, X, BarChart2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

const DATA_SOURCES: Record<string, { label: string; table: string; columns: { key: string; label: string; type: string }[] }> = {
  movements: {
    label: "Movimientos de inventario",
    table: "inventory_movements",
    columns: [
      { key: "movement_date", label: "Fecha", type: "date" },
      { key: "type", label: "Tipo", type: "text" },
      { key: "quantity", label: "Cantidad", type: "number" },
      { key: "unit_cost", label: "Costo unitario", type: "money" },
      { key: "total_cost", label: "Costo total", type: "money" },
      { key: "notes", label: "Notas", type: "text" },
    ],
  },
  products: {
    label: "Productos",
    table: "products",
    columns: [
      { key: "name", label: "Nombre", type: "text" },
      { key: "unit", label: "Unidad", type: "text" },
      { key: "current_stock", label: "Stock actual", type: "number" },
      { key: "average_cost", label: "Costo promedio", type: "money" },
      { key: "min_stock", label: "Stock mínimo", type: "number" },
    ],
  },
  purchase_invoices: {
    label: "Facturas de compra",
    table: "purchase_invoices",
    columns: [
      { key: "invoice_number", label: "N° Factura", type: "text" },
      { key: "supplier_name", label: "Proveedor", type: "text" },
      { key: "invoice_date", label: "Fecha factura", type: "date" },
      { key: "total_amount", label: "Total", type: "money" },
      { key: "status", label: "Estado", type: "text" },
    ],
  },
  pos_orders: {
    label: "Pedidos POS",
    table: "pos_orders",
    columns: [
      { key: "order_number", label: "N° Orden", type: "text" },
      { key: "customer_name", label: "Cliente", type: "text" },
      { key: "total", label: "Total", type: "money" },
      { key: "status", label: "Estado", type: "text" },
      { key: "created_at", label: "Fecha", type: "date" },
      { key: "service_period", label: "Servicio", type: "text" },
    ],
  },
  stays: {
    label: "Estancias del hotel",
    table: "stays",
    columns: [
      { key: "check_in", label: "Check-in", type: "date" },
      { key: "check_out", label: "Check-out", type: "date" },
      { key: "status", label: "Estado", type: "text" },
      { key: "rate_per_night", label: "Tarifa/noche", type: "money" },
      { key: "total_charged", label: "Total cobrado", type: "money" },
      { key: "occupancy_type", label: "Tipo ocupación", type: "text" },
    ],
  },
  waste: {
    label: "Desperdicios y mermas",
    table: "inventory_movements",
    columns: [
      { key: "movement_date", label: "Fecha", type: "date" },
      { key: "quantity", label: "Cantidad", type: "number" },
      { key: "unit_cost", label: "Costo unitario", type: "money" },
      { key: "loss_value", label: "Valor pérdida", type: "money" },
      { key: "waste_reason", label: "Razón", type: "text" },
      { key: "notes", label: "Notas", type: "text" },
    ],
  },
};

const OPERATORS = [
  { value: "eq", label: "Igual a" },
  { value: "gt", label: "Mayor que" },
  { value: "lt", label: "Menor que" },
  { value: "gte", label: "Mayor o igual" },
  { value: "lte", label: "Menor o igual" },
  { value: "ilike", label: "Contiene" },
];

type Filter = { field: string; operator: string; value: string };

export default function CustomReports() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [tab, setTab] = useState("builder");
  const [reportName, setReportName] = useState("");
  const [dataSource, setDataSource] = useState("products");
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const source = DATA_SOURCES[dataSource];

  const { data: savedReports = [] } = useQuery({
    queryKey: ["custom-reports", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_reports" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  const toggleCol = (key: string) => {
    setSelectedCols(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  const addFilter = () => setFilters(prev => [...prev, { field: source.columns[0]?.key || "", operator: "eq", value: "" }]);
  const removeFilter = (i: number) => setFilters(prev => prev.filter((_, idx) => idx !== i));
  const updateFilter = (i: number, key: string, value: string) => setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, [key]: value } : f));

  const generate = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const cols = selectedCols.length > 0 ? selectedCols.join(", ") : "*";
      let query = supabase.from(source.table as any).select(cols).eq("restaurant_id", restaurantId);

      if (dataSource === "waste") {
        query = query.in("type", ["merma", "desperdicio"]);
      }

      for (const f of filters) {
        if (!f.value) continue;
        if (f.operator === "ilike") query = query.ilike(f.field, `%${f.value}%`);
        else if (f.operator === "eq") query = query.eq(f.field, f.value);
        else if (f.operator === "gt") query = query.gt(f.field, f.value);
        else if (f.operator === "lt") query = query.lt(f.field, f.value);
        else if (f.operator === "gte") query = query.gte(f.field, f.value);
        else if (f.operator === "lte") query = query.lte(f.field, f.value);
      }

      if (sortField) query = query.order(sortField, { ascending: sortDir === "asc" });
      else query = query.order("created_at", { ascending: false });

      const { data, error } = await query.limit(500);
      if (error) throw error;
      setResults(data || []);
    } catch (e: any) {
      toast.error(e.message || "Error al generar");
    }
    setLoading(false);
  };

  const displayCols = selectedCols.length > 0
    ? source.columns.filter(c => selectedCols.includes(c.key))
    : source.columns;

  const numericCol = displayCols.find(c => c.type === "money" || c.type === "number");
  const stats = useMemo(() => {
    if (!results || !numericCol) return null;
    const vals = results.map(r => Number(r[numericCol.key] ?? 0)).filter(v => !isNaN(v));
    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { total: sum, avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals), count: vals.length };
  }, [results, numericCol]);

  const exportExcel = () => {
    if (!results) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Informe");
    XLSX.writeFile(wb, `${reportName || "informe"}.xlsx`);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!reportName.trim()) throw new Error("Nombre requerido");
      const { error } = await supabase.from("custom_reports" as any).insert({
        restaurant_id: restaurantId!,
        name: reportName.trim(),
        data_source: dataSource,
        columns_config: selectedCols,
        filters_config: filters,
        sort_field: sortField || null,
        sort_direction: sortDir,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-reports"] });
      toast.success("Informe guardado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const loadReport = (r: any) => {
    setReportName(r.name);
    setDataSource(r.data_source);
    setSelectedCols(r.columns_config || []);
    setFilters(r.filters_config || []);
    setSortField(r.sort_field || "");
    setSortDir(r.sort_direction || "desc");
    setResults(null);
    setTab("builder");
  };

  const deleteReportMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_reports" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-reports"] });
      toast.success("Informe eliminado");
    },
  });

  const formatCell = (value: any, type: string) => {
    if (value == null) return "—";
    if (type === "money") return formatCOP(value);
    if (type === "number") return formatNumber(value, 2);
    if (type === "date") return String(value).substring(0, 10);
    return String(value);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">Informes Personalizados</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="builder">Constructor</TabsTrigger>
            <TabsTrigger value="saved">Mis Informes ({savedReports.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="saved">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Columnas</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedReports.map((r: any) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => loadReport(r)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{DATA_SOURCES[r.data_source]?.label || r.data_source}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(r.columns_config || []).length || "Todas"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteReportMutation.mutate(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {savedReports.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No hay informes guardados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="builder">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left panel - Builder */}
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div><Label>Nombre del informe</Label><Input value={reportName} onChange={e => setReportName(e.target.value)} placeholder="Mi informe" /></div>
                    <div>
                      <Label>Fuente de datos</Label>
                      <Select value={dataSource} onValueChange={v => { setDataSource(v); setSelectedCols([]); setFilters([]); setSortField(""); setResults(null); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(DATA_SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Columnas</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {source.columns.map(c => (
                      <div key={c.key} className="flex items-center gap-2">
                        <Checkbox checked={selectedCols.includes(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                        <Label className="text-sm cursor-pointer" onClick={() => toggleCol(c.key)}>{c.label}</Label>
                      </div>
                    ))}
                    {selectedCols.length === 0 && <p className="text-xs text-muted-foreground">Sin selección = todas</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Filtros</CardTitle>
                      <Button variant="ghost" size="sm" onClick={addFilter}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {filters.map((f, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Select value={f.field} onValueChange={v => updateFilter(i, "field", v)}>
                          <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{source.columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={f.operator} onValueChange={v => updateFilter(i, "operator", v)}>
                          <SelectTrigger className="w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="flex-1 text-xs" value={f.value} onChange={e => updateFilter(i, "value", e.target.value)} placeholder="Valor" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFilter(i)}><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    {filters.length === 0 && <p className="text-xs text-muted-foreground">Sin filtros</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Ordenar por</Label>
                        <Select value={sortField} onValueChange={setSortField}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="Campo" /></SelectTrigger>
                          <SelectContent>{source.columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Dirección</Label>
                        <Select value={sortDir} onValueChange={setSortDir}>
                          <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asc">Ascendente</SelectItem>
                            <SelectItem value="desc">Descendente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button className="flex-1 gap-1" onClick={generate} disabled={loading}>
                    <Play className="h-4 w-4" />{loading ? "Generando..." : "Generar Informe"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => saveMutation.mutate()} disabled={!reportName.trim()} title="Guardar">
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Right panel - Results */}
              <div className="lg:col-span-2 space-y-4">
                {stats && (
                  <div className="grid grid-cols-4 gap-2">
                    <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Registros</p><p className="font-bold">{formatNumber(stats.count)}</p></CardContent></Card>
                    <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="font-bold text-sm">{numericCol?.type === "money" ? formatCOP(stats.total) : formatNumber(stats.total, 2)}</p></CardContent></Card>
                    <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Promedio</p><p className="font-bold text-sm">{numericCol?.type === "money" ? formatCOP(stats.avg) : formatNumber(stats.avg, 2)}</p></CardContent></Card>
                    <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Min / Max</p><p className="font-bold text-sm">{numericCol?.type === "money" ? `${formatCOP(stats.min)} — ${formatCOP(stats.max)}` : `${formatNumber(stats.min, 2)} — ${formatNumber(stats.max, 2)}`}</p></CardContent></Card>
                  </div>
                )}

                {results && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{results.length} registro{results.length !== 1 ? "s" : ""}</p>
                    <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1"><Download className="h-3.5 w-3.5" />Excel</Button>
                  </div>
                )}

                <ScrollArea className="h-[500px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {displayCols.map(c => <TableHead key={c.key} className={c.type === "money" || c.type === "number" ? "text-right" : ""}>{c.label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(results || []).map((row: any, i: number) => (
                        <TableRow key={i}>
                          {displayCols.map(c => (
                            <TableCell key={c.key} className={`text-sm ${c.type === "money" || c.type === "number" ? "text-right font-mono" : ""}`}>
                              {formatCell(row[c.key], c.type)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {results && results.length === 0 && (
                        <TableRow><TableCell colSpan={displayCols.length} className="text-center text-muted-foreground py-8">Sin resultados</TableCell></TableRow>
                      )}
                      {!results && (
                        <TableRow>
                          <TableCell colSpan={displayCols.length} className="text-center text-muted-foreground py-12">
                            <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            Configura y genera tu informe
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
