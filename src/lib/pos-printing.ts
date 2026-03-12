/**
 * POS Printing utilities
 * Generates printable HTML for kitchen comandas and sales tickets.
 * Opens a print window with auto-print — works with thermal printers and standard printers.
 */

interface PrintOrderItem {
  name: string;
  quantity: number;
  notes?: string;
  unit_price?: number;
  total?: number;
}

interface KitchenComandaData {
  orderNumber: string;
  servicePeriod: string;
  destination: string;
  destinationDetail?: string;
  groupLabel?: string; // e.g. company name, "Clientes individuales"
  items: PrintOrderItem[];
  createdAt: string;
}

interface TicketData {
  orderNumber: string;
  servicePeriod: string;
  customerName?: string;
  companyName?: string;
  billingMode?: string;
  items: PrintOrderItem[];
  total: number;
  createdAt: string;
  restaurantName?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  breakfast: "Desayuno", lunch: "Almuerzo", dinner: "Cena", snack: "Lonche",
};

const BILLING_LABELS: Record<string, string> = {
  corporate_charge: "Cargo corporativo",
  individual_account: "Cuenta individual",
  cash: "Efectivo",
};

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) {
    alert("No se pudo abrir la ventana de impresión. Verifica los permisos del navegador.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    // Don't close automatically — user may want to review
  }, 500);
}

export function printKitchenComanda(data: KitchenComandaData) {
  const service = SERVICE_LABELS[data.servicePeriod] || data.servicePeriod;
  const itemsHtml = data.items
    .map(i => `
      <tr>
        <td style="font-size:16px;font-weight:bold;padding:4px 0;">${i.quantity}x</td>
        <td style="font-size:16px;font-weight:bold;padding:4px 8px;">${i.name}</td>
      </tr>
      ${i.notes ? `<tr><td></td><td style="font-size:12px;color:#666;padding:0 8px;">→ ${i.notes}</td></tr>` : ""}
    `)
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>Comanda ${data.orderNumber}</title>
<style>
  @page { margin: 5mm; }
  body { font-family: 'Courier New', monospace; margin: 0; padding: 8px; max-width: 80mm; }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; margin: 0; }
  .meta { font-size: 12px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  .footer { border-top: 2px dashed #000; margin-top: 8px; padding-top: 4px; font-size: 11px; text-align: center; }
</style></head><body>
<div class="header">
  <h1>🍳 COMANDA</h1>
  <div class="meta"><strong>${data.orderNumber}</strong></div>
  <div class="meta">${service} · ${data.destination}${data.destinationDetail ? " — " + data.destinationDetail : ""}</div>
  ${data.groupLabel ? `<div class="meta" style="font-size:14px;font-weight:bold;">${data.groupLabel}</div>` : ""}
  <div class="meta">${new Date(data.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>
</div>
<table>${itemsHtml}</table>
<div class="footer">Impreso: ${new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>
</body></html>`;

  openPrintWindow(html);
}

export function printTicket(data: TicketData) {
  const service = SERVICE_LABELS[data.servicePeriod] || data.servicePeriod;
  const billing = BILLING_LABELS[data.billingMode || ""] || data.billingMode || "";

  const itemsHtml = data.items
    .map(i => `
      <tr>
        <td style="padding:3px 0;">${i.quantity}x ${i.name}</td>
        <td style="text-align:right;padding:3px 0;">$${(i.total ?? i.quantity * (i.unit_price ?? 0)).toLocaleString()}</td>
      </tr>
    `)
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>Ticket ${data.orderNumber}</title>
<style>
  @page { margin: 5mm; }
  body { font-family: 'Courier New', monospace; margin: 0; padding: 8px; max-width: 80mm; }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .header h2 { font-size: 14px; margin: 0; }
  .meta { font-size: 11px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .total-row { border-top: 2px solid #000; font-size: 16px; font-weight: bold; }
  .footer { border-top: 1px dashed #000; margin-top: 8px; padding-top: 4px; font-size: 10px; text-align: center; }
</style></head><body>
<div class="header">
  ${data.restaurantName ? `<h2>${data.restaurantName}</h2>` : ""}
  <div class="meta"><strong>${data.orderNumber}</strong></div>
  <div class="meta">${service}</div>
  ${data.companyName ? `<div class="meta">Empresa: ${data.companyName}</div>` : ""}
  ${data.customerName ? `<div class="meta">Cliente: ${data.customerName}</div>` : ""}
  ${billing ? `<div class="meta">Cobro: ${billing}</div>` : ""}
  <div class="meta">${new Date(data.createdAt).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</div>
</div>
<table>${itemsHtml}
  <tr class="total-row">
    <td style="padding-top:8px;">TOTAL</td>
    <td style="text-align:right;padding-top:8px;">$${data.total.toLocaleString()}</td>
  </tr>
</table>
<div class="footer">Gracias por su preferencia<br/>Impreso: ${new Date().toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</div>
</body></html>`;

  openPrintWindow(html);
}
