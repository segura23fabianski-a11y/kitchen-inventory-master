import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores pueden crear usuarios");

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile?.restaurant_id) {
      throw new Error("Tu perfil no tiene restaurante asignado; no puedes crear usuarios");
    }
    const restaurantId = callerProfile.restaurant_id as string;

    const { email, password, full_name, role } = await req.json();

    if (!email || !password || !role) throw new Error("email, password y role son requeridos");
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

    // Validate role exists in the roles table
    const { data: validRole } = await adminClient
      .from("roles")
      .select("name")
      .eq("name", role)
      .maybeSingle();
    if (!validRole) throw new Error(`Rol inválido: ${role}`);

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });
    if (createError) throw createError;

    await adminClient.from("profiles").update({
      full_name: full_name || "",
      restaurant_id: restaurantId,
      status: "active",
      approved_at: new Date().toISOString(),
    }).eq("user_id", newUser.user.id);

    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
    });
    if (roleError) throw roleError;

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
