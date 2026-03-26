import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, PackagePlus, Zap, Percent } from "lucide-react";
import { toast } from "sonner";
import { fuzzyMatch } from "@/lib/search-utils";
import { formatCOP } from "@/lib/utils";

const MENU_CATEGORIES = ["Desayuno", "Almuerzo", "Cena", "Lonches", "Bebidas", "Snacks", "A la carta", "Postres", "General"];

interface SelectedProduct {
  productId: string;
  name: string;
  barcode: string | null;
  category: string;
  price: string;
  cost: number;
}

function calcSuggestedPrice(cost: number, marginPct: number): number {
  if (cost <= 0 || marginPct >= 100) return 0;
  return Math.ceil(cost / (1 - marginPct / 100));
}

function getProductCost(p: any): number {
  const avg = Number(p.average_cost ?? 0);
  const last = Number(p.last_unit_cost ?? 0);
  return avg > 0 ? avg : last;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkImportMenuDialog({ open, onOpenChange }: Props) {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [defaultCategory, setDefaultCategory] = useState("General");
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(new Map());
  const [marginPct, setMarginPct] = useState(20);

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-bulk-import", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, barcode, category_id, average_cost, last_unit_cost, categories(name)")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId && open,
  });

  const { data: existingLinked = [] } = useQuery({
    queryKey: ["existing-linked-products", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("linked_product_id")
        .eq("restaurant_id", restaurantId!)
        .not("linked_product_id", "is", null);
      if (error) throw error;
      return (data || []).map((d: any) => d.linked_product_id);
    },
    enabled: !!restaurantId && open,
  });

  const existingSet = useMemo(() => new Set(existingLinked), [existingLinked]);

  const inventoryCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p: any) => {
      if (p.categories?.name) cats.add(p.categories.name);
    });
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      if (existingSet.has(p.id)) return false;
      if (filterCat !== "all" && (p.categories?.name || "") !== filterCat) return false;
      if (search && !fuzzyMatch(`${p.name} ${p.barcode || ""}`, search)) return false;
      return true;
    });
  }, [products, existingSet, filterCat, search]);

  const toggleProduct = (p: any) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        const cost = getProductCost(p);
        const suggested = calcSuggestedPrice(cost, marginPct);
        next.set(p.id, {
          productId: p.id,
          name: p.name,
          barcode: p.barcode,
          category: defaultCategory,
          price: suggested > 0 ? String(suggested) : "",
          cost,
        });
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredProducts.length) {
      setSelected(new Map());
    } else {
      const next = new Map<string, SelectedProduct>();
      filteredProducts.forEach((p: any) => {
        const cost = getProductCost(p);
        const suggested = calcSuggestedPrice(cost, marginPct);
        next.set(p.id, selected.get(p.id) || {
          productId: p.id,
          name: p.name,
          barcode: p.barcode,
          category: defaultCategory,
          price: suggested > 0 ? String(suggested) : "",
          cost,
        });
      });
      setSelected(next);
    }
  };

  const recalculateAllPrices = () => {
    setSelected(prev => {
      const next = new Map(prev);
      next.forEach((item, id) => {
        const suggested = calcSuggestedPrice(item.cost, marginPct);
        if (suggested > 0) next.set(id, { ...item, price: String(suggested) });
      });
      return next;
    });
  };

  const updatePrice = (productId: string, price: string) => {
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(productId);
      if (item) next.set(productId, { ...item, price });
      return next;
    });
  };

  const updateCategory = (productId: string, category: string) => {
    setSelected(prev => {
      const next = new Map(prev);
      const item = next.get(productId);
      if (item) next.set(productId, { ...item, category });
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const items = Array.from(selected.values());
      if (items.length === 0) throw new Error("Selecciona al menos un producto");

      const payload = items.map(item => ({
        restaurant_id: restaurantId!,
        name: item.name,
        category: item.category,
        price: parseFloat(item.price) || 0,
        active: true,
        barcode: item.barcode || null,
        item_type: "direct_product",
        linked_product_id: item.productId,
      }));

      const { error } = await supabase.from("menu_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      const count = selected.size;
      qc.invalidateQueries({ queryKey: ["menu-items"] });
      toast.success(`${count} producto${count > 1 ? "s" : ""} importado${count > 1 ? "s" : ""} al menú`);
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message || "Error al importar"),
  });

  const closeDialog = () => {
    onOpenChange(false);
    setSearch("");
    setFilterCat("all");
    setSelected(new Map());
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && closeDialog()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Importar Productos desde Inventario
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Selecciona productos de inventario para agregarlos como ítems de venta directa en el POS.
            {existingSet.size > 0 && (
              <span className="ml-1">({existingSet.size} ya vinculados, ocultos)</span>
            )}
          </p>
        </DialogHeader>

        {/* Profit margin panel */}
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Percent className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium">% de Utilidad sobre precio de venta</span>
              <div className="flex items-center gap-1">
                <span className="text-sm">Utilidad:</span>
                <Input
                  type="number"
                  min={1} max={90}
                  value={marginPct}
                  onChange={e => setMarginPct(Math.max(1, Math.min(90, Number(e.target.value))))}
                  className="w-20 h-8 text-center font-bold"
                />
                <span className="text-sm font-bold">%</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Ej: costo {formatCOP(1000)} → precio {formatCOP(calcSuggestedPrice(1000, marginPct))}
              </span>
              {selected.size > 0 && (
                <Button variant="outline" size="sm" onClick={recalculateAllPrices} className="gap-1 ml-auto">
                  <Zap className="h-3.5 w-3.5" />
                  Recalcular {selected.size} precios
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs">Buscar producto</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre o código..." className="pl-8 h-9" />
            </div>
          </div>
          <div className="w-[160px]">
            <Label className="text-xs">Cat. inventario</Label>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {inventoryCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <Label className="text-xs">Cat. POS por defecto</Label>
            <Select value={defaultCategory} onValueChange={setDefaultCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 min-h-0 border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredProducts.length > 0 && selected.size === filteredProducts.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Cat. inv.</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="w-[120px]">Cat. POS</TableHead>
                <TableHead className="text-right w-[100px]">Sugerido</TableHead>
                <TableHead className="w-[100px]">Precio venta</TableHead>
                <TableHead className="w-[70px]">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p: any) => {
                const isSelected = selected.has(p.id);
                const item = selected.get(p.id);
                const cost = getProductCost(p);
                const suggested = calcSuggestedPrice(cost, marginPct);
                const priceNum = parseFloat(item?.price || "0");
                const realMargin = priceNum > 0 && cost > 0 ? ((priceNum - cost) / priceNum) * 100 : -1;
                return (
                  <TableRow key={p.id} className={isSelected ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleProduct(p)} />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{p.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.barcode || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{p.categories?.name || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{cost > 0 ? formatCOP(cost) : "—"}</TableCell>
                    <TableCell>
                      {isSelected ? (
                        <Select value={item?.category || defaultCategory} onValueChange={v => updateCategory(p.id, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{defaultCategory}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-amber-600 font-medium">
                      {suggested > 0 ? formatCOP(suggested) : "—"}
                    </TableCell>
                    <TableCell>
                      {isSelected ? (
                        <Input
                          type="number"
                          min={0}
                          value={item?.price || ""}
                          onChange={e => updatePrice(p.id, e.target.value)}
                          placeholder="0"
                          className="h-7 text-xs w-full"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSelected && realMargin >= 0 ? (
                        <Badge variant="outline" className={`text-xs ${realMargin >= 20 ? "text-emerald-600 border-emerald-300" : realMargin >= 10 ? "text-amber-600 border-amber-300" : "text-destructive border-destructive/30"}`}>
                          {realMargin.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {products.length === 0 ? "No hay productos en inventario" : "No hay productos disponibles para importar"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {selected.size > 0 ? (
              <span className="font-medium text-foreground">{selected.size} seleccionado{selected.size > 1 ? "s" : ""}</span>
            ) : (
              "Ningún producto seleccionado"
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={selected.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? "Importando..." : `Importar ${selected.size > 0 ? selected.size : ""} al Menú`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
