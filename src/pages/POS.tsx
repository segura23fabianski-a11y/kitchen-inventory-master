import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Utensils, Building2, List, LayoutGrid, DollarSign } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParams } from "react-router-dom";
import POSRestaurantTab from "@/components/pos/POSRestaurantTab";
import POSCorporateTab from "@/components/pos/POSCorporateTab";
import POSMenuTab from "@/components/pos/POSMenuTab";
import POSTablesTab from "@/components/pos/POSTablesTab";
import POSCashRegisterTab from "@/components/pos/POSCashRegisterTab";

interface TabDef {
  value: string;
  label: string;
  icon: typeof Utensils;
  permKey: string;
}

const posTabs: TabDef[] = [
  { value: "restaurant", label: "Restaurante", icon: Utensils, permKey: "pos_restaurant" },
  { value: "corporate", label: "Corporativo", icon: Building2, permKey: "pos_corporate" },
  { value: "cash", label: "Caja", icon: DollarSign, permKey: "cash_open" },
  { value: "menu", label: "Menú", icon: List, permKey: "pos_menu" },
  { value: "tables", label: "Mesas", icon: LayoutGrid, permKey: "pos_tables" },
];

export default function POS() {
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = posTabs.filter(t => hasPermission(t.permKey));
  const defaultTab = visibleTabs[0]?.value || "restaurant";
  const activeTab = searchParams.get("tab") || defaultTab;

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <AppLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 flex h-[calc(100dvh-11rem)] min-h-[620px] flex-col">
        <TabsList className="flex-wrap h-auto gap-1 flex-shrink-0">
          {visibleTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <tab.icon className="h-4 w-4" />{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {hasPermission("pos_restaurant") && <TabsContent value="restaurant" className="mt-0 flex-1 min-h-0"><POSRestaurantTab /></TabsContent>}
        {hasPermission("pos_corporate") && <TabsContent value="corporate" className="mt-0 flex-1 min-h-0"><POSCorporateTab /></TabsContent>}
        {hasPermission("cash_open") && <TabsContent value="cash" className="mt-0 flex-1 min-h-0"><POSCashRegisterTab /></TabsContent>}
        {hasPermission("pos_menu") && <TabsContent value="menu" className="mt-0 flex-1 min-h-0"><POSMenuTab /></TabsContent>}
        {hasPermission("pos_tables") && <TabsContent value="tables" className="mt-0 flex-1 min-h-0"><POSTablesTab /></TabsContent>}
      </Tabs>
    </AppLayout>
  );
}
