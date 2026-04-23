import { Action, CategoriaMaterial, Level, ProcessoTipo } from './types';

type ConfiguracaoSistemaBase = {
  criticoDias: number;
  altoDias: number;
  medioDias: number;
  baixoDias: number;
  riscoAltoDias: number;
  riscoMedioDias: number;
  prioridadeUrgenteDias: number;
  prioridadeAltaDias: number;
  comprarDias: number;
  podeEmprestarDias: number;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
  alvoTransferenciaCmm: number;
  mesesCompraSugerida: number;
  excluirCmmMenorQueUm: boolean;
};

export const PROCESSO_TOTAL_PARCELAS_MAX = 6;

type ProcessoPrazoCategoriaSlug = 'MaterialHospitalar' | 'MaterialFarmacologico';
type ProcessoPrazoTipoSlug = 'Arp' | 'Simplificado' | 'Excepcional';
type ProcessoPrazoParcelaNumero = 1 | 2 | 3 | 4 | 5 | 6;

export type ProcessoPrazoParcelaKey =
  `processo${ProcessoPrazoCategoriaSlug}${ProcessoPrazoTipoSlug}Parcela${ProcessoPrazoParcelaNumero}DiasUteis`;

export type ConfiguracaoSistema = ConfiguracaoSistemaBase & Record<ProcessoPrazoParcelaKey, number>;

export const processoPrazoCategorias = [
  { categoria: 'material_hospitalar', label: 'Materiais', slug: 'MaterialHospitalar' },
  { categoria: 'material_farmacologico', label: 'Medicamentos', slug: 'MaterialFarmacologico' },
] as const satisfies readonly { categoria: CategoriaMaterial; label: string; slug: ProcessoPrazoCategoriaSlug }[];

export const processoPrazoTipos = [
  { tipo: 'ARP', label: 'ARP', slug: 'Arp' },
  { tipo: 'Processo Simplificado', label: 'Processo Simplificado', slug: 'Simplificado' },
  { tipo: 'Processo Excepcional', label: 'Processo Excepcional', slug: 'Excepcional' },
] as const satisfies readonly { tipo: ProcessoTipo; label: string; slug: ProcessoPrazoTipoSlug }[];

export const processoPrazoParcelaNumeros = [1, 2, 3, 4, 5, 6] as const;

const processoPrazoPadraoPorParcela: Record<ProcessoPrazoParcelaNumero, number> = {
  1: 5,
  2: 45,
  3: 85,
  4: 125,
  5: 165,
  6: 205,
};

const categoriaSlugByValue: Record<CategoriaMaterial, ProcessoPrazoCategoriaSlug> = {
  material_hospitalar: 'MaterialHospitalar',
  material_farmacologico: 'MaterialFarmacologico',
};

const tipoSlugByValue: Record<ProcessoTipo, ProcessoPrazoTipoSlug> = {
  ARP: 'Arp',
  'Processo Simplificado': 'Simplificado',
  'Processo Excepcional': 'Excepcional',
};

export function getProcessoPrazoParcelaKey(
  categoria: CategoriaMaterial,
  tipo: ProcessoTipo,
  parcela: ProcessoPrazoParcelaNumero
): ProcessoPrazoParcelaKey {
  return `processo${categoriaSlugByValue[categoria]}${tipoSlugByValue[tipo]}Parcela${parcela}DiasUteis`;
}

export const processoPrazoParcelaDefinitions = processoPrazoCategorias.flatMap((categoria) =>
  processoPrazoTipos.flatMap((tipo) =>
    processoPrazoParcelaNumeros.map((parcela) => ({
      categoria: categoria.categoria,
      categoriaLabel: categoria.label,
      tipo: tipo.tipo,
      tipoLabel: tipo.label,
      parcela,
      key: getProcessoPrazoParcelaKey(categoria.categoria, tipo.tipo, parcela),
    }))
  )
);

function criarProcessoPrazosPadrao() {
  return Object.fromEntries(
    processoPrazoParcelaDefinitions.map((definition) => [
      definition.key,
      processoPrazoPadraoPorParcela[definition.parcela],
    ])
  ) as Record<ProcessoPrazoParcelaKey, number>;
}

