import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function usePermissions() {
  const { user } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_permissions");
      if (error) throw error;
      return (data as { function_key: string }[]).map((r) => r.function_key);
    },
    enabled: !!user,
  });

  const hasPermission = (functionKey: string) => {
    if (!permissions) return false;
    return permissions.includes(functionKey);
  };

  return { permissions, hasPermission, isLoading };
}
