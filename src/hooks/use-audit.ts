import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "ADD_CODE" | "REMOVE_CODE" | "COST_CHANGE" | "ROLLBACK" | "BACKDATED_MOVEMENT";

interface AuditParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  canRollback?: boolean;
  metadata?: Record<string, any> | null;
}

export function useAudit() {
  const { user } = useAuth();
  const restaurantId = useRestaurantId();

  const logAudit = async (params: AuditParams) => {
    if (!user || !restaurantId) return;
    try {
      await supabase.from("audit_events" as any).insert({
        restaurant_id: restaurantId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        performed_by: user.id,
        before: params.before ?? null,
        after: params.after ?? null,
        can_rollback: params.canRollback ?? false,
        metadata: params.metadata ?? null,
      } as any);
    } catch (e) {
      console.error("Audit log error:", e);
    }
  };

  return { logAudit };
}