const configuracaoSistemaBasePadrao: ConfiguracaoSistemaBase = {
  criticoDias: 7,
  altoDias: 15,
  medioDias: 30,
  baixoDias: 60,
  riscoAltoDias: 10,
  riscoMedioDias: 25,
  prioridadeUrgenteDias: 7,
  prioridadeAltaDias: 15,
  comprarDias: 15,
  podeEmprestarDias: 120,
  doadorSeguroDias: 100,
  pisoDoadorAposEmprestimoDias: 100,
  alvoTransferenciaCmm: 0.75,
  mesesCompraSugerida: 2,
  excluirCmmMenorQueUm: false,
};

export const configuracaoSistemaPadrao: ConfiguracaoSistema = {
  ...configuracaoSistemaBasePadrao,
  ...criarProcessoPrazosPadrao(),
};

export type ConfiguracaoSistemaKey = keyof ConfiguracaoSistema;

export type ConfiguracaoSistemaValidationIssue = {
  fields: ConfiguracaoSistemaKey[];
  message: string;
};

export const configuracaoSistemaKeys = Object.keys(configuracaoSistemaPadrao) as ConfiguracaoSistemaKey[];

export const processoParcelaPrazoKeys = processoPrazoParcelaDefinitions.map(
  (definition) => definition.key
) as ProcessoPrazoParcelaKey[];

const configuracaoSistemaBaseLabels: Record<keyof ConfiguracaoSistemaBase, string> = {
  criticoDias: 'Crítico até',
  altoDias: 'Alto até',
  medioDias: 'Médio até',
  baixoDias: 'Baixo até',
  riscoAltoDias: 'Risco alto até',
  riscoMedioDias: 'Risco médio até',
  prioridadeUrgenteDias: 'Prioridade urgente até',
  prioridadeAltaDias: 'Prioridade alta até',
  comprarDias: 'Comprar quando faltar até',
  podeEmprestarDias: 'Pode emprestar quando tiver pelo menos',
  doadorSeguroDias: 'Hospital que empresta precisa ter mais de',
  pisoDoadorAposEmprestimoDias: 'Hospital que empresta deve ficar com pelo menos',
  alvoTransferenciaCmm: 'Quanto o HMSA deve pegar emprestado',
  mesesCompraSugerida: 'Quantidade sugerida para compra',
  excluirCmmMenorQueUm: 'Ocultar itens com consumo mensal menor que 1',
};

export const configuracaoSistemaLabels: Record<ConfiguracaoSistemaKey, string> = {
  ...configuracaoSistemaBaseLabels,
  ...Object.fromEntries(
    processoPrazoParcelaDefinitions.map((definition) => [
      definition.key,
      `${definition.categoriaLabel} · ${definition.tipoLabel} · Parcela ${definition.parcela}`,
    ])
  ),
} as Record<ConfiguracaoSistemaKey, string>;

const integerKeys = new Set<ConfiguracaoSistemaKey>([
  'criticoDias',
  'altoDias',
  'medioDias',
  'baixoDias',
  'riscoAltoDias',
  'riscoMedioDias',
  'prioridadeUrgenteDias',
  'prioridadeAltaDias',
  'comprarDias',
  'podeEmprestarDias',
  'doadorSeguroDias',
  'pisoDoadorAposEmprestimoDias',
  ...processoParcelaPrazoKeys,
]);

const fieldBounds: Partial<Record<ConfiguracaoSistemaKey, { min: number; max: number }>> = {
  criticoDias: { min: 1, max: 365 },
  altoDias: { min: 1, max: 365 },
  medioDias: { min: 1, max: 365 },
  baixoDias: { min: 1, max: 365 },
  riscoAltoDias: { min: 1, max: 365 },
  riscoMedioDias: { min: 1, max: 365 },
  prioridadeUrgenteDias: { min: 1, max: 365 },
  prioridadeAltaDias: { min: 1, max: 365 },
  comprarDias: { min: 1, max: 365 },
  podeEmprestarDias: { min: 1, max: 365 },
  doadorSeguroDias: { min: 1, max: 365 },
  pisoDoadorAposEmprestimoDias: { min: 1, max: 365 },
  alvoTransferenciaCmm: { min: 0, max: 2 },
  mesesCompraSugerida: { min: 0.1, max: 24 },
  ...Object.fromEntries(
    processoParcelaPrazoKeys.map((key) => [key, { min: 1, max: 365 }])
  ),
};

