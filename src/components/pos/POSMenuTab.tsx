import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, PackagePlus } from "lucide-react";
import BulkImportMenuDialog from "./BulkImportMenuDialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fuzzyMatch } from "@/lib/search-utils";

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
        .select("id, name, barcode")
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
        .select("id, name, recipe_type")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Menú Comercial</h2>
        <div className="flex gap-2">
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline"><PackagePlus className="h-4 w-4 mr-1" />Importar desde inventario</Button>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Código</TableHead>
            <TableHead className="text-right">Precio</TableHead>
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
              <TableCell className="text-right">${Number(item.price).toLocaleString()}</TableCell>
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
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay ítems</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

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

            {/* Product linking */}
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

            {/* Recipe linking */}
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
    </div>
  );
}
