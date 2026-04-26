import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useAlmoxData } from '@/features/almox/almox-provider';
import {
  ConfiguracaoSistema,
  PROCESSO_TOTAL_PARCELAS_MAX,
  getProcessoParcelaDiasUteis,
} from '@/features/almox/configuracao';
import {
  AppIcon,
} from '@/features/almox/components/common';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { almoxTheme } from '@/features/almox/tokens';
import {
  CategoriaMaterial,
  ProcessoAcompanhamento,
  ProcessoParcelaDetalhe,
  ProcessoProdutoLookup,
  ProcessoSaveInput,
  ProcessoStatus,
  ProcessoTipo,
} from '@/features/almox/types';
import { computeProcessStatus } from '@/features/almox/process-utils';
import { matchesQuery } from '@/features/almox/utils';

const PROCESS_TYPES: ProcessoTipo[] = ['ARP', 'Processo Simplificado', 'Processo Excepcional'];
const PROCESS_TABLE_MIN_WIDTH = 1160;

const processTheme = {
  bg: '#06090f',
  panel: '#0d1120',
  surface: 'rgba(255,255,255,0.042)',
  surfaceHi: 'rgba(255,255,255,0.07)',
  surfacePressed: 'rgba(255,255,255,0.1)',
  border: 'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.13)',
  text: '#eef2ff',
  muted: 'rgba(220,228,255,0.56)',
  dim: 'rgba(220,228,255,0.32)',
  accent: '#00d4a0',
  green: '#22d3a0',
  amber: '#ffb340',
  red: '#ff5f5f',
  blue: '#5aafff',
  purple: '#b197fc',
  slate: '#96a4c5',
  critical: '#ff4444',
  ink: '#04080f',
};

const statusMeta: Record<ProcessoStatus, { label: string; color: string; background: string }> = {
  andamento: {
    label: 'Em andamento',
    color: processTheme.slate,
    background: 'rgba(150,164,197,0.12)',
  },
  atrasado: {
    label: 'Atrasado',
    color: processTheme.red,
    background: 'rgba(255,95,95,0.13)',
  },
  concluido: {
    label: 'Concluído',
    color: processTheme.green,
    background: 'rgba(34,211,160,0.11)',
  },
  cancelado: {
    label: 'Cancelado',
    color: processTheme.slate,
    background: 'rgba(150,164,197,0.12)',
  },
};

type ProcessoEnriquecido = ProcessoAcompanhamento & {
  status: ProcessoStatus;
  entregues: number;
  visualParcelas: ProcessoParcelasVisualMap;
  suficiencia_em_dias?: number;
  andamentoComAlerta: boolean;
};

type ParcelaVisualDraft = {
  adiadaDiasUteis: number;
  empresaNotificada: boolean;
  empresaNotificadaEm: string | null;
  dataEntrega: string | null;
};

type ProcessoParcelasVisualMap = Record<number, ParcelaVisualDraft>;

type ModalState =
  | { type: 'new'; categoria: CategoriaMaterial }
  | { type: 'edit'; item: ProcessoEnriquecido }
  | { type: 'parcelas'; item: ProcessoEnriquecido; selectedIndex: number | null; mode: 'single' | 'summary' }
  | null;

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

function formatDate(value: Date | null) {
  if (!value) {
    return '-';
  }

  return value.toLocaleDateString('pt-BR');
}

function formatLookupNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  });
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function addBusinessDays(date: Date, days: number) {
  const nextDate = new Date(date);
  let added = 0;

  while (added < days) {
    nextDate.setDate(nextDate.getDate() + 1);
    const weekday = nextDate.getDay();
    if (weekday !== 0 && weekday !== 6) {
      added += 1;
    }
  }

  return nextDate;
}

function formatBusinessDaysLabel(days: number) {
  return days === 1 ? '1 dia útil' : `${days} dias úteis`;
}

function getParcelaDueDate(
  item: Pick<ProcessoAcompanhamento, 'categoria_material' | 'data_resgate' | 'tipo_processo'>,
  index: number,
  config: ConfiguracaoSistema
) {
  const baseDate = parseIsoDate(item.data_resgate);
  if (!baseDate) {
    return null;
  }

  return addBusinessDays(
    baseDate,
    getProcessoParcelaDiasUteis(config, item.categoria_material, item.tipo_processo, index)
  );
}

function getDefaultParcelaVisualDraft(): ParcelaVisualDraft {
  return {
    adiadaDiasUteis: 0,
    empresaNotificada: false,
    empresaNotificadaEm: null,
    dataEntrega: null,
  };
}

function convertParcelaDetalheToVisualDraft(detalhe?: ProcessoParcelaDetalhe | null): ParcelaVisualDraft {
  if (!detalhe) {
    return getDefaultParcelaVisualDraft();
  }

  return {
    adiadaDiasUteis: Math.max(0, Math.trunc(Number(detalhe.adiamento_dias_uteis) || 0)),
    empresaNotificada: detalhe.empresa_notificada === true,
    empresaNotificadaEm: detalhe.empresa_notificada_em ? formatIsoDateToPtBr(detalhe.empresa_notificada_em) : null,
    dataEntrega: detalhe.data_entrega ? formatIsoDateToPtBr(detalhe.data_entrega) : null,
  };
}

function getProcessItemKey(item: Pick<ProcessoAcompanhamento, 'id' | 'numero_processo' | 'cod_bionexo'>) {
  return item.id ?? `${item.numero_processo}-${item.cod_bionexo}`;
}

function createVisualParcelasMap(
  item: Pick<ProcessoAcompanhamento, 'id' | 'numero_processo' | 'cod_bionexo' | 'total_parcelas' | 'parcelas_detalhes'>,
  current?: ProcessoParcelasVisualMap
) {
  return Object.fromEntries(
    Array.from({ length: item.total_parcelas }, (_, index) => [
      index,
      {
        ...getDefaultParcelaVisualDraft(),
        ...convertParcelaDetalheToVisualDraft(item.parcelas_detalhes[index]),
        ...(current?.[index] ?? {}),
      },
    ])
  ) as ProcessoParcelasVisualMap;
}

function buildParcelasDetalhesFromVisualState(
  item: Pick<ProcessoAcompanhamento, 'total_parcelas'>,
  parcelasEntregues: boolean[],
  visualState: ProcessoParcelasVisualMap
): ProcessoParcelaDetalhe[] {
  return Array.from({ length: item.total_parcelas }, (_, index) => {
    const current = visualState[index] ?? getDefaultParcelaVisualDraft();
    const entregue = parcelasEntregues[index] === true;
    const dataEntrega = current.dataEntrega ? convertPtBrDateToIso(current.dataEntrega) : null;
    const empresaNotificada = current.empresaNotificada === true;
    const empresaNotificadaEm = current.empresaNotificadaEm
      ? convertPtBrDateToIso(current.empresaNotificadaEm)
      : null;

    return {
      numero: index + 1,
      entregue,
      data_entrega: entregue ? dataEntrega : null,
      adiamento_dias_uteis: Math.max(0, Math.trunc(current.adiadaDiasUteis || 0)),
      empresa_notificada: empresaNotificada,
      empresa_notificada_em: empresaNotificada ? empresaNotificadaEm : null,
      atualizado_em: new Date().toISOString(),
    };
  });
}

function getParcelaVisualState(item: ProcessoEnriquecido, index: number) {
  return item.visualParcelas[index] ?? getDefaultParcelaVisualDraft();
}

function getParcelaAdjustedDueDate(
  item: Pick<ProcessoAcompanhamento, 'categoria_material' | 'data_resgate' | 'tipo_processo'>,
  index: number,
  config: ConfiguracaoSistema,
  visualState?: ParcelaVisualDraft
) {
  const dueDate = getParcelaDueDate(item, index, config);
  if (!dueDate) {
    return null;
  }

  const extraDays = Math.max(0, Math.trunc(visualState?.adiadaDiasUteis ?? 0));
  if (extraDays === 0) {
    return dueDate;
  }

  return addBusinessDays(dueDate, extraDays);
}

function getParcelaLabel(
  index: number,
  config: ConfiguracaoSistema,
  categoria: CategoriaMaterial,
  tipo: ProcessoTipo
) {
  return formatBusinessDaysLabel(getProcessoParcelaDiasUteis(config, categoria, tipo, index));
}

function getTodayPtBrDate() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = String(today.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatPtBrDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parsePtBrDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = formatPtBrDateInput(value);
  const [dayText, monthText, yearText] = normalized.split('/');
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  if (!day || !month || !year || yearText?.length !== 4) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function convertPtBrDateToIso(value: string | null | undefined) {
  const parsed = parsePtBrDate(value);
  if (!parsed) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidOptionalPtBrDate(value: string | null | undefined) {
  if (!value || value.trim().length === 0) {
    return true;
  }

  return convertPtBrDateToIso(value) != null;
}

function formatIsoDateToPtBr(value: string | null | undefined) {
  return formatDate(parseIsoDate(value));
}

function formatStoredDateLabel(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  if (value.includes('/')) {
    return value;
  }

  return formatIsoDateToPtBr(value);
}

function getTodayAtStartOfDay() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function countDelivered(item: ProcessoAcompanhamento) {
  return item.parcelas_entregues.filter(Boolean).length;
}

const PROCESSO_ALERTA_DIAS_UTEIS = 1;

function isParcelaNearDue(dueDate: Date | null, today: Date) {
  if (!dueDate) {
    return false;
  }
  const limit = addBusinessDays(today, PROCESSO_ALERTA_DIAS_UTEIS);
  return dueDate > today && dueDate <= limit;
}

function hasAndamentoComAlerta(
  item: ProcessoAcompanhamento,
  config: ConfiguracaoSistema,
  visualParcelas?: ProcessoParcelasVisualMap
) {
  const today = getTodayAtStartOfDay();

  for (let index = 0; index < item.total_parcelas; index += 1) {
    if (item.parcelas_entregues[index]) {
      continue;
    }

    const dueDate = getParcelaAdjustedDueDate(item, index, config, visualParcelas?.[index]);
    if (isParcelaNearDue(dueDate, today)) {
      return true;
    }
  }

  return false;
}

function getFirstPendingParcelaIndex(item: ProcessoAcompanhamento) {
  const firstPending = item.parcelas_entregues.findIndex((parcel) => !parcel);
  return firstPending >= 0 ? firstPending : 0;
}

function normalizeBionexoCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return '';
  }

  const withoutPrefix = trimmed.replace(/^I\s*-\s*/i, '').trim();
  return withoutPrefix ? `I-${withoutPrefix}` : '';
}

function stripBionexoPrefix(value: string) {
  return value.replace(/^I\s*-\s*/i, '').trim();
}

function normalizeProductCode(value: string) {
  return String(value ?? '').trim();
}

function getProcessTypeColor(tipo: ProcessoTipo) {
  if (tipo === 'ARP') {
    return processTheme.accent;
  }

  if (tipo === 'Processo Excepcional') {
    return processTheme.purple;
  }

  return processTheme.blue;
}

function getProcessListRank(item: Pick<ProcessoEnriquecido, 'status' | 'critico'>) {
  if (item.status === 'cancelado') {
    return 4;
  }

  if (item.status === 'concluido') {
    return 3;
  }

  if (item.critico) {
    return 0;
  }

  if (item.status === 'atrasado') {
    return 1;
  }

  return 2;
}