function parseConfigNumber(value: unknown, fallback: number) {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value === 'number') {
    return value;
  }

  const normalized = String(value).trim().replace(',', '.');
  return Number(normalized);
}

function parseConfigBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'sim') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'nao' || normalized === 'não') {
      return false;
    }
  }

  return fallback;
}

function formatRangeNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value)) : '?';
}

function formatRange(start: number, end: number) {
  return `${formatRangeNumber(start)}-${formatRangeNumber(end)} dias`;
}

export function isConfiguracaoSistemaKey(value: string): value is ConfiguracaoSistemaKey {
  return configuracaoSistemaKeys.includes(value as ConfiguracaoSistemaKey);
}

export function normalizarConfiguracaoSistema(
  input: Partial<Record<ConfiguracaoSistemaKey, unknown>> = {},
  base: ConfiguracaoSistema = configuracaoSistemaPadrao
): ConfiguracaoSistema {
  const next: Partial<Record<ConfiguracaoSistemaKey, unknown>> = { ...base };

  for (const key of configuracaoSistemaKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      next[key] =
        typeof base[key] === 'boolean'
          ? parseConfigBoolean(input[key], base[key])
          : parseConfigNumber(input[key], base[key]);
    }
  }

  return next as ConfiguracaoSistema;
}

export function criarConfiguracaoSistemaDeRows(rows: { chave: string; valor: unknown }[]) {
  const input: Partial<Record<ConfiguracaoSistemaKey, unknown>> = {};

  for (const row of rows) {
    if (isConfiguracaoSistemaKey(row.chave)) {
      input[row.chave] = row.valor;
    }
  }

  return normalizarConfiguracaoSistema(input);
}

export function validarConfiguracaoSistema(config: ConfiguracaoSistema): ConfiguracaoSistemaValidationIssue[] {
  const issues: ConfiguracaoSistemaValidationIssue[] = [];

  for (const key of configuracaoSistemaKeys) {
    const value = config[key];
    const bounds = fieldBounds[key];
    const label = configuracaoSistemaLabels[key];

    if (typeof value === 'boolean') {
      continue;
    }

    if (!Number.isFinite(value)) {
      issues.push({ fields: [key], message: `${label} precisa ser um número.` });
      continue;
    }

    if (integerKeys.has(key) && !Number.isInteger(value)) {
      issues.push({ fields: [key], message: `${label} precisa ser um número inteiro.` });
    }

    if (bounds && (value < bounds.min || value > bounds.max)) {
      issues.push({
        fields: [key],
        message: `${label} precisa ficar entre ${bounds.min} e ${bounds.max}.`,
      });
    }
  }

  if (config.criticoDias > config.altoDias || config.altoDias > config.medioDias || config.medioDias > config.baixoDias) {
    issues.push({
      fields: ['criticoDias', 'altoDias', 'medioDias', 'baixoDias'],
      message: 'As faixas de cobertura precisam seguir a ordem: crítico <= alto <= médio <= baixo.',
    });
  }

  if (config.riscoAltoDias > config.riscoMedioDias) {
    issues.push({
      fields: ['riscoAltoDias', 'riscoMedioDias'],
      message: 'Risco alto precisa ser menor ou igual ao risco médio.',
    });
  }

  if (config.prioridadeUrgenteDias > config.prioridadeAltaDias) {
    issues.push({
      fields: ['prioridadeUrgenteDias', 'prioridadeAltaDias'],
      message: 'Prioridade urgente precisa ser menor ou igual à prioridade alta.',
    });
  }

  if (config.comprarDias > config.medioDias) {
    issues.push({
      fields: ['comprarDias', 'medioDias'],
      message: 'Comprar até precisa ficar dentro da faixa monitorada até médio.',
    });
  }

  if (config.podeEmprestarDias < config.doadorSeguroDias) {
    issues.push({
      fields: ['podeEmprestarDias', 'doadorSeguroDias'],
      message: 'Pode emprestar precisa ser maior ou igual ao mínimo que o hospital que empresta deve manter.',
    });
  }

  for (const categoria of processoPrazoCategorias) {
    for (const tipo of processoPrazoTipos) {
      const keys = processoPrazoParcelaNumeros.map((parcela) =>
        getProcessoPrazoParcelaKey(categoria.categoria, tipo.tipo, parcela)
      );

      for (let index = 1; index < keys.length; index += 1) {
        const previousKey = keys[index - 1];
        const currentKey = keys[index];

        if (config[previousKey] > config[currentKey]) {
          issues.push({
            fields: [previousKey, currentKey],
            message: `Os prazos de ${categoria.label} em ${tipo.label} precisam seguir a ordem da parcela 1 até a parcela 6.`,
          });
          break;
        }
      }
    }
  }

  return issues;
}

