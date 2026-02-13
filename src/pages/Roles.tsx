import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Layers, Plus, Pencil, Trash2 } from "lucide-react";

const ROLES = ["admin", "cocina", "bodega"] as const;
type AppRole = (typeof ROLES)[number];

const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  cocina: "Cocina",
  bodega: "Bodega",
};

const roleBadgeColor: Record<AppRole, string> = {
  admin: "bg-primary text-primary-foreground",
  cocina: "bg-warning text-warning-foreground",
  bodega: "bg-success text-success-foreground",
};

const CATEGORIES = ["Inventario", "Catálogo", "Administración", "Reportes", "General"];

type SystemFunction = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
  created_at: string;
};

export default function Roles() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Dialog state for create/edit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SystemFunction | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formSortOrder, setFormSortOrder] = useState(0);

  const { data: functions, isLoading: loadingFunctions } = useQuery({
    queryKey: ["system-functions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_functions")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions, isLoading: loadingPerms } = useQuery({
    queryKey: ["all-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const hasPermission = (role: AppRole, functionKey: string) =>
    permissions?.some((p) => p.role === role && p.function_key === functionKey) ?? false;

  const togglePermission = useMutation({
    mutationFn: async ({ role, functionKey, enabled }: { role: AppRole; functionKey: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from("role_permissions").insert({ role, function_key: functionKey });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("role_permissions").delete().eq("role", role).eq("function_key", functionKey);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createFunction = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("system_functions").insert({
        key: formKey,
        label: formLabel,
        description: formDescription || null,
        category: formCategory,
        sort_order: formSortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-functions"] });
      resetForm();
      toast({ title: "Función creada exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateFunction = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("system_functions").update({
        key: formKey,
        label: formLabel,
        description: formDescription || null,
        category: formCategory,
        sort_order: formSortOrder,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-functions"] });
      qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      resetForm();
      toast({ title: "Función actualizada exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFunction = useMutation({
    mutationFn: async (id: string) => {
      // Delete associated permissions first
      const fn = functions?.find((f) => f.id === id);
      if (fn) {
        await supabase.from("role_permissions").delete().eq("function_key", fn.key);
      }
      const { error } = await supabase.from("system_functions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-functions"] });
      qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      toast({ title: "Función eliminada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditing(null);
    setFormKey("");
    setFormLabel("");
    setFormDescription("");
    setFormCategory("General");
    setFormSortOrder(0);
  };

  const openCreate = () => {
    setEditing(null);
    setFormKey("");
    setFormLabel("");
    setFormDescription("");
    setFormCategory("General");
    setFormSortOrder((functions?.length ?? 0) + 1);
    setDialogOpen(true);
  };

  const openEdit = (fn: SystemFunction) => {
    setEditing(fn);
    setFormKey(fn.key);
    setFormLabel(fn.label);
    setFormDescription(fn.description || "");
    setFormCategory(fn.category);
    setFormSortOrder(fn.sort_order);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateFunction.mutate();
    } else {
      createFunction.mutate();
    }
  };

  const isFormValid = formKey.trim().length > 0 && formLabel.trim().length > 0;

  // Group functions by category
  const grouped = (functions ?? []).reduce<Record<string, typeof functions>>((acc, fn) => {
    const cat = fn.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(fn);
    return acc;
  }, {});

  const isLoading = loadingFunctions || loadingPerms;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Roles y Permisos</h1>
            <p className="text-muted-foreground">Configura qué funciones puede acceder cada rol</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Cargando...</p>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-sm text-muted-foreground w-[300px]">Función</th>
                    {ROLES.map((role) => (
                      <th key={role} className="p-4 text-center min-w-[120px]">
                        <Badge className={roleBadgeColor[role]}>{roleLabels[role]}</Badge>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([category, fns]) => (
                    <>
                      <tr key={`cat-${category}`} className="bg-muted/50">
                        <td colSpan={ROLES.length + 1} className="px-4 py-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            {category}
                          </div>
                        </td>
                      </tr>
                      {fns!.map((fn) => (
                        <tr key={fn.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-4">
                            <div>
                              <p className="font-medium text-sm">{fn.label}</p>
                              <p className="text-xs text-muted-foreground">{fn.description}</p>
                            </div>
                          </td>
                          {ROLES.map((role) => {
                            const enabled = hasPermission(role, fn.key);
                            const isAdminCore = role === "admin" && ["roles", "users"].includes(fn.key);
                            return (
                              <td key={role} className="p-4 text-center">
                                <Switch
                                  checked={enabled}
                                  disabled={isAdminCore || togglePermission.isPending}
                                  onCheckedChange={(checked) =>
                                    togglePermission.mutate({ role, functionKey: fn.key, enabled: checked })
                                  }
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Funciones del sistema
              </CardTitle>
              <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else openCreate(); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Nueva función</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-heading">{editing ? "Editar función" : "Crear función"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Clave (key) *</Label>
                      <Input value={formKey} onChange={(e) => setFormKey(e.target.value)} placeholder="ej: products_create" disabled={!!editing} />
                      {!!editing && <p className="text-xs text-muted-foreground">La clave no se puede cambiar</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <Input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="ej: Crear productos" />
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción</Label>
                      <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Descripción opcional" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Categoría</Label>
                        <Select value={formCategory} onValueChange={setFormCategory}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Orden</Label>
                        <Input type="number" value={formSortOrder} onChange={(e) => setFormSortOrder(Number(e.target.value))} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={!isFormValid || createFunction.isPending || updateFunction.isPending}>
                        {editing ? "Guardar cambios" : "Crear función"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(functions ?? []).map((fn) => (
                <div key={fn.key} className="rounded-lg border p-3 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{fn.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{fn.description}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs">{fn.category}</Badge>
                        <span className="text-xs text-muted-foreground">({fn.key})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(fn)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar función?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará <strong>{fn.label}</strong> y todos los permisos asociados. No se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteFunction.mutate(fn.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}