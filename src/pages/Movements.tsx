import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowDownCircle, ArrowUpCircle, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Movements() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<string>("entrada");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: movements, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, products(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMovement = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_movements").insert({
        product_id: productId,
        user_id: user!.id,
        type,
        quantity: Number(quantity),
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId("");
      setType("entrada");
      setQuantity("");
      setNotes("");
      toast({ title: "Movimiento registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const typeIcon = (t: string) => {
    if (t === "entrada") return <ArrowDownCircle className="h-4 w-4 text-success" />;
    if (t === "salida") return <ArrowUpCircle className="h-4 w-4 text-warning" />;
    return <Settings2 className="h-4 w-4 text-muted-foreground" />;
  };

  const typeBadge = (t: string) => {
    if (t === "entrada") return <Badge className="bg-success text-success-foreground">Entrada</Badge>;
    if (t === "salida") return <Badge className="bg-warning text-warning-foreground">Salida</Badge>;
    return <Badge variant="secondary">Ajuste</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Movimientos</h1>
            <p className="text-muted-foreground">Registro de entradas, salidas y ajustes</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Movimiento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Registrar Movimiento</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addMovement.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Producto</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                    <SelectContent>
                      {products?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="salida">Salida</SelectItem>
                      <SelectItem value="ajuste">Ajuste</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cantidad</Label>
                  <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
                </div>
                <Button type="submit" className="w-full" disabled={addMovement.isPending || !productId}>
                  {addMovement.isPending ? "Registrando..." : "Registrar"}
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
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !movements?.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin movimientos</TableCell></TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {typeIcon(m.type)}
                        {(m as any).products?.name}
                      </TableCell>
                      <TableCell>{typeBadge(m.type)}</TableCell>
                      <TableCell className="font-semibold">{Number(m.quantity)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{m.notes || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(m.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
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
