import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpDown, Search, ChefHat, Layers,
  Calendar, AlertTriangle, CheckCircle, ArrowLeft,
} from "lucide-react";

interface Props {
  restaurantId: string;
}

export default function RecipeCostAnalysis({ restaurantId }: Props) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "deviation" | "last_date">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, last_unit_cost").order("name");
      if (error) throw error;
      return data;
    },
  });

  const productMap = useMemo(() => new Map(products?.map((p) => [p.id, p]) ?? []), [products]);

  const { data: recipes } = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*, recipe_ingredients(id, product_id, quantity, unit)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: comboLogs } = useQuery({
    queryKey: ["combo-execution-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_execution_logs" as any)
        .select("*")
        .order("executed_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: comboItems } = useQuery({
    queryKey: ["combo-execution-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("combo_execution_items" as any)
        .select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: variableComponents } = useQuery({
    queryKey: ["recipe-variable-components"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_variable_components" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: productionRuns } = useQuery({
    queryKey: ["recipe-production-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipe_production_runs")
        .select("*")
        .order("production_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getProductCost = (productId: string): number => {
    const prod = productMap.get(productId);
    if (!prod) return 0;
    const avg = Number(prod.average_cost ?? 0);
    if (avg > 0) return avg;
    return Number((prod as any).last_unit_cost ?? 0);
  };

  const calcRecipeTheoreticalCost = (ings: { product_id: string; quantity: number; unit: string }[]) => {
    return ings.reduce((sum, item) => {
      const prod = productMap.get(item.product_id);
      if (!prod) return sum;
      const cost = getProductCost(item.product_id);
      const qtyInProductUnit = convertToProductUnit(item.quantity, item.unit, prod.unit);
      return sum + cost * qtyInProductUnit;
    }, 0);
  };

  // Build summary rows
  const summaryRows = useMemo(() => {
    if (!recipes) return [];

    return recipes.map((recipe) => {
      const rMode = ((recipe as any).recipe_mode ?? "fixed") as string;
      const rType = ((recipe as any).recipe_type ?? "food") as string;
      const ings = (recipe.recipe_ingredients ?? []).map((ri) => ({
        product_id: ri.product_id,
        quantity: Number(ri.quantity),
        unit: (ri as any).unit ?? productMap.get(ri.product_id)?.unit ?? "unidad",
      }));

      let theoreticalUnitCost = 0;
      let lastRealUnitCost: number | null = null;
      let avgRealUnitCost: number | null = null;
      let totalProduced = 0;
      let lastProductionDate: string | null = null;
      let executionCount = 0;

      if (rMode === "variable_combo") {
        // Use combo execution logs
        const logs = comboLogs?.filter((l: any) => l.recipe_id === recipe.id) ?? [];
        executionCount = logs.length;
        if (logs.length > 0) {
          const costs = logs.map((l: any) => Number(l.unit_cost));
          avgRealUnitCost = costs.reduce((a, b) => a + b, 0) / costs.length;
          lastRealUnitCost = Number(logs[0].unit_cost);
          totalProduced = logs.reduce((s: number, l: any) => s + Number(l.servings), 0);
          lastProductionDate = logs[0].executed_at;
        }
        // Theoretical from average_component_cost sum
        const recipeComponents = variableComponents?.filter((vc: any) => vc.recipe_id === recipe.id) ?? [];
        theoreticalUnitCost = recipeComponents.reduce((s: number, vc: any) => s + Number(vc.average_component_cost ?? 0), 0);
      } else {
        // Fixed recipe
        theoreticalUnitCost = calcRecipeTheoreticalCost(ings);
        
        // Use production runs
        const runs = productionRuns?.filter((r) => r.recipe_id === recipe.id) ?? [];
        executionCount = runs.length;
        if (runs.length > 0) {
          const costs = runs.map((r) => Number(r.actual_unit_cost));
          avgRealUnitCost = costs.reduce((a, b) => a + b, 0) / costs.length;
          lastRealUnitCost = Number(runs[0].actual_unit_cost);
          totalProduced = runs.reduce((s, r) => s + Number(r.quantity_produced), 0);
          lastProductionDate = runs[0].production_date;
        }
      }

      const deviation = lastRealUnitCost !== null ? lastRealUnitCost - theoreticalUnitCost : null;
      const deviationPct = theoreticalUnitCost > 0 && deviation !== null
        ? (deviation / theoreticalUnitCost) * 100
        : null;

      return {
        id: recipe.id,
        name: recipe.name,
        recipeType: rType,
        recipeMode: rMode,
        theoreticalUnitCost,
        lastRealUnitCost,
        avgRealUnitCost,
        totalProduced,
        lastProductionDate,
        deviation,
        deviationPct,
        executionCount,
      };
    });
  }, [recipes, comboLogs, productionRuns, productMap, variableComponents]);

  const filteredRows = useMemo(() => {
    let rows = summaryRows.filter((r) =>
      r.name.toLowerCase().includes(search.toLowerCase())
    );
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "deviation") cmp = (a.deviation ?? 0) - (b.deviation ?? 0);
      else if (sortKey === "last_date") cmp = (a.lastProductionDate ?? "").localeCompare(b.lastProductionDate ?? "");
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [summaryRows, search, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const formatCost = (cost: number | null) => {
    if (cost === null) return "—";
    if (cost === 0) return "$0";
    return `$${cost.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const selectedRow = summaryRows.find((r) => r.id === selectedRecipeId);

  // Totals
  const totalRecipes = summaryRows.length;
  const withData = summaryRows.filter((r) => r.executionCount > 0);
  const avgDeviation = withData.length > 0
    ? withData.reduce((s, r) => s + (r.deviation ?? 0), 0) / withData.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">Total Recetas</p>
            <p className="font-heading text-2xl font-bold">{totalRecipes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">Con datos reales</p>
            <p className="font-heading text-2xl font-bold">{withData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">Sin ejecuciones</p>
            <p className="font-heading text-2xl font-bold">{totalRecipes - withData.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4 text-center">
            <p className="text-xs text-muted-foreground">Desviación prom.</p>
            <p className={`font-heading text-2xl font-bold ${avgDeviation > 0 ? "text-destructive" : avgDeviation < 0 ? "text-green-600" : ""}`}>
              {formatCost(avgDeviation)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Buscar receta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("name")}>
                  Receta <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-right">Teórico Unit.</TableHead>
              <TableHead className="text-right">Último Real Unit.</TableHead>
              <TableHead className="text-right">Promedio Real</TableHead>
              <TableHead className="text-right">Producido</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("last_date")}>
                  Última Prod. <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort("deviation")}>
                  Desviación <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Sin recetas encontradas
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRecipeId(row.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {row.recipeMode === "variable_combo"
                        ? <Layers className="h-4 w-4 text-purple-600 shrink-0" />
                        : <ChefHat className="h-4 w-4 text-primary shrink-0" />}
                      <span className="truncate max-w-[200px]">{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {row.recipeMode === "variable_combo" ? "Combo" : "Fija"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCost(row.theoreticalUnitCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCost(row.lastRealUnitCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCost(row.avgRealUnitCost)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.totalProduced > 0 ? row.totalProduced : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.lastProductionDate
                      ? format(new Date(row.lastProductionDate), "dd/MM/yy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {row.deviation !== null && row.theoreticalUnitCost > 0 ? (
                      <div className="flex items-center gap-1">
                        {row.deviation > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-destructive" />
                        ) : row.deviation < 0 ? (
                          <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        )}
                        <span className={`text-sm font-mono ${row.deviation > 0 ? "text-destructive" : row.deviation < 0 ? "text-green-600" : ""}`}>
                          {row.deviation > 0 ? "+" : ""}{formatCost(row.deviation)}
                        </span>
                        {row.deviationPct !== null && (
                          <span className="text-xs text-muted-foreground">
                            ({row.deviationPct > 0 ? "+" : ""}{row.deviationPct.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    ) : row.executionCount > 0 && row.theoreticalUnitCost === 0 ? (
                      <span className="text-xs text-muted-foreground">Sin teórico</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin datos</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <RecipeDetailDialog
        recipeId={selectedRecipeId}
        row={selectedRow ?? null}
        comboLogs={comboLogs ?? []}
        comboItems={comboItems ?? []}
        productionRuns={productionRuns ?? []}
        productMap={productMap}
        variableComponents={variableComponents ?? []}
        onClose={() => setSelectedRecipeId(null)}
      />
    </div>
  );
}

// ---------- Detail dialog ----------
function RecipeDetailDialog({
  recipeId,
  row,
  comboLogs,
  comboItems,
  productionRuns,
  productMap,
  onClose,
}: {
  recipeId: string | null;
  row: any;
  comboLogs: any[];
  comboItems: any[];
  productionRuns: any[];
  productMap: Map<string, any>;
  onClose: () => void;
}) {
  if (!recipeId || !row) return null;

  const isCombo = row.recipeMode === "variable_combo";

  // Get historical data
  const logs = isCombo
    ? comboLogs.filter((l) => l.recipe_id === recipeId)
    : [];
  const runs = !isCombo
    ? productionRuns.filter((r) => r.recipe_id === recipeId)
    : [];

  const itemsByLog = useMemo(() => {
    const map = new Map<string, any[]>();
    comboItems.forEach((item) => {
      const arr = map.get(item.execution_id) || [];
      arr.push(item);
      map.set(item.execution_id, arr);
    });
    return map;
  }, [comboItems]);

  const formatCost = (cost: number | null) => {
    if (cost === null || cost === undefined) return "—";
    return `$${Number(cost).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const historyEntries = isCombo
    ? logs.map((l: any) => {
        const logItems = itemsByLog.get(l.id) ?? [];
        // Calculate theoretical total from component average costs if available
        const recipeComponents = variableComponents?.filter((vc: any) => vc.recipe_id === recipeId) ?? [];
        const theoreticalUnit = recipeComponents.reduce((s: number, vc: any) => s + Number(vc.average_component_cost ?? 0), 0);
        return {
          date: l.executed_at,
          qty: Number(l.servings),
          theoreticalTotal: theoreticalUnit > 0 ? theoreticalUnit * Number(l.servings) : null,
          realTotal: Number(l.total_cost),
          theoreticalUnit: theoreticalUnit > 0 ? theoreticalUnit : null,
          realUnit: Number(l.unit_cost),
          source: "Kiosco Cocina",
          items: logItems,
        };
      })
    : runs.map((r: any) => ({
        date: r.production_date,
        qty: Number(r.quantity_produced),
        theoreticalTotal: Number(r.theoretical_total_cost),
        realTotal: Number(r.actual_total_cost),
        theoreticalUnit: Number(r.theoretical_unit_cost),
        realUnit: Number(r.actual_unit_cost),
        source: "Producción",
        items: [] as any[],
      }));

  return (
    <Dialog open={!!recipeId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {isCombo ? <Layers className="h-5 w-5 text-purple-600" /> : <ChefHat className="h-5 w-5 text-primary" />}
            {row.name}
            <Badge variant="outline" className="text-xs">{isCombo ? "Combo Variable" : "Receta Fija"}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Cost summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {row.theoreticalUnitCost > 0 && (
            <Card>
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <p className="text-xs text-muted-foreground">Teórico Unit.</p>
                <p className="font-heading text-lg font-bold">{formatCost(row.theoreticalUnitCost)}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-3 pb-2 px-3 text-center">
              <p className="text-xs text-muted-foreground">Último Real Unit.</p>
              <p className="font-heading text-lg font-bold">{formatCost(row.lastRealUnitCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2 px-3 text-center">
              <p className="text-xs text-muted-foreground">Promedio Real</p>
              <p className="font-heading text-lg font-bold">{formatCost(row.avgRealUnitCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2 px-3 text-center">
              <p className="text-xs text-muted-foreground">Total Producido</p>
              <p className="font-heading text-lg font-bold">{row.totalProduced}</p>
            </CardContent>
          </Card>
          {row.theoreticalUnitCost > 0 && row.deviation !== null && (
            <Card>
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <p className="text-xs text-muted-foreground">Desviación</p>
                <p className={`font-heading text-lg font-bold ${(row.deviation ?? 0) > 0 ? "text-destructive" : "text-green-600"}`}>
                  {row.deviation > 0 ? "+" : ""}{formatCost(row.deviation)}
                  {row.deviationPct !== null && (
                    <span className="text-sm font-normal ml-1">({row.deviationPct > 0 ? "+" : ""}{row.deviationPct.toFixed(1)}%)</span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History table */}
        <div className="space-y-2">
          <h3 className="font-heading text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Historial de Ejecuciones ({historyEntries.length})
          </h3>

          {historyEntries.length === 0 ? (
            <div className="rounded-md bg-muted p-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
              Sin ejecuciones registradas para esta receta
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    {!isCombo && <TableHead className="text-right">Teórico Total</TableHead>}
                    <TableHead className="text-right">Real Total</TableHead>
                    {!isCombo && <TableHead className="text-right">Teórico Unit.</TableHead>}
                    <TableHead className="text-right">Real Unit.</TableHead>
                    <TableHead>Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyEntries.map((entry, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">
                        {format(new Date(entry.date), "dd/MM/yyyy HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right font-mono">{entry.qty}</TableCell>
                      {!isCombo && <TableCell className="text-right font-mono text-sm">{formatCost(entry.theoreticalTotal)}</TableCell>}
                      <TableCell className="text-right font-mono text-sm">{formatCost(entry.realTotal)}</TableCell>
                      {!isCombo && <TableCell className="text-right font-mono text-sm">{formatCost(entry.theoreticalUnit)}</TableCell>}
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatCost(entry.realUnit)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{entry.source}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Combo detail: show items for each execution */}
          {isCombo && historyEntries.length > 0 && (
            <div className="space-y-2 mt-4">
              <h3 className="font-heading text-sm font-semibold">Detalle de componentes por ejecución</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {historyEntries.slice(0, 10).map((entry, idx) => (
                  entry.items.length > 0 && (
                    <div key={idx} className="rounded-md border p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {format(new Date(entry.date), "dd/MM/yyyy HH:mm")} — {entry.qty} servicios — {formatCost(entry.realUnit)}/u
                      </p>
                      {entry.items.map((item: any, j: number) => {
                        const prod = productMap.get(item.product_id);
                        return (
                          <div key={j} className="flex items-center justify-between text-xs">
                            <span>
                              <span className="font-medium capitalize">{item.component_name}</span>
                              {" → "}{prod?.name ?? "?"}
                            </span>
                            <span className="font-mono">{formatCost(Number(item.line_cost))}</span>
                          </div>
                        );
                      })}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
