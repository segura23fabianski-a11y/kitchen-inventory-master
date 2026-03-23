import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) throw new Error("No autorizado");

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's restaurant
    const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", user.id).single();
    if (!profile?.restaurant_id) throw new Error("Sin restaurante asignado");
    const restaurantId = profile.restaurant_id;

    const body = await req.json();
    const { smart_invoice_id } = body;
    if (!smart_invoice_id) throw new Error("smart_invoice_id requerido");

    // Fetch the smart invoice
    const { data: smartInv, error: invErr } = await db
      .from("smart_invoices")
      .select("*")
      .eq("id", smart_invoice_id)
      .eq("restaurant_id", restaurantId)
      .single();
    if (invErr || !smartInv) throw new Error("Factura inteligente no encontrada");

    // Download PDF from storage
    const pdfPath = smartInv.pdf_url;
    if (!pdfPath) throw new Error("No hay PDF asociado");

    const { data: pdfData, error: dlErr } = await db.storage
      .from("invoice-pdfs")
      .download(pdfPath);
    if (dlErr || !pdfData) throw new Error("No se pudo descargar el PDF");

    const pdfBytes = await pdfData.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

    // Fetch products, presentations, and aliases for matching context
    const [productsRes, presentationsRes, aliasesRes] = await Promise.all([
      db.from("products").select("id, name, unit, barcode").eq("restaurant_id", restaurantId),
      db.from("purchase_presentations").select("id, product_id, name, conversion_factor").eq("restaurant_id", restaurantId).eq("active", true),
      db.from("invoice_product_aliases").select("*").eq("restaurant_id", restaurantId),
    ]);

    const products = productsRes.data ?? [];
    const presentations = presentationsRes.data ?? [];
    const aliases = aliasesRes.data ?? [];

    // Also fetch product codes
    const { data: productCodes } = await db.from("product_codes").select("product_id, code, description").eq("restaurant_id", restaurantId);

    // Build product catalog for AI context
    const productCatalog = products.map((p: any) => {
      const codes = (productCodes ?? []).filter((c: any) => c.product_id === p.id).map((c: any) => c.code);
      const presos = presentations.filter((pr: any) => pr.product_id === p.id).map((pr: any) => `${pr.name} (=${pr.conversion_factor} ${p.unit})`);
      return `- ${p.name} [${p.unit}]${p.barcode ? ` barcode:${p.barcode}` : ""}${codes.length ? ` códigos:${codes.join(",")}` : ""}${presos.length ? ` presentaciones:${presos.join(",")}` : ""}`;
    }).join("\n");

    const aliasCatalog = aliases.map((a: any) => `- "${a.external_name}" → producto_id:${a.product_id}`).join("\n");

    // Call Lovable AI with the PDF
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Eres un sistema de extracción de datos de facturas de compra. Extrae toda la información relevante del PDF de factura adjunto.

CATÁLOGO DE PRODUCTOS DEL SISTEMA:
${productCatalog}

${aliasCatalog ? `ALIASES CONOCIDOS:\n${aliasCatalog}` : ""}

