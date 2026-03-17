import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { usePermissions } from "@/hooks/use-permissions";

export function useBackdate() {
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { hasPermission } = usePermissions();

  const { data: canBackdate } = useQuery({
    queryKey: ["can-backdate", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("can_backdate_inventory")
        .eq("user_id", user!.id)
        .single();
      if (error) return false;
      return (data as any)?.can_backdate_inventory ?? false;
    },
    enabled: !!user,
  });

  // Check global setting
  const { data: initModeGlobal } = useQuery({
    queryKey: ["init-mode", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "inventory_initialization_mode")
        .maybeSingle();
      return data?.value === true;
    },
    enabled: !!restaurantId,
  });

  // Init mode is allowed if the global setting is on AND the user's role has the permission
  const hasInitPermission = hasPermission("inventory_init_mode");
  const initMode = !!(initModeGlobal && hasInitPermission);

  const { data: maxDays } = useQuery({
    queryKey: ["backdate-max-days", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "backdate_max_days")
        .maybeSingle();
      return typeof data?.value === "number" ? data.value : 45;
    },
    enabled: !!restaurantId,
  });

  const backdatingAllowed = !!(canBackdate && initMode);

  return { canBackdate: !!canBackdate, initMode, backdatingAllowed, maxDays: maxDays ?? 45 };
}
