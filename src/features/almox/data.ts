import {
  Action,
  BlacklistItem,
  CategoriaMaterial,
  DashboardData,
  DetailItem,
  EmailConfig,
  Hospital,
  IntelligenceDetails,
  OrderItem,
  Priority,
  Product,
  ProductProcessSummary,
  ProductProcessSummaryEntry,
  ProductProcessSummaryParcel,
} from './types';
import { ConfiguracaoSistema, configuracaoSistemaPadrao, getLimiteCompraDias } from './configuracao';

export interface EstoqueAtualRow {
  categoria_material?: CategoriaMaterial | string | null;
  estoque_importado_id?: string;
  lote_importacao_id?: string;
  data_referencia?: string | null;
  importado_em: string;
  unidade_id?: string;
  codigo_unidade: string;
  nome_unidade?: string;
  produto_referencia_id: string | null;
  codigo_produto_referencia: string | null;
  nome_produto_referencia: string | null;
  unidade_medida_referencia?: string | null;
  especie_padrao?: string | null;
  produto_unidade_id?: string;
  codigo_produto: string;
  nome_produto: string;
  unidade_medida_produto?: string | null;
  suficiencia_em_dias: number | string | null;
  data_ultima_entrada: string | null;
  valor_custo_medio?: number | string | null;
  consumo_medio: number | string | null;
  estoque_atual: number | string | null;
  criado_em?: string;
}

export interface ProductMonthlyConsumptionSignal {
  product_code: string;
  data_snapshot_inicio: string | null;
  consumo_mes_ate_hoje: number;
  percentual_consumido: number | null;
}

interface EnrichedProduct extends Product {
  hospital: Hospital;
  produto_referencia_id: string | null;
  codigo_produto_referencia: string | null;
  estoque_atual: number;
  data_ultima_entrada: string | null;
}

export interface AlmoxDataset {
  hospitals: Hospital[];
  productsByHospital: Record<Hospital, Product[]>;
  dashboardByHospital: Record<Hospital, DashboardData>;
  intelligenceDetails: IntelligenceDetails;
  loansNeeded: Product[];
  canLend: Product[];
  orderItems: OrderItem[];
  emailPreviewItems: Product[];
  lastSync: string | null;
}

const hospitalOrder: Hospital[] = ['HMSA', 'HEC', 'HDDS', 'HABF'];

const emailConfigSeed: EmailConfig = {
  smtp_host: 'smtp.hospital.local',
  smtp_port: 587,
  email_user: 'alertas.almox@hmsa.local',
  email_pass: '************',
  email_destination: 'suprimentos@hmsa.local',
  auto_send_on_sync: true,
};

const categoriaMaterialLabels: Record<CategoriaMaterial, string> = {
  material_hospitalar: 'Material hospitalar',
  material_farmacologico: 'Material farmacológico',
};

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function parseNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategoriaMaterial(value: EstoqueAtualRow['categoria_material']): CategoriaMaterial {
  return value === 'material_farmacologico' ? 'material_farmacologico' : 'material_hospitalar';
}

export function getCategoriaMaterialLabel(value: CategoriaMaterial) {
  return categoriaMaterialLabels[value];
}

function mapHospital(code: string): Hospital | null {
  const normalized = String(code ?? '').trim().toUpperCase();

  if (normalized === 'HMSASOUL') {
    return 'HMSA';
  }
  if (normalized === 'HEC' || normalized === 'HDDS' || normalized === 'HABF') {
    return normalized;
  }

  return null;
}

function getLevel(days: number, estoqueAtual: number, config: ConfiguracaoSistema) {
  if (estoqueAtual <= 0) return 'URGENTE' as const;
  if (days <= config.criticoDias) return 'CRÍTICO' as const;
  if (days <= config.altoDias) return 'ALTO' as const;
  if (days <= config.medioDias) return 'MÉDIO' as const;
  if (days <= config.baixoDias) return 'BAIXO' as const;
  return 'ESTÁVEL' as const;
}

function getRuptureRisk(days: number, config: ConfiguracaoSistema) {
  if (days <= config.riscoAltoDias) return 'RISCO ALTO' as const;
  if (days <= config.riscoMedioDias) return 'RISCO MÉDIO' as const;
  return 'ESTÁVEL' as const;
}

function getPriority(item: Product, config: ConfiguracaoSistema): Priority {
  if (item.sufficiency_days <= config.prioridadeUrgenteDias) return 'URGENTE';
  if (item.sufficiency_days <= config.prioridadeAltaDias) return 'ALTA';
  return 'NORMAL';
}

function safeMonthlyConsumption(value: number) {
  return value > 0 ? value : 0.01;
}

function safeDailyUsage(value: number) {
  return safeMonthlyConsumption(value) / 30;
}

function clampSufficiency(value: number) {
  return Math.min(Math.max(value, 0), 365);
}

