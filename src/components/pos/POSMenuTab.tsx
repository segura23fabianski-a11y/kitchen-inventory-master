import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, PackagePlus, Zap, Download, Upload } from "lucide-react";
import BulkImportMenuDialog from "./BulkImportMenuDialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fuzzyMatch } from "@/lib/search-utils";
import { formatCOP } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import * as XLSX from "xlsx";

const MENU_CATEGORIES = ["Desayuno", "Almuerzo", "Cena", "Lonches", "Bebidas", "Snacks", "A la carta", "Postres", "General"];

const ITEM_TYPE_OPTIONS = [
  { value: "simple", label: "Simple (solo POS)" },
  { value: "direct_product", label: "Producto directo (inventario)" },
  { value: "recipe", label: "Receta / Plato" },
  { value: "combo_variable", label: "Combo variable" },
];

const ITEM_TYPE_LABELS: Record<string, string> = {
  simple: "Simple",
  direct_product: "Producto",
  recipe: "Receta",
  combo_variable: "Combo",
};

export default function POSMenuTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [barcode, setBarcode] = useState("");
  const [itemType, setItemType] = useState("simple");
  const [linkedProductId, setLinkedProductId] = useState("");
  const [linkedRecipeId, setLinkedRecipeId] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [profitMargin, setProfitMargin] = useState(20);
  // Excel import state
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [excelRows, setExcelRows] = useState<any[]>([]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["menu-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-menu", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, barcode, average_cost")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-for-menu", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, recipe_type, recipe_ingredients(quantity, products(average_cost))")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const getRecipeCost = (recipeId: string) => {
    const recipe = recipes.find((r: any) => r.id === recipeId);
    if (!recipe || !recipe.recipe_ingredients) return 0;
    return (recipe.recipe_ingredients as any[]).reduce((sum: number, ri: any) => {
      const cost = Number(ri.products?.average_cost ?? 0);
      return sum + Number(ri.quantity) * cost;
    }, 0);
  };

  const getItemCost = (item: any) => {
    if (item.linked_product_id) {
      const p = products.find((pr: any) => pr.id === item.linked_product_id);
      return Number(p?.average_cost ?? 0);
    }
    if (item.linked_recipe_id) return getRecipeCost(item.linked_recipe_id);
    return 0;
  };

  const suggestedPrice = useMemo(() => {
    let cost = 0;
    if (itemType === "direct_product" && linkedProductId) {
      const p = products.find((pr: any) => pr.id === linkedProductId);
      cost = Number(p?.average_cost ?? 0);
    } else if ((itemType === "recipe" || itemType === "combo_variable") && linkedRecipeId) {
      cost = getRecipeCost(linkedRecipeId);
    }
    if (cost <= 0 || profitMargin >= 100) return 0;
    return cost / (1 - profitMargin / 100);
  }, [linkedProductId, linkedRecipeId, itemType, profitMargin, products, recipes]);

  const linkedCost = useMemo(() => {
    if (itemType === "direct_product" && linkedProductId) {
      const p = products.find((pr: any) => pr.id === linkedProductId);
      return Number(p?.average_cost ?? 0);
    }
    if ((itemType === "recipe" || itemType === "combo_variable") && linkedRecipeId) {
      return getRecipeCost(linkedRecipeId);
    }
    return 0;
  }, [linkedProductId, linkedRecipeId, itemType, products, recipes]);

  const filtered = items.filter((item: any) => {
    if (filterCat !== "all" && item.category !== filterCat) return false;
    if (search && !fuzzyMatch(`${item.name} ${item.barcode || ""} ${item.category}`, search)) return false;
    return true;
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        restaurant_id: restaurantId!,
        name: name.trim(),
        category,
        price: parseFloat(price) || 0,
        active,
        barcode: barcode.trim() || null,
        item_type: itemType,
        linked_product_id: itemType === "direct_product" && linkedProductId ? linkedProductId : null,
        linked_recipe_id: (itemType === "recipe" || itemType === "combo_variable") && linkedRecipeId ? linkedRecipeId : null,
      };
      if (editId) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-items"] });
      toast.success(editId ? "Ítem actualizado" : "Ítem creado");
      closeDialog();
    },
    onError: () => toast.error("Error al guardar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-items"] });
      toast.success("Ítem eliminado");
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setName("");
    setCategory("General");
    setPrice("");
    setActive(true);
    setBarcode("");
    setItemType("simple");
    setLinkedProductId("");
    setLinkedRecipeId("");
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setName(item.name);
    setCategory(item.category);
    setPrice(String(item.price));
    setActive(item.active);
    setBarcode(item.barcode || "");
    setItemType(item.item_type || "simple");
    setLinkedProductId(item.linked_product_id || "");
    setLinkedRecipeId(item.linked_recipe_id || "");
    setOpen(true);
  };

  const filteredRecipes = itemType === "combo_variable"
    ? recipes.filter((r: any) => r.recipe_type === "variable_combo")
    : recipes;

  // Excel export
  const exportMenuToExcel = async () => {
    const { data: menuItems } = await supabase
      .from("menu_items")
      .select("id, name, category, price, barcode, active, item_type")
      .eq("restaurant_id", restaurantId!)
      .order("category").order("name");

    if (!menuItems?.length) {
      toast.error("No hay items en el menú para exportar");
      return;
    }

    const rows = menuItems.map(i => ({
      "ID (no editar)": i.id,
      "Nombre": i.name,
      "Categoría POS": i.category,
      "Precio de venta": i.price,
      "Código de barras": i.barcode || "",
      "Activo (SI/NO)": i.active ? "SI" : "NO",
      "Tipo": i.item_type,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Menú POS");
    XLSX.writeFile(wb, "menu_pos_export.xlsx");
    toast.success("Menú exportado correctamente");
  };

  // Excel import handler
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as any[];
      setExcelRows(rows);
    };
    reader.readAsArrayBuffer(file);
  };

  const importFromExcel = useMutation({
    mutationFn: async () => {
      if (!excelRows.length) throw new Error("Sin datos");

      const toProcess = excelRows.map(row => ({
        restaurant_id: restaurantId!,
        name: String(row["Nombre"] || row["name"] || "").trim(),
        category: String(row["Categoría POS"] || row["category"] || "General"),
        price: Number(row["Precio de venta"] || row["price"] || 0),
        barcode: String(row["Código de barras"] || row["barcode"] || "").trim() || null,
        active: String(row["Activo (SI/NO)"] || "SI").toUpperCase() === "SI",
        item_type: String(row["Tipo"] || row["item_type"] || "direct_product"),
      }));

      for (let i = 0; i < excelRows.length; i++) {
        const id = excelRows[i]["ID (no editar)"];
        if (id && typeof id === "string" && id.length > 10) {
          const { error } = await supabase.from("menu_items").update(toProcess[i]).eq("id", id).eq("restaurant_id", restaurantId!);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("menu_items").insert(toProcess[i]);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-items"] });
      toast.success(`${excelRows.length} items procesados correctamente`);
      setExcelImportOpen(false);
      setExcelRows([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Menú Comercial</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportMenuToExcel} size="sm" variant="outline" className="gap-1.5">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={() => setExcelImportOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline"><PackagePlus className="h-4 w-4 mr-1" />Importar inventario</Button>
          <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />Nuevo Ítem</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-[200px]" />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Código</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">% Margen</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((item: any) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {ITEM_TYPE_LABELS[item.item_type] || item.item_type || "Simple"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground font-mono">{item.barcode || "—"}</TableCell>
              <TableCell className="text-right">{formatCOP(item.price)}</TableCell>
              <TableCell className="text-right">
                {(() => {
                  const cost = getItemCost(item);
                  if (cost <= 0 || Number(item.price) <= 0) return <span className="text-muted-foreground">—</span>;
                  const margin = ((Number(item.price) - cost) / Number(item.price) * 100);
                  return (
                    <Badge variant="outline" className={margin >= 20 ? "text-emerald-600 border-emerald-300" : margin >= 10 ? "text-amber-600 border-amber-300" : "text-destructive border-destructive/30"}>
                      {margin.toFixed(1)}%
                    </Badge>
                  );
                })()}
              </TableCell>
              <TableCell>
                <Badge variant={item.active ? "default" : "secondary"}>
                  {item.active ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay ítems</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar Ítem" : "Nuevo Ítem del Menú"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Bandeja carne" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoría</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Precio</Label>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de ítem</Label>
                <Select value={itemType} onValueChange={v => { setItemType(v); setLinkedProductId(""); setLinkedRecipeId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Escanear o escribir" />
              </div>
            </div>

            {itemType === "direct_product" && (
              <div>
                <Label>Producto de inventario</Label>
                <SearchableSelect
                  value={linkedProductId}
                  onValueChange={setLinkedProductId}
                  placeholder="Seleccionar producto..."
                  options={products.map(p => ({ value: p.id, label: p.name, searchTerms: p.barcode || undefined }))}
                />
              </div>
            )}

            {(itemType === "recipe" || itemType === "combo_variable") && (
              <div>
                <Label>{itemType === "combo_variable" ? "Combo / Servicio variable" : "Receta"}</Label>
                <SearchableSelect
                  value={linkedRecipeId}
                  onValueChange={setLinkedRecipeId}
                  placeholder="Seleccionar receta..."
                  options={filteredRecipes.map((r: any) => ({ value: r.id, label: r.name }))}
                />
              </div>
            )}

            {linkedCost > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">% Utilidad</Label>
                    <span className="text-xs font-mono font-bold text-primary">{profitMargin}%</span>
                  </div>
                  <Slider
                    value={[profitMargin]}
                    onValueChange={([v]) => setProfitMargin(v)}
                    min={5} max={80} step={1}
                    className="my-1"
                  />
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Costo</p>
                      <p className="font-mono font-semibold">{formatCOP(linkedCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Utilidad</p>
                      <p className="font-mono font-semibold text-emerald-600">{formatCOP(suggestedPrice - linkedCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sugerido</p>
                      <p className="font-mono font-bold text-primary">{formatCOP(suggestedPrice)}</p>
                    </div>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="w-full gap-1"
                    onClick={() => setPrice(String(Math.round(suggestedPrice)))}
                  >
                    <Zap className="h-3.5 w-3.5" /> Aplicar precio sugerido
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel import dialog */}
      <Dialog open={excelImportOpen} onOpenChange={v => { if (!v) { setExcelImportOpen(false); setExcelRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Importar Menú desde Excel
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Sube un archivo .xlsx con columnas: Nombre, Categoría POS, Precio de venta, Código de barras, Activo (SI/NO).
              Si incluye "ID (no editar)", se actualizarán los ítems existentes.
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <Input type="file" accept=".xlsx,.xls" onChange={handleExcelFile} />

            {excelRows.length > 0 && (
              <>
                <p className="text-sm font-medium">{excelRows.length} registros encontrados — Vista previa:</p>
                <div className="max-h-[300px] overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excelRows.slice(0, 15).map((row, i) => {
                        const hasId = !!(row["ID (no editar)"] && String(row["ID (no editar)"]).length > 10);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">{row["Nombre"] || row["name"] || "—"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row["Categoría POS"] || row["category"] || "General"}</Badge></TableCell>
                            <TableCell className="text-right">{formatCOP(Number(row["Precio de venta"] || row["price"] || 0))}</TableCell>
                            <TableCell className="text-xs font-mono">{row["Código de barras"] || row["barcode"] || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={hasId ? "secondary" : "default"} className="text-xs">
                                {hasId ? "Actualizar" : "Nuevo"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {excelRows.length > 15 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground text-xs">
                            ...y {excelRows.length - 15} registros más
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setExcelImportOpen(false); setExcelRows([]); }}>Cancelar</Button>
            <Button
              onClick={() => importFromExcel.mutate()}
              disabled={excelRows.length === 0 || importFromExcel.isPending}
            >
              {importFromExcel.isPending ? "Procesando..." : `Importar ${excelRows.length} items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkImportMenuDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
