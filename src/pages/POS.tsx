import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, UtensilsCrossed, LayoutGrid, List, Tag } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParams } from "react-router-dom";
import POSOrdersTab from "@/components/pos/POSOrdersTab";
import POSMenuTab from "@/components/pos/POSMenuTab";
import POSTablesTab from "@/components/pos/POSTablesTab";
import POSKitchenTab from "@/components/pos/POSKitchenTab";
import POSServiceRatesTab from "@/components/pos/POSServiceRatesTab";

interface TabDef {
  value: string;
  label: string;
  icon: typeof ShoppingCart;
  permKey: string;
}

const posTabs: TabDef[] = [
  { value: "orders", label: "Pedidos", icon: ShoppingCart, permKey: "pos_orders" },
  { value: "kitchen", label: "Cocina", icon: UtensilsCrossed, permKey: "pos_kitchen" },
  { value: "menu", label: "Menú", icon: List, permKey: "pos_menu" },
  { value: "rates", label: "Tarifas", icon: Tag, permKey: "pos_menu" },
  { value: "tables", label: "Mesas", icon: LayoutGrid, permKey: "pos_tables" },
];

export default function POS() {
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = posTabs.filter(t => hasPermission(t.permKey));
  const defaultTab = visibleTabs[0]?.value || "orders";
  const activeTab = searchParams.get("tab") || defaultTab;

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <AppLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          {visibleTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <tab.icon className="h-4 w-4" />{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {hasPermission("pos_orders") && <TabsContent value="orders"><POSOrdersTab /></TabsContent>}
        {hasPermission("pos_kitchen") && <TabsContent value="kitchen"><POSKitchenTab /></TabsContent>}
        {hasPermission("pos_menu") && <TabsContent value="menu"><POSMenuTab /></TabsContent>}
        {hasPermission("pos_menu") && <TabsContent value="rates"><POSServiceRatesTab /></TabsContent>}
        {hasPermission("pos_tables") && <TabsContent value="tables"><POSTablesTab /></TabsContent>}
      </Tabs>
    </AppLayout>
  );
}
