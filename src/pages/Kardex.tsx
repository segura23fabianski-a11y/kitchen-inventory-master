import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, ArrowLeft, CalendarIcon, Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";

type MovementType = "entrada" | "salida" | "ajuste" | "operational_consumption" | "pos_sale";

const typeLabels: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  pos_sale: "Venta POS",
  ajuste: "Ajuste",
  operational_consumption: "Consumo Operativo",
  merma: "Merma",
  desperdicio: "Desperdicio",
  vencimiento: "Vencimiento",
  daño: "Daño",
  transformacion: "Transformación",
};

const typeBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  entrada: "default",
  salida: "destructive",
  pos_sale: "destructive",
  ajuste: "secondary",
  operational_consumption: "outline",
  merma: "secondary",
  desperdicio: "destructive",
  vencimiento: "outline",
  daño: "default",
  transformacion: "outline",
};

function getDocumentOrigin(mov: any, recipesMap: Map<string, string>, servicesMap: Map<string, string>): string {
  if (mov.recipe_id && recipesMap.has(mov.recipe_id)) return `Receta: ${recipesMap.get(mov.recipe_id)}`;
  if (mov.service_id && servicesMap.has(mov.service_id)) return `Servicio: ${servicesMap.get(mov.service_id)}`;
  if (mov.type === "ajuste") return "Ajuste manual";
  if (mov.notes?.toLowerCase().includes("factura")) return mov.notes;
  return mov.notes || "—";
}

