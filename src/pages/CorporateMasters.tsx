import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FolderTree, DollarSign } from "lucide-react";
import { useState } from "react";
import CompaniesTab from "@/components/hotel/CompaniesTab";
import POSContractsTab from "@/components/pos/POSContractsTab";
import CorporateRatesTab from "@/components/corporate/CorporateRatesTab";

export default function CorporateMasters() {
  const [tab, setTab] = useState("companies");

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Maestros Corporativos</h1>
          <p className="text-sm text-muted-foreground">
            Gestión centralizada de empresas, contratos, subgrupos y tarifas. Hotel y POS utilizan estos datos pero no los modifican.
          </p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="companies" className="gap-1.5">
              <Building2 className="h-4 w-4" />Empresas
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5">
              <FolderTree className="h-4 w-4" />Contratos y Subgrupos
            </TabsTrigger>
            <TabsTrigger value="rates" className="gap-1.5">
              <DollarSign className="h-4 w-4" />Tarifas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="companies"><CompaniesTab /></TabsContent>
          <TabsContent value="contracts"><POSContractsTab /></TabsContent>
          <TabsContent value="rates"><CorporateRatesTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
