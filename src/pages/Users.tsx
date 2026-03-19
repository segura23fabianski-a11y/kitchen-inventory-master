import { useState, useMemo } from "react";
import { fuzzyMatch, buildHaystack } from "@/lib/search-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useRoles } from "@/hooks/use-roles";
import { Plus, Trash2, ShieldPlus, UserCheck, Ban, Clock, Pencil, KeyRound, CalendarClock, Search } from "lucide-react";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";

type EditingUser = { user_id: string; full_name: string };

export default function Users() {
  const { roleNames, getRoleLabel } = useRoles();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [addRoleUserId, setAddRoleUserId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [approveRole, setApproveRole] = useState("");

  // Edit user state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Reset password state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const restaurantId = useRestaurantId();
  const [userSearch, setUserSearch] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const activeProfiles = useMemo(() => {
    const active = profiles?.filter((p) => p.status === "active") ?? [];
    if (!userSearch.trim()) return active;
    return active.filter((p) => fuzzyMatch(buildHaystack(p.full_name), userSearch));
  }, [profiles, userSearch]);
  const pendingProfiles = profiles?.filter((p) => p.status === "pending") ?? [];
  const blockedProfiles = profiles?.filter((p) => p.status === "blocked") ?? [];

  const getRoles = (userId: string) =>
    allRoles?.filter((r) => r.user_id === userId) ?? [];

  const roleBadgeColor = (role: string) => {
    if (role === "admin") return "bg-primary text-primary-foreground";
    if (role === "cocina") return "bg-warning text-warning-foreground";
    return "bg-success text-success-foreground";
  };

  const statusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-success text-success-foreground">Activo</Badge>;
    if (status === "blocked") return <Badge variant="destructive">Bloqueado</Badge>;
    return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pendiente</Badge>;
  };

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, full_name: fullName, role, restaurant_id: restaurantId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      setOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("bodega");
      toast({ title: "Usuario creado exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveUser = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // 1. Update profile: set active, assign restaurant_id, approved_at
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          status: "active",
          restaurant_id: restaurantId,
          approved_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (profileError) throw profileError;

      // 2. Assign role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (roleError) throw roleError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      toast({ title: "Usuario aprobado exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const blockUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "blocked" })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast({ title: "Usuario bloqueado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      setAddRoleUserId(null);
      toast({ title: "Rol asignado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      toast({ title: "Rol eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      toast({ title: "Usuario eliminado exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateUser = useMutation({
    mutationFn: async ({ user_id, full_name, email }: { user_id: string; full_name?: string; email?: string }) => {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: { user_id, full_name, email },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditDialogOpen(false);
      setEditingUser(null);
      toast({ title: "Usuario actualizado exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ user_id, password }: { user_id: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: { user_id, password },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setResetDialogOpen(false);
      setResetUserId(null);
      setNewPassword("");
      toast({ title: "Contraseña restablecida exitosamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleBackdate = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ can_backdate_inventory: value } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast({ title: "Permiso actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Initialization mode settings
  const { data: initModeSetting } = useQuery({
    queryKey: ["init-mode-setting", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "inventory_initialization_mode")
        .maybeSingle();
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: maxDaysSetting } = useQuery({
    queryKey: ["backdate-max-days-setting", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "backdate_max_days")
        .maybeSingle();
      return data;
    },
    enabled: !!restaurantId,
  });

  const toggleInitMode = useMutation({
    mutationFn: async (value: boolean) => {
      if (initModeSetting) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value: value as any })
          .eq("id", initModeSetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_settings")
          .insert({ restaurant_id: restaurantId!, key: "inventory_initialization_mode", value: value as any });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["init-mode-setting"] });
      qc.invalidateQueries({ queryKey: ["init-mode"] });
      toast({ title: "Modo inicialización actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMaxDays = useMutation({
    mutationFn: async (days: number) => {
      if (maxDaysSetting) {
        const { error } = await supabase
          .from("app_settings")
          .update({ value: days as any })
          .eq("id", maxDaysSetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_settings")
          .insert({ restaurant_id: restaurantId!, key: "backdate_max_days", value: days as any });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backdate-max-days-setting"] });
      qc.invalidateQueries({ queryKey: ["backdate-max-days"] });
      toast({ title: "Días máximos actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditUser = (p: { user_id: string; full_name: string }) => {
    setEditingUser(p);
    setEditFullName(p.full_name || "");
    setEditEmail("");
    setEditDialogOpen(true);
  };

  const openResetPassword = (userId: string, name: string) => {
    setResetUserId(userId);
    setResetUserName(name);
    setNewPassword("");
    setResetDialogOpen(true);
  };

  const isCreateValid = email.includes("@") && password.length >= 6 && role;

  const initModeActive = initModeSetting?.value === true;
  const currentMaxDays = typeof maxDaysSetting?.value === "number" ? maxDaysSetting.value : 45;

  const renderActiveTable = () => (
    <>
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <KioskTextInput className="pl-10" placeholder="Buscar usuario..." value={userSearch} onChange={setUserSearch} keyboardLabel="Buscar usuario" inputType="search" />
        </div>
      </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Creado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!activeProfiles.length ? (
          <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin usuarios activos</TableCell></TableRow>
        ) : (
          activeProfiles.map((p) => {
            const userRoles = getRoles(p.user_id);
            const assignedRoleNames = userRoles.map((r) => r.role);
            const availableRoles = roleNames.filter((r) => !assignedRoleNames.includes(r));
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name || "Sin nombre"}</TableCell>
                <TableCell>{statusBadge(p.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap items-center">
                    {userRoles.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Sin rol</span>
                    ) : (
                      userRoles.map((r) => (
                        <div key={r.id} className="flex items-center gap-0.5">
                          <Badge className={roleBadgeColor(r.role)}>{r.role}</Badge>
                          <button
                            onClick={() => removeRole.mutate(r.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            title="Quitar rol"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(p.created_at).toLocaleDateString("es")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {availableRoles.length > 0 && (
                      addRoleUserId === p.user_id ? (
                        <div className="flex items-center gap-2">
                          <Select value={newRole} onValueChange={(v) => setNewRole(v)}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRoles.map((r) => (
                                <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={() => addRole.mutate({ userId: p.user_id, role: newRole })} disabled={addRole.isPending}>
                            Asignar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddRoleUserId(null)}>✕</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setAddRoleUserId(p.user_id); setNewRole(availableRoles[0]); }}>
                          <ShieldPlus className="mr-1 h-3 w-3" /> Agregar rol
                        </Button>
                      )
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEditUser(p)} title="Editar datos">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openResetPassword(p.user_id, p.full_name || "este usuario")} title="Restablecer contraseña">
                      <KeyRound className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant={(p as any).can_backdate_inventory ? "default" : "ghost"}
                      className={cn((p as any).can_backdate_inventory && "bg-warning text-warning-foreground hover:bg-warning/90")}
                      onClick={() => toggleBackdate.mutate({ userId: p.user_id, value: !(p as any).can_backdate_inventory })}
                      title={`Backdating: ${(p as any).can_backdate_inventory ? "Activado" : "Desactivado"}`}
                    >
                      <CalendarClock className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => blockUser.mutate(p.user_id)}>
                      <Ban className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente a <strong>{p.full_name || "este usuario"}</strong> y todos sus datos asociados. No se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteUser.mutate(p.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
    </>
  );

  const renderPendingTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Registrado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!pendingProfiles.length ? (
          <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No hay usuarios pendientes</TableCell></TableRow>
        ) : (
          pendingProfiles.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.full_name || "Sin nombre"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(p.created_at).toLocaleDateString("es")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <Select value={approveRole} onValueChange={(v) => setApproveRole(v)}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleNames.map((r) => (
                        <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => approveUser.mutate({ userId: p.user_id, role: approveRole })}
                    disabled={approveUser.isPending}
                  >
                    <UserCheck className="mr-1 h-3 w-3" /> Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => blockUser.mutate(p.user_id)}
                  >
                    <Ban className="mr-1 h-3 w-3" /> Bloquear
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción eliminará permanentemente a <strong>{p.full_name || "este usuario"}</strong>. No se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteUser.mutate(p.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Usuarios</h1>
            <p className="text-muted-foreground">Gestión de usuarios, aprobación y roles</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Usuario</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Crear Usuario</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (isCreateValid) createUser.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
                </div>
                <div className="space-y-2">
                  <Label>Correo electrónico *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@ejemplo.com" required />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña * (mín. 6 caracteres)</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <div className="space-y-2">
                  <Label>Rol inicial *</Label>
                  <Select value={role} onValueChange={(v) => setRole(v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                    <SelectContent>
                      {roleNames.map((r) => (
                        <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createUser.isPending || !isCreateValid}>
                  {createUser.isPending ? "Creando..." : "Crear Usuario"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="h-4 w-4" />
              Pendientes {pendingProfiles.length > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{pendingProfiles.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="active">Activos ({activeProfiles.length})</TabsTrigger>
            <TabsTrigger value="blocked">Bloqueados ({blockedProfiles.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Usuarios Pendientes de Aprobación</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {renderPendingTable()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                ) : renderActiveTable()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blocked">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Registrado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!blockedProfiles.length ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sin usuarios bloqueados</TableCell></TableRow>
                    ) : (
                      blockedProfiles.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.full_name || "Sin nombre"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(p.created_at).toLocaleDateString("es")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveUser.mutate({ userId: p.user_id, role: approveRole })}
                              >
                                <UserCheck className="mr-1 h-3 w-3" /> Reactivar
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción eliminará permanentemente a <strong>{p.full_name || "este usuario"}</strong>. No se puede deshacer.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteUser.mutate(p.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Initialization Mode Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Modo Inicialización de Inventario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Modo inicialización</p>
                <p className="text-sm text-muted-foreground">Permite registrar movimientos con fecha anterior a usuarios autorizados</p>
              </div>
              <Switch
                checked={initModeActive}
                onCheckedChange={(v) => toggleInitMode.mutate(v)}
                disabled={toggleInitMode.isPending}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Días máximos de retroactividad</p>
                <p className="text-sm text-muted-foreground">Límite de días hacia atrás para registrar movimientos</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20"
                  value={currentMaxDays}
                  min={1}
                  max={365}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v > 0) updateMaxDays.mutate(v);
                  }}
                />
                <span className="text-sm text-muted-foreground">días</span>
              </div>
            </div>
            {initModeActive && (
              <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-warning">
                ⚠️ Modo inicialización activo. Los usuarios con el permiso <CalendarClock className="inline h-3 w-3" /> pueden registrar movimientos con fecha anterior.
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditDialogOpen(false); setEditingUser(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Editar Usuario</DialogTitle>
              <DialogDescription>Actualiza el nombre o correo electrónico del usuario</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (editingUser) {
                updateUser.mutate({
                  user_id: editingUser.user_id,
                  full_name: editFullName,
                  ...(editEmail ? { email: editEmail } : {}),
                });
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} placeholder="Nombre completo" />
              </div>
              <div className="space-y-2">
                <Label>Nuevo correo electrónico (opcional)</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Dejar vacío para no cambiar" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending ? "Guardando..." : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetDialogOpen} onOpenChange={(open) => { if (!open) { setResetDialogOpen(false); setResetUserId(null); setNewPassword(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Restablecer Contraseña</DialogTitle>
              <DialogDescription>Nueva contraseña para <strong>{resetUserName}</strong></DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (resetUserId && newPassword.length >= 6) {
                resetPassword.mutate({ user_id: resetUserId, password: newPassword });
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nueva contraseña * (mín. 6 caracteres)</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={resetPassword.isPending || newPassword.length < 6}>
                  {resetPassword.isPending ? "Restableciendo..." : "Restablecer contraseña"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
