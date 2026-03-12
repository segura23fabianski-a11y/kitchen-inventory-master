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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Pencil, Trash2, Building2, FolderTree, Users } from "lucide-react";
import { toast } from "sonner";

export default function POSContractsTab() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // Contract dialog state
  const [contractOpen, setContractOpen] = useState(false);
  const [contractEditId, setContractEditId] = useState<string | null>(null);
  const [contractCompanyId, setContractCompanyId] = useState("");
  const [contractName, setContractName] = useState("");
  const [contractCode, setContractCode] = useState("");
  const [contractActive, setContractActive] = useState(true);

  // Group dialog state
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupContractId, setGroupContractId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState("");
  const [groupActive, setGroupActive] = useState(true);

  // Queries
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

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, hotel_companies(name)")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["contract-groups", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_groups")
        .select("*, contracts(name, hotel_companies(name))")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  // Contract mutations
  const saveContract = useMutation({
    mutationFn: async () => {
      const payload: any = {
        restaurant_id: restaurantId!,
        company_id: contractCompanyId,
        name: contractName.trim(),
        code: contractCode.trim() || null,
        active: contractActive,
      };
      if (contractEditId) {
        const { error } = await supabase.from("contracts").update(payload).eq("id", contractEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contracts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success(contractEditId ? "Contrato actualizado" : "Contrato creado");
      closeContractDialog();
    },
    onError: () => toast.error("Error al guardar contrato"),
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contrato eliminado");
    },
  });

  // Group mutations
  const saveGroup = useMutation({
    mutationFn: async () => {
      const payload: any = {
        restaurant_id: restaurantId!,
        contract_id: groupContractId,
        name: groupName.trim(),
        group_type: groupType.trim() || null,
        active: groupActive,
      };
      if (groupEditId) {
        const { error } = await supabase.from("contract_groups").update(payload).eq("id", groupEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contract_groups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-groups"] });
      toast.success(groupEditId ? "Subgrupo actualizado" : "Subgrupo creado");
      closeGroupDialog();
    },
    onError: () => toast.error("Error al guardar subgrupo"),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-groups"] });
      toast.success("Subgrupo eliminado");
    },
  });

  const closeContractDialog = () => {
    setContractOpen(false);
    setContractEditId(null);
    setContractCompanyId("");
    setContractName("");
    setContractCode("");
    setContractActive(true);
  };

  const closeGroupDialog = () => {
    setGroupOpen(false);
    setGroupEditId(null);
    setGroupContractId("");
    setGroupName("");
    setGroupType("");
    setGroupActive(true);
  };

  const openEditContract = (c: any) => {
    setContractEditId(c.id);
    setContractCompanyId(c.company_id);
    setContractName(c.name);
    setContractCode(c.code || "");
    setContractActive(c.active);
    setContractOpen(true);
  };

  const openEditGroup = (g: any) => {
    setGroupEditId(g.id);
    setGroupContractId(g.contract_id);
    setGroupName(g.name);
    setGroupType(g.group_type || "");
    setGroupActive(g.active);
    setGroupOpen(true);
  };

  // Group contracts by company for display
  const contractsByCompany: Record<string, { companyName: string; contracts: any[] }> = {};
  for (const c of contracts) {
    const companyName = (c as any).hotel_companies?.name || "Sin empresa";
    if (!contractsByCompany[c.company_id]) {
      contractsByCompany[c.company_id] = { companyName, contracts: [] };
    }
    contractsByCompany[c.company_id].contracts.push(c);
  }

  const groupsByContract: Record<string, any[]> = {};
  for (const g of groups) {
    if (!groupsByContract[g.contract_id]) groupsByContract[g.contract_id] = [];
    groupsByContract[g.contract_id].push(g);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Contratos y Subgrupos</h2>
        <p className="text-sm text-muted-foreground">
          Estructura: Empresa → Contrato/Frente → Subgrupo/Centro de consumo
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => setContractOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />Nuevo Contrato
        </Button>
        <Button onClick={() => setGroupOpen(true)} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />Nuevo Subgrupo
        </Button>
      </div>

      {/* Hierarchy view */}
      {Object.keys(contractsByCompany).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay contratos configurados. Crea un contrato para comenzar.
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {Object.entries(contractsByCompany).map(([companyId, { companyName, contracts: companyContracts }]) => (
            <AccordionItem key={companyId} value={companyId} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{companyName}</span>
                  <Badge variant="outline" className="ml-2">{companyContracts.length} contratos</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                {companyContracts.map(contract => {
                  const contractGroups = groupsByContract[contract.id] || [];
                  return (
                    <div key={contract.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FolderTree className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{contract.name}</span>
                          {contract.code && (
                            <Badge variant="secondary" className="text-xs">{contract.code}</Badge>
                          )}
                          <Badge variant={contract.active ? "default" : "secondary"} className="text-xs">
                            {contract.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContract(contract)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteContract.mutate(contract.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {contractGroups.length > 0 ? (
                        <div className="ml-6 space-y-1">
                          {contractGroups.map(g => (
                            <div key={g.id} className="flex items-center justify-between py-1 text-sm">
                              <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{g.name}</span>
                                {g.group_type && (
                                  <span className="text-xs text-muted-foreground">({g.group_type})</span>
                                )}
                                <Badge variant={g.active ? "outline" : "secondary"} className="text-[10px]">
                                  {g.active ? "Activo" : "Inactivo"}
                                </Badge>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditGroup(g)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteGroup.mutate(g.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ml-6 text-xs text-muted-foreground">Sin subgrupos</p>
                      )}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Contract Dialog */}
      <Dialog open={contractOpen} onOpenChange={v => !v && closeContractDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{contractEditId ? "Editar Contrato" : "Nuevo Contrato / Frente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Empresa</Label>
              <Select value={contractCompanyId} onValueChange={setContractCompanyId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre del contrato / frente</Label>
              <Input value={contractName} onChange={e => setContractName(e.target.value)} placeholder="Ej: RIC 23" />
            </div>
            <div>
              <Label>Código (opcional)</Label>
              <Input value={contractCode} onChange={e => setContractCode(e.target.value)} placeholder="Ej: RIC-23" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={contractActive} onCheckedChange={setContractActive} />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeContractDialog}>Cancelar</Button>
            <Button onClick={() => saveContract.mutate()} disabled={!contractName.trim() || !contractCompanyId}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupOpen} onOpenChange={v => !v && closeGroupDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{groupEditId ? "Editar Subgrupo" : "Nuevo Subgrupo / Centro de Consumo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Contrato / Frente</Label>
              <Select value={groupContractId} onValueChange={setGroupContractId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar contrato..." /></SelectTrigger>
                <SelectContent>
                  {contracts.filter(c => c.active).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {(c as any).hotel_companies?.name} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre del subgrupo</Label>
              <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Ej: staff, cuadrilla, vigilantes" />
            </div>
            <div>
              <Label>Tipo (opcional)</Label>
              <Input value={groupType} onChange={e => setGroupType(e.target.value)} placeholder="Ej: interno, tercero, subcontratista" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={groupActive} onCheckedChange={setGroupActive} />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeGroupDialog}>Cancelar</Button>
            <Button onClick={() => saveGroup.mutate()} disabled={!groupName.trim() || !groupContractId}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