function clampScore(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function formatDays(days: number) {
  return `${round(days, 0)} dias`;
}

function formatUnits(value: number) {
  return `${round(value, 0)} un.`;
}

function formatPercentFromRatio(value: number) {
  return `${round(value * 100, 0)}%`;
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) {
    return null;
  }

  const nextDate = new Date(year, month - 1, day);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function baseActionForHospital(item: EnrichedProduct, config: ConfiguracaoSistema) {
  if (item.sufficiency_days <= getLimiteCompraDias(config)) return 'COMPRAR' as const;
  if (item.sufficiency_days <= config.medioDias) return 'AVALIAR' as const;
  if (item.sufficiency_days >= config.podeEmprestarDias) return 'PODE EMPRESTAR' as const;
  return 'OK' as const;
}

function getContextualPurchaseAction(action: Action, processSummary?: ProductProcessSummary): Action {
  if (action !== 'COMPRAR') {
    return action;
  }

  if (!processSummary || processSummary.total_open === 0) {
    return 'COMPRAR';
  }

  if (processSummary.overdue_count > 0) {
    return 'COBRAR ENTREGA';
  }

  return 'ACOMPANHAR PROCESSO';
}

function isPurchaseWorkflowAction(action?: Action) {
  return action === 'COMPRAR' || action === 'ACOMPANHAR PROCESSO' || action === 'COBRAR ENTREGA';
}

type ConsumptionAssessment = {
  state: 'missing' | 'normal' | 'moderate' | 'high';
  snapshotLabel?: string;
  monthlyPercentLabel?: string;
  consumedUnitsLabel?: string;
  avgUnitsLabel?: string;
  paceAboveExpectedLabel?: string;
};

type ObservationContext = {
  processSummary?: ProductProcessSummary;
  consumptionSignal?: ProductMonthlyConsumptionSignal;
  suggestedHospital?: Hospital;
  qtyTransfer?: number;
  donorAfter?: number;
  receiverAfter?: number;
  qtyToBuy?: number;
};

function getMonthMeasurementRatio(snapshotDate: Date, referenceDate = new Date()) {
  const currentDate = new Date(referenceDate);
  currentDate.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(snapshotDate.getFullYear(), snapshotDate.getMonth() + 1, 0).getDate();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysMeasured = Math.max(1, Math.floor((currentDate.getTime() - snapshotDate.getTime()) / msPerDay) + 1);

  return Math.min(daysMeasured / daysInMonth, 1);
}

function getConsumptionAssessment(
  signal: ProductMonthlyConsumptionSignal | undefined,
  item: Pick<Product, 'avg_monthly_consumption'>
): ConsumptionAssessment {
  if (!signal) {
    return { state: 'missing' };
  }

  const snapshotDate = parseIsoDate(signal.data_snapshot_inicio);
  if (!snapshotDate || signal.percentual_consumido == null) {
    return { state: 'missing' };
  }

  const measurementRatio = getMonthMeasurementRatio(snapshotDate);
  const paceRatio = measurementRatio > 0 ? signal.percentual_consumido / measurementRatio : signal.percentual_consumido;
  const state =
    paceRatio >= 1.35 ? 'high' : paceRatio >= 1.15 ? 'moderate' : 'normal';

  return {
    state,
    snapshotLabel: snapshotDate.toLocaleDateString('pt-BR'),
    monthlyPercentLabel: formatPercentFromRatio(signal.percentual_consumido),
    consumedUnitsLabel: formatUnits(signal.consumo_mes_ate_hoje),
    avgUnitsLabel: formatUnits(item.avg_monthly_consumption),
    paceAboveExpectedLabel: formatPercentFromRatio(Math.max(paceRatio - 1, 0)),
  };
}

function getTodayAtStartOfDay(referenceDate = new Date()) {
  const nextDate = new Date(referenceDate);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function getCalendarDayDifference(targetDate: Date | null, referenceDate = new Date()) {
  if (!targetDate) {
    return null;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetDate.getTime() - getTodayAtStartOfDay(referenceDate).getTime()) / msPerDay);
}

function isOlderThanYears(targetDate: Date, years: number, referenceDate = new Date()) {
  const thresholdDate = getTodayAtStartOfDay(referenceDate);
  thresholdDate.setFullYear(thresholdDate.getFullYear() - years);
  return targetDate < thresholdDate;
}

function formatRelativeDays(days: number) {
  if (days === 0) {
    return 'hoje';
  }

  const amount = Math.abs(days);
  return days > 0 ? `daqui a ${amount} dia(s)` : `há ${amount} dia(s)`;
}

function formatElapsedTimeFromDays(days: number) {
  const amount = Math.abs(days);

  if (amount >= 365) {
    return `${Math.floor(amount / 365)} ano(s)`;
  }

  if (amount >= 30) {
    return `${Math.floor(amount / 30)} mes(es)`;
  }

  return `${amount} dia(s)`;
}

function joinObservationLines(lines: (string | null | undefined)[]) {
  return lines.filter(Boolean).join('\n');
}

function formatDateLabel(value: string | null | undefined) {
  const parsedDate = parseIsoDate(value);
  return parsedDate ? parsedDate.toLocaleDateString('pt-BR') : null;
}

function getLastEntryObservationLines(item: Pick<EnrichedProduct, 'data_ultima_entrada'>) {
  const entryDate = parseIsoDate(item.data_ultima_entrada);
  if (!entryDate) {
    return ['Entrada: sem data na base'];
  }

  const entryDays = getCalendarDayDifference(entryDate) ?? 0;
  const entryLabel = `Entrada: ${entryDate.toLocaleDateString('pt-BR')} • há ${formatElapsedTimeFromDays(entryDays)}`;

  if (isOlderThanYears(entryDate, 3)) {
    return [
      `${entryLabel} • VALIDAR USO`,
      'Próximo passo: retirar da lista se obsoleto',
    ];
  }

  return [entryLabel];
}

function getInventorySnapshotLines(item: Pick<EnrichedProduct, 'estoque_atual' | 'sufficiency_days' | 'data_ultima_entrada'>) {
  return [
    `Estoque: ${formatUnits(item.estoque_atual)} • ${formatDays(item.sufficiency_days)}`,
    ...getLastEntryObservationLines(item),
  ];
}

function getPrimaryProcessEntry(processSummary?: ProductProcessSummary) {
  return processSummary?.entries[0] ?? null;
}

function getPrimaryProcessParcel(entry?: ProductProcessSummaryEntry | null) {
  if (!entry || entry.parcelas.length === 0) {
    return null;
  }

  return [...entry.parcelas].sort((left, right) => {
    const leftPriority = left.overdue ? 0 : left.near_due ? 1 : 2;
    const rightPriority = right.overdue ? 0 : right.near_due ? 1 : 2;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftDistance = left.due_in_days ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.due_in_days ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.numero - right.numero;
  })[0];
}

function getProcessReference(entry?: ProductProcessSummaryEntry | null) {
  if (!entry) {
    return null;
  }

  const refs = [
    entry.numero_processo ? `${entry.tipo_processo} ${entry.numero_processo}` : entry.tipo_processo,
    entry.edocs ? `E-DOCS ${entry.edocs}` : null,
  ].filter(Boolean);
  const refLabel = refs.join(' / ');

  if (entry.fornecedor) {
    return refLabel ? `${refLabel} com ${entry.fornecedor}` : `Fornecedor ${entry.fornecedor}`;
  }

  return refLabel || 'Processo aberto';
}

function describeProcessParcel(parcel?: ProductProcessSummaryParcel | null) {
  if (!parcel) {
    return 'Parcela: sem detalhe na base';
  }

  const delayLabel = parcel.adiamento_dias_uteis ? ` (+${parcel.adiamento_dias_uteis}d)` : '';
  if (parcel.overdue) {
    return `Parcela: P${parcel.numero} • ${parcel.data_label}${delayLabel} • atrasada ${formatRelativeDays(parcel.due_in_days ?? -1)}`;
  }

  if (parcel.near_due) {
    if (parcel.due_in_days === 0) {
      return `Parcela: P${parcel.numero} • ${parcel.data_label}${delayLabel} • vence hoje`;
    }

    return `Parcela: P${parcel.numero} • ${parcel.data_label}${delayLabel} • ${formatRelativeDays(parcel.due_in_days ?? 1)}`;
  }

  return `Parcela: P${parcel.numero} • ${parcel.data_label}${delayLabel}`;
}

function getProcessSituationDetail(entry?: ProductProcessSummaryEntry | null, parcel?: ProductProcessSummaryParcel | null) {
  const processReference = getProcessReference(entry);
  const parcelDescription = describeProcessParcel(parcel);

  if (!processReference) {
    return parcelDescription;
  }

  return `Processo: ${processReference}\n${parcelDescription}`;
}

function getProcessNotificationDetail(
  entry?: ProductProcessSummaryEntry | null,
  parcel?: ProductProcessSummaryParcel | null
) {
  if (!parcel?.overdue) {
    return null;
  }

  if (parcel.empresa_notificada) {
    const notifiedAt = formatDateLabel(parcel.empresa_notificada_em);
    return notifiedAt
      ? `Cobrança: notificado em ${notifiedAt}`
      : 'Cobrança: fornecedor já notificado';
  }

  return entry?.fornecedor
    ? `Cobrança: ${entry.fornecedor} ainda não notificado`
    : 'Cobrança: fornecedor ainda não notificado';
}

function getExtraOpenProcessDetail(processSummary?: ProductProcessSummary) {
  if (!processSummary || processSummary.total_open <= 1) {
    return null;
  }

  const extraCount = processSummary.total_open - 1;
  return `Extras: +${extraCount} processo(s) aberto(s)`;
}

function getBorrowPlanDetail(context: ObservationContext, mode: 'action' | 'contingency') {
  if (!context.suggestedHospital || !context.qtyTransfer) {
    return null;
  }

  const opener =
    mode === 'action'
      ? `Remanejamento: ${context.suggestedHospital} • até ${formatUnits(context.qtyTransfer)}`
      : `Contingência: ${context.suggestedHospital} • até ${formatUnits(context.qtyTransfer)}`;
  const tail = [
    context.receiverAfter != null ? `HMSA ${formatDays(context.receiverAfter)}` : null,
    context.donorAfter != null ? `doador ${formatDays(context.donorAfter)}` : null,
  ].filter(Boolean);

  return tail.length > 0 ? `${opener} • ${tail.join(' • ')}` : opener;
}

function getPurchasePlanDetail(context: ObservationContext) {
  if (!context.qtyToBuy) {
    return null;
  }

  return `Compra: ~${formatUnits(context.qtyToBuy)}`;
}

function buildObservationSummary(
  action: Action,
  primaryEntry: ProductProcessSummaryEntry | null,
  primaryParcel: ProductProcessSummaryParcel | null,
  context: ObservationContext,
  consumptionAssessment: ConsumptionAssessment
) {
  switch (action) {
    case 'COMPRAR':
      return context.qtyToBuy ? `Abrir compra de ${formatUnits(context.qtyToBuy)}` : 'Abrir compra';
    case 'ACOMPANHAR PROCESSO':
      return primaryEntry?.edocs && primaryParcel
        ? `Acompanhar P${primaryParcel.numero} do E-DOCS ${primaryEntry.edocs}`
        : 'Acompanhar processo';
    case 'COBRAR ENTREGA':
      return primaryEntry?.edocs && primaryParcel
        ? `Cobrar P${primaryParcel.numero} do E-DOCS ${primaryEntry.edocs}`
        : 'Cobrar fornecedor';
    case 'PEGAR EMPRESTADO':
      return context.suggestedHospital && context.qtyTransfer
        ? `Pedir ${formatUnits(context.qtyTransfer)} ao ${context.suggestedHospital}`
        : 'Solicitar empréstimo';
    case 'PODE EMPRESTAR':
      return consumptionAssessment.state === 'high' || consumptionAssessment.state === 'moderate'
        ? 'Segurar saldo no HMSA'
        : 'Avaliar redistribuição';
    case 'AVALIAR':
      return primaryEntry ? 'Revisar cobertura e processo' : 'Revisar abastecimento';
    case 'OK':
      return consumptionAssessment.state === 'high' || consumptionAssessment.state === 'moderate'
        ? 'Monitorar aumento de consumo'
        : 'Sem ação imediata';
    default:
      return 'Manter monitoramento';
  }
}

function getConsumptionObservationDetail(
  signal: ProductMonthlyConsumptionSignal | undefined,
  item: Pick<Product, 'avg_monthly_consumption'>,
  mode: 'critical' | 'context'
) {
  const assessment = getConsumptionAssessment(signal, item);

  if (assessment.state === 'missing') {
    return mode === 'critical'
      ? 'Consumo: sem snapshot diário'
      : null;
  }

  if (assessment.state === 'normal') {
    return mode === 'critical'
      ? `Consumo: em linha desde ${assessment.snapshotLabel}`
      : null;
  }

  return `Consumo: ${assessment.monthlyPercentLabel} da média • +${(assessment.paceAboveExpectedLabel ?? '0%').replace('%', '')}% vs ritmo esperado • base ${assessment.snapshotLabel}`;
}

function buildProductObservation(item: EnrichedProduct, action: Action, config: ConfiguracaoSistema, context: ObservationContext = {}) {
  const { processSummary, consumptionSignal } = context;
  const primaryEntry = getPrimaryProcessEntry(processSummary);
  const primaryParcel = getPrimaryProcessParcel(primaryEntry);
  const consumptionAssessment = getConsumptionAssessment(consumptionSignal, item);
  const consumptionCritical = getConsumptionObservationDetail(consumptionSignal, item, 'critical');
  const consumptionContext = getConsumptionObservationDetail(consumptionSignal, item, 'context');
  const inventorySnapshotLines = getInventorySnapshotLines(item);
  const processSituation = getProcessSituationDetail(primaryEntry, primaryParcel);
  const notificationDetail = getProcessNotificationDetail(primaryEntry, primaryParcel);
  const extraProcesses = getExtraOpenProcessDetail(processSummary);
  const borrowPlan = getBorrowPlanDetail(context, 'action');
  const borrowContingency = getBorrowPlanDetail(context, 'contingency');
  const purchasePlan = getPurchasePlanDetail(context);
  const observationSummary = buildObservationSummary(
    action,
    primaryEntry,
    primaryParcel,
    context,
    consumptionAssessment
  );

  switch (action) {
    case 'COMPRAR':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          'Processo: sem processo aberto',
          purchasePlan,
          `Remanejamento: sem doador > ${config.doadorSeguroDias} dias`,
          consumptionCritical,
        ]),
      };
    case 'ACOMPANHAR PROCESSO':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          processSituation,
          ...inventorySnapshotLines,
          extraProcesses,
          borrowContingency ??
            (context.qtyToBuy && item.sufficiency_days <= config.altoDias
              ? `Backup: compra ~${formatUnits(context.qtyToBuy)}`
              : null),
          consumptionCritical,
        ]),
      };
    case 'COBRAR ENTREGA':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          processSituation,
          ...inventorySnapshotLines,
          notificationDetail,
          borrowContingency ??
            (context.qtyToBuy ? `Backup: compra ~${formatUnits(context.qtyToBuy)}` : null),
          consumptionCritical,
        ]),
      };
    case 'PEGAR EMPRESTADO':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          borrowPlan,
          primaryEntry
            ? `${processSituation}\nObjetivo: segurar HMSA até regularização`
            : null,
          consumptionCritical,
        ]),
      };
    case 'PODE EMPRESTAR':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          consumptionContext
            ? `${consumptionContext}\nLimite: validar necessidade interna antes de liberar`
            : `Limite: manter HMSA > ${config.pisoDoadorAposEmprestimoDias} dias após saída`,
        ]),
      };
    case 'AVALIAR':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          primaryEntry ? processSituation : null,
          extraProcesses,
          consumptionContext
            ? `${consumptionContext}\nPróximo passo: revisar compra e monitoramento`
            : 'Próximo passo: revisar compra, consumo e recebimentos',
        ]),
      };
    case 'OK':
      return {
        observation_summary: observationSummary,
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          consumptionContext ?? 'Status: sem processo crítico • consumo em rotina',
        ]),
      };
    default:
      return {
        observation_summary: 'Manter monitoramento',
        observation_detail: joinObservationLines([
          ...inventorySnapshotLines,
          'Próximo passo: acompanhar próxima atualização da base',
        ]),
      };
  }
}

