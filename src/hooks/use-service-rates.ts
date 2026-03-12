import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";

/**
 * Resolves the correct price for a menu item based on consumption mode and company.
 * Priority:
 * 1. Company + mode specific rate
 * 2. Company general rate (any mode match)
 * 3. General mode rate (no company)
 * 4. Menu item base price
 */
export function useServiceRates() {
  const restaurantId = useRestaurantId();

  const { data: rates = [] } = useQuery({
    queryKey: ["service-rates-active", restaurantId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("service_rates")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true);
      if (error) throw error;
      // Filter by date validity client-side
      return (data || []).filter(r => {
        if (r.effective_from && r.effective_from > today) return false;
        if (r.effective_to && r.effective_to < today) return false;
        return true;
      });
    },
    enabled: !!restaurantId,
  });

  const resolveRate = (
    menuItemId: string,
    basePrice: number,
    consumptionMode: string,
    companyId?: string | null
  ): { price: number; source: string } => {
    // 1. Company + exact mode
    if (companyId) {
      const companyModeRate = rates.find(
        r => r.menu_item_id === menuItemId && r.company_id === companyId && r.consumption_mode === consumptionMode
      );
      if (companyModeRate) return { price: Number(companyModeRate.price), source: "company_mode" };

      // 2. Company + any (check corporate_charge as fallback for company)
      const companyAnyRate = rates.find(
        r => r.menu_item_id === menuItemId && r.company_id === companyId
      );
      if (companyAnyRate) return { price: Number(companyAnyRate.price), source: "company_general" };
    }

    // 3. General mode rate (no company)
    const generalModeRate = rates.find(
      r => r.menu_item_id === menuItemId && !r.company_id && r.consumption_mode === consumptionMode
    );
    if (generalModeRate) return { price: Number(generalModeRate.price), source: "mode_general" };

    // 4. Base price
    return { price: basePrice, source: "menu_base" };
  };

  return { resolveRate, rates };
}
