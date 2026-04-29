import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAlmoxData } from '@/features/almox/almox-provider';
import { readCachedValue, writeCachedValue } from '@/features/almox/cache';
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { AlmoxTheme } from '@/features/almox/tokens';
import { useThemedStyles } from '@/features/almox/theme-provider';
import { CategoriaMaterial, MonthlyConsumptionRow } from '@/features/almox/types';
import { formatDecimal, matchesQuery, paginate } from '@/features/almox/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CONSUMO_COLUMNS_CACHE_KEY = 'almox:consumo:columns:v2';
const CONSUMO_COLUMNS_CACHE_TTL_MS = 365 * DAY_IN_MS;

type ConsumoColumnId =
  | 'product'
  | 'code'
  | 'currentStock'
  | 'projectedEndingStock'
  | 'currentSufficiency'
  | 'projectedSufficiency'
  | 'monthConsumption'
  | 'cmm'
  | 'percentCmm'
  | 'firstSnapshot';

type ConsumoColumnDefinition = {
  id: ConsumoColumnId;
  label: string;
  description: string;
  width: number;
  required?: boolean;
};

type ConsumoRenderedColumn = ConsumoColumnDefinition & {
  preview?: boolean;
};

type ConsumoColumnListKind = 'visible' | 'hidden';

type ConsumoColumnLayout = {
  visibleIds: ConsumoColumnId[];
  hiddenIds: ConsumoColumnId[];
};

const CONSUMO_COLUMN_OPTIONS: ConsumoColumnDefinition[] = [
  {
    id: 'product',
    label: 'Produto',
    description: 'Identificacao principal do item. Esta coluna fica sempre visivel.',
    width: 260,
    required: true,
  },
  {
    id: 'code',
    label: 'Código',
    description: 'Codigo do produto no almoxarifado.',
    width: 120,
  },
  {
    id: 'currentStock',
    label: 'Estoque atual',
    description: 'Quantidade atual registrada no estoque.',
    width: 110,
  },
  {
    id: 'projectedEndingStock',
    label: 'Est. fim mês',
    description: 'Estoque final projetado se o ritmo observado continuar até o fim do mês.',
    width: 110,
  },
  {
    id: 'currentSufficiency',
    label: 'Suf. atual',
    description: 'Cobertura em dias da fotografia atual do estoque.',
    width: 110,
  },
  {
    id: 'projectedSufficiency',
    label: 'Suf. fim mês',
    description: 'Cobertura em dias projetada para o fechamento do mês.',
    width: 110,
  },
  {
    id: 'monthConsumption',
    label: 'Consumo mês',
    description: 'Consumo acumulado no mês, somando apenas quedas diárias de estoque.',
    width: 110,
  },
  {
    id: 'cmm',
    label: 'CMM',
    description: 'Consumo medio mensal informado pelo SISCORE.',
    width: 110,
  },
  {
    id: 'percentCmm',
    label: '% CMM',
    description: 'Percentual do CMM já consumido no mês.',
    width: 110,
  },
  {
    id: 'firstSnapshot',
    label: '1º snapshot',
    description: 'Primeiro dia do mês com snapshot disponível para esse item.',
    width: 110,
  },
];

const DEFAULT_VISIBLE_CONSUMO_COLUMNS = CONSUMO_COLUMN_OPTIONS.map((column) => column.id);

function normalizeColumnIds(value: unknown) {
  const validIds = new Set<ConsumoColumnId>(CONSUMO_COLUMN_OPTIONS.map((column) => column.id));
  const uniqueIds = new Set<ConsumoColumnId>();
  const normalizedIds: ConsumoColumnId[] = [];

  if (!Array.isArray(value)) {
    return normalizedIds;
  }

  for (const rawId of value) {
    if (typeof rawId !== 'string') {
      continue;
    }

    const columnId = rawId as ConsumoColumnId;
    if (!validIds.has(columnId) || uniqueIds.has(columnId)) {
      continue;
    }

    uniqueIds.add(columnId);
    normalizedIds.push(columnId);
  }

  return normalizedIds;
}

