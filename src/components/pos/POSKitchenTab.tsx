import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Building2, User, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const SERVICE_LABELS: Record<string, string> = {
  breakfast: "Desayuno", lunch: "Almuerzo", dinner: "Cena", snack: "Lonche",
};

const DEST_LABELS: Record<string, string> = {
  table: "Mesa", takeaway: "Para llevar", room: "Habitación", reception: "Recepción",
  company_area: "Área empresa", dining_area: "Comedor", other: "Otro",
};

const ORDER_TYPE_ICON: Record<string, typeof Building2> = {
  company: Building2, individual: User, table: LayoutGrid,
};

export default function POSKitchenTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const { data: orders = [] } = useQuery({
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

  const getClientLabel = (o: any) => {
    if (o.order_type === "company") return o.hotel_companies?.name || "Empresa";
    if (o.order_type === "table") return o.pos_tables?.name || "Mesa";
    return o.customer_name || "Cliente";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" /> Comandas en Cocina ({orders.length})
      </h2>

      {orders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No hay comandas pendientes</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map(order => {
          const Icon = ORDER_TYPE_ICON[order.order_type] || User;
          return (
            <Card key={order.id} className="border-2 border-orange-300 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {order.order_number}
                  </CardTitle>
                  <Badge variant="outline">{SERVICE_LABELS[order.service_period] || order.service_period}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {getClientLabel(order)} · {DEST_LABELS[order.delivery_destination_type] || order.delivery_destination_type}
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
          );
        })}
      </div>
    </div>
  );
}
