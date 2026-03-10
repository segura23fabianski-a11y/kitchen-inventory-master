import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import SuggestedPurchases from "@/components/purchase-orders/SuggestedPurchases";
import OrdersList from "@/components/purchase-orders/OrdersList";

export default function PurchaseOrders() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos de Compra</h1>
          <p className="text-muted-foreground text-sm">Sugeridos de reposición y pedidos a proveedores.</p>
        </div>
        <Tabs defaultValue="suggestions">
          <TabsList>
            <TabsTrigger value="suggestions">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Sugeridos
            </TabsTrigger>
            <TabsTrigger value="orders">
              <ShoppingCart className="h-4 w-4 mr-1" />
              Pedidos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="suggestions" className="mt-4">
            <SuggestedPurchases />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <OrdersList />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