function buildBaseProducts(rows: EstoqueAtualRow[], config: ConfiguracaoSistema, cmmExceptionCodes: Set<string>) {
  const products = rows
    .map<EnrichedProduct | null>((row) => {
      const hospital = mapHospital(row.codigo_unidade);
      if (!hospital) {
        return null;
      }

      const productCode = String(row.codigo_produto ?? '').trim();
      const avgMonthlyConsumption = parseNumber(row.consumo_medio);
      const isLowConsumptionException = hospital === 'HMSA' && cmmExceptionCodes.has(productCode);
      if (config.excluirCmmMenorQueUm && avgMonthlyConsumption < 1 && !isLowConsumptionException) {
        return null;
      }

      const sufficiencyDays = clampSufficiency(parseNumber(row.suficiencia_em_dias));
      const categoriaMaterial = normalizeCategoriaMaterial(row.categoria_material);
      const estoqueAtualValue = parseNumber(row.estoque_atual);
      const levelValue = getLevel(sufficiencyDays, estoqueAtualValue, config);
      const ruptureRiskValue = getRuptureRisk(sufficiencyDays, config);

      const product: EnrichedProduct = {
        hospital,
        categoria_material: categoriaMaterial,
        product_code: productCode,
        product_name: row.nome_produto,
        produto_referencia_id: row.produto_referencia_id,
        codigo_produto_referencia: row.codigo_produto_referencia,
        sufficiency_days: sufficiencyDays,
        avg_monthly_consumption: avgMonthlyConsumption,
        daily_usage: round(safeDailyUsage(avgMonthlyConsumption), 4),
        level: levelValue,
        rupture_risk: ruptureRiskValue,
        estoque_atual: estoqueAtualValue,
        data_ultima_entrada: row.data_ultima_entrada,
      };

      return {
        ...product,
        action: baseActionForHospital(product, config),
      };
    })
    .filter((item): item is EnrichedProduct => item !== null);

  return hospitalOrder.reduce<Record<Hospital, EnrichedProduct[]>>((accumulator, hospital) => {
    accumulator[hospital] = products.filter((item) => item.hospital === hospital);
    return accumulator;
  }, {} as Record<Hospital, EnrichedProduct[]>);
}

