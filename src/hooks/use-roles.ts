import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = {
  id: string;
  name: string;
  label: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
};

export function useRoles() {
  const { data: roles, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as Role[];
    },
  });

  const roleNames = roles?.map((r) => r.name) ?? [];
  const getRoleLabel = (name: string) => roles?.find((r) => r.name === name)?.label ?? name;

  return { roles: roles ?? [], roleNames, getRoleLabel, isLoading };
}
