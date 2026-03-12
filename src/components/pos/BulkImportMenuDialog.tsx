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
import { Search, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { fuzzyMatch } from "@/lib/search-utils";

const MENU_CATEGORIES = ["Desayuno", "Almuerzo", "Cena", "Lonches", "Bebidas", "Snacks", "A la carta", "Postres", "General"];

interface SelectedProduct {
  productId: string;
  name: string;
  barcode: string | null;
  category: string;
  price: string;
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

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-bulk-import", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, barcode, category_id, categories(name)")
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
        next.set(p.id, {
          productId: p.id,
          name: p.name,
          barcode: p.barcode,
          category: defaultCategory,
          price: "",
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
        next.set(p.id, selected.get(p.id) || {
          productId: p.id,
          name: p.name,
          barcode: p.barcode,
          category: defaultCategory,
          price: "",
        });
      });
      setSelected(next);
    }
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

  const selectedArray = Array.from(selected.values());

  return (
    <Dialog open={open} onOpenChange={v => !v && closeDialog()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
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
                <TableHead>Producto inventario</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Cat. inventario</TableHead>
                <TableHead className="w-[130px]">Cat. POS</TableHead>
                <TableHead className="w-[110px]">Precio venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p: any) => {
                const isSelected = selected.has(p.id);
                const item = selected.get(p.id);
                return (
                  <TableRow key={p.id} className={isSelected ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleProduct(p)} />
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.barcode || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{p.categories?.name || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {isSelected ? (
                        <Select value={item?.category || defaultCategory} onValueChange={v => updateCategory(p.id, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{defaultCategory}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSelected ? (
                        <Input
                          type="number"
                          min={0}
                          value={item?.price || ""}
                          onChange={e => updatePrice(p.id, e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs w-full"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {products.length === 0 ? "No hay productos en inventario" : "No hay productos disponibles para importar"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

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
