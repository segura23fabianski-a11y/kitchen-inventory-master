import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// ─── XML Parsing Helpers ─────────────────────────────────────

function getTagContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

function getAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = regex.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function getAttr(xml: string, attr: string): string {
  const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

/**
 * Get the invoice-level <cbc:ID> — the one that is a direct child of the 
 * root <Invoice> or <fe:Invoice> element, NOT nested inside sub-blocks.
 * Colombian UBL 2.1 puts the invoice number here.
 */
function getInvoiceRootId(xml: string): string {
  // Strategy: Remove all known nested blocks that contain their own <cbc:ID>,
  // then extract the first <cbc:ID> from what remains — that's the invoice number.
  const blocksToRemove = [
    "cac:AccountingSupplierParty", "cac:AccountingCustomerParty",
    "cac:TaxRepresentativeParty", "cac:Delivery", "cac:PaymentMeans",
    "cac:PaymentTerms", "cac:AllowanceCharge", "cac:TaxTotal",
    "cac:LegalMonetaryTotal", "cac:InvoiceLine", "cac:CreditNoteLine",
    "cac:DebitNoteLine", "cac:AdditionalDocumentReference",
    "cac:BillingReference", "cac:ContractDocumentReference",
    "cac:DespatchDocumentReference", "cac:ReceiptDocumentReference",
    "cac:OrderReference", "cac:Signature", "cac:PayeeParty",
    "cac:PrepaidPayment",
    // Also non-prefixed versions
    "AccountingSupplierParty", "AccountingCustomerParty",
    "TaxTotal", "LegalMonetaryTotal", "InvoiceLine",
    "Signature", "AdditionalDocumentReference",
    // DIAN extensions
    "ext:UBLExtensions", "sts:DianExtensions",
  ];

  let stripped = xml;
  for (const block of blocksToRemove) {
    const re = new RegExp(`<${block}[\\s>][\\s\\S]*?</${block}>`, "gi");
    stripped = stripped.replace(re, "");
  }

  // Now get the first <cbc:ID> — should be the invoice number
  const id = getTagContent(stripped, "cbc:ID") || getTagContent(stripped, "ID");
  
  // Sanity check: invoice numbers are typically short alphanumeric strings
  // If we got something that looks like a hash (>40 chars, hex), reject it
  if (id && id.length > 40 && /^[a-f0-9]+$/i.test(id)) {
    console.warn(`Rejected hash-like ID: ${id.substring(0, 30)}...`);
    return "";
  }

  return id;
}

/**
 * Parse a Colombian-style electronic invoice XML (UBL 2.1 / DIAN format).
 * Also supports AttachedDocument wrappers and simpler custom XML formats.
 */
function parseInvoiceXml(xmlText: string): {
  supplier_name: string | null;
  supplier_nit: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    tax_amount: number;
  }>;
} {
  const normalizeEmbeddedXml = (value: string) => value
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .trim();

  const isAttachedDocument = /<AttachedDocument[\s>]|<[^>]+:AttachedDocument[\s>]/i.test(xmlText);
  if (isAttachedDocument) {
    const parentDocumentId = getTagContent(xmlText, "cbc:ParentDocumentID") || getTagContent(xmlText, "ParentDocumentID");
    const embeddedDescription = getTagContent(xmlText, "cbc:Description") || getTagContent(xmlText, "Description");
    const embeddedXml = embeddedDescription ? normalizeEmbeddedXml(embeddedDescription) : "";

    if (embeddedXml && /<Invoice[\s>]|<[^>]+:Invoice[\s>]/i.test(embeddedXml)) {
      const embeddedParsed = parseInvoiceXml(embeddedXml);
      if (parentDocumentId) {
        embeddedParsed.invoice_number = parentDocumentId.trim();
      }
      console.log(`AttachedDocument resolved: parentDocumentId=${parentDocumentId || "n/a"}, embeddedInvoice=${embeddedParsed.invoice_number || "n/a"}`);
      return embeddedParsed;
    }

    return {
      supplier_name: null,
      supplier_nit: null,
      invoice_number: parentDocumentId || null,
      invoice_date: null,
      subtotal: null,
      tax_total: null,
      total: null,
      items: [],
    };
  }

  const isUBL = xmlText.includes("ubltr") || xmlText.includes("Invoice") || xmlText.includes("cac:") || xmlText.includes("cbc:");

  let supplierName: string | null = null;
  let supplierNit: string | null = null;
  let invoiceNumber: string | null = null;
  let invoiceDate: string | null = null;
  let subtotal: number | null = null;
  let taxTotal: number | null = null;
  let total: number | null = null;
  const items: Array<{ description: string; quantity: number; unit_price: number; total: number; tax_amount: number }> = [];

  if (isUBL) {
    invoiceNumber = getInvoiceRootId(xmlText);

    if (!invoiceNumber) {
      const qrText = getTagContent(xmlText, "sts:QRCode") || getTagContent(xmlText, "QRCode");
      const qrInvoiceNumber = qrText.match(/NumFac:\s*([^\s<\n\r]+)/i)?.[1]?.trim();
      if (qrInvoiceNumber) invoiceNumber = qrInvoiceNumber;
    }

    if (!invoiceNumber) {
      const idMatch = xmlText.match(/<cbc:ID[^>]*>([^<]{1,30})<\/cbc:ID>/i);
      if (idMatch) invoiceNumber = idMatch[1].trim();
    }

    invoiceDate = getTagContent(xmlText, "cbc:IssueDate") || getTagContent(xmlText, "IssueDate");

    const supplierBlock = getTagContent(xmlText, "cac:AccountingSupplierParty") || getTagContent(xmlText, "AccountingSupplierParty");
    if (supplierBlock) {
      supplierName = getTagContent(supplierBlock, "cbc:RegistrationName") || getTagContent(supplierBlock, "cbc:Name") || getTagContent(supplierBlock, "RegistrationName");
      supplierNit = getTagContent(supplierBlock, "cbc:CompanyID") || getTagContent(supplierBlock, "CompanyID");
    }

    const legalTotal = getTagContent(xmlText, "cac:LegalMonetaryTotal") || getTagContent(xmlText, "LegalMonetaryTotal");
    if (legalTotal) {
      subtotal = parseFloat(getTagContent(legalTotal, "cbc:LineExtensionAmount") || getTagContent(legalTotal, "LineExtensionAmount")) || null;
      total = parseFloat(getTagContent(legalTotal, "cbc:PayableAmount") || getTagContent(legalTotal, "PayableAmount")) || null;
    }

    const taxTotalBlock = getTagContent(xmlText, "cac:TaxTotal") || getTagContent(xmlText, "TaxTotal");
    if (taxTotalBlock) {
      taxTotal = parseFloat(getTagContent(taxTotalBlock, "cbc:TaxAmount") || getTagContent(taxTotalBlock, "TaxAmount")) || null;
    }

    const lineBlocks = getAllTags(xmlText, "cac:InvoiceLine").length > 0
      ? getAllTags(xmlText, "cac:InvoiceLine")
      : getAllTags(xmlText, "InvoiceLine");

    for (const line of lineBlocks) {
      const desc = getTagContent(line, "cbc:Description") || getTagContent(line, "Description") || getTagContent(line, "cbc:Name") || getTagContent(line, "Name") || "Sin descripción";
      const qty = parseFloat(getTagContent(line, "cbc:InvoicedQuantity") || getTagContent(line, "InvoicedQuantity") || getTagContent(line, "Quantity")) || 0;
      const lineExt = parseFloat(getTagContent(line, "cbc:LineExtensionAmount") || getTagContent(line, "LineExtensionAmount")) || 0;

      const priceBlock = getTagContent(line, "cac:Price") || getTagContent(line, "Price");
      let unitPrice = 0;
      if (priceBlock) {
        unitPrice = parseFloat(getTagContent(priceBlock, "cbc:PriceAmount") || getTagContent(priceBlock, "PriceAmount")) || 0;
      }
      if (!unitPrice && qty > 0) unitPrice = lineExt / qty;

      const lineTaxBlock = getTagContent(line, "cac:TaxTotal") || getTagContent(line, "TaxTotal");
      const lineTax = lineTaxBlock ? (parseFloat(getTagContent(lineTaxBlock, "cbc:TaxAmount") || getTagContent(lineTaxBlock, "TaxAmount")) || 0) : 0;

      items.push({ description: desc, quantity: qty, unit_price: unitPrice, total: lineExt, tax_amount: lineTax });
    }
  } else {
    supplierName = getTagContent(xmlText, "proveedor") || getTagContent(xmlText, "supplier") || getTagContent(xmlText, "nombre_proveedor") || getTagContent(xmlText, "RazonSocial");
    supplierNit = getTagContent(xmlText, "nit") || getTagContent(xmlText, "NIT") || getTagContent(xmlText, "rfc") || getTagContent(xmlText, "RFC") || getTagContent(xmlText, "NumeroDocumento");
    invoiceNumber = getTagContent(xmlText, "numero_factura") || getTagContent(xmlText, "invoice_number") || getTagContent(xmlText, "NumeroFactura") || getTagContent(xmlText, "Numero");
    invoiceDate = getTagContent(xmlText, "fecha") || getTagContent(xmlText, "date") || getTagContent(xmlText, "FechaEmision") || getTagContent(xmlText, "Fecha");
    subtotal = parseFloat(getTagContent(xmlText, "subtotal") || getTagContent(xmlText, "SubTotal")) || null;
    taxTotal = parseFloat(getTagContent(xmlText, "impuestos") || getTagContent(xmlText, "tax") || getTagContent(xmlText, "IVA") || getTagContent(xmlText, "TotalImpuestos")) || null;
    total = parseFloat(getTagContent(xmlText, "total") || getTagContent(xmlText, "Total") || getTagContent(xmlText, "ValorTotal")) || null;

    const itemTags = ["item", "linea", "detalle", "producto", "Item", "Linea", "Detalle", "DetalleFactura"];
    for (const tag of itemTags) {
      const found = getAllTags(xmlText, tag);
      if (found.length > 0) {
        for (const block of found) {
          const desc = getTagContent(block, "descripcion") || getTagContent(block, "description") || getTagContent(block, "nombre") || getTagContent(block, "Descripcion") || "Sin descripción";
          const qty = parseFloat(getTagContent(block, "cantidad") || getTagContent(block, "quantity") || getTagContent(block, "Cantidad")) || 0;
          const up = parseFloat(getTagContent(block, "precio_unitario") || getTagContent(block, "unit_price") || getTagContent(block, "PrecioUnitario") || getTagContent(block, "ValorUnitario")) || 0;
          const lt = parseFloat(getTagContent(block, "total") || getTagContent(block, "Total") || getTagContent(block, "ValorTotal")) || (qty * up);
          const tax = parseFloat(getTagContent(block, "impuesto") || getTagContent(block, "iva") || getTagContent(block, "IVA")) || 0;
          items.push({ description: desc, quantity: qty, unit_price: up, total: lt, tax_amount: tax });
        }
        break;
      }
    }
  }

  console.log(`XML extraction result: invoice=${invoiceNumber}, supplier=${supplierName}, nit=${supplierNit}, items=${items.length}, total=${total}`);

  return { supplier_name: supplierName, supplier_nit: supplierNit, invoice_number: invoiceNumber, invoice_date: invoiceDate, subtotal, tax_total: taxTotal, total, items };
}

