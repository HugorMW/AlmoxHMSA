import { ConfiguracaoSistema, getProcessoParcelaDiasUteis } from './configuracao';
import {
  ProcessoAcompanhamento,
  ProcessoStatus,
  ProductProcessSummary,
  ProductProcessSummaryEntry,
  ProductProcessSummaryParcel,
} from './types';

const PROCESSO_ALERTA_DIAS = 7;

type ParcelaVisualLike = Partial<Record<number, { adiadaDiasUteis?: number | null }>>;

function parseIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getTodayAtStartOfDay() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function countDelivered(item: ProcessoAcompanhamento) {
  return item.parcelas_entregues.filter(Boolean).length;
}

function getParcelaAdjustedDueDate(
  item: Pick<
    ProcessoAcompanhamento,
    'categoria_material' | 'data_resgate' | 'tipo_processo' | 'parcelas_detalhes'
  >,
  index: number,
  config: ConfiguracaoSistema,
  visualParcelas?: ParcelaVisualLike
) {
  const baseDate = parseIsoDate(item.data_resgate);
  if (!baseDate) {
    return null;
  }

  const dueDate = addDays(
    baseDate,
    getProcessoParcelaDiasUteis(config, item.categoria_material, item.tipo_processo, index)
  );
  const savedExtraDays = Math.max(
    0,
    Math.trunc(Number(item.parcelas_detalhes?.[index]?.adiamento_dias_uteis) || 0)
  );
  const visualExtraDays = Math.max(0, Math.trunc(visualParcelas?.[index]?.adiadaDiasUteis ?? 0));
  const extraDays = visualExtraDays || savedExtraDays;

  return extraDays > 0 ? addDays(dueDate, extraDays) : dueDate;
}

function isParcelaNearDue(dueDate: Date | null, today: Date) {
  if (!dueDate) {
    return false;
  }

  const limit = addDays(today, PROCESSO_ALERTA_DIAS);
  return dueDate <= limit;
}

function getCalendarDayDifference(targetDate: Date | null, referenceDate: Date) {
  if (!targetDate) {
    return null;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetDate.getTime() - referenceDate.getTime()) / msPerDay);
}

function normalizeProductCode(value: string) {
  return String(value ?? '').trim();
}

function formatDateLabel(value: Date | null) {
  if (!value) {
    return '-';
  }

  return value.toLocaleDateString('pt-BR');
}

function buildParcelasSummary(
  item: ProcessoAcompanhamento,
  config: ConfiguracaoSistema
): ProductProcessSummaryParcel[] {
  const today = getTodayAtStartOfDay();

  return Array.from({ length: item.total_parcelas }, (_, index) => {
    const delivered = item.parcelas_entregues[index] === true;
    if (delivered) {
      return null;
    }

    const delayDays = Math.max(
      0,
      Math.trunc(Number(item.parcelas_detalhes?.[index]?.adiamento_dias_uteis) || 0)
    );
    const dueDate = getParcelaAdjustedDueDate(item, index, config);
    const dueInDays = getCalendarDayDifference(dueDate, today);
    const overdue = dueDate ? dueDate < today : false;
    const nearDue = !overdue && isParcelaNearDue(dueDate, today);
    const empresaNotificada = item.parcelas_detalhes?.[index]?.empresa_notificada === true;
    const empresaNotificadaEm = item.parcelas_detalhes?.[index]?.empresa_notificada_em ?? null;

    const parcela: ProductProcessSummaryParcel =
      delayDays > 0
        ? {
            numero: index + 1,
            data_label: formatDateLabel(dueDate),
            adiamento_dias_uteis: delayDays,
            due_in_days: dueInDays,
            overdue,
            near_due: nearDue,
            empresa_notificada: empresaNotificada,
            empresa_notificada_em: empresaNotificadaEm,
          }
        : {
            numero: index + 1,
            data_label: formatDateLabel(dueDate),
            due_in_days: dueInDays,
            overdue,
            near_due: nearDue,
            empresa_notificada: empresaNotificada,
            empresa_notificada_em: empresaNotificadaEm,
          };

    return parcela;
  }).filter((parcela): parcela is ProductProcessSummaryParcel => parcela !== null);
}

