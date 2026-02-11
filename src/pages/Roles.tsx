import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Layers } from "lucide-react";

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

export default function Roles() {
  const { toast } = useToast();
  const qc = useQueryClient();

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
        <div>
          <h1 className="font-heading text-3xl font-bold">Roles y Permisos</h1>
          <p className="text-muted-foreground">Configura qué funciones puede acceder cada rol</p>
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
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Funciones del sistema registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(functions ?? []).map((fn) => (
                <div key={fn.key} className="rounded-lg border p-3">
                  <p className="font-medium text-sm">{fn.label}</p>
                  <p className="text-xs text-muted-foreground">{fn.description}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">{fn.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