/**
 * Cross-validate XML data against PDF-extracted data.
 */
function crossValidate(
  xmlData: { supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; subtotal: number | null; total: number | null },
  pdfData: { supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; total: number | null }
): string[] {
  const warnings: string[] = [];
  
  if (xmlData.supplier_name && pdfData.supplier_name) {
    const xmlNorm = xmlData.supplier_name.toLowerCase().trim();
    const pdfNorm = pdfData.supplier_name.toLowerCase().trim();
    if (!xmlNorm.includes(pdfNorm.split(" ")[0]) && !pdfNorm.includes(xmlNorm.split(" ")[0])) {
      warnings.push(`Proveedor difiere: XML="${xmlData.supplier_name}" vs PDF="${pdfData.supplier_name}"`);
    }
  }

  if (xmlData.invoice_number && pdfData.invoice_number) {
    if (xmlData.invoice_number.trim() !== pdfData.invoice_number.trim()) {
      warnings.push(`Nº factura difiere: XML="${xmlData.invoice_number}" vs PDF="${pdfData.invoice_number}"`);
    }
  }

  if (xmlData.invoice_date && pdfData.invoice_date) {
    if (xmlData.invoice_date !== pdfData.invoice_date) {
      warnings.push(`Fecha difiere: XML="${xmlData.invoice_date}" vs PDF="${pdfData.invoice_date}"`);
    }
  }

  if (xmlData.total != null && pdfData.total != null) {
    if (Math.abs(xmlData.total - pdfData.total) > 1) {
      warnings.push(`Total difiere: XML=$${xmlData.total.toFixed(2)} vs PDF=$${pdfData.total.toFixed(2)}`);
    }
  }

  return warnings;
}

