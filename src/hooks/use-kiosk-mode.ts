import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";

export function useKioskMode() {
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  const { data: kioskMode = false, isLoading } = useQuery({
    queryKey: ["app-setting", "kiosk_mode", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("restaurant_id", restaurantId!)
        .eq("key", "kiosk_mode")
        .maybeSingle();
      return data?.value === true;
    },
    enabled: !!restaurantId,
  });

  const toggleKioskMode = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from("app_settings").upsert(
        {
          restaurant_id: restaurantId!,
          key: "kiosk_mode",
          value: enabled as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id,key" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-setting", "kiosk_mode"] }),
  });

  return { kioskMode, isLoading, toggleKioskMode };
}
