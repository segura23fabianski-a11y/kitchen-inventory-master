import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function useRestaurantId() {
  const { user } = useAuth();

  const { data: restaurantId } = useQuery({
    queryKey: ["my-restaurant-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data.restaurant_id;
    },
    enabled: !!user,
  });

  return restaurantId;
}
