import { useState } from "react";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Trash2, Warehouse as WarehouseIcon, Search } from "lucide-react";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

export default function Warehouses() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const restaurantId = useRestaurantId();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addWarehouse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("warehouses").insert({ name: name.trim(), description: description.trim(), restaurant_id: restaurantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      setOpen(false);
      setName("");
      setDescription("");
      toast({ title: "Almacén creado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteWarehouse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast({ title: "Almacén eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Almacenes</h1>
            <p className="text-muted-foreground">Gestiona los almacenes de tu inventario</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Almacén</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Agregar Almacén</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) addWarehouse.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <KioskTextInput value={name} onChange={setName} placeholder="Ej: Bodega principal" keyboardLabel="Nombre del almacén" />
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <KioskTextInput value={description} onChange={setDescription} placeholder="Ubicación o notas" keyboardLabel="Descripción" />
                </div>
                <Button type="submit" className="w-full" disabled={addWarehouse.isPending || !name.trim()}>
                  {addWarehouse.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !warehouses?.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sin almacenes</TableCell></TableRow>
                ) : (
                  warehouses.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-muted-foreground" />
                        {w.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{w.description || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteWarehouse.mutate(w.id)} disabled={deleteWarehouse.isPending}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
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
