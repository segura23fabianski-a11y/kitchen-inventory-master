import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ArrowUpDown, ArrowUp, ArrowDown, Search, Download, Filter, X, Package } from "lucide-react";
import * as XLSX from "xlsx";
import { formatCOP, formatNumber } from "@/lib/utils";

type SortField = "name" | "stock" | "cost" | "value";
type SortDir = "asc" | "desc";

export default function InventoryValue() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterUnit, setFilterUnit] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // all, low, ok, zero
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: products, isLoading } = useQuery({
    queryKey: ["products-value"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, min_stock, category_id, warehouse_id, categories(name), warehouses(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const units = useMemo(() => {
    if (!products) return [];
    const set = new Set(products.map((p) => p.unit));
    return Array.from(set).sort();
  }, [products]);

  const enriched = useMemo(() => {
    if (!products) return [];
    return products.map((p) => ({
      ...p,
      stock: Number(p.current_stock ?? 0),
      cost: Number(p.average_cost ?? 0),
      value: Number(p.current_stock ?? 0) * Number(p.average_cost ?? 0),
      categoryName: (p as any).categories?.name ?? "Sin categoría",
      warehouseName: (p as any).warehouses?.name ?? "Sin almacén",
      isLow: Number(p.current_stock ?? 0) <= Number(p.min_stock ?? 0) && Number(p.current_stock ?? 0) > 0,
      isZero: Number(p.current_stock ?? 0) === 0,
    }));
  }, [products]);

  const filtered = useMemo(() => {
    let data = enriched;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (filterCategory !== "all") data = data.filter((p) => p.category_id === filterCategory);
    if (filterWarehouse !== "all") data = data.filter((p) => p.warehouse_id === filterWarehouse);
    if (filterUnit !== "all") data = data.filter((p) => p.unit === filterUnit);
    if (filterStatus === "low") data = data.filter((p) => p.isLow);
    if (filterStatus === "ok") data = data.filter((p) => !p.isLow && !p.isZero);
    if (filterStatus === "zero") data = data.filter((p) => p.isZero);

    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "stock") cmp = a.stock - b.stock;
      else if (sortField === "cost") cmp = a.cost - b.cost;
      else cmp = a.value - b.value;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [enriched, search, filterCategory, filterWarehouse, filterUnit, filterStatus, sortField, sortDir]);

  const totalValue = useMemo(() => filtered.reduce((s, p) => s + p.value, 0), [filtered]);
  const totalProducts = filtered.length;
  const hasFilters = filterCategory !== "all" || filterWarehouse !== "all" || filterUnit !== "all" || filterStatus !== "all" || search.trim();

  const clearFilters = () => {
    setSearch("");
    setFilterCategory("all");
    setFilterWarehouse("all");
    setFilterUnit("all");
    setFilterStatus("all");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportExcel = () => {
    const rows = filtered.map((p) => ({
      Producto: p.name,
      Categoría: p.categoryName,
      Almacén: p.warehouseName,
      Unidad: p.unit,
      Stock: p.stock,
      "Costo Promedio": p.cost,
      "Valor Inventario": Math.round(p.value),
    }));
    rows.push({ Producto: "TOTAL", Categoría: "", Almacén: "", Unidad: "", Stock: 0, "Costo Promedio": 0, "Valor Inventario": Math.round(totalValue) });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Valor Inventario");
    XLSX.writeFile(wb, `valor_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-heading text-3xl font-bold">Valor del Inventario</h1>
            <p className="text-muted-foreground text-sm">Reporte de costos y valoración actual del inventario</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel}>
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Valor Total del Inventario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">{formatCOP(totalValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Package className="h-4 w-4" /> Productos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">{totalProducts}</p>
              <p className="text-xs text-muted-foreground">{hasFilters ? "filtrados" : "en total"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Costo Promedio por Producto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl font-bold">
                ${totalProducts > 0 ? (totalValue / totalProducts).toLocaleString("es-CO", { maximumFractionDigits: 0 }) : "0"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px]"><Filter className="h-3.5 w-3.5 mr-1 opacity-50" /><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Almacén" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los almacenes</SelectItem>
              {warehouses?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Unidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">Stock OK</SelectItem>
              <SelectItem value="low">Stock Bajo</SelectItem>
              <SelectItem value="zero">Sin Stock</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                    Producto <SortIcon field="name" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                <TableHead className="hidden md:table-cell">Almacén</TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("stock")}>
                    Stock <SortIcon field="stock" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("cost")}>
                    CPP <SortIcon field="cost" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("value")}>
                    Valor <SortIcon field="value" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin productos</TableCell></TableRow>
              ) : (
                <>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{p.categoryName}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{p.warehouseName}</TableCell>
                      <TableCell>
                        <span className={p.isZero ? "text-destructive" : p.isLow ? "text-warning" : ""}>
                          {formatNumber(p.stock, 2)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{p.unit}</span>
                        {p.isLow && <Badge variant="destructive" className="ml-1 text-[10px] px-1">Bajo</Badge>}
                        {p.isZero && <Badge variant="outline" className="ml-1 text-[10px] px-1">Sin stock</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCOP(p.cost)}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-sm">
                        {formatCOP(p.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={5} className="text-right">TOTAL</TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCOP(totalValue)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
