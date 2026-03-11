import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hotel as HotelIcon, BedDouble, Users, Building2, CalendarCheck, Sparkles, BarChart3, Shirt, Package, LayoutDashboard } from "lucide-react";
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
import { useState } from "react";

export default function Hotel() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleCheckIn = (_roomId: string) => {
    setActiveTab("stays");
  };

  const handleCheckOut = (_stayId: string) => {
    setActiveTab("stays");
  };

  return (
    <AppLayout>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="stays" className="gap-1.5"><CalendarCheck className="h-4 w-4" />Estancias</TabsTrigger>
          <TabsTrigger value="rooms" className="gap-1.5"><BedDouble className="h-4 w-4" />Habitaciones</TabsTrigger>
          <TabsTrigger value="room-types" className="gap-1.5"><HotelIcon className="h-4 w-4" />Tipos</TabsTrigger>
          <TabsTrigger value="guests" className="gap-1.5"><Users className="h-4 w-4" />Huéspedes</TabsTrigger>
          <TabsTrigger value="companies" className="gap-1.5"><Building2 className="h-4 w-4" />Empresas</TabsTrigger>
          <TabsTrigger value="housekeeping" className="gap-1.5"><Sparkles className="h-4 w-4" />Housekeeping</TabsTrigger>
          <TabsTrigger value="laundry" className="gap-1.5"><Shirt className="h-4 w-4" />Lavandería</TabsTrigger>
          <TabsTrigger value="linen" className="gap-1.5"><Package className="h-4 w-4" />Lencería</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><BarChart3 className="h-4 w-4" />Reportes Corp.</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><RoomDashboard onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} /></TabsContent>
        <TabsContent value="stays"><StaysTab /></TabsContent>
        <TabsContent value="rooms"><RoomsTab /></TabsContent>
        <TabsContent value="room-types"><RoomTypesTab /></TabsContent>
        <TabsContent value="guests"><GuestsTab /></TabsContent>
        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="housekeeping"><HousekeepingTab /></TabsContent>
        <TabsContent value="laundry"><LaundryTab /></TabsContent>
        <TabsContent value="linen"><LinenInventoryTab /></TabsContent>
        <TabsContent value="reports"><CorporateReportsTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
