import { useState } from "react";
import { fuzzyMatch } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { useAudit } from "@/hooks/use-audit";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

export default function Categories() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { logAudit } = useAudit();
  const canCreate = hasPermission("categories_create");
  const canUpdate = hasPermission("categories_update");
  const canDelete = hasPermission("categories_delete");
  const [search, setSearch] = useState("");
  const restaurantId = useRestaurantId();

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setOpen(false);
  };

  const saveCategory = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { data: prev } = await supabase.from("categories").select("*").eq("id", editingId).single();
        const { error } = await supabase.from("categories").update({ name, description }).eq("id", editingId);
        if (error) throw error;
        const { data: after } = await supabase.from("categories").select("*").eq("id", editingId).single();
        await logAudit({ entityType: "category", entityId: editingId, action: "UPDATE", before: prev, after, canRollback: true });
      } else {
        const { data, error } = await supabase.from("categories").insert({ name, description, restaurant_id: restaurantId! }).select("id").single();
        if (error) throw error;
        await logAudit({ entityType: "category", entityId: data.id, action: "CREATE", after: { name, description }, canRollback: false });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      resetForm();
      toast({ title: editingId ? "Categoría actualizada" : "Categoría creada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { data: prev } = await supabase.from("categories").select("*").eq("id", id).single();
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ entityType: "category", entityId: id, action: "DELETE", before: prev, canRollback: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Categoría eliminada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (cat: { id: string; name: string; description: string | null }) => {
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description || "");
    setOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Categorías</h1>
            <p className="text-muted-foreground">Organiza los productos por categoría</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); else setOpen(true); }}>
            {canCreate && <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nueva Categoría</Button>
            </DialogTrigger>}
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">{editingId ? "Editar" : "Agregar"} Categoría</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveCategory.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <KioskTextInput value={name} onChange={setName} keyboardLabel="Nombre de categoría" />
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <KioskTextInput value={description} onChange={setDescription} keyboardLabel="Descripción" />
                </div>
                <Button type="submit" className="w-full" disabled={saveCategory.isPending}>
                  {saveCategory.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput className="pl-10" placeholder="Buscar categoría..." value={search} onChange={setSearch} keyboardLabel="Buscar categoría" inputType="search" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  {(canUpdate || canDelete) && <TableHead className="w-24 text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !categories?.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sin categorías</TableCell></TableRow>
                ) : (
                  categories
                    .filter((c) => fuzzyMatch(c.name, search))
                    .map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.description || "—"}</TableCell>
                      {(canUpdate || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canUpdate && <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>}
                          {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Se eliminará "{c.name}". Si hay productos asociados, la operación podría fallar.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteCategory.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          )}
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
