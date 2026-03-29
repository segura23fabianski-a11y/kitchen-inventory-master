import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check caller is admin
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores pueden eliminar usuarios");

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile?.restaurant_id) throw new Error("Tu perfil no tiene restaurante asignado");

    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id es requerido");

    // Prevent self-deletion
    if (user_id === caller.id) throw new Error("No puedes eliminarte a ti mismo");

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", user_id)
      .maybeSingle();
    if (targetProfileError) throw targetProfileError;
    if (!targetProfile || targetProfile.restaurant_id !== callerProfile.restaurant_id) {
      throw new Error("No puedes eliminar usuarios de otro restaurante");
    }

    // Delete roles first
    await adminClient.from("user_roles").delete().eq("user_id", user_id);

    // Delete profile
    await adminClient.from("profiles").delete().eq("user_id", user_id);

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