// ─── Auth Helper ─────────────────────────────────────────────

async function authenticateRequest(
  req: Request,
  db: any,
  body: any
): Promise<{ userId: string; restaurantId: string } | Response> {
  const { internal_call } = body ?? {};

  if (internal_call) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY.substring(0, 20))) {
      const token = authHeader.replace("Bearer ", "");
      if (!token) {
        return new Response(JSON.stringify({ error: "No autorizado." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Sesión expirada." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", user.id).single();
      if (!profile?.restaurant_id) {
        return new Response(JSON.stringify({ error: "Sin restaurante asignado." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return { userId: user.id, restaurantId: profile.restaurant_id };
    } else {
      const { smart_invoice_id: sid } = body;
      if (!sid) {
        return new Response(JSON.stringify({ error: "smart_invoice_id requerido." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inv } = await db.from("smart_invoices").select("restaurant_id, created_by").eq("id", sid).single();
      if (!inv) {
        return new Response(JSON.stringify({ error: "Factura no encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return { userId: inv.created_by, restaurantId: inv.restaurant_id };
    }
  } else {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "No autorizado. Inicia sesión nuevamente." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Sesión expirada. Vuelve a iniciar sesión." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await db.from("profiles").select("restaurant_id").eq("user_id", user.id).single();
    if (!profile?.restaurant_id) {
      return new Response(JSON.stringify({ error: "Sin restaurante asignado al usuario." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return { userId: user.id, restaurantId: profile.restaurant_id };
  }
}

// ─── Product Matching ────────────────────────────────────────

function matchItems(
  extractedItems: Array<{ description: string; quantity: number; unit_price: number; total: number; is_expense?: boolean; matched_product_id?: string; matched_product_name?: string; detected_presentation?: string; confidence?: number }>,
  products: any[],
  presentations: any[],
  aliases: any[],
  smartInvoiceId: string,
  restaurantId: string
) {
  return extractedItems.map((item) => {
    let productId: string | null = null;
    let presentationId: string | null = null;
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

    // Try AI match by ID
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
        pr.name.toLowerCase().includes((item.detected_presentation || "").toLowerCase())
      );
      if (pres) {
        presentationId = pres.id;
        qtyBase = item.quantity * Number(pres.conversion_factor);
        unitCostBase = (item.quantity * item.unit_price) / qtyBase;
      }
    }

    const isExpense = item.is_expense === true;

    return {
      smart_invoice_id: smartInvoiceId,
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
      is_expense: isExpense,
      needs_review: isExpense ? false : matchStatus !== "confirmed",
    };
  });
}

// ─── AI PDF Parsing ──────────────────────────────────────────

async function parsePdfWithAI(
  db: any,
  pdfBase64: string,
  restaurantId: string,
  productCatalog: string,
  aliasCatalog: string
): Promise<{ supplier_name?: string; invoice_number?: string; invoice_date?: string; total?: number; items: any[] }> {
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
5. Extrae subtotales y total de la factura.
6. CLASIFICACIÓN COSTO vs GASTO: Para cada línea, clasifica si es un COSTO (materia prima, insumo, ingrediente que entra al inventario) o un GASTO (servicio, flete, impuesto, descuento, cargo operativo que NO entra al inventario). Ejemplos de COSTO: pollo, aceite, harina, vasos, servilletas, químicos de limpieza, amenities. Ejemplos de GASTO: transporte, flete, IVA adicional, descuento comercial, servicio de entrega, propina.`,
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
                      description: { type: "string" },
                      quantity: { type: "number" },
                      unit_price: { type: "number" },
                      total: { type: "number" },
                      matched_product_name: { type: "string" },
                      matched_product_id: { type: "string" },
                      detected_presentation: { type: "string" },
                      confidence: { type: "number" },
                      is_expense: { type: "boolean" },
                    },
                    required: ["description", "quantity", "unit_price", "total", "confidence", "is_expense"],
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
    throw { status: aiResponse.status, message: errText };
  }

  const aiResult = await aiResponse.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw { status: 422, message: "La IA no pudo extraer datos del PDF." };
  }

  return JSON.parse(toolCall.function.arguments);
}

// ─── Main Handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "La función de análisis de IA no está configurada. Contacta al administrador." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Cuerpo de solicitud inválido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate
    const authResult = await authenticateRequest(req, db, body);
    if (authResult instanceof Response) return authResult;
    const { userId, restaurantId } = authResult;

    const { smart_invoice_id } = body;
    if (!smart_invoice_id) {
      return new Response(JSON.stringify({ error: "smart_invoice_id es requerido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: "Factura inteligente no encontrada." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileType = smartInv.file_type || "pdf";
    const hasXml = !!smartInv.xml_url;
    const hasPdf = !!smartInv.pdf_url;

    console.log(`Processing invoice ${smart_invoice_id}: file_type=${fileType}, hasXml=${hasXml}, hasPdf=${hasPdf}`);

    // Fetch products, presentations, aliases
    const [productsRes, presentationsRes, aliasesRes, productCodesRes] = await Promise.all([
      db.from("products").select("id, name, unit, barcode").eq("restaurant_id", restaurantId),
      db.from("purchase_presentations").select("id, product_id, name, conversion_factor").eq("restaurant_id", restaurantId).eq("active", true),
      db.from("invoice_product_aliases").select("*").eq("restaurant_id", restaurantId),
      db.from("product_codes").select("product_id, code, description").eq("restaurant_id", restaurantId),
    ]);

    const products = productsRes.data ?? [];
    const presentations = presentationsRes.data ?? [];
    const aliases = aliasesRes.data ?? [];
    const productCodes = productCodesRes.data ?? [];

    // Build catalogs for AI context
    const productCatalog = products.map((p: any) => {
      const codes = productCodes.filter((c: any) => c.product_id === p.id).map((c: any) => c.code);
      const presos = presentations.filter((pr: any) => pr.product_id === p.id).map((pr: any) => `${pr.name} (=${pr.conversion_factor} ${p.unit})`);
      return `- ${p.name} [${p.unit}]${p.barcode ? ` barcode:${p.barcode}` : ""}${codes.length ? ` códigos:${codes.join(",")}` : ""}${presos.length ? ` presentaciones:${presos.join(",")}` : ""}`;
    }).join("\n");
    const aliasCatalog = aliases.map((a: any) => `- "${a.external_name}" → producto_id:${a.product_id}`).join("\n");

    let extracted: any = null;
    let xmlData: ReturnType<typeof parseInvoiceXml> | null = null;
    let pdfData: any = null;
    let validationWarnings: string[] = [];
    let sourceUsed: "xml" | "pdf" | "ai" = "ai";

    // ─── PRIORITY 1: XML ─────────────────────────────────────
    if (hasXml) {
      console.log("Processing XML source (priority)...");
      const { data: xmlBlob, error: xmlDlErr } = await db.storage.from("invoice-pdfs").download(smartInv.xml_url);
      if (xmlDlErr || !xmlBlob) {
        console.error("XML download error:", xmlDlErr);
      } else {
        const xmlText = await xmlBlob.text();
        xmlData = parseInvoiceXml(xmlText);
        sourceUsed = "xml";

        if (xmlData.items.length > 0) {
          console.log(`XML parsed: ${xmlData.items.length} items, total=${xmlData.total}`);

          // Use AI to classify items and match to catalog
          const aiClassifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content: `Dado un listado de ítems de factura y un catálogo de productos, haz match de cada ítem con el producto más similar del catálogo. Clasifica cada ítem como COSTO o GASTO.

CATÁLOGO:
${productCatalog}

${aliasCatalog ? `ALIASES:\n${aliasCatalog}` : ""}

Reglas:
- COSTO: materia prima, insumo, ingrediente para inventario
- GASTO: flete, servicio, impuesto, descuento, cargo operativo
- Si no hay match claro, deja matched_product_id vacío y confidence en 0
- Si detectas una presentación (bolsa 900g, pack x6, caja x12), indícala`,
                },
                {
                  role: "user",
                  content: `Clasifica y haz match de estos ítems:\n${xmlData.items.map((it, i) => `${i + 1}. "${it.description}" qty=${it.quantity} precio=${it.unit_price} total=${it.total}`).join("\n")}`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "classify_items",
                    description: "Clasificar ítems de factura",
                    parameters: {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              index: { type: "number" },
                              matched_product_id: { type: "string" },
                              matched_product_name: { type: "string" },
                              detected_presentation: { type: "string" },
                              confidence: { type: "number" },
                              is_expense: { type: "boolean" },
                            },
                            required: ["index", "confidence", "is_expense"],
                          },
                        },
                      },
                      required: ["items"],
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "classify_items" } },
            }),
          });

          let classifiedItems: any[] = [];
          if (aiClassifyResponse.ok) {
            try {
              const classifyResult = await aiClassifyResponse.json();
              const tc = classifyResult.choices?.[0]?.message?.tool_calls?.[0];
              if (tc) {
                const parsed = JSON.parse(tc.function.arguments);
                classifiedItems = parsed.items || [];
              }
            } catch (e) {
              console.warn("AI classify parse error:", e);
            }
          } else {
            console.warn("AI classify failed, using unclassified items");
          }

          // Merge XML data with AI classification
          extracted = {
            supplier_name: xmlData.supplier_name,
            invoice_number: xmlData.invoice_number,
            invoice_date: xmlData.invoice_date,
            total: xmlData.total,
            items: xmlData.items.map((xmlItem, idx) => {
              const classified = classifiedItems.find((c: any) => c.index === idx + 1) || {};
              return {
                description: xmlItem.description,
                quantity: xmlItem.quantity,
                unit_price: xmlItem.unit_price,
                total: xmlItem.total,
                matched_product_id: classified.matched_product_id || "",
                matched_product_name: classified.matched_product_name || "",
                detected_presentation: classified.detected_presentation || "",
                confidence: classified.confidence ?? 0,
                is_expense: classified.is_expense ?? false,
              };
            }),
          };
        } else {
          console.warn("XML parsed but no items found, falling back to PDF/AI");
          xmlData = null;
          sourceUsed = "ai";
        }
      }
    }

    // ─── PRIORITY 2: PDF via AI ──────────────────────────────
    if (!extracted && hasPdf) {
      console.log("Processing PDF source...");
      const { data: pdfBlob, error: dlErr } = await db.storage.from("invoice-pdfs").download(smartInv.pdf_url);
      if (dlErr || !pdfBlob) {
        console.error("PDF download error:", dlErr);
        return new Response(JSON.stringify({ error: "No se pudo descargar el PDF." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      const pdfSizeMB = pdfBytes.length / (1024 * 1024);
      if (pdfSizeMB > 20) {
        return new Response(JSON.stringify({ error: `El PDF es demasiado grande (${pdfSizeMB.toFixed(1)} MB). Máximo 20 MB.` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let pdfBase64 = "";
      const chunkSize = 32768;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, Math.min(i + chunkSize, pdfBytes.length));
        pdfBase64 += String.fromCharCode(...chunk);
      }
      pdfBase64 = btoa(pdfBase64);

      try {
        extracted = await parsePdfWithAI(db, pdfBase64, restaurantId, productCatalog, aliasCatalog);
        sourceUsed = "ai";
      } catch (err: any) {
        const status = err.status || 500;
        if (status === 429 || status === 402) {
          await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
        }
        const msg = status === 429 ? "Límite de solicitudes de IA excedido. Intenta en unos minutos."
          : status === 402 ? "Créditos de IA insuficientes."
          : status === 422 ? err.message
          : `Error del servicio de IA (código ${status}).`;
        await db.from("smart_invoices").update({ status: "pending" }).eq("id", smart_invoice_id);
        return new Response(JSON.stringify({ error: msg }), {
          status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!extracted) {
      return new Response(JSON.stringify({ error: "No hay archivos (XML ni PDF) para procesar." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Cross-validation: XML vs PDF ────────────────────────
    if (xmlData && hasPdf && sourceUsed === "xml") {
      // Optionally parse PDF to cross-validate
      try {
        const { data: pdfBlob } = await db.storage.from("invoice-pdfs").download(smartInv.pdf_url);
        if (pdfBlob) {
          const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
          if (pdfBytes.length / (1024 * 1024) <= 20) {
            let pdfBase64 = "";
            const chunkSize = 32768;
            for (let i = 0; i < pdfBytes.length; i += chunkSize) {
              const chunk = pdfBytes.subarray(i, Math.min(i + chunkSize, pdfBytes.length));
              pdfBase64 += String.fromCharCode(...chunk);
            }
            pdfBase64 = btoa(pdfBase64);

            pdfData = await parsePdfWithAI(db, pdfBase64, restaurantId, productCatalog, aliasCatalog);
            validationWarnings = crossValidate(
              { supplier_name: xmlData.supplier_name, invoice_number: xmlData.invoice_number, invoice_date: xmlData.invoice_date, subtotal: xmlData.subtotal, total: xmlData.total },
              { supplier_name: pdfData.supplier_name || null, invoice_number: pdfData.invoice_number || null, invoice_date: pdfData.invoice_date || null, total: pdfData.total || null }
            );
            if (validationWarnings.length > 0) {
              console.log("Cross-validation warnings:", validationWarnings);
            }
          }
        }
      } catch (cvErr) {
        console.warn("Cross-validation skipped (PDF AI error):", cvErr);
      }
    }

    // ─── Save Results ────────────────────────────────────────
    // Update smart invoice header
    await db.from("smart_invoices").update({
      supplier_name: extracted.supplier_name || null,
      invoice_number: extracted.invoice_number || null,
      invoice_date: extracted.invoice_date || null,
      total_detected: extracted.total || null,
      ai_raw_response: extracted,
      status: "draft",
      validation_warnings: validationWarnings.length > 0 ? validationWarnings : null,
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

    // Process items
    const itemsToInsert = matchItems(extracted.items ?? [], products, presentations, aliases, smart_invoice_id, restaurantId);

    if (itemsToInsert.length > 0) {
      const { error: insertErr } = await db.from("smart_invoice_items").insert(itemsToInsert);
      if (insertErr) {
        console.error("Error inserting items:", insertErr);
        return new Response(JSON.stringify({ error: "Se analizó la factura pero hubo un error al guardar las líneas." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`Successfully parsed ${itemsToInsert.length} items via ${sourceUsed}`);

    return new Response(JSON.stringify({
      success: true,
      items_parsed: itemsToInsert.length,
      supplier: extracted.supplier_name,
      invoice_number: extracted.invoice_number,
      source_used: sourceUsed,
      validation_warnings: validationWarnings,
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