export default function ProcessesScreen() {
  const {
    processItems,
    processItemsLoading,
    processItemsError,
    refreshProcessItems,
    error,
    systemConfig,
    findHmsaProductByProductCode,
    findHmsaProductByBionexoCode,
    lookupHmsaProductByProductCode,
    lookupHmsaProductByBionexoCode,
    saveProcessItem,
    updateProcessParcelas,
    setProcessCanceled,
    deleteProcessItem,
  } = useAlmoxData();
  const [categoria, setCategoria] = useState<CategoriaMaterial>('material_hospitalar');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<ProcessoTipo | 'todos'>('todos');
  const [statusFilter, setStatusFilter] = useState<ProcessoStatus | 'todos' | 'critico'>('todos');
  const [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'info'; message: string } | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [parcelasVisualState, setParcelasVisualState] = useState<Record<string, ProcessoParcelasVisualMap>>({});

  useEffect(() => {
    let active = true;

    void refreshProcessItems()
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setInitialLoadDone(true);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshProcessItems]);

  const enrichedItems = useMemo<ProcessoEnriquecido[]>(
    () =>
      processItems.map((item) => {
        const lookup =
          (item.cod_bionexo ? findHmsaProductByBionexoCode(item.cod_bionexo) : null) ??
          (item.cd_produto ? findHmsaProductByProductCode(item.cd_produto) : null);
        const visual = parcelasVisualState[getProcessItemKey(item)];
        return {
          ...item,
          visualParcelas: createVisualParcelasMap(item, visual),
          status: computeProcessStatus(item, systemConfig, visual),
          entregues: countDelivered(item),
          suficiencia_em_dias: lookup?.suficiencia_em_dias,
          andamentoComAlerta: hasAndamentoComAlerta(item, systemConfig, visual),
        };
      }),
    [findHmsaProductByBionexoCode, findHmsaProductByProductCode, parcelasVisualState, processItems, systemConfig]
  );

  const categoryItems = useMemo(
    () => enrichedItems.filter((item) => item.categoria_material === categoria),
    [categoria, enrichedItems]
  );

  const visibleItems = useMemo(() => {
    return categoryItems
      .filter((item) => !item.ignorado)
      .filter((item) => {
        if (tipoFilter !== 'todos' && item.tipo_processo !== tipoFilter) {
          return false;
        }

        if (statusFilter === 'critico') {
          if (item.cancelado || !item.critico) {
            return false;
          }
        } else if (statusFilter !== 'todos' && item.status !== statusFilter) {
          return false;
        }

        return matchesQuery(
          [
            item.numero_processo,
            item.edocs,
            item.cod_bionexo,
            item.cd_produto,
            item.ds_produto,
            item.fornecedor,
            item.marca,
          ],
          search
        );
      })
      .sort(
        (left, right) =>
          getProcessListRank(left) - getProcessListRank(right) ||
          String(left.data_resgate ?? '9999-12-31').localeCompare(String(right.data_resgate ?? '9999-12-31')) ||
          left.numero_processo.localeCompare(right.numero_processo, 'pt-BR')
      );
  }, [categoryItems, search, statusFilter, tipoFilter]);

  const counts = useMemo(
    () => ({
      total: categoryItems.filter((item) => !item.ignorado).length,
      andamento: categoryItems.filter((item) => !item.ignorado && item.status === 'andamento').length,
      atrasado: categoryItems.filter((item) => !item.ignorado && item.status === 'atrasado').length,
      concluido: categoryItems.filter((item) => !item.ignorado && item.status === 'concluido').length,
      cancelado: categoryItems.filter((item) => !item.ignorado && item.status === 'cancelado').length,
      critico: categoryItems.filter((item) => !item.ignorado && !item.cancelado && item.critico).length,
    }),
    [categoryItems]
  );

  async function handleAction(action: () => Promise<void>, successMessage: string) {
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: 'success', message: successMessage });
    } catch (caughtError) {
      setFeedback({
        tone: 'danger',
        message: caughtError instanceof Error ? caughtError.message : 'Não foi possível atualizar o processo.',
      });
    }
  }

  function resetFiltersForCategory(nextCategoria: CategoriaMaterial) {
    setCategoria(nextCategoria);
    setSearch('');
    setTipoFilter('todos');
    setStatusFilter('todos');
  }

  function applyParcelasVisualState(item: ProcessoAcompanhamento, nextState: ProcessoParcelasVisualMap) {
    const processKey = getProcessItemKey(item);
    setParcelasVisualState((current) => ({
      ...current,
      [processKey]: createVisualParcelasMap(item, nextState),
    }));
  }

  return (
    <ScrollView
      style={styles.processScroll}
      contentContainerStyle={styles.processScrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.darkStage}>
        <View style={styles.topBar}>
          <DarkTabGroup
            options={[
              {
                label: `Materiais`,
                count: enrichedItems.filter((item) => item.categoria_material === 'material_hospitalar' && !item.ignorado).length,
                value: 'material_hospitalar',
                color: processTheme.blue,
              },
              {
                label: `Medicamentos`,
                count: enrichedItems.filter((item) => item.categoria_material === 'material_farmacologico' && !item.ignorado).length,
                value: 'material_farmacologico',
                color: processTheme.purple,
              },
            ]}
            value={categoria}
            onChange={resetFiltersForCategory}
          />

          <View style={styles.headerActions}>
            <DarkButton
              label="Novo processo"
              icon="plus"
              tone="accent"
              onPress={() => setModal({ type: 'new', categoria })}
            />
          </View>
        </View>

        {error ? (
          <DarkNotice
            title="Falha ao consultar a base"
            description={`${error} A busca por Cod. Bionexo depende da última base de estoque carregada.`}
            tone="danger"
          />
        ) : null}

        {processItemsError ? (
          <DarkNotice
            title="Falha ao carregar processos"
            description={processItemsError}
            tone="danger"
          />
        ) : null}

        {feedback ? (
          <DarkNotice
            title={feedback.tone === 'success' ? 'Processo atualizado' : 'Atenção'}
            description={feedback.message}
            tone={feedback.tone}
          />
        ) : null}

        <View style={styles.metricGrid}>
          <MetricCard
            label="Total"
            value={counts.total}
            color={processTheme.text}
            active={statusFilter === 'todos'}
            onPress={() => setStatusFilter('todos')}
          />
          <MetricCard
            label="CRÍTICO (Risco de desabastecimento)"
            value={counts.critico}
            color={processTheme.critical}
            active={statusFilter === 'critico'}
            onPress={() => setStatusFilter((current) => (current === 'critico' ? 'todos' : 'critico'))}
          />
          <MetricCard
            label="Atrasados"
            value={counts.atrasado}
            color={processTheme.red}
            active={statusFilter === 'atrasado'}
            onPress={() => setStatusFilter((current) => (current === 'atrasado' ? 'todos' : 'atrasado'))}
          />
          <MetricCard
            label="Em andamento"
            value={counts.andamento}
            color={processTheme.slate}
            active={statusFilter === 'andamento'}
            onPress={() => setStatusFilter((current) => (current === 'andamento' ? 'todos' : 'andamento'))}
          />
          <MetricCard
            label="Concluídos"
            value={counts.concluido}
            color={processTheme.green}
            active={statusFilter === 'concluido'}
            onPress={() => setStatusFilter((current) => (current === 'concluido' ? 'todos' : 'concluido'))}
          />
          <MetricCard
            label="Cancelados"
            value={counts.cancelado}
            color={processTheme.slate}
            active={statusFilter === 'cancelado'}
            onPress={() => setStatusFilter((current) => (current === 'cancelado' ? 'todos' : 'cancelado'))}
          />
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
            <DarkSearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar pedido, E-DOCS, Bionexo, produto, marca ou fornecedor"
            />
          </View>
          <DarkButton
            label="Filtros"
            icon="filter"
            tone={showFilters ? 'accentSoft' : 'neutral'}
            onPress={() => setShowFilters((current) => !current)}
          />
        </View>

        {showFilters ? (
          <View style={styles.filterPanel}>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Tipo</Text>
              <DarkTabGroup
                compact
                options={[
                  { label: 'Todos', value: 'todos', color: processTheme.accent },
                  ...PROCESS_TYPES.map((tipo) => ({ label: tipo, value: tipo, color: getProcessTypeColor(tipo) })),
                ]}
                value={tipoFilter}
                onChange={setTipoFilter}
              />
            </View>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Situação</Text>
              <DarkTabGroup
                compact
                options={[
                  { label: 'Todos', value: 'todos', color: processTheme.accent },
                  { label: 'Em andamento', value: 'andamento', color: processTheme.slate },
                  { label: 'Atrasado', value: 'atrasado', color: processTheme.red },
                  { label: 'Concluído', value: 'concluido', color: processTheme.green },
                  { label: 'Cancelado', value: 'cancelado', color: processTheme.slate },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </View>
          </View>
        ) : null}

        {!initialLoadDone || (processItemsLoading && processItems.length === 0) ? (
          <DarkEmptyState
            title="Carregando processos"
            description="Consultando processos cadastrados no Supabase."
          />
        ) : visibleItems.length === 0 ? (
          <DarkEmptyState
            title="Nenhum processo encontrado"
            description="Ajuste os filtros ou cadastre um novo processo com Cod. Bionexo ou nº do produto."
          />
        ) : (
          <ProcessTable
            items={visibleItems}
            systemConfig={systemConfig}
            onEdit={(item) => setModal({ type: 'edit', item })}
            onOpenParcelas={(item, selectedIndex) =>
              setModal({
                type: 'parcelas',
                item,
                selectedIndex: selectedIndex ?? null,
                mode: selectedIndex == null ? 'summary' : 'single',
              })
            }
            onToggleCanceled={(item) =>
              item.id
                ? void handleAction(
                    () => setProcessCanceled(item.id!, !item.cancelado),
                    item.cancelado ? 'Processo reativado.' : 'Processo marcado como cancelado.'
                  )
                : undefined
            }
            onDelete={(item) =>
              item.id
                ? void handleAction(() => deleteProcessItem(item.id!), 'Processo removido da lista.')
                : undefined
            }
          />
        )}

        <View style={styles.legendRow}>
          <LegendDot color={processTheme.critical} label="Crítico" />
          <LegendDot color={processTheme.red} label="Parcela atrasada" />
          <LegendDot
            color={processTheme.amber}
            label={
              PROCESSO_ALERTA_DIAS_UTEIS === 1
                ? 'Entrega em 1 dia útil'
                : `Pendente em até ${PROCESSO_ALERTA_DIAS_UTEIS} dias úteis`
            }
          />
          <LegendDot color={processTheme.slate} label="Pendente dentro do prazo" />
          <LegendDot color={processTheme.green} label="Entregue" />
          <LegendIcon icon="clock" color={processTheme.blue} label="Adiada" />
          <LegendIcon icon="bell" color={processTheme.purple} label="Empresa notificada" />
          <Text style={styles.legendText}>Prazos em dias úteis conforme classificação e tipo do processo</Text>
        </View>
      </View>

      {modal?.type === 'new' || modal?.type === 'edit' ? (
        <ProcessFormModal
          initial={modal.type === 'edit' ? modal.item : null}
          initialCategoria={modal.type === 'new' ? modal.categoria : modal.item.categoria_material}
          systemConfig={systemConfig}
          lookupProductByCode={findHmsaProductByProductCode}
          lookupProduct={findHmsaProductByBionexoCode}
          lookupProductByCodeRemote={lookupHmsaProductByProductCode}
          lookupProductRemote={lookupHmsaProductByBionexoCode}
          onClose={() => setModal(null)}
          onSave={(input) =>
            handleAction(async () => {
              await saveProcessItem(input);
              setModal(null);
            }, input.id ? 'Processo atualizado com sucesso.' : 'Processo cadastrado com sucesso.')
          }
        />
      ) : null}

      {modal?.type === 'parcelas' ? (
        <ParcelasModal
          key={`${getProcessItemKey(modal.item)}:${modal.selectedIndex ?? 'summary'}`}
          item={modal.item}
          mode={modal.mode}
          initialSelectedIndex={modal.selectedIndex}
          systemConfig={systemConfig}
          onClose={() => setModal(null)}
          onApplyVisualState={(nextVisualState) => {
            applyParcelasVisualState(modal.item, nextVisualState);
            setFeedback({
              tone: 'info',
              message: 'Visual das parcelas aplicado apenas na interface desta sessão.',
            });
            setModal(null);
          }}
          onSave={(parcelasEntregues, nextVisualState) =>
            modal.item.id
              ? handleAction(async () => {
                  await updateProcessParcelas(
                    modal.item.id!,
                    parcelasEntregues,
                    buildParcelasDetalhesFromVisualState(modal.item, parcelasEntregues, nextVisualState)
                  );
                  applyParcelasVisualState(modal.item, nextVisualState);
                  setModal(null);
                }, 'Parcelas atualizadas com sucesso.')
              : undefined
          }
        />
      ) : null}
    </ScrollView>
  );
}

function MetricCard({
  label,
  value,
  color,
  active,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.metricCard,
        active ? { borderColor: color, backgroundColor: `${color}12` } : null,
        pressed && onPress ? styles.metricCardPressed : null,
      ]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </Pressable>
  );
}

