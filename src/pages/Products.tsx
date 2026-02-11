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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import * as XLSX from "xlsx";

const UNITS = ["unidad", "kg", "g", "litro", "ml", "caja", "bolsa", "paquete"];

interface ProductForm {
  name: string;
  unit: string;
  minStock: string;
  categoryId: string;
  warehouseId: string;
}

const emptyForm: ProductForm = { name: "", unit: "unidad", minStock: "0", categoryId: "", warehouseId: "" };

export default function Products() {
  const { hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("bodega");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const upsertProduct = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        unit: form.unit,
        min_stock: Number(form.minStock),
        category_id: form.categoryId || null,
        warehouse_id: form.warehouseId || null,
      };
      if (editId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      closeDialog();
      toast({ title: editId ? "Producto actualizado" : "Producto creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
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
      const { error } = await supabase.from("products").insert(rows);
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
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      unit: p.unit,
      minStock: String(p.min_stock),
      categoryId: p.category_id ?? "",
      warehouseId: p.warehouse_id ?? "",
    });
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

  const downloadTemplate = () => {
    const template = [
      { nombre: "Ejemplo Producto", unidad: "kg", stock_minimo: 5, costo_promedio: 10.50, categoria: "Carnes", almacen: "Bodega principal" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla_productos.xlsx");
  };

  const filtered = products?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const isValid = form.name.trim().length > 0 && Number(form.minStock) >= 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-3xl font-bold">Productos</h1>
            <p className="text-muted-foreground">Gestión de productos del inventario</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Carga Masiva
              </Button>
              <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Producto</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-heading">{editId ? "Editar Producto" : "Agregar Producto"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); if (isValid) upsertProduct.mutate(); }} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} />
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
                        <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Stock Mínimo</Label>
                      <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} min="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Almacén</Label>
                      <Select value={form.warehouseId} onValueChange={(v) => setForm({ ...form, warehouseId: v })}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {warehouses?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
              <Input className="pl-10" placeholder="Buscar productos..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Costo Prom.</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !filtered?.length ? (
                  <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center py-8 text-muted-foreground">Sin productos</TableCell></TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{(p as any).categories?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{(p as any).warehouses?.name ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{Number(p.current_stock)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                      <TableCell>${Number(p.average_cost).toFixed(2)}</TableCell>
                      <TableCell>
                        {Number(p.current_stock) <= Number(p.min_stock) ? (
                          <Badge variant="destructive">Bajo</Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground">OK</Badge>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