function getBestDonor(item: EnrichedProduct, productsByHospital: Record<Hospital, EnrichedProduct[]>) {
  if (!item.codigo_produto_referencia) {
    return undefined;
  }

  return hospitalOrder
    .filter((hospital) => hospital !== 'HMSA')
    .flatMap((hospital) => productsByHospital[hospital])
    .filter(
      (candidate) =>
        candidate.categoria_material === item.categoria_material &&
        candidate.codigo_produto_referencia === item.codigo_produto_referencia
    )
    .sort((left, right) => right.sufficiency_days - left.sufficiency_days)[0];
}

function enrichProducts(
  productsByHospital: Record<Hospital, EnrichedProduct[]>,
  config: ConfiguracaoSistema,
  processSummaryByProductCode: Record<string, ProductProcessSummary> = {},
  monthlyConsumptionByProductCode: Record<string, ProductMonthlyConsumptionSignal> = {}
) {
  const hmsaProducts = productsByHospital.HMSA.map((product) => {
    const donor = getBestDonor(product, productsByHospital);
    const processSummary = processSummaryByProductCode[product.product_code];
    const monthlyConsumptionSignal = monthlyConsumptionByProductCode[product.product_code];
    const limiteCompraDias = getLimiteCompraDias(config);
    const proposedTransfer = Math.max(0, Math.ceil(product.avg_monthly_consumption * config.alvoTransferenciaCmm));
    const donorDailyUsage = donor ? safeDailyUsage(donor.avg_monthly_consumption) : 0;
    const donorTransferCapacity = donor
      ? Math.max(0, Math.floor((donor.sufficiency_days - config.pisoDoadorAposEmprestimoDias) * donorDailyUsage))
      : 0;
    const hasSafeDonor = proposedTransfer > 0 && !!donor && donor.sufficiency_days > config.doadorSeguroDias && donorTransferCapacity > 0;
    const qtyTransfer = hasSafeDonor ? Math.min(proposedTransfer, donorTransferCapacity) : undefined;
    const projectedSuf = qtyTransfer ? round(product.sufficiency_days + qtyTransfer / safeDailyUsage(product.avg_monthly_consumption), 1) : undefined;
    const donorAfter = donor && qtyTransfer ? round(donor.sufficiency_days - qtyTransfer / donorDailyUsage, 1) : undefined;
    const score =
      donor && qtyTransfer && projectedSuf && donorAfter
        ? clampScore(
            Math.min(projectedSuf, 45) / 45 * 45 +
              Math.min(Math.max(donorAfter - config.pisoDoadorAposEmprestimoDias, 0), 40) / 40 * 30 +
              Math.min(qtyTransfer / Math.max(proposedTransfer, 1), 1) * 15 +
              (product.rupture_risk === 'RISCO ALTO' ? 10 : product.rupture_risk === 'RISCO MÉDIO' ? 6 : 4)
          )
        : undefined;
    const classification = score != null ? (score >= 80 ? 'Alta aderência' : score >= 60 ? 'Viável' : 'Atenção') : undefined;

    let action = product.action;
    if (product.sufficiency_days <= limiteCompraDias) {
      action = hasSafeDonor ? 'PEGAR EMPRESTADO' : 'COMPRAR';
    } else if (product.sufficiency_days <= config.medioDias) {
      action = 'COMPRAR';
    } else if (product.sufficiency_days >= config.podeEmprestarDias) {
      action = 'PODE EMPRESTAR';
    } else {
      action = 'OK';
    }

    action = getContextualPurchaseAction(action, processSummary);
    const qtyToBuy = isPurchaseWorkflowAction(action)
      ? Math.max(1, Math.ceil(product.avg_monthly_consumption * config.mesesCompraSugerida))
      : undefined;
    const observation = buildProductObservation(
      product,
      action,
      config,
      {
        processSummary,
        consumptionSignal: monthlyConsumptionSignal,
        suggestedHospital: donor?.hospital,
        qtyTransfer,
        donorAfter,
        receiverAfter: projectedSuf,
        qtyToBuy,
      }
    );

    return {
      ...product,
      action,
      suggested_hospital: donor?.hospital,
      donor_sufficiency: donor?.sufficiency_days,
      donor_current_stock: donor?.estoque_atual,
      qty_transfer: qtyTransfer,
      projected_suf: projectedSuf,
      nova_suf_doador: donorAfter,
      nova_suf_receptor: projectedSuf,
      score,
      classification,
      qty_to_buy: qtyToBuy,
      observation_summary: observation.observation_summary,
      observation_detail: observation.observation_detail,
    };
  });

  return {
    ...productsByHospital,
    HMSA: hmsaProducts,
  };
}

