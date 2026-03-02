import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowDownCircle, ArrowUpCircle, Settings2, Trash2, Search } from "lucide-react";
import BulkUploadDialog from "@/components/BulkUploadDialog";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Movements() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const { user, hasRole } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const restaurantId = useRestaurantId();
  const canCreate = hasPermission("movements_create");
  const canDelete = hasPermission("movements_delete");

  const allowedTypes = hasRole("admin")
    ? ["entrada", "salida", "ajuste"]
    : hasRole("bodega")
    ? ["entrada", "ajuste"]
    : ["salida"];

  const [type, setType] = useState<string>(allowedTypes[0]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: movements, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, products(name, unit)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      // Admins can see all profiles via RLS; others won't — graceful fallback
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, barcode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productCodes } = useQuery({
    queryKey: ["product-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_codes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const computedTotal = (Number(quantity) || 0) * (Number(unitCost) || 0);

  const addMovement = useMutation({
    mutationFn: async () => {
      const uc = Number(unitCost) || 0;
      const qty = Number(quantity);
      const { data: mov, error } = await supabase.from("inventory_movements").insert({
        product_id: productId,
        user_id: user!.id,
        type,
        quantity: qty,
        unit_cost: uc,
        total_cost: qty * uc,
        notes,
        restaurant_id: restaurantId!,
      }).select("id").single();
      if (error) throw error;
      // Only audit adjustments
      if (type === "ajuste") {
        await logAudit({
          entityType: "inventory_movement",
          entityId: mov.id,
          action: "CREATE",
          after: { product_id: productId, type, quantity: qty, unit_cost: uc, notes },
          canRollback: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId("");
      setType(allowedTypes[0]);
      setQuantity("");
      setUnitCost("");
      setNotes("");
      toast({ title: "Movimiento registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Pre-fill unit cost from product's average_cost when product changes
  const handleProductChange = (id: string) => {
    setProductId(id);
    const prod = products?.find((p) => p.id === id);
    if (prod) setUnitCost(String(prod.average_cost));
  };

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

  const deleteMovement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_movements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Movimiento eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isValid = productId && Number(quantity) > 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Movimientos</h1>
            <p className="text-muted-foreground">
              {hasRole("cocina") ? "Registro de consumos" : "Registro de entradas, salidas y ajustes"}
            </p>
          </div>
          {canCreate && (
          <div className="flex items-center gap-2">
            {allowedTypes.includes("entrada") && <BulkUploadDialog products={products} />}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Movimiento</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Registrar Movimiento</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (isValid) addMovement.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Producto *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {productId ? products?.find((p) => p.id === productId)?.name ?? "Seleccionar..." : "Seleccionar producto..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre o código..." onValueChange={(val) => {
                          // Auto-resolve by barcode or product_code
                          const q = val.trim().toLowerCase();
                          if (q) {
                            const byBarcode = products?.find((p) => p.barcode?.toLowerCase() === q);
                            if (byBarcode) { handleProductChange(byBarcode.id); return; }
                            const byCode = productCodes?.find((c) => c.code.toLowerCase() === q);
                            if (byCode) { handleProductChange(byCode.product_id); return; }
                          }
                        }} />
                        <CommandList>
                          <CommandEmpty>No se encontró producto.</CommandEmpty>
                          <CommandGroup>
                            {products?.map((p) => {
                              const pCodes = productCodes?.filter((c) => c.product_id === p.id);
                              const codesStr = pCodes?.map((c) => c.code).join(", ");
                              return (
                                <CommandItem key={p.id} value={`${p.name} ${p.barcode ?? ""} ${codesStr ?? ""}`} onSelect={() => handleProductChange(p.id)}>
                                  <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                                  {p.name} ({p.unit})
                                  {codesStr && <span className="ml-2 text-xs text-muted-foreground">[{codesStr}]</span>}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedTypes.includes("entrada") && <SelectItem value="entrada">Entrada</SelectItem>}
                      {allowedTypes.includes("salida") && <SelectItem value="salida">Salida</SelectItem>}
                      {allowedTypes.includes("ajuste") && <SelectItem value="ajuste">Ajuste</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cantidad *</Label>
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0.01" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Costo Unitario</Label>
                    <Input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} min="0" step="0.01" />
                  </div>
                </div>
                {computedTotal > 0 && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <span className="text-muted-foreground">Costo total:</span>{" "}
                    <span className="font-semibold">${computedTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." maxLength={500} />
                </div>
                <Button type="submit" className="w-full" disabled={addMovement.isPending || !isValid}>
                  {addMovement.isPending ? "Registrando..." : "Registrar"}
                </Button>
              </form>
            </DialogContent>
            </Dialog>
          </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-10" placeholder="Buscar por producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo Unit.</TableHead>
                  <TableHead>Costo Total</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Fecha</TableHead>
                  {canDelete && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !movements?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin movimientos</TableCell></TableRow>
                ) : (
                  movements
                    .filter((m) => (m as any).products?.name?.toLowerCase().includes(search.toLowerCase()))
                    .map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {typeIcon(m.type)}
                        {(m as any).products?.name}
                      </TableCell>
                      <TableCell>{typeBadge(m.type)}</TableCell>
                      <TableCell className="font-semibold">{Number(m.quantity)}</TableCell>
                      <TableCell>${Number(m.unit_cost).toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">${Number(m.total_cost).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">{profileMap.get(m.user_id) || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(m.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                      </TableCell>
                      {canDelete && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMovement.mutate(m.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
