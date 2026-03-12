import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Building2, Users, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const SERVICE_LABELS: Record<string, string> = {
  breakfast: "Desayuno", lunch: "Almuerzo", dinner: "Cena", snack: "Lonche",
};

const DEST_LABELS: Record<string, string> = {
  table: "Mesa", takeaway: "Para llevar", room: "Habitación", reception: "Recepción",
  company_area: "Área empresa", dining_area: "Comedor", other: "Otro",
};

export default function POSKitchenTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const { data: rawOrders = [] } = useQuery({
    queryKey: ["pos-kitchen-orders", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_orders")
        .select(`*, pos_order_items(*, menu_items(name)), hotel_companies(name), pos_tables(name)`)
        .eq("restaurant_id", restaurantId!)
        .eq("status", "sent_to_kitchen")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
    refetchInterval: 10000,
  });

  const markServed = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "served" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      toast.success("Pedido marcado como servido");
    },
  });

  const markAllServed = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.from("pos_orders").update({ status: "served" }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      toast.success("Pedidos marcados como servidos");
    },
  });

  // Separate orders: corporate (grouped by company) vs individual (consolidated)
  const corporateOrders = rawOrders.filter(o => o.order_type === "company");
  const individualOrders = rawOrders.filter(o => o.order_type === "individual");
  const tableOrders = rawOrders.filter(o => o.order_type === "table");

  // Group corporate by company
  const corporateByCompany: Record<string, typeof corporateOrders> = {};
  for (const o of corporateOrders) {
    const companyName = (o as any).hotel_companies?.name || "Empresa";
    if (!corporateByCompany[companyName]) corporateByCompany[companyName] = [];
    corporateByCompany[companyName].push(o);
  }

  // Consolidate individual items (no client names)
  const individualItemsConsolidated: Record<string, { name: string; qty: number; notes: string[] }> = {};
  for (const o of individualOrders) {
    for (const item of ((o as any).pos_order_items || [])) {
      const itemName = item.menu_items?.name || "—";
      if (!individualItemsConsolidated[itemName]) {
        individualItemsConsolidated[itemName] = { name: itemName, qty: 0, notes: [] };
      }
      individualItemsConsolidated[itemName].qty += item.quantity;
      if (item.notes) individualItemsConsolidated[itemName].notes.push(item.notes);
    }
  }

  const totalOrders = rawOrders.length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" /> Comandas en Cocina ({totalOrders})
      </h2>

      {totalOrders === 0 && (
        <div className="text-center py-12 text-muted-foreground">No hay comandas pendientes</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Individual orders - consolidated without names */}
        {individualOrders.length > 0 && (
          <Card className="border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Clientes individuales
                </CardTitle>
                <Badge variant="outline">{individualOrders.length} pedidos</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {SERVICE_LABELS[individualOrders[0]?.service_period] || ""}
              </div>
              <div className="text-xs text-muted-foreground">
                Desde {format(new Date(individualOrders[0]?.created_at), "HH:mm")}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="divide-y">
                {Object.values(individualItemsConsolidated).map(item => (
                  <div key={item.name} className="flex justify-between py-1 text-sm">
                    <span className="font-medium">{item.qty}x {item.name}</span>
                    {item.notes.length > 0 && (
                      <span className="text-xs text-muted-foreground italic ml-2">
                        {item.notes.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                variant="default"
                size="sm"
                onClick={() => markAllServed.mutate(individualOrders.map(o => o.id))}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Marcar todos como Servido
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Corporate orders - grouped by company, showing destination */}
        {Object.entries(corporateByCompany).map(([companyName, companyOrders]) => {
          // Consolidate items within this company group
          const companyItems: Record<string, { name: string; qty: number; notes: string[] }> = {};
          const destinations = new Set<string>();
          for (const o of companyOrders) {
            const dest = DEST_LABELS[o.delivery_destination_type] || o.delivery_destination_type;
            const detail = o.delivery_destination_detail;
            destinations.add(detail ? `${dest} — ${detail}` : dest);
            for (const item of ((o as any).pos_order_items || [])) {
              const itemName = item.menu_items?.name || "—";
              if (!companyItems[itemName]) {
                companyItems[itemName] = { name: itemName, qty: 0, notes: [] };
              }
              companyItems[itemName].qty += item.quantity;
              if (item.notes) companyItems[itemName].notes.push(item.notes);
            }
          }

          return (
            <Card key={companyName} className="border-2 border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {companyName}
                  </CardTitle>
                  <Badge variant="outline">{companyOrders.length} pedidos</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {Array.from(destinations).join(" · ")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(companyOrders[0]?.created_at), "HH:mm")}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="divide-y">
                  {Object.values(companyItems).map(item => (
                    <div key={item.name} className="flex justify-between py-1 text-sm">
                      <span className="font-medium">{item.qty}x {item.name}</span>
                      {item.notes.length > 0 && (
                        <span className="text-xs text-muted-foreground italic ml-2">
                          {item.notes.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant="default"
                  size="sm"
                  onClick={() => markAllServed.mutate(companyOrders.map(o => o.id))}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Marcar todos como Servido
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {/* Table orders - shown individually */}
        {tableOrders.map(order => (
          <Card key={order.id} className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  {order.order_number}
                </CardTitle>
                <Badge variant="outline">{SERVICE_LABELS[order.service_period] || order.service_period}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {(order as any).pos_tables?.name || "Mesa"} · {DEST_LABELS[order.delivery_destination_type] || order.delivery_destination_type}
                {order.delivery_destination_detail && ` — ${order.delivery_destination_detail}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(order.created_at), "HH:mm")}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="divide-y">
                {(order as any).pos_order_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between py-1 text-sm">
                    <span className="font-medium">{item.quantity}x {item.menu_items?.name || "—"}</span>
                    {item.notes && <span className="text-xs text-muted-foreground italic ml-2">{item.notes}</span>}
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                variant="default"
                size="sm"
                onClick={() => markServed.mutate(order.id)}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Marcar como Servido
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
