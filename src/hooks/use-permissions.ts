import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function usePermissions() {
  const { roles } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["role-permissions", roles],
    queryFn: async () => {
      if (!roles.length) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("function_key, role")
        .in("role", roles);
      if (error) throw error;
      return data;
    },
    enabled: roles.length > 0,
  });

  const hasPermission = (functionKey: string) => {
    if (!permissions) return false;
    return permissions.some((p) => p.function_key === functionKey);
  };

  return { permissions, hasPermission, isLoading };
}
