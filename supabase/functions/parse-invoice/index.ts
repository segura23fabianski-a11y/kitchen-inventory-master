import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "La función de análisis de IA no está configurada. Contacta al administrador." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { internal_call } = body ?? {};
    
    let userId: string;
    let restaurantId: string;

    if (internal_call) {
      // Called internally from receive-invoice-email with service role
      // Verify we have the service role auth
      const authHeader = req.headers.get("authorization") ?? "";
      if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY.substring(0, 20))) {
        // Not service role - still validate as user
        const token = authHeader.replace("Bearer ", "");
        if (!token) {
          return new Response(JSON.stringify({ error: "No autorizado." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
        if (authErr || !user) {
          return new Response(JSON.stringify({ error: "Sesión expirada." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = user.id;
        const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", user.id).single();
        if (!profile?.restaurant_id) {
          return new Response(JSON.stringify({ error: "Sin restaurante asignado." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        restaurantId = profile.restaurant_id;
      } else {
        // Internal call - get restaurant from the smart_invoice itself
        const { smart_invoice_id: sid } = body;
        if (!sid) {
          return new Response(JSON.stringify({ error: "smart_invoice_id requerido." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: inv } = await db.from("smart_invoices").select("restaurant_id, created_by").eq("id", sid).single();
        if (!inv) {
          return new Response(JSON.stringify({ error: "Factura no encontrada." }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        restaurantId = inv.restaurant_id;
        userId = inv.created_by;
      }
    } else {
      const authHeader = req.headers.get("authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      if (!token) {
        return new Response(JSON.stringify({ error: "No autorizado. Inicia sesión nuevamente." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Sesión expirada. Vuelve a iniciar sesión." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
      const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", userId).single();
      if (!profile?.restaurant_id) {
        return new Response(JSON.stringify({ error: "Sin restaurante asignado al usuario." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      restaurantId = profile.restaurant_id;
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's restaurant
    const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", user.id).single();
    if (!profile?.restaurant_id) {
      return new Response(JSON.stringify({ error: "Sin restaurante asignado al usuario." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const restaurantId = profile.restaurant_id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Cuerpo de solicitud inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { smart_invoice_id } = body;
    if (!smart_invoice_id) {
      return new Response(JSON.stringify({ error: "smart_invoice_id es requerido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the smart invoice
    const { data: smartInv, error: invErr } = await db
      .from("smart_invoices")
      .select("*")
      .eq("id", smart_invoice_id)
      .eq("restaurant_id", restaurantId)
      .single();
    if (invErr || !smartInv) {
      console.error("Smart invoice fetch error:", invErr);
      return new Response(JSON.stringify({ error: "Factura inteligente no encontrada." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download PDF from storage
    const pdfPath = smartInv.pdf_url;
    if (!pdfPath) {
      return new Response(JSON.stringify({ error: "No hay PDF asociado a esta factura." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Downloading PDF from:", pdfPath);
    const { data: pdfData, error: dlErr } = await db.storage
      .from("invoice-pdfs")
      .download(pdfPath);
    if (dlErr || !pdfData) {
      console.error("PDF download error:", dlErr);
      return new Response(JSON.stringify({ error: "No se pudo descargar el PDF. Verifica que el archivo exista en el almacenamiento." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert PDF to base64 - handle large files in chunks
    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    const pdfSizeMB = pdfBytes.length / (1024 * 1024);
    console.log(`PDF size: ${pdfSizeMB.toFixed(2)} MB`);

    if (pdfSizeMB > 20) {
      return new Response(JSON.stringify({ error: `El PDF es demasiado grande (${pdfSizeMB.toFixed(1)} MB). El máximo permitido es 20 MB.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 in chunks to avoid stack overflow
    let pdfBase64 = "";
    const chunkSize = 32768;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, Math.min(i + chunkSize, pdfBytes.length));
      pdfBase64 += String.fromCharCode(...chunk);
    }
    pdfBase64 = btoa(pdfBase64);

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

    console.log("Calling AI gateway...");

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
        // Reset status back to pending so user can retry
        await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
        return new Response(JSON.stringify({ error: "Límite de solicitudes de IA excedido. Intenta de nuevo en unos minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes. Contacta al administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
      return new Response(JSON.stringify({ error: `Error del servicio de IA (código ${aiResponse.status}). Intenta de nuevo.` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    console.log("AI response received, processing...");

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response:", JSON.stringify(aiResult).substring(0, 500));
      await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
      return new Response(JSON.stringify({ error: "La IA no pudo extraer datos del PDF. Verifica que el archivo sea una factura legible." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: any;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", toolCall.function.arguments?.substring(0, 500));
      await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
      return new Response(JSON.stringify({ error: "No se pudo interpretar la respuesta de la IA. Intenta de nuevo." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const firstWord = extracted.supplier_name.split(" ")[0];
      if (firstWord && firstWord.length > 2) {
        const { data: matchedSuppliers } = await db
          .from("suppliers")
          .select("id, name")
          .eq("restaurant_id", restaurantId)
          .ilike("name", `%${firstWord}%`)
          .limit(1);
        if (matchedSuppliers?.length) {
          await db.from("smart_invoices").update({ supplier_id: matchedSuppliers[0].id }).eq("id", smart_invoice_id);
        }
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
      if (insertErr) {
        console.error("Error inserting items:", insertErr);
        return new Response(JSON.stringify({ error: "Se analizó el PDF pero hubo un error al guardar las líneas. Intenta de nuevo." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`Successfully parsed ${itemsToInsert.length} items`);

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
    return new Response(JSON.stringify({ error: `Error interno: ${msg}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
