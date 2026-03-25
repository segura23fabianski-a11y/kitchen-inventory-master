import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCOP } from "@/lib/utils";

const CONSUMPTION_MODE_LABELS: Record<string, string> = {
  dine_in: "En mesa",
  takeaway: "Para llevar",
  corporate_charge: "Cargo corporativo",
};

export default function POSServiceRatesTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [menuItemId, setMenuItemId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [consumptionMode, setConsumptionMode] = useState("dine_in");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["service-rates", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_rates")
        .select("*, menu_items(name), hotel_companies(name)")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, category, price")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["hotel-companies", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_companies")
        .select("id, name")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        restaurant_id: restaurantId!,
        menu_item_id: menuItemId,
        company_id: companyId && companyId !== "none" ? companyId : null,
        consumption_mode: consumptionMode,
        price: parseFloat(price) || 0,
        active,
        effective_from: effectiveFrom || null,
        effective_to: effectiveTo || null,
      };
      if (editId) {
        const { error } = await supabase.from("service_rates").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_rates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-rates"] });
      toast.success(editId ? "Tarifa actualizada" : "Tarifa creada");
      closeDialog();
    },
    onError: () => toast.error("Error al guardar tarifa"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-rates"] });
      toast.success("Tarifa eliminada");
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setMenuItemId("");
    setCompanyId("");
    setConsumptionMode("dine_in");
    setPrice("");
    setActive(true);
    setEffectiveFrom("");
    setEffectiveTo("");
  };

  const openEdit = (rate: any) => {
    setEditId(rate.id);
    setMenuItemId(rate.menu_item_id);
    setCompanyId(rate.company_id || "none");
    setConsumptionMode(rate.consumption_mode);
    setPrice(String(rate.price));
    setActive(rate.active);
    setEffectiveFrom(rate.effective_from || "");
    setEffectiveTo(rate.effective_to || "");
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tarifas de Alimentación</h2>
          <p className="text-sm text-muted-foreground">
            Define precios diferenciados por modalidad de consumo y empresa
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />Nueva Tarifa
        </Button>
      </div>

      <div className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/30">
        <strong>Prioridad de tarifas:</strong> 1) Tarifa empresa + modalidad → 2) Tarifa empresa general → 3) Tarifa modalidad → 4) Precio base del menú
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ítem del menú</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Modalidad</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead>Vigencia</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((rate: any) => (
            <TableRow key={rate.id}>
              <TableCell className="font-medium">{rate.menu_items?.name || "—"}</TableCell>
              <TableCell>
                {rate.hotel_companies?.name ? (
                  <Badge variant="outline">{rate.hotel_companies.name}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">General</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{CONSUMPTION_MODE_LABELS[rate.consumption_mode] || rate.consumption_mode}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatCOP(rate.price)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {rate.effective_from || rate.effective_to
                  ? `${rate.effective_from || "—"} → ${rate.effective_to || "—"}`
                  : "Permanente"}
              </TableCell>
              <TableCell>
                <Badge variant={rate.active ? "default" : "secondary"}>
                  {rate.active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(rate)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(rate.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && rates.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No hay tarifas configuradas. Los pedidos usarán el precio base del menú.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v => !v && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Tarifa" : "Nueva Tarifa de Alimentación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ítem del menú</Label>
              <Select value={menuItemId} onValueChange={setMenuItemId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ítem..." /></SelectTrigger>
                <SelectContent>
                  {menuItems.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.category}) — Base: {formatCOP(item.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa (opcional — dejar vacío para tarifa general)</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="General (todas)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (todas)</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modalidad de consumo</Label>
              <Select value={consumptionMode} onValueChange={setConsumptionMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dine_in">En mesa</SelectItem>
                  <SelectItem value="takeaway">Para llevar</SelectItem>
                  <SelectItem value="corporate_charge">Cargo corporativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Precio</Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Vigente desde (opcional)</Label>
                <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
              <div>
                <Label>Vigente hasta (opcional)</Label>
                <Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!menuItemId}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
