export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function matchesQuery(values: Array<string | undefined>, query: string) {
  const normalizedQuery = normalizeText(query.trim());
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeText(value ?? '').includes(normalizedQuery));
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(page, 1);
  const startIndex = (safePage - 1) * pageSize;
  return items.slice(startIndex, startIndex + pageSize);
}

export function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
