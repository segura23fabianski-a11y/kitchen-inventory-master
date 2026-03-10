import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";

export function usePdfSettings() {
  const restaurantId = useRestaurantId();

  return useQuery({
    queryKey: ["pdf-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_pdf_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });
}