function DarkButton({
  label,
  icon,
  tone = 'neutral',
  disabled,
  loading,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  tone?: 'neutral' | 'accent' | 'accentSoft' | 'infoSoft' | 'dangerSoft';
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  const isDisabled = disabled || loading;
  const palette = {
    neutral: {
      backgroundColor: processTheme.surfaceHi,
      borderColor: processTheme.borderHi,
      color: processTheme.muted,
      iconColor: processTheme.muted,
    },
    accent: {
      backgroundColor: processTheme.accent,
      borderColor: processTheme.accent,
      color: processTheme.ink,
      iconColor: processTheme.ink,
    },
    accentSoft: {
      backgroundColor: 'rgba(0,212,160,0.1)',
      borderColor: 'rgba(0,212,160,0.38)',
      color: processTheme.accent,
      iconColor: processTheme.accent,
    },
    infoSoft: {
      backgroundColor: 'rgba(90,175,255,0.1)',
      borderColor: 'rgba(90,175,255,0.34)',
      color: processTheme.blue,
      iconColor: processTheme.blue,
    },
    dangerSoft: {
      backgroundColor: 'rgba(255,95,95,0.1)',
      borderColor: 'rgba(255,95,95,0.34)',
      color: processTheme.red,
      iconColor: processTheme.red,
    },
  }[tone];

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.darkButton,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator size={14} color={palette.iconColor} />
      ) : icon ? (
        <AppIcon name={icon} size={14} color={palette.iconColor} />
      ) : null}
      <Text style={[styles.darkButtonText, { color: palette.color }]}>{label}</Text>
    </Pressable>
  );
}