export function getLimiteCompraDias(config: ConfiguracaoSistema) {
  return config.comprarDias;
}

export function getProcessoParcelasDiasUteis(
  config: ConfiguracaoSistema,
  categoria: CategoriaMaterial,
  tipo: ProcessoTipo
) {
  return processoPrazoParcelaNumeros.map((parcela) => config[getProcessoPrazoParcelaKey(categoria, tipo, parcela)]);
}

export function getProcessoParcelaDiasUteis(
  config: ConfiguracaoSistema,
  categoria: CategoriaMaterial,
  tipo: ProcessoTipo,
  index: number
) {
  const safeIndex = Math.min(Math.max(Math.floor(index), 0), PROCESSO_TOTAL_PARCELAS_MAX - 1);
  return getProcessoParcelasDiasUteis(config, categoria, tipo)[safeIndex];
}

export function configuracaoSistemaIgual(left: ConfiguracaoSistema, right: ConfiguracaoSistema) {
  return configuracaoSistemaKeys.every((key) => left[key] === right[key]);
}

export function getLevelRangeLabels(config: ConfiguracaoSistema): Record<Level, string> {
  return {
    URGENTE: 'zerado',
    'CRÍTICO': formatRange(1, config.criticoDias),
    ALTO: formatRange(config.criticoDias + 1, config.altoDias),
    'MÉDIO': formatRange(config.altoDias + 1, config.medioDias),
    BAIXO: formatRange(config.medioDias + 1, config.baixoDias),
    'ESTÁVEL': `${formatRangeNumber(config.baixoDias + 1)}+ dias`,
  };
}

export function getLevelTooltips(config: ConfiguracaoSistema): Record<Level, string> {
  const ranges = getLevelRangeLabels(config);

  return {
    URGENTE: 'Estoque zerado. Ação imediata para evitar indisponibilidade do item.',
    'CRÍTICO': `Cobertura de ${ranges['CRÍTICO']}. Faixa com maior risco de ruptura.`,
    ALTO: `Cobertura de ${ranges.ALTO}. Ainda atende, mas já pede ação rápida.`,
    'MÉDIO': `Cobertura de ${ranges['MÉDIO']}. Sai da urgência curta, mas ainda merece acompanhamento.`,
    BAIXO: `Cobertura de ${ranges.BAIXO}. Faixa operacional mais confortável.`,
    'ESTÁVEL': `Cobertura de ${ranges['ESTÁVEL']}. Indica estoque folgado e possível excedente.`,
  };
}

export function getActionTooltips(config: ConfiguracaoSistema): Record<Action, string> {
  const limiteCompraDias = getLimiteCompraDias(config);

  return {
    COMPRAR:
      `Recomendado quando o HMSA está com até ${limiteCompraDias} dias sem outro hospital com mais de ${config.doadorSeguroDias} dias de cobertura, ou quando já entrou na faixa até ${config.medioDias} dias.`,
    'PEGAR EMPRESTADO':
      `Recomendado quando o HMSA está com até ${limiteCompraDias} dias e existe outro hospital com o mesmo item acima de ${config.doadorSeguroDias} dias, mantendo pelo menos ${config.pisoDoadorAposEmprestimoDias} dias após a transferência.`,
    AVALIAR:
      'Faixa mantida para leitura operacional, mas a regra atual prioriza compra ou empréstimo nas faixas configuradas.',
    'PODE EMPRESTAR':
      `Item com folga a partir de ${config.podeEmprestarDias} dias. Pode entrar como origem de redistribuição se continuar com cobertura suficiente após emprestar.`,
    OK: 'Item fora da faixa crítica e sem necessidade de ação imediata.',
    'EXECUTAR AGORA': 'Ação imediata priorizada em fluxos operacionais específicos.',
    'BAIXA PRIORIDADE': 'Item monitorado, mas sem urgência operacional no momento.',
  };
}
