import {
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
} from './types';

export interface EstoqueAtualRow {
  categoria_material?: CategoriaMaterial | string | null;
  estoque_importado_id: string;
  lote_importacao_id: string;
  data_referencia: string | null;
  importado_em: string;
  unidade_id: string;
  codigo_unidade: string;
  nome_unidade: string;
  produto_referencia_id: string | null;
  codigo_produto_referencia: string | null;
  nome_produto_referencia: string | null;
  unidade_medida_referencia: string | null;
  especie_padrao: string | null;
  produto_unidade_id: string;
  codigo_produto: string;
  nome_produto: string;
  unidade_medida_produto: string | null;
  suficiencia_em_dias: number | string | null;
  data_ultima_entrada: string | null;
  valor_custo_medio: number | string | null;
  consumo_medio: number | string | null;
  estoque_atual: number | string | null;
  criado_em: string;
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

  if (normalized === 'HMSASOUL' || normalized === 'HMSA') {
    return 'HMSA';
  }
  if (normalized === 'HEC' || normalized === 'HDDS' || normalized === 'HABF') {
    return normalized;
  }

  return null;
}

function getLevel(days: number) {
  if (days <= 7) return 'CRÍTICO' as const;
  if (days <= 15) return 'ALERTA' as const;
  if (days <= 30) return 'BAIXO' as const;
  if (days <= 90) return 'MÉDIO' as const;
  return 'ALTO' as const;
}

function getRuptureRisk(days: number) {
  if (days <= 10) return 'RISCO ALTO' as const;
  if (days <= 25) return 'RISCO MÉDIO' as const;
  return 'ESTÁVEL' as const;
}

