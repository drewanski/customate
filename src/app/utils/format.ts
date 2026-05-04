export function formatPeso(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function shortOrderCode(id: string, length = 6) {
  const clean = String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.slice(-length) || String(id || '').slice(-length);
}
