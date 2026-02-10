import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Users() {
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

  const getRoles = (userId: string) =>
    allRoles?.filter((r) => r.user_id === userId).map((r) => r.role) ?? [];

  const roleBadgeColor = (role: string) => {
    if (role === "admin") return "bg-primary text-primary-foreground";
    if (role === "cocina") return "bg-warning text-warning-foreground";
    return "bg-success text-success-foreground";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground">Gestión de usuarios y roles (solo admin)</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !profiles?.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sin usuarios</TableCell></TableRow>
                ) : (
                  profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || "Sin nombre"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {getRoles(p.user_id).length === 0 ? (
                            <span className="text-sm text-muted-foreground">Sin rol</span>
                          ) : (
                            getRoles(p.user_id).map((r) => (
                              <Badge key={r} className={roleBadgeColor(r)}>{r}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(p.created_at).toLocaleDateString("es")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
