import { CategoriaMaterial, ProcessoCategoria } from './types';

const BUILT_IN_CATEGORIA_LABELS: Record<CategoriaMaterial, string> = {
  material_hospitalar: 'Materiais',
  material_farmacologico: 'Medicamentos',
};

const BUILT_IN_CATEGORIA_FULL_LABELS: Record<CategoriaMaterial, string> = {
  material_hospitalar: 'Material hospitalar',
  material_farmacologico: 'Material farmacológico',
};

const BUILT_IN_CATEGORIAS = Object.keys(BUILT_IN_CATEGORIA_LABELS) as CategoriaMaterial[];

export function isBuiltInProcessoCategoria(value: string): value is CategoriaMaterial {
  return BUILT_IN_CATEGORIAS.includes(value as CategoriaMaterial);
}

export function slugifyProcessoCategoria(label: string): string {
  const normalized = String(label ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized;
}

export function getProcessoCategoriaTabLabel(value: ProcessoCategoria): string {
  if (isBuiltInProcessoCategoria(value)) {
    return BUILT_IN_CATEGORIA_LABELS[value];
  }

  const cleaned = String(value ?? '')
    .replace(/^material[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'Personalizado';
  }

  return cleaned
    .split(' ')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

export function getProcessoCategoriaFullLabel(value: ProcessoCategoria): string {
  if (isBuiltInProcessoCategoria(value)) {
    return BUILT_IN_CATEGORIA_FULL_LABELS[value];
  }

  return getProcessoCategoriaTabLabel(value);
}

const CUSTOM_CATEGORIA_PALETTE = [
  '#22d3ee',
  '#f97316',
  '#facc15',
  '#34d399',
  '#a855f7',
  '#f472b6',
  '#60a5fa',
];

export function getProcessoCategoriaCustomColor(value: ProcessoCategoria): string {
  const slug = slugifyProcessoCategoria(String(value ?? ''));
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) >>> 0;
  }
  return CUSTOM_CATEGORIA_PALETTE[hash % CUSTOM_CATEGORIA_PALETTE.length];
}

export function compareProcessoCategorias(left: ProcessoCategoria, right: ProcessoCategoria) {
  const leftBuiltIn = isBuiltInProcessoCategoria(left);
  const rightBuiltIn = isBuiltInProcessoCategoria(right);

  if (leftBuiltIn && !rightBuiltIn) return -1;
  if (!leftBuiltIn && rightBuiltIn) return 1;

  if (leftBuiltIn && rightBuiltIn) {
    return BUILT_IN_CATEGORIAS.indexOf(left as CategoriaMaterial) - BUILT_IN_CATEGORIAS.indexOf(right as CategoriaMaterial);
  }

  return getProcessoCategoriaTabLabel(left).localeCompare(getProcessoCategoriaTabLabel(right), 'pt-BR');
}

export function listProcessoCategoriasFromItems(
  values: Iterable<ProcessoCategoria>
): ProcessoCategoria[] {
  const seen = new Set<string>(BUILT_IN_CATEGORIAS);
  const ordered: ProcessoCategoria[] = [...BUILT_IN_CATEGORIAS];

  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    ordered.push(value);
  }

  return ordered.sort(compareProcessoCategorias);
}
