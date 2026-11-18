/** Match product names against a search term after trimming surrounding space. */
export function matchesProductSearch(product, searchTerm) {
  const normalizedTerm = String(searchTerm || '').trim().toLowerCase();
  return String(product?.name || '').toLowerCase().includes(normalizedTerm);
}
