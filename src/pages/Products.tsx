import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet, X, ImageIcon, DollarSign } from "lucide-react";
import CostRevaluationDialog from "@/components/CostRevaluationDialog";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import * as XLSX from "xlsx";

const UNITS = ["unidad", "kg", "g", "litro", "ml", "caja", "bolsa", "paquete"];

interface ProductForm {
  name: string;
  unit: string;
  minStock: string;
  categoryId: string;
  warehouseId: string;
  barcode: string;
  dailyConsumption: string;
  targetDaysOfStock: string;
  reorderMode: string;
}

interface CodeEntry {
  id?: string;
  code: string;
  description: string;
}

const emptyForm: ProductForm = { name: "", unit: "unidad", minStock: "0", categoryId: "", warehouseId: "", barcode: "", dailyConsumption: "", targetDaysOfStock: "5", reorderMode: "min_stock" };

export default function Products() {
  const { hasRole } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("products_create");
  const canUpdate = hasPermission("products_update");
  const canDelete = hasPermission("products_delete");
  const canManage = canCreate || canUpdate;
  const restaurantId = useRestaurantId();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [codes, setCodes] = useState<CodeEntry[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [revalProduct, setRevalProduct] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name), warehouses(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCodes } = useQuery({
    queryKey: ["product-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_codes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const categoryMap = new Map(categories?.map((c) => [c.name.toLowerCase(), c.id]) ?? []);
  const warehouseMap = new Map(warehouses?.map((w) => [w.name.toLowerCase(), w.id]) ?? []);

  const uploadImage = async (productId: string): Promise<string | null> => {
    if (!imageFile || !restaurantId) return existingImageUrl;
    const ext = imageFile.name.split(".").pop();
    const path = `${restaurantId}/${productId}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, imageFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const saveCodes = async (productId: string) => {
    if (!restaurantId) return;
    // Delete existing codes for this product
    await supabase.from("product_codes").delete().eq("product_id", productId);
    // Insert new codes
    const validCodes = codes.filter((c) => c.code.trim());
    if (validCodes.length > 0) {
      const { error } = await supabase.from("product_codes").insert(
        validCodes.map((c) => ({
          product_id: productId,
          code: c.code.trim(),
          description: c.description.trim() || null,
          restaurant_id: restaurantId,
        }))
      );
      if (error) throw error;
    }
  };

  const upsertProduct = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        unit: form.unit,
        min_stock: Number(form.minStock),
        category_id: form.categoryId || null,
        warehouse_id: form.warehouseId || null,
        barcode: form.barcode.trim() || null,
        daily_consumption: form.dailyConsumption ? Number(form.dailyConsumption) : null,
        target_days_of_stock: Number(form.targetDaysOfStock) || 5,
        reorder_mode: form.reorderMode,
      };

      let productId = editId;
      let beforeData: any = null;

      if (editId) {
        // Fetch before state for audit
        const { data: prev } = await supabase.from("products").select("*").eq("id", editId).single();
        beforeData = prev;
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert({ ...payload, restaurant_id: restaurantId! }).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      // Upload image
      const imageUrl = await uploadImage(productId!);
      if (imageUrl !== undefined) {
        await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId!);
      }

      // Save codes
      await saveCodes(productId!);

      // Fetch after state for audit
      const { data: afterData } = await supabase.from("products").select("*").eq("id", productId!).single();

      // Log audit
      await logAudit({
        entityType: "product",
        entityId: productId!,
        action: editId ? "UPDATE" : "CREATE",
        before: beforeData,
        after: afterData,
        canRollback: !!editId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-codes"] });
      closeDialog();
      toast({ title: editId ? "Producto actualizado" : "Producto creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { data: prev } = await supabase.from("products").select("*").eq("id", id).single();
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ entityType: "product", entityId: id, action: "DELETE", before: prev, after: null, canRollback: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-codes"] });
      setDeleteId(null);
      toast({ title: "Producto eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkInsert = useMutation({
    mutationFn: async () => {
      const rows = bulkPreview.map((r) => ({
        name: String(r.nombre).trim(),
        unit: UNITS.includes(String(r.unidad ?? "").toLowerCase()) ? String(r.unidad).toLowerCase() : "unidad",
        min_stock: Number(r.stock_minimo) || 0,
        average_cost: Number(r.costo_promedio) || 0,
        category_id: r.categoria ? (categoryMap.get(String(r.categoria).toLowerCase()) ?? null) : null,
        warehouse_id: r.almacen ? (warehouseMap.get(String(r.almacen).toLowerCase()) ?? null) : null,
      }));
      const { error } = await supabase.from("products").insert(rows.map(r => ({ ...r, restaurant_id: restaurantId! })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setBulkOpen(false);
      setBulkPreview([]);
      setBulkErrors([]);
      toast({ title: `${bulkPreview.length} productos cargados` });
    },
    onError: (e: any) => toast({ title: "Error al cargar", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyForm);
    setCodes([]);
    setImageFile(null);
    setImagePreview(null);
    setExistingImageUrl(null);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      unit: p.unit,
      minStock: String(p.min_stock),
      categoryId: p.category_id ?? "",
      warehouseId: p.warehouse_id ?? "",
      barcode: p.barcode ?? "",
      dailyConsumption: p.daily_consumption != null ? String(p.daily_consumption) : "",
      targetDaysOfStock: String(p.target_days_of_stock ?? 5),
      reorderMode: p.reorder_mode ?? "min_stock",
    });
    setExistingImageUrl(p.image_url ?? null);
    setImagePreview(p.image_url ?? null);
    // Load existing codes
    const productCodes = allCodes?.filter((c) => c.product_id === p.id) ?? [];
    setCodes(productCodes.map((c) => ({ id: c.id, code: c.code, description: c.description ?? "" })));
    setOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);
        const errors: string[] = [];
        const valid = json.filter((row, i) => {
          if (!row.nombre || !String(row.nombre).trim()) {
            errors.push(`Fila ${i + 2}: falta el nombre`);
            return false;
          }
          return true;
        });
        setBulkPreview(valid);
        setBulkErrors(errors);
      } catch {
        toast({ title: "Error", description: "No se pudo leer el archivo", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => setImagePreview(evt.target?.result as string);
    reader.readAsDataURL(file);
  };

  const downloadTemplate = () => {
    const template = [
      { nombre: "Ejemplo Producto", unidad: "kg", stock_minimo: 5, costo_promedio: 10.50, categoria: "Carnes", almacen: "Bodega principal" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla_productos.xlsx");
  };

  // Build a map of product_id -> codes for search
  const codesByProduct = new Map<string, string[]>();
  allCodes?.forEach((c) => {
    const arr = codesByProduct.get(c.product_id) || [];
    arr.push(c.code.toLowerCase());
    codesByProduct.set(c.product_id, arr);
  });

  const filtered = products?.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    if (p.name.toLowerCase().includes(q)) return true;
    if (p.barcode && p.barcode.toLowerCase().includes(q)) return true;
    const pCodes = codesByProduct.get(p.id);
    if (pCodes?.some((c) => c.includes(q))) return true;
    return false;
  });

  const isValid = form.name.trim().length > 0 && Number(form.minStock) >= 0;

  const addCode = () => setCodes([...codes, { code: "", description: "" }]);
  const removeCode = (idx: number) => setCodes(codes.filter((_, i) => i !== idx));
  const updateCode = (idx: number, field: keyof CodeEntry, value: string) => {
    const next = [...codes];
    next[idx] = { ...next[idx], [field]: value };
    setCodes(next);
  };

  // Get codes display for a product
  const getProductCodesDisplay = (productId: string) => {
    const pCodes = allCodes?.filter((c) => c.product_id === productId);
    if (!pCodes?.length) return null;
    return pCodes;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-3xl font-bold">Productos</h1>
            <p className="text-muted-foreground">Gestión de productos del inventario</p>
          </div>
          {(canCreate || canUpdate) && (
            <div className="flex gap-2">
              {canCreate && (
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Carga Masiva
                </Button>
              )}
              <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
                {canCreate && (
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Producto</Button>
                </DialogTrigger>
                )}
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-heading">{editId ? "Editar Producto" : "Agregar Producto"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); if (isValid) upsertProduct.mutate(); }} className="space-y-4">
                    {/* Image upload */}
                    <div className="space-y-2">
                      <Label>Imagen del producto</Label>
                      <div className="flex items-center gap-4">
                        {imagePreview ? (
                          <div className="relative h-20 w-20 rounded-md border overflow-hidden">
                            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => { setImageFile(null); setImagePreview(null); setExistingImageUrl(null); }}
                              className="absolute top-0.5 right-0.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => imageRef.current?.click()}
                            className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted/50"
                          >
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={() => imageRef.current?.click()}>
                          {imagePreview ? "Cambiar" : "Subir imagen"}
                        </Button>
                        <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <KioskTextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Nombre del producto" keyboardLabel="Nombre del producto" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Unidad</Label>
                        <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                      <Label>Categoría</Label>
                        <SearchableSelect
                          options={categories?.map((c) => ({ value: c.id, label: c.name })) ?? []}
                          value={form.categoryId}
                          onValueChange={(v) => setForm({ ...form, categoryId: v })}
                          placeholder="Seleccionar categoría..."
                          searchPlaceholder="Buscar categoría..."
                          clearable
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Stock Mínimo</Label>
                        <NumericKeypadInput mode="decimal" value={form.minStock} onChange={(v) => setForm({ ...form, minStock: v })} min="0" keypadLabel="Stock mínimo" quickButtons={[1, 5, 10]} />
                      </div>
                      <div className="space-y-2">
                      <Label>Código de barras principal</Label>
                        <KioskTextInput value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="Escanear o ingresar..." keyboardLabel="Código de barras" />
                      </div>
                    </div>
                    <div className="space-y-2">
                    <Label>Almacén</Label>
                      <SearchableSelect
                        options={warehouses?.map((w) => ({ value: w.id, label: w.name })) ?? []}
                        value={form.warehouseId}
                        onValueChange={(v) => setForm({ ...form, warehouseId: v })}
                        placeholder="Seleccionar almacén..."
                        searchPlaceholder="Buscar almacén..."
                        clearable
                      />
                    </div>

                    {/* Reorder settings */}
                    <div className="space-y-3 rounded-lg border p-3">
                      <Label className="text-sm font-semibold">Reposición</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Modo de reposición</Label>
                          <Select value={form.reorderMode} onValueChange={(v) => setForm({ ...form, reorderMode: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="min_stock">Stock mínimo</SelectItem>
                              <SelectItem value="coverage">Cobertura (días)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Consumo diario prom.</Label>
                          <NumericKeypadInput mode="decimal" value={form.dailyConsumption} onChange={(v) => setForm({ ...form, dailyConsumption: v })} min="0" keypadLabel="Consumo diario" />
                        </div>
                      </div>
                      {form.reorderMode === "coverage" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Días objetivo de inventario</Label>
                          <NumericKeypadInput mode="integer" value={form.targetDaysOfStock} onChange={(v) => setForm({ ...form, targetDaysOfStock: v })} min="1" keypadLabel="Días objetivo" />
                        </div>
                      )}
                    </div>

                    {/* Códigos adicionales */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Códigos adicionales</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addCode}>
                          <Plus className="mr-1 h-3 w-3" /> Agregar código
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Agrega variaciones del producto (ej: sabores, presentaciones) con códigos únicos.
                      </p>
                      {codes.length > 0 && (
                        <div className="space-y-2 rounded-md border p-3">
                          {codes.map((c, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <KioskTextInput
                                placeholder="Código"
                                value={c.code}
                                onChange={(v) => updateCode(idx, "code", v)}
                                className="flex-1"
                                keyboardLabel="Código adicional"
                              />
                              <KioskTextInput
                                placeholder="Descripción (opcional)"
                                value={c.description}
                                onChange={(v) => updateCode(idx, "description", v)}
                                className="flex-1"
                                keyboardLabel="Descripción del código"
                              />
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeCode(idx)}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={upsertProduct.isPending || !isValid}>
                      {upsertProduct.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Eliminar producto?</DialogTitle></DialogHeader>
            <p className="text-muted-foreground text-sm">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteProduct.isPending} onClick={() => deleteId && deleteProduct.mutate(deleteId)}>
                {deleteProduct.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk upload dialog */}
        <Dialog open={bulkOpen} onOpenChange={(v) => { if (!v) { setBulkOpen(false); setBulkPreview([]); setBulkErrors([]); } else setBulkOpen(true); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> Carga Masiva de Productos
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-dashed p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sube un archivo Excel (.xlsx) con las columnas: <strong>nombre</strong>, unidad, stock_minimo, costo_promedio, categoria, almacen
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="mr-1 h-3 w-3" /> Descargar Plantilla
                  </Button>
                  <Button size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-1 h-3 w-3" /> Seleccionar Archivo
                  </Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Las categorías y almacenes deben existir previamente (se buscan por nombre exacto)
                </p>
              </div>

              {bulkErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                  {bulkErrors.map((err, i) => (
                    <p key={i} className="text-sm text-destructive">{err}</p>
                  ))}
                </div>
              )}

              {bulkPreview.length > 0 && (
                <>
                  <div className="text-sm font-medium">{bulkPreview.length} productos listos para cargar:</div>
                  <div className="max-h-64 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead>Stock Mín.</TableHead>
                          <TableHead>Costo</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Almacén</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkPreview.map((r, i) => {
                          const catFound = r.categoria ? categoryMap.has(String(r.categoria).toLowerCase()) : true;
                          const whFound = r.almacen ? warehouseMap.has(String(r.almacen).toLowerCase()) : true;
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.nombre}</TableCell>
                              <TableCell>{r.unidad || "unidad"}</TableCell>
                              <TableCell>{r.stock_minimo || 0}</TableCell>
                              <TableCell>${Number(r.costo_promedio || 0).toFixed(2)}</TableCell>
                              <TableCell>
                                {r.categoria ? (
                                  catFound ? <span>{r.categoria}</span> : <span className="text-destructive">{r.categoria} ⚠️</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                {r.almacen ? (
                                  whFound ? <span>{r.almacen}</span> : <span className="text-destructive">{r.almacen} ⚠️</span>
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <Button className="w-full" onClick={() => bulkInsert.mutate()} disabled={bulkInsert.isPending}>
                    {bulkInsert.isPending ? "Cargando..." : `Cargar ${bulkPreview.length} productos`}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <KioskTextInput className="pl-10" placeholder="Buscar por nombre, código de barras o código adicional..." value={search} onChange={setSearch} keyboardLabel="Buscar producto" inputType="search" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Códigos</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Último Costo</TableHead>
                  <TableHead>Costo Prom.</TableHead>
                  <TableHead>Estado</TableHead>
                  {(canUpdate || canDelete) && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={canManage ? 11 : 10} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !filtered?.length ? (
                  <TableRow><TableCell colSpan={canManage ? 11 : 10} className="text-center py-8 text-muted-foreground">Sin productos</TableCell></TableRow>
                ) : (
                  filtered.map((p) => {
                    const pCodes = getProductCodesDisplay(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          {(p as any).image_url ? (
                            <img src={(p as any).image_url} alt={p.name} className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {p.barcode && <Badge variant="outline" className="text-xs font-mono">{p.barcode}</Badge>}
                            {pCodes?.map((c) => (
                              <Badge key={c.id} variant="secondary" className="text-xs font-mono" title={c.description ?? undefined}>
                                {c.code}
                              </Badge>
                            ))}
                            {!p.barcode && !pCodes?.length && <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{(p as any).categories?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{(p as any).warehouses?.name ?? "—"}</TableCell>
                        <TableCell className="font-semibold">{Number(p.current_stock)}</TableCell>
                        <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                        <TableCell className={Number((p as any).last_unit_cost ?? 0) > 0 ? "" : "text-muted-foreground"}>{Number((p as any).last_unit_cost ?? 0) > 0 ? `$${Number((p as any).last_unit_cost).toFixed(2)}` : "—"}</TableCell>
                        <TableCell>${Number(p.average_cost).toFixed(2)}</TableCell>
                        <TableCell>
                          {Number(p.current_stock) <= Number(p.min_stock) ? (
                            <Badge variant="destructive">Bajo</Badge>
                          ) : (
                            <Badge className="bg-success text-success-foreground">OK</Badge>
                          )}
                        </TableCell>
                        {(canUpdate || canDelete) && (
                          <TableCell>
                            <div className="flex gap-1">
                              {canUpdate && <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                              {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