function buildChartData(items: Product[]) {
  const ranges = [
    { label: '0-7', matcher: (value: number) => value <= 7 },
    { label: '8-15', matcher: (value: number) => value >= 8 && value <= 15 },
    { label: '16-30', matcher: (value: number) => value >= 16 && value <= 30 },
    { label: '31-60', matcher: (value: number) => value >= 31 && value <= 60 },
    { label: '61-90', matcher: (value: number) => value >= 61 && value <= 90 },
    { label: '91-120', matcher: (value: number) => value >= 91 && value <= 120 },
    { label: '120+', matcher: (value: number) => value > 120 },
  ];

  return ranges.map((range) => ({
    range: range.label,
    count: items.filter((item) => range.matcher(item.sufficiency_days)).length,
  }));
}

function buildInsights(hospital: Hospital, dashboard: DashboardData) {
  const insights = [
    `${dashboard.kpi.to_buy} itens pedem reposição imediata em ${hospital}.`,
    `${dashboard.kpi.to_borrow + dashboard.kpi.to_evaluate} itens podem ser tratados com redistribuição entre unidades.`,
    `${dashboard.kpi.can_lend} itens seguem acima da faixa segura e merecem revisão de saldo.`,
  ];

  if (hospital === 'HMSA') {
    insights.push(`${dashboard.kpi.rupture_risk_count} itens exigem acompanhamento diário até a próxima janela de abastecimento.`);
  }

  return insights;
}

