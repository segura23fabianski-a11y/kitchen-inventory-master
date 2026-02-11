import { useState } from "react";
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
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

const UNITS = ["unidad", "kg", "g", "litro", "ml", "caja", "bolsa", "paquete"];

interface ProductForm {
  name: string;
  unit: string;
  minStock: string;
  categoryId: string;
  averageCost: string;
}

const emptyForm: ProductForm = { name: "", unit: "unidad", minStock: "0", categoryId: "", averageCost: "0" };

export default function Products() {
  const { hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("bodega");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").order("name");
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

  const upsertProduct = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        min_stock: Number(form.minStock),
        category_id: form.categoryId || null,
        average_cost: Number(form.averageCost),
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
      averageCost: String(p.average_cost),
    });
    setOpen(true);
  };

  const filtered = products?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const isValid = form.name.trim().length > 0 && Number(form.minStock) >= 0 && Number(form.averageCost) >= 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Productos</h1>
            <p className="text-muted-foreground">Gestión de productos del inventario</p>
          </div>
          {canManage && (
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stock Mínimo</Label>
                      <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} min="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Costo Promedio</Label>
                      <Input type="number" value={form.averageCost} onChange={(e) => setForm({ ...form, averageCost: e.target.value })} min="0" step="0.01" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={upsertProduct.isPending || !isValid}>
                    {upsertProduct.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Delete confirmation */}
        <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>¿Eliminar producto?</DialogTitle></DialogHeader>
            <p className="text-muted-foreground text-sm">Esta acción no se puede deshacer. Se eliminará el producto permanentemente.</p>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteProduct.isPending} onClick={() => deleteId && deleteProduct.mutate(deleteId)}>
                {deleteProduct.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
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
                  <TableHead>Stock</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Costo Prom.</TableHead>
                  <TableHead>Estado</TableHead>
                  {canManage && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !filtered?.length ? (
                  <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">Sin productos</TableCell></TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{(p as any).categories?.name ?? "—"}</TableCell>
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