function normalizeColumnLayout(value: unknown): ConsumoColumnLayout {
  const defaultOrder = CONSUMO_COLUMN_OPTIONS.map((column) => column.id);
  const requiredIds = CONSUMO_COLUMN_OPTIONS.filter((column) => column.required).map((column) => column.id);

  if (Array.isArray(value)) {
    const normalizedVisibleIds = normalizeColumnIds(value);
    const visibleIds = defaultOrder.filter(
      (columnId) => requiredIds.includes(columnId) || normalizedVisibleIds.includes(columnId)
    );
    const hiddenIds = defaultOrder.filter((columnId) => !visibleIds.includes(columnId));
    return { visibleIds, hiddenIds };
  }

  const rawValue =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  const requestedVisibleIds = normalizeColumnIds(rawValue?.visibleIds);
  const requestedHiddenIds = normalizeColumnIds(rawValue?.hiddenIds).filter(
    (columnId) => !requestedVisibleIds.includes(columnId)
  );

  const visibleIds = [
    ...requiredIds.filter((columnId) => !requestedVisibleIds.includes(columnId)),
    ...requestedVisibleIds,
  ];
  const hiddenIds = [...requestedHiddenIds];

  for (const columnId of defaultOrder) {
    if (!visibleIds.includes(columnId) && !hiddenIds.includes(columnId)) {
      hiddenIds.push(columnId);
    }
  }

  return {
    visibleIds: visibleIds.length > 0 ? visibleIds : DEFAULT_VISIBLE_CONSUMO_COLUMNS,
    hiddenIds,
  };
}

function moveColumnId(list: ConsumoColumnId[], columnId: ConsumoColumnId, targetIndex: number) {
  const nextList = list.filter((item) => item !== columnId);
  const safeIndex = Math.max(0, Math.min(targetIndex, nextList.length));
  nextList.splice(safeIndex, 0, columnId);
  return nextList;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const match = String(value).trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function diffInDays(start: Date, end: Date) {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_IN_MS);
}