function getPriority(item: Product): Priority {
  if (item.sufficiency_days <= 7) return 'URGENTE';
  if (item.sufficiency_days <= 15) return 'ALTA';
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

function baseActionForHospital(item: EnrichedProduct) {
  if (item.sufficiency_days <= 15) return 'COMPRAR' as const;
  if (item.sufficiency_days <= 30) return 'AVALIAR' as const;
  if (item.sufficiency_days >= 120) return 'PODE EMPRESTAR' as const;
  return 'OK' as const;
}

function buildBaseProducts(rows: EstoqueAtualRow[]) {
  const products = rows
    .map<EnrichedProduct | null>((row) => {
      const hospital = mapHospital(row.codigo_unidade);
      if (!hospital) {
        return null;
      }

      const avgMonthlyConsumption = parseNumber(row.consumo_medio);
      const sufficiencyDays = clampSufficiency(parseNumber(row.suficiencia_em_dias));
      const categoriaMaterial = normalizeCategoriaMaterial(row.categoria_material);

      return {
        hospital,
        categoria_material: categoriaMaterial,
        product_code: String(row.codigo_produto),
        product_name: row.nome_produto,
        produto_referencia_id: row.produto_referencia_id,
        codigo_produto_referencia: row.codigo_produto_referencia,
        sufficiency_days: sufficiencyDays,
        avg_monthly_consumption: avgMonthlyConsumption,
        daily_usage: round(safeDailyUsage(avgMonthlyConsumption), 4),
        level: getLevel(sufficiencyDays),
        rupture_risk: getRuptureRisk(sufficiencyDays),
        estoque_atual: parseNumber(row.estoque_atual),
        data_ultima_entrada: row.data_ultima_entrada,
        action: baseActionForHospital({
          hospital,
          categoria_material: categoriaMaterial,
          product_code: String(row.codigo_produto),
          product_name: row.nome_produto,
          produto_referencia_id: row.produto_referencia_id,
          codigo_produto_referencia: row.codigo_produto_referencia,
          sufficiency_days: sufficiencyDays,
          avg_monthly_consumption: avgMonthlyConsumption,
          daily_usage: round(safeDailyUsage(avgMonthlyConsumption), 4),
          level: getLevel(sufficiencyDays),
          rupture_risk: getRuptureRisk(sufficiencyDays),
          estoque_atual: parseNumber(row.estoque_atual),
          data_ultima_entrada: row.data_ultima_entrada,
        }),
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

function enrichProducts(productsByHospital: Record<Hospital, EnrichedProduct[]>) {
  const hmsaProducts = productsByHospital.HMSA.map((product) => {
    const donor = getBestDonor(product, productsByHospital);
    const proposedTransfer = Math.max(0, Math.ceil(product.avg_monthly_consumption * 0.75));
    const donorDailyUsage = donor ? safeDailyUsage(donor.avg_monthly_consumption) : 0;
    const donorTransferCapacity = donor
      ? Math.max(0, Math.floor((donor.sufficiency_days - 100) * donorDailyUsage))
      : 0;
    const hasSafeDonor = !!donor && donor.sufficiency_days > 100 && donorTransferCapacity > 0;
    const qtyTransfer = hasSafeDonor ? Math.min(proposedTransfer, donorTransferCapacity) : undefined;
    const projectedSuf = qtyTransfer ? round(product.sufficiency_days + qtyTransfer / safeDailyUsage(product.avg_monthly_consumption), 1) : undefined;
    const donorAfter = donor && qtyTransfer ? round(donor.sufficiency_days - qtyTransfer / donorDailyUsage, 1) : undefined;
    const score =
      donor && qtyTransfer && projectedSuf && donorAfter
        ? clampScore(
            Math.min(projectedSuf, 45) / 45 * 45 +
              Math.min(Math.max(donorAfter - 100, 0), 40) / 40 * 30 +
              Math.min(qtyTransfer / Math.max(proposedTransfer, 1), 1) * 15 +
              (product.rupture_risk === 'RISCO ALTO' ? 10 : product.rupture_risk === 'RISCO MÉDIO' ? 6 : 4)
          )
        : undefined;
    const classification = score != null ? (score >= 80 ? 'Alta aderência' : score >= 60 ? 'Viável' : 'Atenção') : undefined;

    let action = product.action;
    if (product.sufficiency_days <= 15) {
      action = hasSafeDonor ? 'PEGAR EMPRESTADO' : 'COMPRAR';
    } else if (product.sufficiency_days <= 30) {
      action = 'COMPRAR';
    } else if (product.sufficiency_days >= 120) {
      action = 'PODE EMPRESTAR';
    } else {
      action = 'OK';
    }

    const qtyToBuy = action === 'COMPRAR' ? Math.max(1, Math.ceil(product.avg_monthly_consumption * 2)) : undefined;

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
      critical: items.filter((item) => item.level === 'CRÍTICO').length,
      alert: items.filter((item) => item.level === 'ALERTA').length,
      low: items.filter((item) => item.level === 'BAIXO').length,
      medium: items.filter((item) => item.level === 'MÉDIO').length,
      high: items.filter((item) => item.level === 'ALTO').length,
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

function buildIntelligenceDetails(productsByHospital: Record<Hospital, Product[]>): IntelligenceDetails {
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
    .filter((item) => item.sufficiency_days >= 120)
    .slice(0, 6)
    .map((item) => ({
      categoria_material: item.categoria_material,
      product_name: item.product_name,
      product_code: item.product_code,
      sufficiency_days: item.sufficiency_days,
      excess_qty: Math.max(0, Math.ceil((item as EnrichedProduct).estoque_atual - item.avg_monthly_consumption * 2)),
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
        item.action === 'COMPRAR'
          ? 'Preparar reposição com prioridade e acompanhar consumo diário.'
          : 'Executar remanejamento entre hospitais antes do ponto de ruptura.',
    }));

  return {
    transfer_items: transferItems,
    idle_items: idleItems,
    rupture_items: ruptureItems,
  };
}

function buildOrderItems(productsByHospital: Record<Hospital, Product[]>): OrderItem[] {
  return (productsByHospital.HMSA ?? [])
    .filter((item) => item.action === 'COMPRAR')
    .sort((left, right) => left.sufficiency_days - right.sufficiency_days)
    .map((item) => ({
      ...item,
      qty_to_buy: item.qty_to_buy ?? Math.max(1, Math.ceil(item.avg_monthly_consumption * 2)),
      priority: getPriority(item),
    }));
}

function buildEmailPreviewItems(productsByHospital: Record<Hospital, Product[]>) {
  return (productsByHospital.HMSA ?? [])
    .filter((item) => item.level === 'CRÍTICO' || item.level === 'ALERTA')
    .sort((left, right) => left.sufficiency_days - right.sufficiency_days)
    .slice(0, 5);
}

export function createEmptyDataset(): AlmoxDataset {
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

export function hydrateDataset(rows: EstoqueAtualRow[]): AlmoxDataset {
  const baseProducts = buildBaseProducts(rows);
  const enrichedProducts = enrichProducts(baseProducts);
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
    intelligenceDetails: buildIntelligenceDetails(productsByHospital),
    loansNeeded: [...(productsByHospital.HMSA ?? [])]
      .filter((item) => item.action === 'PEGAR EMPRESTADO' || item.action === 'AVALIAR')
      .sort((left, right) => left.sufficiency_days - right.sufficiency_days),
    canLend: [...(productsByHospital.HMSA ?? [])]
      .filter((item) => item.action === 'PODE EMPRESTAR')
      .sort((left, right) => right.sufficiency_days - left.sufficiency_days),
    orderItems: buildOrderItems(productsByHospital),
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