function buildDashboard(hospital: Hospital, productsByHospital: Record<Hospital, Product[]>, lastSync: string | null): DashboardData {
  const items = productsByHospital[hospital] ?? [];
  const top10Critical = [...items].sort((left, right) => left.sufficiency_days - right.sufficiency_days).slice(0, 10);

  const hospitalRanking = hospitalOrder
    .map((itemHospital) => {
      const hospitalItems = productsByHospital[itemHospital] ?? [];
      const totalProducts = hospitalItems.length;
      const avgSufficiency =
        totalProducts > 0
          ? round(hospitalItems.reduce((sum, item) => sum + item.sufficiency_days, 0) / totalProducts, 0)
          : 0;

      return {
        hospital: itemHospital,
        avg_sufficiency: avgSufficiency,
        total_products: totalProducts,
      };
    })
    .sort((left, right) => right.avg_sufficiency - left.avg_sufficiency);

  const dashboard: DashboardData = {
    kpi: {
      total_products: items.length,
      urgent: items.filter((item) => item.level === 'URGENTE').length,
      critical: items.filter((item) => item.level === 'CRÍTICO').length,
      high: items.filter((item) => item.level === 'ALTO').length,
      medium: items.filter((item) => item.level === 'MÉDIO').length,
      low: items.filter((item) => item.level === 'BAIXO').length,
      stable: items.filter((item) => item.level === 'ESTÁVEL').length,
      to_buy: items.filter((item) => item.action === 'COMPRAR').length,
      to_borrow: items.filter((item) => item.action === 'PEGAR EMPRESTADO').length,
      to_evaluate: items.filter((item) => item.action === 'AVALIAR').length,
      can_lend: items.filter((item) => item.action === 'PODE EMPRESTAR').length,
      rupture_risk_count: items.filter((item) => item.rupture_risk !== 'ESTÁVEL').length,
    },
    chart_data: buildChartData(items),
    top10_critical: top10Critical,
    hospital_ranking: hospitalRanking,
    insights: [],
    hospitals: hospitalOrder,
    active_hospital: hospital,
    last_sync: lastSync,
  };

  dashboard.insights = buildInsights(hospital, dashboard);
  return dashboard;
}