function buildProjection(row: MonthlyConsumptionRow, referenceDate = new Date()) {
  const snapshotDate = parseIsoDate(row.data_snapshot_inicio);
  const consumoMes = toNumber(row.consumo_mes_ate_hoje);
  const estoqueAtual = toNumber(row.estoque_atual);
  const consumoMedio = toNumber(row.consumo_medio);
  const averageDailyConsumption = consumoMedio > 0 ? consumoMedio / 30 : 0;

  if (!snapshotDate || consumoMes <= 0) {
    return {
      projectedEndingStock: null as number | null,
      projectedSufficiencyDays: null as number | null,
    };
  }

  const today = startOfDay(referenceDate);
  const elapsedDays = Math.max(1, diffInDays(snapshotDate, today) + 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(0, 0, 0, 0);
  const remainingDays = Math.max(0, diffInDays(today, endOfMonth));
  const observedDailyConsumption = consumoMes / elapsedDays;
  const projectedEndingStock = Math.max(0, estoqueAtual - observedDailyConsumption * remainingDays);
  const projectedSufficiencyDays =
    averageDailyConsumption > 0 ? projectedEndingStock / averageDailyConsumption : null;

  return {
    projectedEndingStock,
    projectedSufficiencyDays,
  };
}

function rowIsHmsa(codigoUnidade: string) {
  return codigoUnidade.trim().toUpperCase() === 'HMSASOUL';
}

function normalizeCategoria(value: MonthlyConsumptionRow['categoria_material']): CategoriaMaterial {
  return value === 'material_farmacologico' ? 'material_farmacologico' : 'material_hospitalar';
}

function renderColumnContent({
  row,
  columnId,
  projection,
  categoriaLabel,
  styles,
}: {
  row: MonthlyConsumptionRow;
  columnId: ConsumoColumnId;
  projection: ReturnType<typeof buildProjection>;
  categoriaLabel: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const consumoMes = toNumber(row.consumo_mes_ate_hoje);
  const consumoMedio = toNumber(row.consumo_medio);
  const percentual = toNumber(row.percentual_consumido) * 100;
  const estoqueAtual = toNumber(row.estoque_atual);
  const sufAtual = toNumber(row.suficiencia_em_dias);

  switch (columnId) {
    case 'product':
      return (
        <View style={styles.productCell}>
          <Text style={styles.productName} numberOfLines={1}>
            {row.nome_produto ?? '—'}
          </Text>
          {categoriaLabel ? <Text style={styles.productMeta}>{categoriaLabel}</Text> : null}
        </View>
      );
    case 'code':
      return <Text style={styles.tableCell}>{row.codigo_produto}</Text>;
    case 'currentStock':
      return <Text style={styles.tableCell}>{formatDecimal(estoqueAtual, 0)}</Text>;
    case 'projectedEndingStock':
      return (
        <Text
          style={[
            styles.tableCell,
            projection.projectedSufficiencyDays != null && projection.projectedSufficiencyDays <= 30
              ? styles.cellWarning
              : null,
          ]}>
          {projection.projectedEndingStock == null ? '—' : formatDecimal(projection.projectedEndingStock, 0)}
        </Text>
      );
    case 'currentSufficiency':
      return <Text style={[styles.tableCell, sufAtual <= 30 ? styles.cellWarning : null]}>{formatDecimal(sufAtual)}</Text>;
    case 'projectedSufficiency':
      return (
        <Text
          style={[
            styles.tableCell,
            projection.projectedSufficiencyDays != null && projection.projectedSufficiencyDays <= 30
              ? styles.cellWarning
              : null,
          ]}>
          {projection.projectedSufficiencyDays == null ? '—' : formatDecimal(projection.projectedSufficiencyDays)}
        </Text>
      );
    case 'monthConsumption':
      return <Text style={[styles.tableCell, styles.cellWarning]}>{formatDecimal(consumoMes, 0)}</Text>;
    case 'cmm':
      return <Text style={styles.tableCell}>{formatDecimal(consumoMedio, 0)}</Text>;
    case 'percentCmm':
      return <Text style={[styles.tableCell, styles.cellWarning]}>{`${formatDecimal(percentual, 0)}%`}</Text>;
    case 'firstSnapshot':
      return (
        <Text style={styles.tableCell}>
          {row.data_snapshot_inicio ? new Date(row.data_snapshot_inicio).toLocaleDateString('pt-BR') : '—'}
        </Text>
      );
    default:
      return null;
  }
}

export default function ConsumoScreen() {
  const styles = useThemedStyles(createStyles);
  const {
    categoryFilter,
    syncingBase,
    syncBase,
    refreshing,
    syncError,
    syncNotice,
    loading,
    error,
    warning,
    monthlyConsumptionRows,
    refresh,
  } = useAlmoxData();
  const headerScrollRef = useRef<ScrollView>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [isColumnsEditorOpen, setColumnsEditorOpen] = useState(false);
  const [columnLayout, setColumnLayout] = useState<ConsumoColumnLayout>(() => {
    const cached = readCachedValue<ConsumoColumnLayout | ConsumoColumnId[]>(
      CONSUMO_COLUMNS_CACHE_KEY,
      CONSUMO_COLUMNS_CACHE_TTL_MS
    );
    return normalizeColumnLayout(cached?.value);
  });
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  useEffect(() => {
    writeCachedValue(CONSUMO_COLUMNS_CACHE_KEY, columnLayout);
  }, [columnLayout]);

  const filteredRows = useMemo(() => {
    const hmsaRows = monthlyConsumptionRows.filter((row) => rowIsHmsa(row.codigo_unidade));
    const categorizedRows =
      categoryFilter === 'todos'
        ? hmsaRows
        : hmsaRows.filter((row) => normalizeCategoria(row.categoria_material) === categoryFilter);

    const withConsumption = categorizedRows.filter((row) => {
      const consumoMedio = toNumber(row.consumo_medio);
      const consumoMes = toNumber(row.consumo_mes_ate_hoje);
      return consumoMedio > 0 && consumoMes > consumoMedio;
    });

    const matched = withConsumption.filter((row) =>
      matchesQuery([row.nome_produto ?? undefined, row.codigo_produto], deferredSearch)
    );

    return matched.sort((left, right) => {
      const leftProjection = buildProjection(left);
      const rightProjection = buildProjection(right);
      const leftProjectedSufficiency =
        leftProjection.projectedSufficiencyDays == null ? Number.POSITIVE_INFINITY : leftProjection.projectedSufficiencyDays;
      const rightProjectedSufficiency =
        rightProjection.projectedSufficiencyDays == null ? Number.POSITIVE_INFINITY : rightProjection.projectedSufficiencyDays;
      if (leftProjectedSufficiency !== rightProjectedSufficiency) {
        return leftProjectedSufficiency - rightProjectedSufficiency;
      }
      const leftPerc = toNumber(left.percentual_consumido);
      const rightPerc = toNumber(right.percentual_consumido);
      return rightPerc - leftPerc;
    });
  }, [monthlyConsumptionRows, categoryFilter, deferredSearch]);

  const monthlyConsumptionWarning =
    warning && warning.includes('a apuração de consumo do mês') ? warning : null;
  const hasAnySnapshot = monthlyConsumptionRows.some((row) => row.data_snapshot_inicio != null);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = paginate(filteredRows, safePage, pageSize);
  const visibleColumns = useMemo(() => {
    const lookup = new Set(columnLayout.visibleIds);
    return columnLayout.visibleIds
      .map((columnId) => CONSUMO_COLUMN_OPTIONS.find((column) => column.id === columnId))
      .filter((column): column is ConsumoColumnDefinition => !!column && lookup.has(column.id));
  }, [columnLayout.visibleIds]);
  const hiddenColumns = useMemo(
    () =>
      columnLayout.hiddenIds
        .map((columnId) => CONSUMO_COLUMN_OPTIONS.find((column) => column.id === columnId))
        .filter((column): column is ConsumoColumnDefinition => !!column),
    [columnLayout.hiddenIds]
  );
  const renderedColumns = useMemo<ConsumoRenderedColumn[]>(
    () =>
      isColumnsEditorOpen
        ? [
            ...visibleColumns,
            ...hiddenColumns.map((column) => ({
              ...column,
              preview: true,
            })),
          ]
        : visibleColumns,
    [hiddenColumns, isColumnsEditorOpen, visibleColumns]
  );
  const tableMinWidth = useMemo(
    () => renderedColumns.reduce((sum, column) => sum + column.width, 0),
    [renderedColumns]
  );
  const webStickyHeaderStyle =
    Platform.OS === 'web'
      ? ({ position: 'sticky', top: 0, zIndex: 8 } as const)
      : null;
  const webPreviewBlurStyle = Platform.OS === 'web' ? ({ filter: 'blur(0.75px)' } as const) : null;

  function moveColumn(columnId: ConsumoColumnId, targetList: ConsumoColumnListKind, targetIndex: number) {
    const column = CONSUMO_COLUMN_OPTIONS.find((item) => item.id === columnId);
    if (column?.required && targetList === 'hidden') {
      return;
    }

    setColumnLayout((current) => {
      const nextVisibleIds = current.visibleIds.filter((id) => id !== columnId);
      const nextHiddenIds = current.hiddenIds.filter((id) => id !== columnId);

      if (targetList === 'visible') {
        return normalizeColumnLayout({
          visibleIds: moveColumnId(nextVisibleIds, columnId, targetIndex),
          hiddenIds: nextHiddenIds,
        });
      }

      return normalizeColumnLayout({
        visibleIds: nextVisibleIds,
        hiddenIds: moveColumnId(nextHiddenIds, columnId, targetIndex),
      });
    });
  }

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle="Produtos HMSA que já ultrapassaram o consumo médio mensal antes do mês terminar."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={loading || refreshing ? 'Atualizando...' : 'Recarregar'}
              icon="refresh"
              tone="neutral"
              onPress={() => void refresh()}
              disabled={loading || refreshing}
            />
            <ActionButton
              label={syncingBase ? 'Sincronizando...' : 'Atualizar estoque'}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase('estoque')}
              disabled={refreshing || syncingBase}
            />
          </View>
        }
      />

      {error ? (
        <InfoBanner title="Falha ao carregar apuração" description={error} tone="danger" />
      ) : null}

      {warning ? (
        <InfoBanner title="Atualização parcial da base" description={warning} tone="warning" />
      ) : null}

      {syncError ? (
        <InfoBanner title="Falha ao sincronizar com o SISCORE" description={syncError} tone="danger" />
      ) : null}

      {syncNotice ? <InfoBanner title="Sincronizacao da base" description={syncNotice} tone="info" /> : null}

      {!loading && !error && !monthlyConsumptionWarning && !hasAnySnapshot ? (
        <InfoBanner
          title="Snapshot diário ainda não disponível"
          description="A apuração soma as quedas diárias de estoque desde o primeiro snapshot do mês e ignora aumentos por entrada. Assim que a rotina diária gravar o primeiro snapshot, os dados começam a aparecer aqui."
          tone="warning"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Itens acima do consumo médio"
          subtitle={`${filteredRows.length} produto(s) com consumo acumulado acima da média mensal, ordenados pela menor suficiência projetada ao fim do mês`}
          icon="consumo"
        />
        <View style={styles.toolbarRow}>
          <View style={styles.searchGrow}>
            <SearchField
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Buscar produto ou código..."
            />
          </View>
          <ActionButton
            label={isColumnsEditorOpen ? 'Fechar edição' : 'Editar colunas'}
            icon="edit"
            tone="neutral"
            onPress={() => setColumnsEditorOpen((current) => !current)}
          />
        </View>

        {loading ? (
          <EmptyState title="Carregando apuração" description="Consultando snapshot do mês e estoque atual." />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title={monthlyConsumptionWarning ? 'Apuração indisponível' : 'Nenhum item em alerta'}
            description={
              monthlyConsumptionWarning
                ? 'A apuração mensal não pôde ser atualizada nesta carga. O app manteve a última versão válida quando disponível.'
                : hasAnySnapshot
                ? 'Nenhum produto ultrapassou o consumo médio mensal até o momento.'
                : 'Aguardando o primeiro snapshot do mês para iniciar a comparação.'
            }
          />
        ) : (
          <View style={styles.tableOuter}>
            <View style={[styles.tableStickyHeader, webStickyHeaderStyle]}>
              <ScrollView
                ref={headerScrollRef}
                horizontal
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}>
                <View style={[styles.tableWrap, { minWidth: tableMinWidth }]}>
                  <View style={styles.tableHeader}>
                    {renderedColumns.map((column) => {
                      const visibleIndex = visibleColumns.findIndex((item) => item.id === column.id);
                      const canMoveLeft = visibleIndex > 0;
                      const canMoveRight = visibleIndex > -1 && visibleIndex < visibleColumns.length - 1;
                      const isPreview = column.preview === true;
                      const isPreviewStart = isPreview && hiddenColumns[0]?.id === column.id;

                      return (
                        <View
                          key={column.id}
                          style={[
                            styles.tableHeadColumn,
                            getColumnStyle(styles, column.id),
                            isPreview ? styles.previewColumn : null,
                            isPreviewStart ? styles.previewColumnStart : null,
                          ]}>
                          <Text style={[styles.tableHeadCell, isPreview ? styles.previewHeadCell : null]}>
                            {column.label}
                          </Text>
                          {isPreview ? (
                            <View style={styles.previewHeaderMeta}>
                              <Text style={styles.previewHeaderHint}>Oculta</Text>
                              <HeaderActionButton
                                icon="plus"
                                label={`Adicionar ${column.label} de volta`}
                                onPress={() =>
                                  moveColumn(column.id, 'visible', Number.MAX_SAFE_INTEGER)
                                }
                              />
                            </View>
                          ) : isColumnsEditorOpen && !column.required ? (
                            <View style={styles.headerColumnActions}>
                              <HeaderActionButton
                                icon="chevronLeft"
                                label="Mover à esquerda"
                                disabled={!canMoveLeft}
                                onPress={() => moveColumn(column.id, 'visible', visibleIndex - 1)}
                              />
                              <HeaderActionButton
                                icon="chevronRight"
                                label="Mover à direita"
                                disabled={!canMoveRight}
                                onPress={() => moveColumn(column.id, 'visible', visibleIndex + 1)}
                              />
                              <HeaderActionButton
                                icon="blocked"
                                label="Ocultar coluna"
                                onPress={() => moveColumn(column.id, 'hidden', 0)}
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(event) =>
                headerScrollRef.current?.scrollTo({
                  x: event.nativeEvent.contentOffset.x,
                  animated: false,
                })
              }>
              <View style={[styles.tableWrap, { minWidth: tableMinWidth }]}>
                {pageRows.map((row) => {
                  const projection = buildProjection(row);
                  const categoriaLabel =
                    categoryFilter === 'todos'
                      ? getCategoriaMaterialLabel(normalizeCategoria(row.categoria_material))
                      : null;

                  return (
                    <View key={`${row.codigo_unidade}-${row.codigo_produto}`} style={styles.tableRow}>
                      {renderedColumns.map((column) => {
                        const isPreview = column.preview === true;
                        const isPreviewStart = isPreview && hiddenColumns[0]?.id === column.id;

                        return (
                          <View
                            key={column.id}
                            style={[
                              styles.cellBox,
                              getColumnStyle(styles, column.id),
                              isPreview ? styles.previewColumn : null,
                              isPreviewStart ? styles.previewColumnStart : null,
                            ]}>
                            <View
                              style={[
                                isPreview ? styles.previewContent : null,
                                isPreview ? webPreviewBlurStyle : null,
                              ]}>
                              {renderColumnContent({
                                row,
                                columnId: column.id,
                                projection,
                                categoriaLabel,
                                styles,
                              })}
                            </View>
                            {isPreview ? <View pointerEvents="none" style={styles.previewWash} /> : null}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}
        {filteredRows.length > 0 ? (
          <PaginationFooter
            totalItems={filteredRows.length}
            pageItemsCount={pageRows.length}
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            itemLabel="produto(s)"
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        ) : null}
      </SectionCard>
    </ScreenScrollView>
  );
}

function HeaderActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevronLeft' | 'chevronRight' | 'blocked' | 'plus';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerActionButton,
        disabled ? styles.headerActionButtonDisabled : null,
        pressed && !disabled ? styles.headerActionButtonPressed : null,
      ]}>
      <AppIcon name={icon} size={12} color={disabled ? '#63738f' : '#d9e2f3'} />
    </Pressable>
  );
}

function getColumnStyle(styles: ReturnType<typeof createStyles>, columnId: ConsumoColumnId) {
  if (columnId === 'product') {
    return styles.productColumn;
  }

  if (columnId === 'code') {
    return styles.codeColumn;
  }

  return styles.smallColumn;
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchGrow: {
    flex: 1,
    minWidth: 280,
  },
  tableWrap: {
    minWidth: 0,
  },
  tableOuter: {
    gap: 0,
  },
  tableStickyHeader: {
    backgroundColor: tokens.colors.surface,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.lineStrong,
    alignItems: 'flex-start',
  },
  tableHeadColumn: {
    gap: 6,
  },
  tableHeadCell: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  headerColumnActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  previewHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  previewHeaderHint: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerActionButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionButtonDisabled: {
    opacity: 0.42,
  },
  headerActionButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.line,
  },
  tableCell: {
    color: tokens.colors.text,
    fontSize: 13,
  },
  cellBox: {
    minHeight: 72,
    justifyContent: 'center',
    position: 'relative',
  },
  cellWarning: {
    color: '#b4234a',
    fontWeight: '700',
  },
  productColumn: {
    width: 260,
    paddingRight: tokens.spacing.md,
  },
  codeColumn: {
    width: 120,
  },
  smallColumn: {
    width: 110,
  },
  productCell: {
    gap: 4,
    justifyContent: 'center',
  },
  previewColumn: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  previewColumnStart: {
    borderLeftWidth: 1,
    borderLeftColor: tokens.colors.lineStrong,
    paddingLeft: tokens.spacing.md,
  },
  previewHeadCell: {
    color: tokens.colors.textSoft,
  },
  previewContent: {
    opacity: 0.5,
  },
  previewWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 14, 20, 0.08)',
  },
  productName: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  productMeta: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  columnToggleDisabled: {
    opacity: 0.78,
  },
});

