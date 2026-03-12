import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";

export function useContractServiceRates() {
  const restaurantId = useRestaurantId();

  const { data: serviceRates = [] } = useQuery({
    queryKey: ["contract-service-rates", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_service_rates" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId,
  });

  /**
   * Resolve the rate for a corporate service.
   * Priority: 1) company + contract + service_type  2) company + service_type (no contract)
   */
  const resolveServiceRate = (
    companyId: string,
    contractId: string | null,
    serviceType: string
  ): { rate: number; found: boolean } => {
    // 1. Exact match: company + contract + service_type
    if (contractId) {
      const exact = serviceRates.find(
        (r: any) => r.company_id === companyId && r.contract_id === contractId && r.service_type === serviceType
      );
      if (exact) return { rate: Number(exact.rate), found: true };
    }

    // 2. Company-level rate (no contract)
    const companyRate = serviceRates.find(
      (r: any) => r.company_id === companyId && !r.contract_id && r.service_type === serviceType
    );
    if (companyRate) return { rate: Number(companyRate.rate), found: true };

    return { rate: 0, found: false };
  };

  return { serviceRates, resolveServiceRate };
}
