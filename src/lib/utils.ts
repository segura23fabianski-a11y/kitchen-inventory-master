import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea números con separadores de miles para Colombia.
 * Ejemplo: 1250000 → $1.250.000  |  15500.50 → $15.500,50
 */
export function formatCOP(value: number | string | null | undefined, decimals = 0): string {
  const num = Number(value ?? 0);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Formatea número sin símbolo de moneda, solo con puntos de miles.
 * Ejemplo: 1250000 → 1.250.000
 */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const num = Number(value ?? 0);
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