function buildIntelligenceDetails(productsByHospital: Record<Hospital, Product[]>, config: ConfiguracaoSistema): IntelligenceDetails {
  const hmsaItems = productsByHospital.HMSA ?? [];
  const transferItems: DetailItem[] = hmsaItems
    .filter((item) => item.qty_transfer && item.action === 'PEGAR EMPRESTADO')
    .slice(0, 6)
    .map((item) => ({
      categoria_material: item.categoria_material,
      product_name: item.product_name,
      product_code: item.product_code,
      sufficiency_days: item.sufficiency_days,
      suggested_hospital: item.suggested_hospital,
      donor_sufficiency: item.donor_sufficiency,
      donor_current_stock: item.donor_current_stock,
      qty_transfer: item.qty_transfer,
      score: item.score,
      classification: item.classification,
      recommendation: 'Redistribuir lote entre unidades antes de abrir reposição externa.',
      action: item.action,
      projected_suf: item.projected_suf,
    }));

  const idleItems: DetailItem[] = hmsaItems
    .filter((item) => item.sufficiency_days >= config.podeEmprestarDias)
    .slice(0, 6)
    .map((item) => ({
      categoria_material: item.categoria_material,
      product_name: item.product_name,
      product_code: item.product_code,
      sufficiency_days: item.sufficiency_days,
      excess_qty: Math.max(0, Math.ceil((item as EnrichedProduct).estoque_atual - item.avg_monthly_consumption * config.mesesCompraSugerida)),
      recommendation: 'Rever redistribuição ou consumo programado antes da próxima reposição.',
    }));

  const ruptureItems: DetailItem[] = hmsaItems
    .filter((item) => item.rupture_risk !== 'ESTÁVEL')
    .slice(0, 6)
    .map((item) => ({
      categoria_material: item.categoria_material,
      product_name: item.product_name,
      product_code: item.product_code,
      sufficiency_days: item.sufficiency_days,
      projected_suf: item.projected_suf,
      rupture_risk: item.rupture_risk,
      action: item.action,
      recommendation:
        isPurchaseWorkflowAction(item.action)
          ? 'Preparar reposição com prioridade e acompanhar consumo diário.'
          : 'Executar remanejamento entre hospitais antes do ponto de ruptura.',
    }));

  return {
    transfer_items: transferItems,
    idle_items: idleItems,
    rupture_items: ruptureItems,
  };
}

