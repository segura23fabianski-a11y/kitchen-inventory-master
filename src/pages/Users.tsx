import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Plus, Trash2, ShieldPlus, UserCheck, Ban, Clock } from "lucide-react";

const ROLES = ["admin", "cocina", "bodega"] as const;
type AppRole = (typeof ROLES)[number];

export default function Users() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("bodega");
  const [addRoleUserId, setAddRoleUserId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("bodega");
  const [approveRole, setApproveRole] = useState<AppRole>("bodega");
  const { toast } = useToast();
  const qc = useQueryClient();
  const restaurantId = useRestaurantId();

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

  const activeProfiles = profiles?.filter((p) => p.status === "active") ?? [];
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
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
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
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
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

  const isCreateValid = email.includes("@") && password.length >= 6 && role;

  const renderActiveTable = () => (
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
            const availableRoles = ROLES.filter((r) => !assignedRoleNames.includes(r));
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
                          <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRoles.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
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
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => blockUser.mutate(p.user_id)}>
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
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
                  <Select value={approveRole} onValueChange={(v) => setApproveRole(v as AppRole)}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
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
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="bodega">Bodega</SelectItem>
                      <SelectItem value="cocina">Cocina</SelectItem>
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveUser.mutate({ userId: p.user_id, role: approveRole })}
                            >
                              <UserCheck className="mr-1 h-3 w-3" /> Reactivar
                            </Button>
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
      </div>
    </AppLayout>
  );
}