INSTRUCCIONES:
1. Extrae: proveedor, fecha, número de factura, y cada línea de producto con su descripción, cantidad, precio unitario y total.
2. Para cada línea, intenta identificar el producto del catálogo que mejor coincida (match flexible por nombre, no requiere match exacto).
3. Si detectas una presentación (ej: "bolsa 900g", "pack x6", "caja x12"), indícala.
4. Si NO puedes identificar un producto con confianza, marca confidence como 0.
5. Extrae subtotales y total de la factura.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae los datos de esta factura de compra:" },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice",
              description: "Datos extraídos de la factura de compra",
              parameters: {
                type: "object",
                properties: {
                  supplier_name: { type: "string", description: "Nombre del proveedor" },
                  invoice_number: { type: "string", description: "Número de factura" },
                  invoice_date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
                  total: { type: "number", description: "Total de la factura" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string", description: "Descripción del ítem tal como aparece en la factura" },
                        quantity: { type: "number", description: "Cantidad" },
                        unit_price: { type: "number", description: "Precio unitario" },
                        total: { type: "number", description: "Total de la línea" },
                        matched_product_name: { type: "string", description: "Nombre del producto del catálogo que coincide (o vacío si no hay match)" },
                        matched_product_id: { type: "string", description: "ID UUID del producto del catálogo (o vacío)" },
                        detected_presentation: { type: "string", description: "Presentación detectada (ej: bolsa 900g, pack x6) o vacío" },
                        confidence: { type: "number", description: "Confianza del match de 0 a 1" },
                      },
                      required: ["description", "quantity", "unit_price", "total", "confidence"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido, intenta de nuevo en unos minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para el servicio de IA." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("La IA no pudo extraer datos del PDF");

    const extracted = JSON.parse(toolCall.function.arguments);

    // Update smart invoice header
    await db.from("smart_invoices").update({
      supplier_name: extracted.supplier_name || null,
      invoice_number: extracted.invoice_number || null,
      invoice_date: extracted.invoice_date || null,
      total_detected: extracted.total || null,
      ai_raw_response: extracted,
      status: "draft",
      updated_at: new Date().toISOString(),
    }).eq("id", smart_invoice_id);

    // Try to match supplier
    if (extracted.supplier_name) {
      const { data: matchedSuppliers } = await db
        .from("suppliers")
        .select("id, name")
        .eq("restaurant_id", restaurantId)
        .ilike("name", `%${extracted.supplier_name.split(" ")[0]}%`)
        .limit(1);
      if (matchedSuppliers?.length) {
        await db.from("smart_invoices").update({ supplier_id: matchedSuppliers[0].id }).eq("id", smart_invoice_id);
      }
    }

    // Delete existing items for re-parse
    await db.from("smart_invoice_items").delete().eq("smart_invoice_id", smart_invoice_id);

    // Process each extracted item
    const itemsToInsert = (extracted.items ?? []).map((item: any) => {
      let productId = null;
      let presentationId = null;
      let qtyBase = item.quantity;
      let unitCostBase = item.unit_price;
      let matchStatus = "unmatched";
      let matchConfidence = item.confidence ?? 0;

      // Try alias match first
      const aliasMatch = aliases.find((a: any) => 
        a.external_name.toLowerCase() === (item.description || "").toLowerCase()
      );
      if (aliasMatch) {
        productId = aliasMatch.product_id;
        presentationId = aliasMatch.presentation_id;
        matchStatus = "confirmed";
        matchConfidence = 1;
      }

      // Try AI match
      if (!productId && item.matched_product_id) {
        const prod = products.find((p: any) => p.id === item.matched_product_id);
        if (prod) {
          productId = prod.id;
          matchStatus = matchConfidence >= 0.8 ? "suggested" : "unmatched";
        }
      }

      // Try fuzzy name match
      if (!productId && item.matched_product_name) {
        const normalizedName = (item.matched_product_name || "").toLowerCase();
        const prod = products.find((p: any) => p.name.toLowerCase() === normalizedName);
        if (prod) {
          productId = prod.id;
          matchStatus = "suggested";
          matchConfidence = Math.max(matchConfidence, 0.7);
        }
      }

      // Try presentation match
      if (productId && item.detected_presentation) {
        const pres = presentations.find((pr: any) =>
          pr.product_id === productId &&
          pr.name.toLowerCase().includes(item.detected_presentation.toLowerCase())
        );
        if (pres) {
          presentationId = pres.id;
          qtyBase = item.quantity * Number(pres.conversion_factor);
          unitCostBase = (item.quantity * item.unit_price) / qtyBase;
        }
      }

      return {
        smart_invoice_id,
        restaurant_id: restaurantId,
        raw_description: item.description,
        raw_quantity: String(item.quantity),
        raw_unit_price: String(item.unit_price),
        raw_total: String(item.total),
        product_id: productId,
        presentation_id: presentationId,
        quantity_in_presentation: item.quantity,
        quantity_in_base_unit: qtyBase,
        unit_cost_per_base: unitCostBase,
        line_total: item.total,
        match_status: matchStatus,
        match_confidence: matchConfidence,
        needs_review: matchStatus !== "confirmed",
      };
    });

    if (itemsToInsert.length > 0) {
      const { error: insertErr } = await db.from("smart_invoice_items").insert(itemsToInsert);
      if (insertErr) console.error("Error inserting items:", insertErr);
    }

    return new Response(JSON.stringify({
      success: true,
      items_parsed: itemsToInsert.length,
      supplier: extracted.supplier_name,
      invoice_number: extracted.invoice_number,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-invoice error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
