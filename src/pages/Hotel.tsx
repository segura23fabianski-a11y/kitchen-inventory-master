import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hotel as HotelIcon, BedDouble, Users, Building2, CalendarCheck, Sparkles, BarChart3, Shirt, Package, LayoutDashboard, CalendarPlus } from "lucide-react";
import RoomTypesTab from "@/components/hotel/RoomTypesTab";
import RoomsTab from "@/components/hotel/RoomsTab";
import GuestsTab from "@/components/hotel/GuestsTab";
import CompaniesTab from "@/components/hotel/CompaniesTab";
import StaysTab from "@/components/hotel/StaysTab";
import HousekeepingTab from "@/components/hotel/HousekeepingTab";
import CorporateReportsTab from "@/components/hotel/CorporateReportsTab";
import LaundryTab from "@/components/hotel/LaundryTab";
import LinenInventoryTab from "@/components/hotel/LinenInventoryTab";
import RoomDashboard from "@/components/hotel/RoomDashboard";
import ReservationsTab from "@/components/hotel/ReservationsTab";
import { usePermissions } from "@/hooks/use-permissions";
import { useState } from "react";

interface TabDef {
  value: string;
  label: string;
  icon: typeof LayoutDashboard;
  permKey: string;
}

const hotelTabs: TabDef[] = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, permKey: "hotel_dashboard_view" },
  { value: "stays", label: "Estancias", icon: CalendarCheck, permKey: "hotel_stays_view" },
  { value: "rooms", label: "Habitaciones", icon: BedDouble, permKey: "hotel_rooms_view" },
  { value: "room-types", label: "Tipos", icon: HotelIcon, permKey: "hotel_room_types_view" },
  { value: "guests", label: "Huéspedes", icon: Users, permKey: "hotel_guests_view" },
  { value: "companies", label: "Empresas", icon: Building2, permKey: "hotel_companies_view" },
  { value: "housekeeping", label: "Housekeeping", icon: Sparkles, permKey: "housekeeping_view" },
  { value: "laundry", label: "Lavandería", icon: Shirt, permKey: "laundry_view" },
  { value: "linen", label: "Lencería", icon: Package, permKey: "linen_inventory_view" },
  { value: "reports", label: "Reportes Corp.", icon: BarChart3, permKey: "hotel_corporate_reports_view" },
];

export default function Hotel() {
  const { hasPermission } = usePermissions();
  const visibleTabs = hotelTabs.filter(t => hasPermission(t.permKey));
  const defaultTab = visibleTabs[0]?.value || "dashboard";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleCheckIn = (_roomId: string) => setActiveTab("stays");
  const handleCheckOut = (_stayId: string) => setActiveTab("stays");

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
        {hasPermission("hotel_dashboard_view") && (
          <TabsContent value="dashboard"><RoomDashboard onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} /></TabsContent>
        )}
        {hasPermission("hotel_stays_view") && <TabsContent value="stays"><StaysTab /></TabsContent>}
        {hasPermission("hotel_rooms_view") && <TabsContent value="rooms"><RoomsTab /></TabsContent>}
        {hasPermission("hotel_room_types_view") && <TabsContent value="room-types"><RoomTypesTab /></TabsContent>}
        {hasPermission("hotel_guests_view") && <TabsContent value="guests"><GuestsTab /></TabsContent>}
        {hasPermission("hotel_companies_view") && <TabsContent value="companies"><CompaniesTab /></TabsContent>}
        {hasPermission("housekeeping_view") && <TabsContent value="housekeeping"><HousekeepingTab /></TabsContent>}
        {hasPermission("laundry_view") && <TabsContent value="laundry"><LaundryTab /></TabsContent>}
        {hasPermission("linen_inventory_view") && <TabsContent value="linen"><LinenInventoryTab /></TabsContent>}
        {hasPermission("hotel_corporate_reports_view") && <TabsContent value="reports"><CorporateReportsTab /></TabsContent>}
      </Tabs>
    </AppLayout>
  );
}