function buildOrderItems(productsByHospital: Record<Hospital, Product[]>, config: ConfiguracaoSistema): OrderItem[] {
  return (productsByHospital.HMSA ?? [])
    .filter((item) => item.action === 'COMPRAR')
    .sort((left, right) => left.sufficiency_days - right.sufficiency_days)
    .map((item) => ({
      ...item,
      qty_to_buy: item.qty_to_buy ?? Math.max(1, Math.ceil(item.avg_monthly_consumption * config.mesesCompraSugerida)),
      priority: getPriority(item, config),
    }));
}

function buildEmailPreviewItems(productsByHospital: Record<Hospital, Product[]>) {
  return (productsByHospital.HMSA ?? [])
    .filter((item) => item.level === 'URGENTE' || item.level === 'CRÍTICO' || item.level === 'ALTO')
    .sort((left, right) => left.sufficiency_days - right.sufficiency_days)
    .slice(0, 5);
}

export function createEmptyDataset(config: ConfiguracaoSistema = configuracaoSistemaPadrao): AlmoxDataset {
  const productsByHospital = hospitalOrder.reduce<Record<Hospital, Product[]>>((accumulator, hospital) => {
    accumulator[hospital] = [];
    return accumulator;
  }, {} as Record<Hospital, Product[]>);

  const dashboardByHospital = hospitalOrder.reduce<Record<Hospital, DashboardData>>((accumulator, hospital) => {
    accumulator[hospital] = buildDashboard(hospital, productsByHospital, null);
    return accumulator;
  }, {} as Record<Hospital, DashboardData>);

  return {
    hospitals: hospitalOrder,
    productsByHospital,
    dashboardByHospital,
    intelligenceDetails: {
      transfer_items: [],
      idle_items: [],
      rupture_items: [],
    },
    loansNeeded: [],
    canLend: [],
    orderItems: [],
    emailPreviewItems: [],
    lastSync: null,
  };
}

export function hydrateDataset(
  rows: EstoqueAtualRow[],
  config: ConfiguracaoSistema = configuracaoSistemaPadrao,
  options: {
    cmmExceptionCodes?: Set<string>;
    processSummaryByProductCode?: Record<string, ProductProcessSummary>;
    monthlyConsumptionByProductCode?: Record<string, ProductMonthlyConsumptionSignal>;
  } = {}
): AlmoxDataset {
  const baseProducts = buildBaseProducts(rows, config, options.cmmExceptionCodes ?? new Set());
  const enrichedProducts = enrichProducts(
    baseProducts,
    config,
    options.processSummaryByProductCode,
    options.monthlyConsumptionByProductCode
  );
  const productsByHospital = hospitalOrder.reduce<Record<Hospital, Product[]>>((accumulator, hospital) => {
    accumulator[hospital] = enrichedProducts[hospital];
    return accumulator;
  }, {} as Record<Hospital, Product[]>);

  const lastSync = rows
    .map((row) => row.importado_em)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

  const dashboardByHospital = hospitalOrder.reduce<Record<Hospital, DashboardData>>((accumulator, hospital) => {
    accumulator[hospital] = buildDashboard(hospital, productsByHospital, lastSync);
    return accumulator;
  }, {} as Record<Hospital, DashboardData>);

  return {
    hospitals: hospitalOrder,
    productsByHospital,
    dashboardByHospital,
    intelligenceDetails: buildIntelligenceDetails(productsByHospital, config),
    loansNeeded: [...(productsByHospital.HMSA ?? [])]
      .filter((item) => item.action === 'PEGAR EMPRESTADO' || item.action === 'AVALIAR')
      .sort((left, right) => left.sufficiency_days - right.sufficiency_days),
    canLend: [...(productsByHospital.HMSA ?? [])]
      .filter((item) => item.action === 'PODE EMPRESTAR')
      .sort((left, right) => right.sufficiency_days - left.sufficiency_days),
    orderItems: buildOrderItems(productsByHospital, config),
    emailPreviewItems: buildEmailPreviewItems(productsByHospital),
    lastSync,
  };
}

export function getBlacklistItems() {
  return [] as BlacklistItem[];
}

export function getEmailConfig() {
  return emailConfigSeed;
}