function DarkTabGroup<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { label: string; value: T; count?: number; color: string }[];
  value: T;
  onChange: (nextValue: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.darkTabs, compact ? styles.darkTabsCompact : null]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.darkTab,
              compact ? styles.darkTabCompact : null,
              active
                ? {
                    backgroundColor: `${option.color}24`,
                    borderColor: `${option.color}66`,
                  }
                : null,
              pressed ? styles.darkTabPressed : null,
            ]}>
            <Text
              style={[
                styles.darkTabText,
                compact ? styles.darkTabTextCompact : null,
                active ? { color: option.color, fontWeight: '800' } : null,
              ]}>
              {option.label}
            </Text>
            {typeof option.count === 'number' ? (
              <View style={[styles.darkTabCount, active ? { backgroundColor: option.color } : null]}>
                <Text style={[styles.darkTabCountText, active ? { color: processTheme.bg } : null]}>
                  {option.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function DarkSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.darkSearch}>
      <AppIcon name="search" size={15} color={processTheme.dim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={processTheme.dim}
        style={styles.darkSearchInput}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} style={styles.clearSearchButton}>
          <Text style={styles.clearSearchText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DarkNotice({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: 'success' | 'danger' | 'warning' | 'info';
}) {
  const color =
    tone === 'success'
      ? processTheme.green
      : tone === 'danger'
        ? processTheme.red
        : tone === 'warning'
          ? processTheme.amber
          : processTheme.blue;

  return (
    <View style={[styles.darkNotice, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Text style={[styles.darkNoticeTitle, { color }]}>{title}</Text>
      <Text style={styles.darkNoticeText}>{description}</Text>
    </View>
  );
}

function DarkEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.darkEmptyState}>
      <Text style={styles.darkEmptyTitle}>{title}</Text>
      <Text style={styles.darkEmptyDescription}>{description}</Text>
    </View>
  );
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.darkField}>
      <Text style={styles.darkFieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function DarkInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={processTheme.dim}
      style={[styles.darkInput, props.style]}
    />
  );
}

function ProcessTable({
  items,
  systemConfig,
  onEdit,
  onOpenParcelas,
  onToggleCanceled,
  onDelete,
}: {
  items: ProcessoEnriquecido[];
  systemConfig: ConfiguracaoSistema;
  onEdit: (item: ProcessoEnriquecido) => void;
  onOpenParcelas: (item: ProcessoEnriquecido, selectedIndex?: number) => void;
  onToggleCanceled: (item: ProcessoEnriquecido) => void;
  onDelete: (item: ProcessoAcompanhamento) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const tableWidth = Math.max(viewportWidth, PROCESS_TABLE_MIN_WIDTH);

  return (
    <View
      style={styles.tableViewport}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={viewportWidth < PROCESS_TABLE_MIN_WIDTH}
        style={styles.tableScroll}
        contentContainerStyle={[styles.tableScrollContent, { width: tableWidth }]}>
        <View style={[styles.table, { width: tableWidth }]}>
          <View style={styles.tableHeader}>
            {['Pedido / Tipo', 'Produto / Fornecedor', 'Data resgate', 'Parcelas e prazos', 'Situação', 'Ações'].map(
              (header, index) => (
                <Text key={header} style={[styles.tableHeadCell, tableColumnStyle(index)]}>
                  {header}
                </Text>
              )
            )}
          </View>

          {items.map((item) => (
            <ProcessRow
              key={item.id ?? `${item.numero_processo}-${item.cod_bionexo}`}
              item={item}
              systemConfig={systemConfig}
              onEdit={() => onEdit(item)}
              onOpenParcelas={(selectedIndex) => onOpenParcelas(item, selectedIndex)}
              onToggleCanceled={() => onToggleCanceled(item)}
              onDelete={() => onDelete(item)}
            />
          ))}

          <View style={styles.tableFooter}>
            <Text style={styles.tableFooterText}>{items.length} processo(s) exibido(s)</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ProcessRow({
  item,
  systemConfig,
  onEdit,
  onOpenParcelas,
  onToggleCanceled,
  onDelete,
}: {
  item: ProcessoEnriquecido;
  systemConfig: ConfiguracaoSistema;
  onEdit: () => void;
  onOpenParcelas: (selectedIndex?: number) => void;
  onToggleCanceled: () => void;
  onDelete: () => void;
}) {
  const status = statusMeta[item.status];
  const typeColor = getProcessTypeColor(item.tipo_processo);

  return (
    <View
      style={[
        styles.tableRow,
        item.cancelado ? styles.canceledRow : item.critico ? styles.criticalRow : null,
        item.status === 'atrasado' ? styles.overdueRow : null,
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={onEdit}
        style={({ pressed }) => [
          styles.tableCellBlock,
          styles.numberColumn,
          styles.tableCellPressable,
          pressed ? styles.tableCellPressablePressed : null,
        ]}>
        <View style={styles.numberLine}>
          {item.critico ? <AppIcon name="alert" size={14} color={processTheme.critical} /> : null}
          <Text style={styles.processNumber}>{item.numero_processo}</Text>
        </View>
        {item.edocs ? <Text style={styles.productMeta}>E-DOCS {item.edocs}</Text> : null}
        <Pill label={item.tipo_processo} color={typeColor} />
      </Pressable>

      <View style={[styles.tableCellBlock, styles.productColumn]}>
        <Text style={styles.productName} numberOfLines={2}>
          {normalizeInlineText(item.ds_produto)}
        </Text>
        <Text style={styles.productMeta} numberOfLines={1}>
          Produto {item.cd_produto}
          {item.cod_bionexo ? ` · Bionexo ${item.cod_bionexo}` : ' · Sem Cod. Bionexo'}
          {item.suficiencia_em_dias != null
            ? ` · Suficiência ${formatLookupNumber(item.suficiencia_em_dias)} dias`
            : ''}
        </Text>
        <Text style={styles.productMeta} numberOfLines={1}>
          {item.fornecedor || 'Fornecedor não informado'}
        </Text>
        <Text style={styles.productMeta} numberOfLines={1}>
          Marca: {item.marca || 'Não informada'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onEdit}
        style={({ pressed }) => [
          styles.tableCellBlock,
          styles.dateColumn,
          styles.tableCellPressable,
          pressed ? styles.tableCellPressablePressed : null,
        ]}>
        <Text style={styles.dateText}>{formatDate(parseIsoDate(item.data_resgate))}</Text>
        <Pill
          label={`${item.entregues}/${item.total_parcelas} entregues`}
          color={
            item.entregues >= item.total_parcelas
              ? processTheme.green
              : item.status === 'atrasado'
                ? processTheme.red
                : item.andamentoComAlerta
                  ? processTheme.amber
                  : processTheme.slate
          }
        />
      </Pressable>

      <View style={[styles.tableCellBlock, styles.timelineColumn]}>
        <ParcelaTimeline item={item} systemConfig={systemConfig} onSelectParcela={onOpenParcelas} />
      </View>

      <View style={[styles.tableCellBlock, styles.statusColumn]}>
        <Pill label={status.label} color={status.color} background={status.background} />
      </View>

      <View style={[styles.actionsColumn, styles.actionList]}>
        <IconButton icon="edit" label="Editar" color={processTheme.blue} onPress={onEdit} />
        <IconButton
          icon={item.cancelado ? 'refresh' : 'blocked'}
          label={item.cancelado ? 'Reativar processo' : 'Cancelar processo'}
          color={item.cancelado ? processTheme.blue : processTheme.slate}
          onPress={onToggleCanceled}
        />
        <IconButton icon="trash" label="Excluir" color={processTheme.red} onPress={onDelete} />
      </View>
    </View>
  );
}

function tableColumnStyle(index: number) {
  const columns = [
    styles.numberColumn,
    styles.productColumn,
    styles.dateColumn,
    styles.timelineColumn,
    styles.statusColumn,
    styles.actionsColumn,
  ];

  return columns[index];
}

function ParcelaTimeline({
  item,
  systemConfig,
  onSelectParcela,
}: {
  item: ProcessoEnriquecido;
  systemConfig: ConfiguracaoSistema;
  onSelectParcela: (selectedIndex: number) => void;
}) {
  const today = getTodayAtStartOfDay();

  return (
    <View style={styles.timeline}>
      {Array.from({ length: item.total_parcelas }, (_, index) => {
        const delivered = item.parcelas_entregues[index] === true;
        const visualState = getParcelaVisualState(item, index);
        const dueDate = getParcelaAdjustedDueDate(item, index, systemConfig, visualState);
        const overdue = !delivered && dueDate != null && dueDate < today;
        const nearDue = !delivered && !overdue && isParcelaNearDue(dueDate, today);
        const color = delivered
          ? processTheme.green
          : overdue
            ? processTheme.red
            : nearDue
              ? processTheme.amber
              : processTheme.slate;

        return (
          <Pressable
            key={index}
            onPress={() => onSelectParcela(index)}
            style={({ pressed }) => [
              styles.timelineItem,
              visualState.adiadaDiasUteis > 0 ? styles.timelineItemDelayed : null,
              visualState.empresaNotificada ? styles.timelineItemNotified : null,
              pressed ? styles.timelineItemPressed : null,
            ]}>
            <View style={[styles.timelineDot, { borderColor: color, backgroundColor: `${color}1f` }]}>
              <Text style={[styles.timelineIndex, { color }]}>{index + 1}</Text>
            </View>
            <View style={styles.timelineTextWrap}>
              <Text style={styles.timelineLabel}>
                P{index + 1} · {getParcelaLabel(index, systemConfig, item.categoria_material, item.tipo_processo)}
              </Text>
              <Text style={[styles.timelineDate, { color }]}>{formatDate(dueDate)}</Text>
              {visualState.adiadaDiasUteis > 0 || visualState.empresaNotificada ? (
                <View style={styles.timelineFlags}>
                  {visualState.adiadaDiasUteis > 0 ? (
                    <View style={styles.timelineFlag}>
                      <AppIcon name="clock" size={10} color={processTheme.blue} />
                      <Text style={styles.timelineFlagText}>+{visualState.adiadaDiasUteis}d</Text>
                    </View>
                  ) : null}
                  {visualState.empresaNotificada ? (
                    <View style={styles.timelineFlag}>
                      <AppIcon
                        name={visualState.empresaNotificada ? 'bell' : 'bellOff'}
                        size={10}
                        color={processTheme.purple}
                      />
                      <Text style={styles.timelineFlagText}>Notificada</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Pill({
  label,
  color,
  background,
}: {
  label: string;
  color: string;
  background?: string;
}) {
  return (
    <View style={[styles.pill, { borderColor: `${color}40`, backgroundColor: background ?? `${color}14` }]}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function IconButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}>
      <AppIcon name={icon} size={15} color={color} />
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function LegendIcon({
  icon,
  color,
  label,
}: {
  icon: React.ComponentProps<typeof AppIcon>['name'];
  color: string;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <AppIcon name={icon} size={12} color={color} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ProcessFormModal({
  initial,
  initialCategoria,
  systemConfig,
  lookupProductByCode,
  lookupProduct,
  lookupProductByCodeRemote,
  lookupProductRemote,
  onClose,
  onSave,
}: {
  initial: ProcessoAcompanhamento | null;
  initialCategoria: CategoriaMaterial;
  systemConfig: ConfiguracaoSistema;
  lookupProductByCode: (cdProduto: string) => ProcessoProdutoLookup | null;
  lookupProduct: (codBionexo: string) => ProcessoProdutoLookup | null;
  lookupProductByCodeRemote: (cdProduto: string) => Promise<ProcessoProdutoLookup | null>;
  lookupProductRemote: (codBionexo: string) => Promise<ProcessoProdutoLookup | null>;
  onClose: () => void;
  onSave: (input: ProcessoSaveInput) => Promise<void>;
}) {
  const [codBionexoText, setCodBionexoText] = useState(stripBionexoPrefix(initial?.cod_bionexo ?? ''));
  const [cdProdutoText, setCdProdutoText] = useState(initial?.cd_produto ?? '');
  const [numeroPedido, setNumeroPedido] = useState(initial?.numero_processo ?? '');
  const [edocs, setEdocs] = useState(initial?.edocs ?? '');
  const [marca, setMarca] = useState(initial?.marca ?? '');
  const [tipoProcesso, setTipoProcesso] = useState<ProcessoTipo>(initial?.tipo_processo ?? 'ARP');
  const [fornecedor, setFornecedor] = useState(initial?.fornecedor ?? '');
  const [dataResgate, setDataResgate] = useState(
    initial?.data_resgate ? formatIsoDateToPtBr(initial.data_resgate) : ''
  );
  const [totalParcelas, setTotalParcelas] = useState(
    Math.min(initial?.total_parcelas ?? 3, PROCESSO_TOTAL_PARCELAS_MAX)
  );
  const [critico, setCritico] = useState(initial?.critico ?? false);
  const [lookupSource, setLookupSource] = useState<'bionexo' | 'produto' | null>(null);
  const [lockedFieldHint, setLockedFieldHint] = useState<'bionexo' | 'produto' | null>(null);
  const [saving, setSaving] = useState(false);
  const [remoteLookup, setRemoteLookup] = useState<{
    mode: 'bionexo' | 'produto' | '';
    code: string;
    loading: boolean;
    product: ProcessoProdutoLookup | null;
    error: string | null;
  }>({ mode: '', code: '', loading: false, product: null, error: null });

  const normalizedCodBionexo = normalizeBionexoCode(codBionexoText);
  const normalizedCdProduto = normalizeProductCode(cdProdutoText);
  const searchMode: 'bionexo' | 'produto' | null =
    lookupSource === 'produto'
      ? normalizedCdProduto
        ? 'produto'
        : normalizedCodBionexo
          ? 'bionexo'
          : null
      : lookupSource === 'bionexo'
        ? normalizedCodBionexo
          ? 'bionexo'
          : normalizedCdProduto
            ? 'produto'
            : null
        : normalizedCodBionexo
          ? 'bionexo'
          : normalizedCdProduto
            ? 'produto'
            : null;
  const localProductByCode = normalizedCdProduto ? lookupProductByCode(normalizedCdProduto) : null;
  const localProductByBionexo = normalizedCodBionexo ? lookupProduct(normalizedCodBionexo) : null;
  const lookup = searchMode === 'produto' ? localProductByCode : localProductByBionexo;
  const initialAsLookup: ProcessoProdutoLookup | null =
    initial &&
    ((normalizedCdProduto && normalizedCdProduto === normalizeProductCode(initial.cd_produto)) ||
      (normalizedCodBionexo && normalizedCodBionexo === normalizeBionexoCode(initial.cod_bionexo)))
      ? {
          cod_bionexo: initial.cod_bionexo ?? '',
          cd_produto: initial.cd_produto,
          ds_produto: initial.ds_produto,
          categoria_material: initial.categoria_material,
        }
      : null;
  const remoteProduct =
    remoteLookup.mode === searchMode &&
    remoteLookup.code === (searchMode === 'produto' ? normalizedCdProduto : normalizedCodBionexo) &&
    !remoteLookup.loading
      ? remoteLookup.product
      : null;
  const remoteLookupLoading =
    remoteLookup.mode === searchMode &&
    remoteLookup.code === (searchMode === 'produto' ? normalizedCdProduto : normalizedCodBionexo) &&
    remoteLookup.loading;
  const remoteLookupError =
    remoteLookup.mode === searchMode &&
    remoteLookup.code === (searchMode === 'produto' ? normalizedCdProduto : normalizedCodBionexo)
      ? remoteLookup.error
      : null;
  const resolvedProduct = lookup ?? remoteProduct ?? initialAsLookup;
  const bionexoLocked = lookupSource === 'produto' && resolvedProduct != null;
  const productLocked = lookupSource === 'bionexo' && resolvedProduct != null;
  const bionexoInputValue = bionexoLocked ? stripBionexoPrefix(resolvedProduct?.cod_bionexo ?? '') : codBionexoText;
  const productInputValue = productLocked ? resolvedProduct?.cd_produto ?? '' : cdProdutoText;
  const bionexoLockMessage =
    lockedFieldHint === 'bionexo'
      ? 'Campo bloqueado. Apague o nº do produto para liberar a edição do Cod. Bionexo.'
      : 'Apague o nº do produto para editar o Cod. Bionexo.';
  const productLockMessage =
    lockedFieldHint === 'produto'
      ? 'Campo bloqueado. Apague o Cod. Bionexo para liberar a edição do nº do produto.'
      : 'Apague o Cod. Bionexo para editar o nº do produto.';
  const hasLocalLookup = lookup != null;
  const previewCategoria = resolvedProduct?.categoria_material ?? initialCategoria;
  const dataResgateIso = convertPtBrDateToIso(dataResgate);
  const baseDate = parsePtBrDate(dataResgate);
  const dataResgateValida = dataResgate.trim().length === 0 || dataResgateIso != null;
  const canSave =
    !!resolvedProduct &&
    numeroPedido.trim().length > 0 &&
    !saving &&
    !remoteLookupLoading &&
    dataResgateValida;

  useEffect(() => {
    const queryCode = searchMode === 'produto' ? normalizedCdProduto : normalizedCodBionexo;

    if (!searchMode || !queryCode) {
      setRemoteLookup({ mode: '', code: '', loading: false, product: null, error: null });
      return;
    }

    if (hasLocalLookup) {
      setRemoteLookup({ mode: searchMode, code: queryCode, loading: false, product: null, error: null });
      return;
    }

    let cancelled = false;
    setRemoteLookup({ mode: searchMode, code: queryCode, loading: true, product: null, error: null });

    const timer = setTimeout(() => {
      const lookupPromise =
        searchMode === 'produto'
          ? lookupProductByCodeRemote(queryCode)
          : lookupProductRemote(queryCode);

      lookupPromise
        .then((product) => {
          if (!cancelled) {
            setRemoteLookup({ mode: searchMode, code: queryCode, loading: false, product, error: null });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRemoteLookup({
              mode: searchMode,
              code: queryCode,
              loading: false,
              product: null,
              error:
                searchMode === 'produto'
                  ? 'Não foi possível consultar o número do produto agora. Tente novamente em instantes.'
                  : 'Não foi possível consultar a base agora. Tente novamente em instantes.',
            });
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasLocalLookup, lookupProductByCodeRemote, lookupProductRemote, normalizedCdProduto, normalizedCodBionexo, searchMode]);

  function handleCodChange(value: string) {
    const nextValue = stripBionexoPrefix(value).toUpperCase();
    setLockedFieldHint(null);
    setCodBionexoText(nextValue);
    if (!nextValue.trim() && lookupSource === 'bionexo') {
      setCdProdutoText('');
      setLookupSource(null);
      return;
    }

    setLookupSource(nextValue.trim() ? 'bionexo' : normalizedCdProduto ? 'produto' : null);
  }

  function handleProductCodeChange(value: string) {
    const nextValue = normalizeProductCode(value);
    setLockedFieldHint(null);
    setCdProdutoText(nextValue);
    if (!nextValue && lookupSource === 'produto') {
      setCodBionexoText('');
      setLookupSource(null);
      return;
    }

    setLookupSource(nextValue ? 'produto' : normalizedCodBionexo ? 'bionexo' : null);
  }

  async function handleSave() {
    if (!resolvedProduct || !canSave) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        categoria_material: resolvedProduct.categoria_material,
        cod_bionexo: resolvedProduct.cod_bionexo ?? '',
        cd_produto: resolvedProduct.cd_produto,
        ds_produto: resolvedProduct.ds_produto,
        numero_processo: numeroPedido.trim(),
        edocs: edocs.trim(),
        marca: marca.trim(),
        tipo_processo: tipoProcesso,
        fornecedor: fornecedor.trim(),
        data_resgate: dataResgateIso,
        total_parcelas: totalParcelas,
        parcelas_entregues: initial?.parcelas_entregues ?? [],
        parcelas_detalhes: initial?.parcelas_detalhes ?? [],
        critico,
        cancelado: initial?.cancelado ?? false,
        ignorado: initial?.ignorado ?? false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{initial ? 'Editar processo' : 'Novo processo'}</Text>
              <Text style={styles.modalSubtitle}>SISCORE · Almoxarifado</Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={onClose}>
              <AppIcon name="chevronDown" size={18} color={processTheme.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.modalGrid}>
              <DarkField label="Cod. Bionexo">
                <View style={styles.lockableFieldWrap}>
                  <View style={[styles.bionexoInputRow, bionexoLocked ? styles.lockedInputSurface : null]}>
                    <View style={[styles.bionexoPrefix, bionexoLocked ? styles.lockedPrefix : null]}>
                      <Text style={[styles.bionexoPrefixText, bionexoLocked ? styles.lockedPrefixText : null]}>I-</Text>
                    </View>
                    <DarkInput
                      value={bionexoInputValue}
                      onChangeText={handleCodChange}
                      placeholder="Opcional"
                      autoCapitalize="characters"
                      editable={!bionexoLocked}
                      selectTextOnFocus={!bionexoLocked}
                      style={[styles.bionexoInput, bionexoLocked ? styles.lockedInput : null]}
                    />
                  </View>
                  {bionexoLocked ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setLockedFieldHint('bionexo')}
                      style={({ pressed }) => [
                        styles.lockedFieldOverlay,
                        pressed ? styles.lockedFieldOverlayPressed : null,
                      ]}
                    />
                  ) : null}
                </View>
                {bionexoLocked ? (
                  <Text
                    style={[
                      styles.fieldHelperText,
                      lockedFieldHint === 'bionexo' ? styles.fieldHelperTextActive : null,
                    ]}>
                    {bionexoLockMessage}
                  </Text>
                ) : null}
              </DarkField>
              <DarkField label="Nº do produto">
                <View style={styles.lockableFieldWrap}>
                  <DarkInput
                    value={productInputValue}
                    onChangeText={handleProductCodeChange}
                    placeholder="Digite o código do produto"
                    keyboardType="default"
                    editable={!productLocked}
                    selectTextOnFocus={!productLocked}
                    style={productLocked ? styles.lockedInput : null}
                  />
                  {productLocked ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setLockedFieldHint('produto')}
                      style={({ pressed }) => [
                        styles.lockedFieldOverlay,
                        pressed ? styles.lockedFieldOverlayPressed : null,
                      ]}
                    />
                  ) : null}
                </View>
                {productLocked ? (
                  <Text
                    style={[
                      styles.fieldHelperText,
                      lockedFieldHint === 'produto' ? styles.fieldHelperTextActive : null,
                    ]}>
                    {productLockMessage}
                  </Text>
                ) : null}
              </DarkField>
            </View>

            {resolvedProduct ? (
              <View style={styles.lookupBox}>
                <View style={styles.lookupHeader}>
                  <AppIcon name="check" size={16} color={processTheme.green} />
                  <Text style={styles.lookupTitle}>Produto localizado na base HMSA</Text>
                </View>
                <Text style={styles.lookupName}>{resolvedProduct.ds_produto}</Text>
                <Text style={styles.lookupMeta}>
                  Produto {resolvedProduct.cd_produto}
                  {resolvedProduct.cod_bionexo ? ` · Bionexo ${resolvedProduct.cod_bionexo}` : ''}
                  {' · '}
                  {getCategoriaMaterialLabel(resolvedProduct.categoria_material)} · Estoque atual{' '}
                  {formatLookupNumber(resolvedProduct.estoque_atual)} · Suficiência{' '}
                  {formatLookupNumber(resolvedProduct.suficiencia_em_dias)} dias
                </Text>
              </View>
            ) : remoteLookupLoading ? (
              <DarkNotice
                title="Buscando produto"
                description={
                  searchMode === 'produto'
                    ? 'Consultando o número do produto na base do HMSA.'
                    : 'Consultando o Cod. Bionexo na base do HMSA.'
                }
                tone="info"
              />
            ) : remoteLookupError ? (
              <DarkNotice
                title="Não foi possível consultar o produto"
                description={remoteLookupError}
                tone="warning"
              />
            ) : searchMode ? (
              <DarkNotice
                title={searchMode === 'produto' ? 'Produto não localizado' : 'Cod. Bionexo não localizado'}
                description={
                  searchMode === 'produto'
                    ? 'Confira se o número do produto existe no HMSA na base importada do SISCORE. O cadastro fica bloqueado até localizar o item.'
                    : 'Confira se o código existe para o HMSA na base importada do SISCORE. O cadastro fica bloqueado até localizar o produto.'
                }
                tone="warning"
              />
            ) : (
              <DarkNotice
                title="Informe o produto"
                description="Use o Cod. Bionexo ou o número do produto para preencher automaticamente a descrição."
                tone="info"
              />
            )}

            <View style={styles.modalGrid}>
              <DarkField label="Nº do pedido">
                <DarkInput value={numeroPedido} onChangeText={setNumeroPedido} placeholder="4131/2025" />
              </DarkField>
              <DarkField label="E-DOCS">
                <DarkInput value={edocs} onChangeText={(value) => setEdocs(value.toUpperCase())} placeholder="2025-BK7DX" />
              </DarkField>
            </View>

            <View style={styles.modalGrid}>
              <DarkField label="Marca">
                <DarkInput value={marca} onChangeText={setMarca} placeholder="Marca do item" />
              </DarkField>
              <DarkField label="Tipo">
                <DarkTabGroup
                  compact
                  options={PROCESS_TYPES.map((tipo) => ({ label: tipo, value: tipo, color: getProcessTypeColor(tipo) }))}
                  value={tipoProcesso}
                  onChange={setTipoProcesso}
                />
              </DarkField>
            </View>

            <DarkField label="Fornecedor">
              <DarkInput value={fornecedor} onChangeText={setFornecedor} placeholder="Razão social" />
            </DarkField>

            <View style={styles.modalGrid}>
              <DarkField label="Data de resgate">
                <DarkInput
                  value={dataResgate}
                  onChangeText={(value) => setDataResgate(formatPtBrDateInput(value))}
                  placeholder="DD/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </DarkField>
              <DarkField label="Parcelas">
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setTotalParcelas((current) => Math.max(1, current - 1))}
                    style={styles.stepperButton}>
                    <Text style={styles.stepperButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{totalParcelas}</Text>
                  <Pressable
                    onPress={() => setTotalParcelas((current) => Math.min(PROCESSO_TOTAL_PARCELAS_MAX, current + 1))}
                    style={[styles.stepperButton, styles.stepperButtonPrimary]}>
                    <Text style={[styles.stepperButtonText, styles.stepperButtonTextPrimary]}>+</Text>
                  </Pressable>
                </View>
              </DarkField>
            </View>

            {dataResgate.trim().length > 0 && !dataResgateValida ? (
              <DarkNotice
                title="Data de resgate incompleta"
                description="Preencha a data no formato DD/MM/AAAA para calcular os prazos e salvar o processo."
                tone="warning"
              />
            ) : null}

            <View style={styles.deadlinePreview}>
              <Text style={styles.deadlineTitle}>Prazos calculados</Text>
              {baseDate ? (
                Array.from({ length: totalParcelas }, (_, index) => (
                  <View key={index} style={styles.deadlineRow}>
                    <Text style={styles.deadlineIndex}>P{index + 1}</Text>
                    <Text style={styles.deadlineLabel}>
                      {getParcelaLabel(index, systemConfig, previewCategoria, tipoProcesso)}
                    </Text>
                    <Text style={styles.deadlineDate}>
                      {formatDate(
                        getParcelaDueDate(
                          {
                            categoria_material: previewCategoria,
                            data_resgate: dataResgateIso,
                            tipo_processo: tipoProcesso,
                          },
                          index,
                          systemConfig
                        )
                      )}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.deadlineEmpty}>Informe a data de resgate para visualizar os prazos.</Text>
              )}
            </View>

            <Pressable
              onPress={() => setCritico((current) => !current)}
              style={[styles.criticalToggle, critico ? styles.criticalToggleActive : null]}>
              <View style={[styles.checkbox, critico ? styles.checkboxActive : null]}>
                {critico ? <AppIcon name="check" size={14} color={processTheme.text} /> : null}
              </View>
              <Text style={[styles.criticalToggleText, critico ? styles.criticalToggleTextActive : null]}>
                Risco de desabastecimento · marcar como crítico
              </Text>
            </Pressable>

            <DarkButton
              label={saving ? 'Salvando...' : initial ? 'Salvar alterações' : 'Cadastrar processo'}
              icon="save"
              tone="accent"
              disabled={!canSave}
              loading={saving}
              onPress={() => void handleSave()}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ParcelasModal({
  item,
  mode,
  initialSelectedIndex,
  systemConfig,
  onClose,
  onApplyVisualState,
  onSave,
}: {
  item: ProcessoEnriquecido;
  mode: 'single' | 'summary';
  initialSelectedIndex: number | null;
  systemConfig: ConfiguracaoSistema;
  onClose: () => void;
  onApplyVisualState: (visualState: ProcessoParcelasVisualMap) => void;
  onSave: (parcelasEntregues: boolean[], visualState: ProcessoParcelasVisualMap) => Promise<void> | undefined;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const compactModal = viewportWidth < 1280 || viewportHeight < 860;
  const [parcelas, setParcelas] = useState(() =>
    Array.from({ length: item.total_parcelas }, (_, index) => item.parcelas_entregues[index] === true)
  );
  const [selectedIndex, setSelectedIndex] = useState(
    initialSelectedIndex ?? getFirstPendingParcelaIndex(item)
  );
  const [visualState, setVisualState] = useState(() => createVisualParcelasMap(item, item.visualParcelas));

  const selectedVisualState = visualState[selectedIndex] ?? getDefaultParcelaVisualDraft();
  const selectedDelivered = parcelas[selectedIndex] === true;
  const standardDueDate = getParcelaDueDate(item, selectedIndex, systemConfig);
  const adjustedDueDate = getParcelaAdjustedDueDate(item, selectedIndex, systemConfig, selectedVisualState);
  const selectedOverdue =
    !selectedDelivered && adjustedDueDate != null && adjustedDueDate < getTodayAtStartOfDay();
  const selectedNearDue =
    !selectedDelivered && !selectedOverdue && isParcelaNearDue(adjustedDueDate, getTodayAtStartOfDay());
  const selectedStatusColor = item.cancelado
    ? processTheme.slate
    : selectedDelivered
      ? processTheme.green
      : selectedOverdue
        ? processTheme.red
        : selectedNearDue
          ? processTheme.amber
          : processTheme.slate;
  const selectedStatusLabel = item.cancelado
    ? 'Cancelado'
    : selectedDelivered
      ? 'Entregue'
      : selectedOverdue
        ? 'Atrasada'
        : 'Pendente';
  const selectedDeliveryDateInvalid = selectedDelivered && !isValidOptionalPtBrDate(selectedVisualState.dataEntrega);
  const selectedNotificationDateInvalid =
    selectedVisualState.empresaNotificada && !isValidOptionalPtBrDate(selectedVisualState.empresaNotificadaEm);
  const hasInvalidParcelDates = Array.from({ length: item.total_parcelas }, (_, index) => {
    const current = visualState[index] ?? getDefaultParcelaVisualDraft();
    return (
      (parcelas[index] === true && !isValidOptionalPtBrDate(current.dataEntrega)) ||
      (current.empresaNotificada && !isValidOptionalPtBrDate(current.empresaNotificadaEm))
    );
  }).some(Boolean);

  function toggleDelivered(index: number) {
    const nextDelivered = !parcelas[index];
    setParcelas((current) => current.map((value, currentIndex) => (currentIndex === index ? !value : value)));
    setVisualState((current) => ({
      ...current,
      [index]: {
        ...(current[index] ?? getDefaultParcelaVisualDraft()),
        dataEntrega: nextDelivered ? current[index]?.dataEntrega ?? getTodayPtBrDate() : null,
      },
    }));
  }

  function updateSelectedVisualState(patch: Partial<ParcelaVisualDraft>) {
    setVisualState((current) => ({
      ...current,
      [selectedIndex]: {
        ...(current[selectedIndex] ?? getDefaultParcelaVisualDraft()),
        ...patch,
      },
    }));
  }

  function adjustDelay(delta: number) {
    updateSelectedVisualState({
      adiadaDiasUteis: Math.max(0, (visualState[selectedIndex]?.adiadaDiasUteis ?? 0) + delta),
    });
  }

  function toggleNotification() {
    const nextNotified = !(visualState[selectedIndex]?.empresaNotificada ?? false);
    updateSelectedVisualState({
      empresaNotificada: nextNotified,
      empresaNotificadaEm: nextNotified ? visualState[selectedIndex]?.empresaNotificadaEm ?? getTodayPtBrDate() : null,
    });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalOverlay, compactModal ? styles.modalOverlayCompact : null]} onPress={onClose}>
        <Pressable
          style={[
            styles.modalCard,
            styles.parcelasModalCard,
            compactModal ? styles.parcelasModalCardCompact : null,
          ]}
          onPress={() => undefined}>
          <View style={[styles.modalHeader, compactModal ? styles.modalHeaderCompact : null]}>
            <View>
              <Text style={styles.modalTitle}>{mode === 'single' ? 'Parcela do processo' : 'Parcelas do processo'}</Text>
              <Text style={styles.modalSubtitle}>{item.numero_processo} · {item.ds_produto}</Text>
            </View>
            <Pressable style={styles.modalCloseButton} onPress={onClose}>
              <AppIcon name="chevronDown" size={18} color={processTheme.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalBodyScroll}
            contentContainerStyle={[styles.modalBody, compactModal ? styles.modalBodyCompact : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.parcelasSelector, compactModal ? styles.parcelasSelectorCompact : null]}>
              {parcelas.map((delivered, index) => {
                const parcelVisualState = visualState[index] ?? getDefaultParcelaVisualDraft();
                const dueDate = getParcelaAdjustedDueDate(item, index, systemConfig, parcelVisualState);
                const today = getTodayAtStartOfDay();
                const overdue = !delivered && dueDate != null && dueDate < today;
                const nearDue = !delivered && !overdue && isParcelaNearDue(dueDate, today);
                const color = delivered
                  ? processTheme.green
                  : overdue
                    ? processTheme.red
                    : nearDue
                      ? processTheme.amber
                      : processTheme.slate;
                const active = selectedIndex === index;

                return (
                  <Pressable
                    key={index}
                    onPress={() => setSelectedIndex(index)}
                    style={[
                      styles.parcelaSelectorButton,
                      compactModal ? styles.parcelaSelectorButtonCompact : null,
                      active ? styles.parcelaSelectorButtonActive : null,
                    ]}>
                    <View style={[styles.parcelaSelectorIndex, { borderColor: color, backgroundColor: `${color}14` }]}>
                      <Text style={[styles.parcelaSelectorIndexText, { color }]}>{index + 1}</Text>
                    </View>
                    <View style={styles.parcelaSelectorBody}>
                      <Text style={styles.parcelaSelectorTitle}>Parcela {index + 1}</Text>
                      <Text style={styles.parcelaSelectorMeta}>{formatDate(dueDate)}</Text>
                    </View>
                    {parcelVisualState.adiadaDiasUteis > 0 || parcelVisualState.empresaNotificada ? (
                      <View style={styles.parcelaSelectorFlags}>
                        {parcelVisualState.adiadaDiasUteis > 0 ? (
                          <AppIcon name="clock" size={12} color={processTheme.blue} />
                        ) : null}
                        {parcelVisualState.empresaNotificada ? (
                          <AppIcon name="bell" size={12} color={processTheme.purple} />
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.parcelaFocusCard, compactModal ? styles.parcelaFocusCardCompact : null]}>
              <View style={styles.parcelaFocusHeader}>
                <View style={styles.parcelaFocusHeaderText}>
                  <Text style={styles.parcelaFocusEyebrow}>
                    Parcela {selectedIndex + 1} de {item.total_parcelas}
                  </Text>
                  <Text style={styles.parcelaFocusTitle}>
                    {mode === 'single' ? 'Acompanhamento da parcela selecionada' : 'Detalhes da parcela'}
                  </Text>
                </View>
                <Pill label={selectedStatusLabel} color={selectedStatusColor} />
              </View>

              <View style={styles.parcelaBadgesRow}>
                {selectedVisualState.adiadaDiasUteis > 0 ? (
                  <View style={styles.parcelaBadge}>
                    <AppIcon name="clock" size={12} color={processTheme.blue} />
                    <Text style={styles.parcelaBadgeText}>Adiada em {selectedVisualState.adiadaDiasUteis} dias úteis</Text>
                  </View>
                ) : null}
                {selectedVisualState.empresaNotificada ? (
                  <View style={styles.parcelaBadge}>
                    <AppIcon name="bell" size={12} color={processTheme.purple} />
                    <Text style={styles.parcelaBadgeText}>Empresa notificada</Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.parcelaInfoGrid, compactModal ? styles.parcelaInfoGridCompact : null]}>
                <View style={[styles.parcelaInfoCard, compactModal ? styles.parcelaInfoCardCompact : null]}>
                  <Text style={styles.parcelaInfoLabel}>Prazo padrão</Text>
                  <Text style={styles.parcelaInfoValue}>{formatDate(standardDueDate)}</Text>
                  <Text style={styles.parcelaInfoHelper}>
                    {getParcelaLabel(selectedIndex, systemConfig, item.categoria_material, item.tipo_processo)}
                  </Text>
                </View>
                <View style={[styles.parcelaInfoCard, compactModal ? styles.parcelaInfoCardCompact : null]}>
                  <Text style={styles.parcelaInfoLabel}>Adiamento aplicado</Text>
                  <Text style={styles.parcelaInfoValue}>
                    {selectedVisualState.adiadaDiasUteis > 0
                      ? `+${selectedVisualState.adiadaDiasUteis} dias úteis`
                      : 'Sem adiamento'}
                  </Text>
                  <Text style={styles.parcelaInfoHelper}>Ajuste visual desta etapa</Text>
                </View>
                <View style={[styles.parcelaInfoCard, compactModal ? styles.parcelaInfoCardCompact : null]}>
                  <Text style={styles.parcelaInfoLabel}>Prazo atual</Text>
                  <Text style={styles.parcelaInfoValue}>{formatDate(adjustedDueDate)}</Text>
                  <Text style={styles.parcelaInfoHelper}>
                    {selectedOverdue ? 'Prazo vencido' : 'Dentro do prazo atual'}
                  </Text>
                </View>
                <View style={[styles.parcelaInfoCard, compactModal ? styles.parcelaInfoCardCompact : null]}>
                  <Text style={styles.parcelaInfoLabel}>Aviso para a empresa</Text>
                  <Text style={styles.parcelaInfoValue}>
                    {selectedVisualState.empresaNotificada ? 'Empresa avisada' : 'Ainda não marcada'}
                  </Text>
                  <Text style={styles.parcelaInfoHelper}>
                    {selectedVisualState.empresaNotificada
                      ? `Em ${formatStoredDateLabel(selectedVisualState.empresaNotificadaEm)}`
                      : 'Sem registro de aviso'}
                  </Text>
                </View>
              </View>

              <View style={styles.parcelaActionSection}>
                <Text style={styles.parcelaActionTitle}>Ações rápidas</Text>

                <View style={[styles.parcelaToggleRow, compactModal ? styles.parcelaToggleRowCompact : null]}>
                  <View style={styles.parcelaToggleText}>
                    <Text style={styles.parcelaToggleLabel}>Entrega da parcela</Text>
                    <Text style={styles.parcelaToggleHelper}>
                      Confirma que esta parcela já foi entregue. Se voltar atrás, ela retorna para pendente.
                    </Text>
                  </View>
                  <View style={styles.deliveryActionControls}>
                    <DarkButton
                      label={selectedDelivered ? 'Voltar para pendente' : 'Confirmar entrega da parcela'}
                      icon={selectedDelivered ? 'refresh' : 'check'}
                      tone={selectedDelivered ? 'neutral' : 'accentSoft'}
                      onPress={() => toggleDelivered(selectedIndex)}
                    />
                    {selectedDelivered ? (
                      <View style={styles.deliveryDateInlineWrap}>
                        <Text style={styles.deliveryDateInlineLabel}>Entregue em</Text>
                        <DarkInput
                          value={selectedVisualState.dataEntrega ?? ''}
                          onChangeText={(value) =>
                            updateSelectedVisualState({ dataEntrega: formatPtBrDateInput(value) || null })
                          }
                          placeholder="DD/MM/AAAA"
                          keyboardType="numbers-and-punctuation"
                          style={styles.deliveryDateInput}
                        />
                        {selectedDeliveryDateInvalid ? (
                          <Text style={styles.inlineDateErrorText}>Preencha em DD/MM/AAAA.</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={[styles.parcelaToggleRow, compactModal ? styles.parcelaToggleRowCompact : null]}>
                  <View style={styles.parcelaToggleText}>
                    <Text style={styles.parcelaToggleLabel}>Adiamento da parcela</Text>
                    <Text style={styles.parcelaToggleHelper}>
                      Ajuste visual em dias úteis para testar o comportamento da interface.
                    </Text>
                  </View>
                  <View style={styles.delayStepper}>
                    <Pressable onPress={() => adjustDelay(-1)} style={styles.delayStepperButton}>
                      <Text style={styles.delayStepperButtonText}>-</Text>
                    </Pressable>
                    <View style={styles.delayStepperValueWrap}>
                      <Text style={styles.delayStepperValue}>{selectedVisualState.adiadaDiasUteis}</Text>
                      <Text style={styles.delayStepperUnit}>dias úteis</Text>
                    </View>
                    <Pressable onPress={() => adjustDelay(1)} style={[styles.delayStepperButton, styles.delayStepperButtonPrimary]}>
                      <Text style={[styles.delayStepperButtonText, styles.delayStepperButtonTextPrimary]}>+</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updateSelectedVisualState({ adiadaDiasUteis: 0 })}
                      style={styles.delayResetButton}>
                      <Text style={styles.delayResetButtonText}>Limpar</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.parcelaToggleRow, compactModal ? styles.parcelaToggleRowCompact : null]}>
                  <View style={styles.parcelaToggleText}>
                    <Text style={styles.parcelaToggleLabel}>Aviso para a empresa</Text>
                    <Text style={styles.parcelaToggleHelper}>
                      Apenas marca que a empresa já foi avisada. Não altera prazo nem situação da parcela.
                    </Text>
                  </View>
                  <View style={styles.deliveryActionControls}>
                    <DarkButton
                      label={
                        selectedVisualState.empresaNotificada
                          ? 'Remover marcação de aviso'
                          : 'Registrar que a empresa foi avisada'
                      }
                      icon={selectedVisualState.empresaNotificada ? 'bellOff' : 'bell'}
                      tone={selectedVisualState.empresaNotificada ? 'neutral' : 'infoSoft'}
                      onPress={toggleNotification}
                    />
                    {selectedVisualState.empresaNotificada ? (
                      <View style={styles.deliveryDateInlineWrap}>
                        <Text style={styles.deliveryDateInlineLabel}>Avisada em</Text>
                        <DarkInput
                          value={selectedVisualState.empresaNotificadaEm ?? ''}
                          onChangeText={(value) =>
                            updateSelectedVisualState({ empresaNotificadaEm: formatPtBrDateInput(value) || null })
                          }
                          placeholder="DD/MM/AAAA"
                          keyboardType="numbers-and-punctuation"
                          style={styles.deliveryDateInput}
                        />
                        {selectedNotificationDateInvalid ? (
                          <Text style={styles.inlineDateErrorText}>Preencha em DD/MM/AAAA.</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {hasInvalidParcelDates ? (
              <DarkNotice
                title="Datas das parcelas incompletas"
                description="Revise os campos de data no formato DD/MM/AAAA antes de salvar as parcelas."
                tone="warning"
              />
            ) : null}

            <View style={styles.parcelasModalActions}>
              <DarkButton
                label="Aplicar visual"
                icon="edit"
                tone="infoSoft"
                onPress={() => onApplyVisualState(visualState)}
              />
              <DarkButton
                label="Salvar parcelas"
                icon="save"
                tone="accent"
                disabled={hasInvalidParcelDates}
                onPress={() => void onSave(parcelas, visualState)}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
  },
  categoryTabsRow: {
    flexDirection: 'row',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.xs,
  },
  metricCardPressed: {
    opacity: 0.82,
  },
  metricLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.mono,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    minWidth: 260,
  },
  filterPanel: {
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.md,
  },
  filterBlock: {
    gap: almoxTheme.spacing.xs,
  },
  filterLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  table: {
    minWidth: 980,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    overflow: 'hidden',
  },
  tableViewport: {
    width: '100%',
    overflow: 'hidden',
  },
  tableScroll: {
    width: '100%',
  },
  tableScrollContent: {
    flexGrow: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: almoxTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.line,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
  },
  tableHeadCell: {
    color: almoxTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.line,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.md,
    backgroundColor: almoxTheme.colors.surface,
  },
  criticalRow: {
    borderLeftWidth: 3,
    borderLeftColor: almoxTheme.colors.red,
    backgroundColor: '#fff8fa',
  },
  overdueRow: {
    backgroundColor: '#fffafb',
  },
  tableCellBlock: {
    paddingRight: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.xs,
  },
  tableCellPressable: {
    borderRadius: almoxTheme.radii.sm,
    paddingVertical: 2,
  },
  tableCellPressablePressed: {
    opacity: 0.78,
  },
  numberColumn: {
    width: 150,
  },
  productColumn: {
    flex: 1,
    minWidth: 290,
  },
  dateColumn: {
    width: 150,
  },
  timelineColumn: {
    width: 220,
  },
  statusColumn: {
    width: 125,
  },
  actionsColumn: {
    width: 118,
  },
  numberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
  },
  processNumber: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.mono,
  },
  productName: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  productMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  dateText: {
    color: almoxTheme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: almoxTheme.typography.mono,
  },
  actionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.xs,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: almoxTheme.radii.sm,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    opacity: 0.75,
  },
  tableFooter: {
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    backgroundColor: almoxTheme.colors.surfaceMuted,
  },
  tableFooterText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  timeline: {
    gap: almoxTheme.spacing.xs,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineIndex: {
    fontSize: 10,
    fontWeight: '800',
  },
  timelineTextWrap: {
    flex: 1,
  },
  timelineLabel: {
    color: almoxTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  timelineDate: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: almoxTheme.typography.mono,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: almoxTheme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: almoxTheme.spacing.xs,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 3,
  },
  legendText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: almoxTheme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surface,
    overflow: 'hidden',
  },
  parcelasModalCard: {
    maxWidth: 560,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: almoxTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceMuted,
  },
  modalTitle: {
    color: almoxTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: almoxTheme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: almoxTheme.colors.surfaceRaised,
  },
  modalBody: {
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.md,
  },
  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  bionexoInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bionexoPrefix: {
    height: 44,
    paddingHorizontal: almoxTheme.spacing.md,
    borderTopLeftRadius: almoxTheme.radii.md,
    borderBottomLeftRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    justifyContent: 'center',
  },
  bionexoPrefixText: {
    color: almoxTheme.colors.brandStrong,
    fontSize: 14,
    fontWeight: '900',
  },
  bionexoInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  lookupBox: {
    borderWidth: 1,
    borderColor: '#bce4cc',
    borderRadius: almoxTheme.radii.md,
    backgroundColor: '#edf9f2',
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.xs,
  },
  lookupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
  },
  lookupTitle: {
    color: almoxTheme.colors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  lookupName: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  lookupMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  stepper: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: almoxTheme.radii.sm,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonPrimary: {
    borderColor: almoxTheme.colors.brand,
    backgroundColor: '#e9f1ff',
  },
  stepperButtonText: {
    color: almoxTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  stepperButtonTextPrimary: {
    color: almoxTheme.colors.brandStrong,
  },
  stepperValue: {
    minWidth: 28,
    textAlign: 'center',
    color: almoxTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.mono,
  },
  deadlinePreview: {
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.sm,
  },
  deadlineTitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
  },
  deadlineIndex: {
    width: 30,
    color: almoxTheme.colors.brandStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  deadlineLabel: {
    flex: 1,
    color: almoxTheme.colors.textSoft,
    fontSize: 12,
  },
  deadlineDate: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.mono,
  },
  deadlineEmpty: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  criticalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
  },
  criticalToggleActive: {
    borderColor: '#efb4c1',
    backgroundColor: '#fff0f3',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    borderColor: almoxTheme.colors.red,
    backgroundColor: almoxTheme.colors.red,
  },
  criticalToggleText: {
    flex: 1,
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  criticalToggleTextActive: {
    color: almoxTheme.colors.red,
  },
  parcelaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
  },
  parcelaOptionDelivered: {
    borderColor: '#bce4cc',
    backgroundColor: '#edf9f2',
  },
  parcelaIndex: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parcelaIndexText: {
    fontSize: 13,
    fontWeight: '900',
  },
  parcelaOptionText: {
    flex: 1,
    gap: 2,
  },
  parcelaTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  parcelaSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
});

const styles = {
  ...baseStyles,
  ...StyleSheet.create({
    processScroll: {
      flex: 1,
      backgroundColor: processTheme.bg,
    },
    processScrollContent: {
      flexGrow: 1,
    },
    darkStage: {
      flexGrow: 1,
      minHeight: '100%',
      borderRadius: 0,
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: processTheme.bg,
      padding: almoxTheme.spacing.lg,
      gap: almoxTheme.spacing.lg,
      overflow: 'hidden',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: almoxTheme.spacing.md,
    },
    headerActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: almoxTheme.spacing.sm,
      alignItems: 'center',
    },
    darkButton: {
      minHeight: 36,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 13,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    darkButtonText: {
      fontSize: 13,
      fontWeight: '800',
    },
    darkTabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignSelf: 'flex-start',
      gap: 3,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: 4,
    },
    darkTabsCompact: {
      borderRadius: 12,
      padding: 3,
    },
    darkTab: {
      minHeight: 36,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    darkTabCompact: {
      minHeight: 31,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    darkTabPressed: {
      backgroundColor: processTheme.surfacePressed,
    },
    darkTabText: {
      color: processTheme.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    darkTabTextCompact: {
      fontSize: 11,
    },
    darkTabCount: {
      minWidth: 24,
      height: 18,
      borderRadius: 99,
      paddingHorizontal: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: processTheme.surfaceHi,
    },
    darkTabCountText: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '900',
    },
    darkSearch: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: processTheme.borderHi,
      backgroundColor: processTheme.surfaceHi,
      paddingHorizontal: 14,
    },
    darkSearchInput: {
      flex: 1,
      minHeight: 40,
      color: processTheme.text,
      fontSize: 13,
      outlineStyle: 'none' as any,
    },
    clearSearchButton: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: processTheme.surfaceHi,
    },
    clearSearchText: {
      color: processTheme.dim,
      fontSize: 16,
      lineHeight: 18,
      fontWeight: '800',
    },
    darkNotice: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: almoxTheme.spacing.md,
      paddingVertical: almoxTheme.spacing.sm,
      gap: 3,
    },
    darkNoticeTitle: {
      fontSize: 12,
      fontWeight: '900',
    },
    darkNoticeText: {
      color: processTheme.muted,
      fontSize: 12,
      lineHeight: 18,
    },
    darkEmptyState: {
      minHeight: 190,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: almoxTheme.spacing.xl,
      gap: almoxTheme.spacing.xs,
    },
    darkEmptyTitle: {
      color: processTheme.text,
      fontSize: 15,
      fontWeight: '900',
    },
    darkEmptyDescription: {
      color: processTheme.muted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
    },
    darkField: {
      flex: 1,
      minWidth: 220,
      gap: 5,
    },
    darkFieldLabel: {
      color: processTheme.muted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    darkInput: {
      width: '100%',
      minHeight: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: processTheme.borderHi,
      backgroundColor: 'rgba(255,255,255,0.06)',
      color: processTheme.text,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      outlineStyle: 'none' as any,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: almoxTheme.spacing.sm,
    },
    metricCard: {
      flex: 1,
      minWidth: 130,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    metricCardPressed: {
      backgroundColor: processTheme.surfacePressed,
    },
    metricLabel: {
      color: processTheme.muted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    metricValue: {
      fontSize: 28,
      fontWeight: '800',
      lineHeight: 31,
      fontFamily: almoxTheme.typography.mono,
    },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center',
    },
    searchWrap: {
      flex: 1,
      minWidth: 260,
    },
    filterPanel: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: 'rgba(255,255,255,0.03)',
      padding: 14,
    },
    filterBlock: {
      flex: 1,
      minWidth: 240,
      gap: 6,
    },
    filterLabel: {
      color: processTheme.muted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    table: {
      minWidth: PROCESS_TABLE_MIN_WIDTH,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: 'rgba(255,255,255,0.03)',
      overflow: 'hidden',
    },
    tableViewport: {
      width: '100%',
      overflow: 'hidden',
    },
    tableScroll: {
      width: '100%',
    },
    tableScrollContent: {
      flexGrow: 0,
    },
    tableHeader: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: processTheme.border,
      backgroundColor: processTheme.surface,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    tableHeadCell: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: processTheme.border,
      borderLeftWidth: 3,
      borderLeftColor: 'transparent',
      backgroundColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    criticalRow: {
      borderLeftColor: processTheme.critical,
      backgroundColor: 'rgba(255,68,68,0.045)',
    },
    canceledRow: {
      backgroundColor: 'rgba(150,164,197,0.06)',
    },
    overdueRow: {
      backgroundColor: 'rgba(255,95,95,0.035)',
    },
    tableCellBlock: {
      paddingRight: 12,
      gap: 5,
    },
    numberColumn: {
      width: 145,
    },
    productColumn: {
      flex: 1,
      minWidth: 305,
    },
    dateColumn: {
      width: 150,
    },
    timelineColumn: {
      width: 252,
    },
    statusColumn: {
      width: 125,
    },
    actionsColumn: {
      width: 115,
    },
    processNumber: {
      color: processTheme.text,
      fontSize: 12.5,
      fontWeight: '900',
      fontFamily: almoxTheme.typography.mono,
    },
    productName: {
      color: processTheme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    productMeta: {
      color: processTheme.muted,
      fontSize: 11,
    },
    dateText: {
      color: processTheme.muted,
      fontSize: 11.5,
      fontWeight: '800',
      fontFamily: almoxTheme.typography.mono,
    },
    actionList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
      paddingTop: 2,
    },
    iconButton: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: 'rgba(255,255,255,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonPressed: {
      backgroundColor: processTheme.surfacePressed,
    },
    tableFooter: {
      borderTopWidth: 1,
      borderTopColor: processTheme.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: 'rgba(255,255,255,0.02)',
    },
    tableFooterText: {
      color: processTheme.dim,
      fontSize: 11,
    },
    timeline: {
      gap: 6,
    },
    timelineItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: almoxTheme.spacing.xs,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginHorizontal: -8,
    },
    timelineItemDelayed: {
      borderColor: 'rgba(90,175,255,0.22)',
      backgroundColor: 'rgba(90,175,255,0.06)',
    },
    timelineItemNotified: {
      borderColor: 'rgba(177,151,252,0.22)',
    },
    timelineItemPressed: {
      backgroundColor: processTheme.surfacePressed,
    },
    timelineTextWrap: {
      flex: 1,
      gap: 1,
    },
    timelineLabel: {
      color: processTheme.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    timelineDate: {
      fontSize: 11,
      fontWeight: '800',
      fontFamily: almoxTheme.typography.mono,
    },
    timelineFlags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    timelineFlag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timelineFlagText: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '800',
    },
    pill: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      borderRadius: 99,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pillText: {
      fontSize: 9.5,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    legendText: {
      color: processTheme.dim,
      fontSize: 10.5,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(4,6,14,0.78)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: almoxTheme.spacing.lg,
    },
    modalOverlayCompact: {
      padding: almoxTheme.spacing.md,
    },
    modalCard: {
      width: '100%',
      maxWidth: 620,
      maxHeight: '92%',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: processTheme.borderHi,
      backgroundColor: processTheme.panel,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.48,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 20 },
      elevation: 12,
    },
    parcelasModalCard: {
      maxWidth: 760,
    },
    parcelasModalCardCompact: {
      maxWidth: 680,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: processTheme.border,
      backgroundColor: 'rgba(90,175,255,0.045)',
    },
    modalTitle: {
      color: processTheme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    modalHeaderCompact: {
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    modalSubtitle: {
      color: processTheme.muted,
      fontSize: 11,
      marginTop: 2,
    },
    modalCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surfaceHi,
    },
    modalBody: {
      paddingHorizontal: 22,
      paddingVertical: 20,
      gap: 14,
    },
    modalBodyScroll: {
      flexShrink: 1,
      minHeight: 0,
    },
    modalBodyCompact: {
      paddingHorizontal: 18,
      paddingVertical: 16,
      gap: 10,
    },
    lookupBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(34,211,160,0.35)',
      backgroundColor: 'rgba(34,211,160,0.08)',
      padding: 14,
      gap: 5,
    },
    lookupTitle: {
      color: processTheme.green,
      fontSize: 12,
      fontWeight: '900',
    },
    lookupName: {
      color: processTheme.text,
      fontSize: 13,
      fontWeight: '800',
    },
    lookupMeta: {
      color: processTheme.muted,
      fontSize: 12,
    },
    lockableFieldWrap: {
      position: 'relative',
    },
    lockedFieldOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 10,
      backgroundColor: 'rgba(7,10,17,0.06)',
    },
    lockedFieldOverlayPressed: {
      backgroundColor: 'rgba(90,175,255,0.1)',
    },
    lockedInputSurface: {
      opacity: 0.52,
    },
    lockedInput: {
      opacity: 0.52,
      borderColor: 'rgba(255,255,255,0.05)',
      backgroundColor: 'rgba(255,255,255,0.025)',
      color: processTheme.dim,
    },
    lockedPrefix: {
      borderColor: 'rgba(255,255,255,0.05)',
      backgroundColor: 'rgba(255,255,255,0.025)',
    },
    lockedPrefixText: {
      color: processTheme.dim,
    },
    fieldHelperText: {
      color: processTheme.dim,
      fontSize: 10,
      lineHeight: 14,
    },
    fieldHelperTextActive: {
      color: processTheme.blue,
      fontWeight: '800',
    },
    bionexoPrefix: {
      height: 42,
      paddingHorizontal: 12,
      borderTopLeftRadius: 10,
      borderBottomLeftRadius: 10,
      borderWidth: 1,
      borderRightWidth: 0,
      borderColor: processTheme.borderHi,
      backgroundColor: processTheme.surfaceHi,
      justifyContent: 'center',
    },
    bionexoPrefixText: {
      color: processTheme.accent,
      fontSize: 13,
      fontWeight: '900',
    },
    stepperButton: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonPrimary: {
      borderColor: 'rgba(0,212,160,0.36)',
      backgroundColor: 'rgba(0,212,160,0.13)',
    },
    stepperButtonText: {
      color: processTheme.text,
      fontSize: 19,
      fontWeight: '900',
    },
    stepperButtonTextPrimary: {
      color: processTheme.accent,
    },
    stepperValue: {
      minWidth: 26,
      color: processTheme.text,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '900',
      fontFamily: almoxTheme.typography.mono,
    },
    deadlinePreview: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: 16,
      gap: 7,
    },
    deadlineTitle: {
      color: processTheme.muted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    deadlineIndex: {
      width: 30,
      color: processTheme.accent,
      fontSize: 12,
      fontWeight: '900',
    },
    deadlineLabel: {
      flex: 1,
      color: processTheme.muted,
      fontSize: 12,
    },
    deadlineDate: {
      color: processTheme.accent,
      fontSize: 12,
      fontWeight: '900',
      fontFamily: almoxTheme.typography.mono,
    },
    deadlineEmpty: {
      color: processTheme.dim,
      fontSize: 12,
    },
    criticalToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    criticalToggleActive: {
      borderColor: 'rgba(255,68,68,0.35)',
      backgroundColor: 'rgba(255,68,68,0.08)',
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: processTheme.borderHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: {
      borderColor: processTheme.critical,
      backgroundColor: processTheme.critical,
    },
    criticalToggleText: {
      flex: 1,
      color: processTheme.muted,
      fontSize: 12,
      fontWeight: '800',
    },
    criticalToggleTextActive: {
      color: processTheme.critical,
    },
    parcelasSelector: {
      flexDirection: 'row',
      gap: 10,
      paddingRight: 4,
    },
    parcelasSelectorCompact: {
      gap: 8,
    },
    parcelaSelectorButton: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 154,
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    parcelaSelectorButtonCompact: {
      minWidth: 132,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    parcelaSelectorButtonActive: {
      borderColor: 'rgba(90,175,255,0.35)',
      backgroundColor: 'rgba(90,175,255,0.08)',
    },
    parcelaSelectorIndex: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    parcelaSelectorIndexText: {
      fontSize: 12,
      fontWeight: '900',
    },
    parcelaSelectorBody: {
      flex: 1,
      gap: 2,
    },
    parcelaSelectorTitle: {
      color: processTheme.text,
      fontSize: 12,
      fontWeight: '900',
    },
    parcelaSelectorMeta: {
      color: processTheme.muted,
      fontSize: 11,
      fontFamily: almoxTheme.typography.mono,
    },
    parcelaSelectorFlags: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    parcelaFocusCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: 'rgba(255,255,255,0.035)',
      padding: 16,
      gap: 14,
    },
    parcelaFocusCardCompact: {
      padding: 12,
      gap: 10,
    },
    parcelaFocusHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
    },
    parcelaFocusHeaderText: {
      flex: 1,
      minWidth: 220,
      gap: 3,
    },
    parcelaFocusEyebrow: {
      color: processTheme.blue,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    parcelaFocusTitle: {
      color: processTheme.text,
      fontSize: 16,
      fontWeight: '900',
    },
    parcelaBadgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    parcelaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surfaceHi,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    parcelaBadgeText: {
      color: processTheme.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    parcelaInfoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    parcelaInfoGridCompact: {
      gap: 8,
    },
    parcelaInfoCard: {
      flex: 1,
      minWidth: 150,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: 12,
      gap: 4,
    },
    parcelaInfoCardCompact: {
      minWidth: 132,
      padding: 10,
    },
    parcelaInfoLabel: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    parcelaInfoValue: {
      color: processTheme.text,
      fontSize: 13,
      fontWeight: '900',
      fontFamily: almoxTheme.typography.mono,
    },
    parcelaInfoHelper: {
      color: processTheme.muted,
      fontSize: 11,
      lineHeight: 16,
    },
    parcelaActionSection: {
      gap: 10,
    },
    parcelaActionTitle: {
      color: processTheme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    parcelaToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: 12,
    },
    parcelaToggleRowCompact: {
      padding: 10,
    },
    parcelaToggleText: {
      flex: 1,
      minWidth: 220,
      gap: 3,
    },
    parcelaToggleLabel: {
      color: processTheme.text,
      fontSize: 12,
      fontWeight: '900',
    },
    parcelaToggleHelper: {
      color: processTheme.muted,
      fontSize: 11,
      lineHeight: 16,
    },
    deliveryActionControls: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 10,
    },
    deliveryDateInlineWrap: {
      width: 140,
      gap: 4,
    },
    deliveryDateInlineLabel: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    inlineDateErrorText: {
      color: processTheme.amber,
      fontSize: 10,
      lineHeight: 14,
    },
    deliveryDateInput: {
      minHeight: 38,
      fontFamily: almoxTheme.typography.mono,
      textAlign: 'center',
    },
    delayStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    delayStepperButton: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    delayStepperButtonPrimary: {
      borderColor: 'rgba(90,175,255,0.36)',
      backgroundColor: 'rgba(90,175,255,0.13)',
    },
    delayStepperButtonText: {
      color: processTheme.text,
      fontSize: 18,
      fontWeight: '900',
    },
    delayStepperButtonTextPrimary: {
      color: processTheme.blue,
    },
    delayStepperValueWrap: {
      minWidth: 92,
      alignItems: 'center',
      gap: 1,
    },
    delayStepperValue: {
      color: processTheme.text,
      fontSize: 16,
      fontWeight: '900',
      fontFamily: almoxTheme.typography.mono,
    },
    delayStepperUnit: {
      color: processTheme.dim,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    delayResetButton: {
      minHeight: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    delayResetButtonText: {
      color: processTheme.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    parcelasModalActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 10,
    },
    parcelaOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: processTheme.border,
      backgroundColor: processTheme.surface,
      padding: 12,
    },
    parcelaOptionDelivered: {
      borderColor: 'rgba(34,211,160,0.35)',
      backgroundColor: 'rgba(34,211,160,0.08)',
    },
    parcelaTitle: {
      color: processTheme.text,
      fontSize: 13,
      fontWeight: '900',
    },
    parcelaSubtitle: {
      color: processTheme.muted,
      fontSize: 12,
    },
  }),
};