export default function Kardex() {
  const { productId: paramProductId } = useParams<{ productId?: string }>();
  const navigate = useNavigate();

  const [selectedProductId, setSelectedProductId] = useState<string>(paramProductId || "");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  const activeProductId = paramProductId || selectedProductId;

  // Queries
  const { data: products } = useQuery({
    queryKey: ["products-kardex"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, current_stock, average_cost, last_unit_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements, isLoading } = useQuery({
    queryKey: ["kardex-movements", activeProductId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, movement_date, created_at, type, quantity, unit_cost, total_cost, notes, user_id, recipe_id, service_id")
        .eq("product_id", activeProductId)
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!activeProductId,
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ["recipes-map"],
    queryFn: async () => {
      const { data } = await supabase.from("recipes").select("id, name");
      return data ?? [];
    },
  });

  const { data: services } = useQuery({
    queryKey: ["services-map"],
    queryFn: async () => {
      const { data } = await supabase.from("operational_services").select("id, name");
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []), [profiles]);
  const recipesMap = useMemo(() => new Map(recipes?.map((r) => [r.id, r.name]) ?? []), [recipes]);
  const servicesMap = useMemo(() => new Map(services?.map((s) => [s.id, s.name]) ?? []), [services]);

  const selectedProduct = products?.find((p) => p.id === activeProductId);

  // Filtered & computed rows with running balance
  const kardexRows = useMemo(() => {
    if (!movements) return [];

    let filtered = movements;

    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      filtered = filtered.filter((m) => m.movement_date >= fromStr);
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setDate(d.getDate() + 1);
      const toStr = format(d, "yyyy-MM-dd");
      filtered = filtered.filter((m) => m.movement_date < toStr);
    }
    if (filterType !== "all") {
      filtered = filtered.filter((m) => m.type === filterType);
    }

    // Calculate running balance from ALL movements (not filtered) up to each point
    // First build a full running balance map
    let runningBalance = 0;
    const balanceAfter = new Map<string, number>();
    for (const m of movements) {
      if (m.type === "entrada") {
        runningBalance += Number(m.quantity);
      } else if (m.type === "salida" || m.type === "operational_consumption") {
        runningBalance -= Number(m.quantity);
      } else if (m.type === "ajuste") {
        runningBalance = Number(m.quantity);
      }
      balanceAfter.set(m.id, runningBalance);
    }

    return filtered.map((m) => {
      const isEntry = m.type === "entrada";
      const isExit = m.type === "salida" || m.type === "operational_consumption";
      const entrada = isEntry ? Number(m.quantity) : 0;
      const salida = isExit ? Number(m.quantity) : 0;

      return {
        id: m.id,
        fecha: m.movement_date,
        tipo: m.type,
        documento: getDocumentOrigin(m, recipesMap, servicesMap),
        entrada,
        salida,
        ajuste: m.type === "ajuste" ? Number(m.quantity) : null,
        costoUnitario: Number(m.unit_cost),
        costoTotal: Number(m.total_cost),
        saldo: balanceAfter.get(m.id) ?? 0,
        usuario: profileMap.get(m.user_id) || "—",
      };
    });
  }, [movements, dateFrom, dateTo, filterType, profileMap, recipesMap, servicesMap]);

  const exportToExcel = () => {
    if (!kardexRows.length || !selectedProduct) return;
    const wsData = kardexRows.map((r) => ({
      Fecha: format(new Date(r.fecha), "dd/MM/yyyy HH:mm", { locale: es }),
      Tipo: typeLabels[r.tipo] || r.tipo,
      Documento: r.documento,
      Entrada: r.entrada || "",
      Salida: r.salida || "",
      Ajuste: r.ajuste ?? "",
      "Costo Unitario": r.costoUnitario,
      "Costo Total": r.costoTotal,
      "Saldo Acumulado": r.saldo,
      Usuario: r.usuario,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kardex");
    XLSX.writeFile(wb, `Kardex_${selectedProduct.name.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterType("all");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">Kardex de Inventario</h1>
              <p className="text-sm text-muted-foreground">Historial completo de movimientos por producto</p>
            </div>
          </div>
          {kardexRows.length > 0 && (
            <Button onClick={exportToExcel} variant="outline" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
          )}
        </div>

        {/* Product selector (only if no param) */}
        {!paramProductId && (
          <Card>
            <CardContent className="pt-6">
              <div className="max-w-md">
                <label className="text-sm font-medium text-foreground mb-2 block">Seleccionar Producto</label>
                <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                      {selectedProduct?.name || "Buscar producto..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Buscar producto..." />
                      <CommandList>
                        <CommandEmpty>No encontrado.</CommandEmpty>
                        <CommandGroup>
                          {products?.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.name}
                              onSelect={() => {
                                setSelectedProductId(p.id);
                                setProductPopoverOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", activeProductId === p.id ? "opacity-100" : "opacity-0")} />
                              {p.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Product summary */}
        {selectedProduct && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Producto</p>
                <p className="font-heading font-semibold text-foreground truncate">{selectedProduct.name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Stock Actual</p>
                <p className="font-heading text-lg font-bold text-foreground">
                  {Number(selectedProduct.current_stock).toLocaleString("es-CO")} {selectedProduct.unit}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Costo Promedio</p>
                <p className="font-heading text-lg font-bold text-foreground">
                  ${Number(selectedProduct.average_cost).toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Último Costo</p>
                <p className="font-heading text-lg font-bold text-foreground">
                  ${Number(selectedProduct.last_unit_cost ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        {activeProductId && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Desde</label>
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left", !dateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Inicio"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); }} className="p-3 pointer-events-auto" locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Hasta</label>
                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left", !dateTo && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fin"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setDateToOpen(false); }} className="p-3 pointer-events-auto" locale={es} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="salida">Salida</SelectItem>
                      <SelectItem value="pos_sale">Venta POS</SelectItem>
                      <SelectItem value="ajuste">Ajuste</SelectItem>
                      <SelectItem value="operational_consumption">Consumo Op.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(dateFrom || dateTo || filterType !== "all") && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
                <div className="ml-auto text-sm text-muted-foreground">
                  {kardexRows.length} movimiento{kardexRows.length !== 1 ? "s" : ""}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Kardex table */}
        {activeProductId && (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando movimientos...</div>
              ) : kardexRows.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  {movements?.length === 0 ? "Este producto no tiene movimientos registrados." : "No hay movimientos con los filtros seleccionados."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Documento / Origen</TableHead>
                        <TableHead className="text-right">Entrada</TableHead>
                        <TableHead className="text-right">Salida</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Costo Total</TableHead>
                        <TableHead className="text-right font-semibold">Saldo</TableHead>
                        <TableHead>Usuario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kardexRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {format(new Date(row.fecha), "dd/MM/yyyy HH:mm", { locale: es })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={typeBadgeVariant[row.tipo] || "secondary"} className="text-xs">
                              {typeLabels[row.tipo] || row.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{row.documento}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">
                            {row.entrada > 0 ? `+${row.entrada.toLocaleString("es-CO")}` : ""}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-500">
                            {row.salida > 0 ? `-${row.salida.toLocaleString("es-CO")}` : ""}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.costoUnitario > 0 ? `$${row.costoUnitario.toLocaleString("es-CO", { minimumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.costoTotal > 0 ? `$${row.costoTotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-heading font-semibold">
                            {row.saldo.toLocaleString("es-CO")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.usuario}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!activeProductId && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Selecciona un producto para ver su Kardex
          </div>
        )}
      </div>
    </AppLayout>
  );
}
