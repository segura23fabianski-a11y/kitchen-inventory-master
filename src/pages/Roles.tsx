import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useRoles, type Role } from "@/hooks/use-roles";
import { Shield, Layers, Plus, Pencil, Trash2, Users } from "lucide-react";

const CATEGORIES = ["Inventario", "Catálogo", "Administración", "Reportes", "General", "Hotel", "Housekeeping", "Lavandería", "compras", "inventario", "Producción", "Análisis", "operacion", "admin"];

export default function Roles() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { roles, roleNames, isLoading: loadingRoles } = useRoles();

  // Role CRUD dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  // Function CRUD dialog state
  const [fnDialogOpen, setFnDialogOpen] = useState(false);
  const [editingFn, setEditingFn] = useState<any>(null);
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

  const hasPermission = (role: string, functionKey: string) =>
    permissions?.some((p) => p.role === role && p.function_key === functionKey) ?? false;

  const togglePermission = useMutation({
    mutationFn: async ({ role, functionKey, enabled }: { role: string; functionKey: string; enabled: boolean }) => {
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

  // --- Role CRUD mutations ---
  const createRole = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("roles").insert({
        name: roleName.toLowerCase().replace(/\s+/g, "_"),
        label: roleLabel,
        description: roleDescription || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      resetRoleForm();
      toast({ title: "Rol creado exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: async () => {
      if (!editingRole) return;
      const { error } = await supabase.from("roles").update({
        label: roleLabel,
        description: roleDescription || null,
      }).eq("id", editingRole.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      resetRoleForm();
      toast({ title: "Rol actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: async (role: Role) => {
      // Delete associated permissions and user_roles
      await supabase.from("role_permissions").delete().eq("role", role.name);
      await supabase.from("user_roles").delete().eq("role", role.name);
      const { error } = await supabase.from("roles").delete().eq("id", role.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      toast({ title: "Rol eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetRoleForm = () => {
    setRoleDialogOpen(false);
    setEditingRole(null);
    setRoleName("");
    setRoleLabel("");
    setRoleDescription("");
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleLabel("");
    setRoleDescription("");
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleLabel(role.label);
    setRoleDescription(role.description || "");
    setRoleDialogOpen(true);
  };

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRole) updateRole.mutate();
    else createRole.mutate();
  };

  // --- Function CRUD mutations ---
  const createFunction = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("system_functions").insert({
        key: formKey, label: formLabel, description: formDescription || null,
        category: formCategory, sort_order: formSortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-functions"] });
      resetFnForm();
      toast({ title: "Función creada exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateFunction = useMutation({
    mutationFn: async () => {
      if (!editingFn) return;
      const { error } = await supabase.from("system_functions").update({
        key: formKey, label: formLabel, description: formDescription || null,
        category: formCategory, sort_order: formSortOrder,
      }).eq("id", editingFn.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-functions"] });
      qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      resetFnForm();
      toast({ title: "Función actualizada" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFunction = useMutation({
    mutationFn: async (id: string) => {
      const fn = functions?.find((f) => f.id === id);
      if (fn) await supabase.from("role_permissions").delete().eq("function_key", fn.key);
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

  const resetFnForm = () => {
    setFnDialogOpen(false);
    setEditingFn(null);
    setFormKey(""); setFormLabel(""); setFormDescription(""); setFormCategory("General"); setFormSortOrder(0);
  };

  const openCreateFn = () => {
    setEditingFn(null);
    setFormKey(""); setFormLabel(""); setFormDescription(""); setFormCategory("General");
    setFormSortOrder((functions?.length ?? 0) + 1);
    setFnDialogOpen(true);
  };

  const openEditFn = (fn: any) => {
    setEditingFn(fn);
    setFormKey(fn.key); setFormLabel(fn.label); setFormDescription(fn.description || "");
    setFormCategory(fn.category); setFormSortOrder(fn.sort_order);
    setFnDialogOpen(true);
  };

  const handleFnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFn) updateFunction.mutate();
    else createFunction.mutate();
  };

  const roleBadgeColor = (name: string) => {
    if (name === "admin") return "bg-primary text-primary-foreground";
    if (name === "cocina") return "bg-warning text-warning-foreground";
    if (name === "bodega") return "bg-success text-success-foreground";
    return "bg-accent text-accent-foreground";
  };

  const grouped = (functions ?? []).reduce<Record<string, typeof functions>>((acc, fn) => {
    const cat = fn.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(fn);
    return acc;
  }, {});

  const isLoading = loadingFunctions || loadingPerms || loadingRoles;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Roles y Permisos</h1>
          <p className="text-muted-foreground">Gestiona roles, funciones y su matriz de permisos</p>
        </div>

        {/* ===== ROLES MANAGEMENT ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Roles
              </CardTitle>
              <Button size="sm" onClick={openCreateRole}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo rol
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-3 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={roleBadgeColor(role.name)}>{role.label}</Badge>
                        {role.is_system && <Badge variant="outline" className="text-xs">Sistema</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                      <span className="text-xs text-muted-foreground">({role.name})</span>
                    </div>
                    {!role.is_system && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditRole(role)}>
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
                              <AlertDialogTitle>¿Eliminar rol "{role.label}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminarán todos los permisos y asignaciones de usuario de este rol. No se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteRole.mutate(role)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Role Dialog */}
        <Dialog open={roleDialogOpen} onOpenChange={(open) => { if (!open) resetRoleForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">{editingRole ? "Editar rol" : "Crear rol"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRoleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre (clave) *</Label>
                <Input
                  value={editingRole ? roleName : roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="ej: contable"
                  disabled={!!editingRole}
                />
                {!editingRole && <p className="text-xs text-muted-foreground">Se usará como identificador interno (sin espacios)</p>}
              </div>
              <div className="space-y-2">
                <Label>Etiqueta *</Label>
                <Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} placeholder="ej: Contable" />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} placeholder="Descripción del rol" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!roleName.trim() || !roleLabel.trim() || createRole.isPending || updateRole.isPending}>
                  {editingRole ? "Guardar cambios" : "Crear rol"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ===== PERMISSIONS MATRIX ===== */}
        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Cargando...</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Matriz de Permisos</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-sm text-muted-foreground w-[300px]">Función</th>
                    {roleNames.map((name) => {
                      const role = roles.find((r) => r.name === name);
                      return (
                        <th key={name} className="p-4 text-center min-w-[120px]">
                          <Badge className={roleBadgeColor(name)}>{role?.label ?? name}</Badge>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([category, fns]) => (
                    <>
                      <tr key={`cat-${category}`} className="bg-muted/50">
                        <td colSpan={roleNames.length + 1} className="px-4 py-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            {category}
                          </div>
                        </td>
                      </tr>
                      {fns!.map((fn) => (
                        <tr key={fn.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-4">
                            <p className="font-medium text-sm">{fn.label}</p>
                            <p className="text-xs text-muted-foreground">{fn.description}</p>
                          </td>
                          {roleNames.map((roleName) => {
                            const enabled = hasPermission(roleName, fn.key);
                            const isAdminCore = roleName === "admin" && ["roles", "users"].includes(fn.key);
                            return (
                              <td key={roleName} className="p-4 text-center">
                                <Switch
                                  checked={enabled}
                                  disabled={isAdminCore || togglePermission.isPending}
                                  onCheckedChange={(checked) =>
                                    togglePermission.mutate({ role: roleName, functionKey: fn.key, enabled: checked })
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

        {/* ===== SYSTEM FUNCTIONS ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Funciones del sistema
              </CardTitle>
              <Button size="sm" onClick={openCreateFn}>
                <Plus className="mr-1 h-4 w-4" /> Nueva función
              </Button>
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
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditFn(fn)}>
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

        {/* Function Dialog */}
        <Dialog open={fnDialogOpen} onOpenChange={(open) => { if (!open) resetFnForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">{editingFn ? "Editar función" : "Crear función"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleFnSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Clave (key) *</Label>
                <Input value={formKey} onChange={(e) => setFormKey(e.target.value)} placeholder="ej: products_create" disabled={!!editingFn} />
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
                  <NumericInput mode="integer" value={formSortOrder} onChange={(v) => setFormSortOrder(Number(v))} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!formKey.trim() || !formLabel.trim() || createFunction.isPending || updateFunction.isPending}>
                  {editingFn ? "Guardar cambios" : "Crear función"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
