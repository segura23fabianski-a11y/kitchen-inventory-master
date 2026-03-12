/**
 * Flexible search utility for partial, multi-word matching.
 *
 * Splits the search query into individual words and checks that
 * EVERY word appears somewhere in the haystack string.
 *
 * Examples:
 *   fuzzyMatch("Filete de tilapia", "tilapia")       → true
 *   fuzzyMatch("Filete de tilapia", "filete tilapia") → true
 *   fuzzyMatch("Gaseosa mini Coca-Cola", "coca")      → true
 *   fuzzyMatch("Papa criolla", "papa cri")            → true
 *   fuzzyMatch("Pechuga a la plancha", "plancha")     → true
 *
 * @param haystack  The text to search in (name, codes, NIT, etc.)
 * @param query     The user's search input
 * @returns         true if all query words are found in the haystack
 */
export function fuzzyMatch(haystack: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  const h = haystack.toLowerCase();
  const terms = query.toLowerCase().trim().split(/\s+/);
  return terms.every((term) => h.includes(term));
}

/**
 * Build a combined haystack string from multiple fields.
 * Filters out null/undefined values.
 *
 * Usage:
 *   const haystack = buildHaystack(product.name, product.barcode, ...codes);
 *   if (fuzzyMatch(haystack, search)) { ... }
 */
export function buildHaystack(...fields: (string | null | undefined)[]): string {
  return fields.filter(Boolean).join(" ");
}
