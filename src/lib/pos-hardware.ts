/**
 * POS Hardware utilities
 * Prepared for ESC/POS integration with cash drawers and receipt printers.
 * 
 * Currently uses browser-based fallbacks.
 * When a real ESC/POS driver or WebUSB integration is added, 
 * only this module needs to change.
 */

export interface CashDrawerConfig {
  /** Connection method: 'serial' | 'usb' | 'network' | 'browser' */
  method: "browser";
  /** For network printers: IP address */
  address?: string;
  /** For serial: port name */
  port?: string;
}

const DEFAULT_CONFIG: CashDrawerConfig = { method: "browser" };

/**
 * Opens the cash drawer.
 * Currently shows a browser notification. 
 * Replace internals with ESC/POS commands when hardware is connected.
 * 
 * ESC/POS cash drawer command reference:
 *   ESC p 0 25 250  (hex: 1B 70 00 19 FA)
 *   - Pin 2 kick: 1B 70 00 19 FA
 *   - Pin 5 kick: 1B 70 01 19 FA
 */
export async function openCashDrawer(config: CashDrawerConfig = DEFAULT_CONFIG): Promise<boolean> {
  if (config.method === "browser") {
    // Browser fallback - log the event
    console.log("[POS Hardware] Cash drawer open requested (browser mode)");
    return true;
  }

  // Future: WebUSB / Serial API / Network socket implementation
  // const ESC_P_COMMAND = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
  // await sendToDevice(config, ESC_P_COMMAND);
  
  return false;
}

/**
 * Check if cash drawer hardware is available.
 * Useful for conditionally showing the "Open drawer" button.
 */
export function isCashDrawerAvailable(): boolean {
  // Always available in browser mode (no-op)
  return true;
}

/**
 * Sends raw bytes to a connected POS device.
 * Placeholder for future WebUSB/Serial integration.
 */
// async function sendToDevice(config: CashDrawerConfig, data: Uint8Array): Promise<void> {
//   // TODO: Implement WebUSB or Serial API
// }
