import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, UtensilsCrossed, LayoutGrid, List, Tag, FolderTree, ShieldCheck } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "react-router-dom";
import POSOrdersTab from "@/components/pos/POSOrdersTab";
import POSMenuTab from "@/components/pos/POSMenuTab";
import POSTablesTab from "@/components/pos/POSTablesTab";
import POSKitchenTab from "@/components/pos/POSKitchenTab";
import POSServiceRatesTab from "@/components/pos/POSServiceRatesTab";
import POSContractsTab from "@/components/pos/POSContractsTab";
import POSAdminTab from "@/components/pos/POSAdminTab";

interface TabDef {
  value: string;
  label: string;
  icon: typeof ShoppingCart;
  permKey: string;
  adminOnly?: boolean;
}

const posTabs: TabDef[] = [
  { value: "orders", label: "Pedidos", icon: ShoppingCart, permKey: "pos_orders" },
  { value: "kitchen", label: "Cocina", icon: UtensilsCrossed, permKey: "pos_kitchen" },
  { value: "menu", label: "Menú", icon: List, permKey: "pos_menu" },
  { value: "rates", label: "Tarifas", icon: Tag, permKey: "pos_menu" },
  { value: "contracts", label: "Contratos", icon: FolderTree, permKey: "pos_menu" },
  { value: "tables", label: "Mesas", icon: LayoutGrid, permKey: "pos_tables" },
  { value: "admin", label: "Admin", icon: ShieldCheck, permKey: "pos_orders", adminOnly: true },
];

export default function POS() {
  const { hasPermission } = usePermissions();
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = posTabs.filter(t => {
    if (!hasPermission(t.permKey)) return false;
    if (t.adminOnly && !hasRole("admin")) return false;
    return true;
  });
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
        {hasPermission("pos_menu") && <TabsContent value="contracts"><POSContractsTab /></TabsContent>}
        {hasPermission("pos_tables") && <TabsContent value="tables"><POSTablesTab /></TabsContent>}
        {hasRole("admin") && <TabsContent value="admin"><POSAdminTab /></TabsContent>}
      </Tabs>
    </AppLayout>
  );
}