export function hasAndamentoComAlerta(
  item: ProcessoAcompanhamento,
  config: ConfiguracaoSistema,
  visualParcelas?: ParcelaVisualLike
) {
  const today = getTodayAtStartOfDay();

  for (let index = 0; index < item.total_parcelas; index += 1) {
    if (item.parcelas_entregues[index]) {
      continue;
    }

    const dueDate = getParcelaAdjustedDueDate(item, index, config, visualParcelas);
    if (isParcelaNearDue(dueDate, today)) {
      return true;
    }
  }

  return false;
}

export function computeProcessStatus(
  item: ProcessoAcompanhamento,
  config: ConfiguracaoSistema,
  visualParcelas?: ParcelaVisualLike
): ProcessoStatus {
  if (item.cancelado) {
    return 'cancelado';
  }

  if (countDelivered(item) >= item.total_parcelas) {
    return 'concluido';
  }

  const today = getTodayAtStartOfDay();
  for (let index = 0; index < item.total_parcelas; index += 1) {
    if (item.parcelas_entregues[index]) {
      continue;
    }

    const dueDate = getParcelaAdjustedDueDate(item, index, config, visualParcelas);
    if (dueDate && dueDate < today) {
      return 'atrasado';
    }
  }

  return 'andamento';
}

function createSummaryEntry(
  item: ProcessoAcompanhamento,
  status: ProcessoStatus,
  andamentoComAlerta: boolean,
  config: ConfiguracaoSistema
): ProductProcessSummaryEntry {
  return {
    numero_processo: String(item.numero_processo ?? '').trim(),
    edocs: String(item.edocs ?? '').trim(),
    fornecedor: String(item.fornecedor ?? '').trim(),
    marca: String(item.marca ?? '').trim(),
    tipo_processo: item.tipo_processo,
    data_resgate: item.data_resgate ?? null,
    status,
    critico: item.critico === true,
    andamento_com_alerta: andamentoComAlerta,
    parcelas: buildParcelasSummary(item, config),
  };
}

function getEntryPriority(entry: ProductProcessSummaryEntry) {
  if (entry.status === 'atrasado') {
    return 0;
  }

  if (entry.andamento_com_alerta) {
    return 1;
  }

  if (entry.critico) {
    return 2;
  }

  return 3;
}

function getClosestParcelDistance(entry: ProductProcessSummaryEntry) {
  return entry.parcelas.reduce((closest, parcela) => {
    if (parcela.due_in_days == null) {
      return closest;
    }

    return Math.min(closest, parcela.due_in_days);
  }, Number.POSITIVE_INFINITY);
}

export function buildOpenProcessSummaryByProductCode(
  processItems: ProcessoAcompanhamento[],
  config: ConfiguracaoSistema
) {
  const summaryByProductCode: Record<string, ProductProcessSummary> = {};

  for (const item of processItems) {
    if (item.ignorado) {
      continue;
    }

    const productCode = normalizeProductCode(item.cd_produto);
    if (!productCode) {
      continue;
    }

    const status = computeProcessStatus(item, config);
    if (status === 'cancelado' || status === 'concluido') {
      continue;
    }

    const andamentoComAlerta = hasAndamentoComAlerta(item, config);
    const currentSummary = summaryByProductCode[productCode] ?? {
      total_open: 0,
      overdue_count: 0,
      critical_count: 0,
      alert_count: 0,
      entries: [],
    };

    currentSummary.total_open += 1;
    if (status === 'atrasado') {
      currentSummary.overdue_count += 1;
    }
    if (item.critico) {
      currentSummary.critical_count += 1;
    }
    if (andamentoComAlerta) {
      currentSummary.alert_count += 1;
    }

    currentSummary.entries.push(
      createSummaryEntry(item, status, andamentoComAlerta, config)
    );
    summaryByProductCode[productCode] = currentSummary;
  }

  for (const summary of Object.values(summaryByProductCode)) {
    summary.entries.sort((left, right) => {
      const leftPriority = getEntryPriority(left);
      const rightPriority = getEntryPriority(right);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftDistance = getClosestParcelDistance(left);
      const rightDistance = getClosestParcelDistance(right);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return `${left.numero_processo}|${left.edocs}`.localeCompare(
        `${right.numero_processo}|${right.edocs}`,
        'pt-BR'
      );
    });
  }

  return summaryByProductCode;
}
