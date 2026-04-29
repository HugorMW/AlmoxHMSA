import type { CSSProperties } from 'react';
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import {
  closestCenter,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createColumnHelper, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable } from '@tanstack/react-table';

import { useAlmoxData } from '@/features/almox/almox-provider';
import { readCachedValue, writeCachedValue } from '@/features/almox/cache';
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  PageHeader,
  type PageSize,
  PaginationFooter,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { useAppTheme, useThemedStyles } from '@/features/almox/theme-provider';
import type { AlmoxTheme } from '@/features/almox/tokens';
import type { CategoriaMaterial, MonthlyConsumptionRow } from '@/features/almox/types';
import { formatDecimal, matchesQuery, paginate } from '@/features/almox/utils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CONSUMO_COLUMNS_CACHE_KEY = 'almox:consumo:columns:v2';
const CONSUMO_COLUMNS_CACHE_TTL_MS = 365 * DAY_IN_MS;
const DEFAULT_SORTING: SortingState = [
  { id: 'projectedSufficiency', desc: false },
  { id: 'percentCmm', desc: true },
];

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
  numeric?: boolean;
};

type ConsumoRenderedColumn = ConsumoColumnDefinition & {
  preview?: boolean;
};

type ConsumoColumnLayout = {
  visibleIds: ConsumoColumnId[];
  hiddenIds: ConsumoColumnId[];
};

const CONSUMO_COLUMN_OPTIONS: ConsumoColumnDefinition[] = [
  {
    id: 'product',
    label: 'Produto',
    description: 'Identificacao principal do item. Esta coluna fica sempre visivel.',
    width: 320,
    required: true,
  },
  {
    id: 'code',
    label: 'Código',
    description: 'Codigo do produto no almoxarifado.',
    width: 124,
  },
  {
    id: 'currentStock',
    label: 'Estoque atual',
    description: 'Quantidade atual registrada no estoque.',
    width: 124,
    numeric: true,
  },
  {
    id: 'projectedEndingStock',
    label: 'Est. fim mês',
    description: 'Estoque final projetado se o ritmo observado continuar até o fim do mês.',
    width: 124,
    numeric: true,
  },
  {
    id: 'currentSufficiency',
    label: 'Suf. atual',
    description: 'Cobertura em dias da fotografia atual do estoque.',
    width: 118,
    numeric: true,
  },
  {
    id: 'projectedSufficiency',
    label: 'Suf. fim mês',
    description: 'Cobertura em dias projetada para o fechamento do mês.',
    width: 124,
    numeric: true,
  },
  {
    id: 'monthConsumption',
    label: 'Consumo mês',
    description: 'Consumo acumulado no mês, somando apenas quedas diárias de estoque.',
    width: 128,
    numeric: true,
  },
  {
    id: 'cmm',
    label: 'CMM',
    description: 'Consumo medio mensal informado pelo SISCORE.',
    width: 110,
    numeric: true,
  },
  {
    id: 'percentCmm',
    label: '% CMM',
    description: 'Percentual do CMM já consumido no mês.',
    width: 102,
    numeric: true,
  },
  {
    id: 'firstSnapshot',
    label: '1º snapshot',
    description: 'Primeiro dia do mês com snapshot disponível para esse item.',
    width: 124,
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

function getColumnDefinition(columnId: ConsumoColumnId) {
  return CONSUMO_COLUMN_OPTIONS.find((column) => column.id === columnId);
}

function buildGridTemplate(columns: ConsumoRenderedColumn[]) {
  return columns.map((column) => `${column.width}px`).join(' ');
}

function buildWebStyles(tokens: AlmoxTheme) {
  const numericTextBase: CSSProperties = {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };

  return {
    tableShell: {
      border: `1px solid ${tokens.colors.lineStrong}`,
      borderRadius: 24,
      background: tokens.colors.surface,
      boxShadow: '0 18px 36px rgba(4, 10, 20, 0.18)',
      overflow: 'hidden',
    } satisfies CSSProperties,
    tableScroller: {
      overflowX: 'auto',
      overflowY: 'visible',
    } satisfies CSSProperties,
    tableViewport: {
      minWidth: '100%',
    } satisfies CSSProperties,
    headerRow: {
      position: 'sticky',
      top: 0,
      zIndex: 5,
      display: 'grid',
      alignItems: 'stretch',
      background: tokens.colors.surface,
      borderBottom: `1px solid ${tokens.colors.lineStrong}`,
      boxShadow: '0 10px 20px rgba(4, 10, 20, 0.12)',
    } satisfies CSSProperties,
    bodyRow: {
      display: 'grid',
      alignItems: 'stretch',
      minHeight: 74,
      borderBottom: `1px solid ${tokens.colors.line}`,
      background: tokens.colors.surface,
    } satisfies CSSProperties,
    headerCell: {
      padding: '14px 16px 12px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 78,
      boxSizing: 'border-box',
    } satisfies CSSProperties,
    headerCellEditable: {
      cursor: 'grab',
      userSelect: 'none',
    } satisfies CSSProperties,
    headerCellDragging: {
      cursor: 'grabbing',
      boxShadow: '0 16px 32px rgba(4, 10, 20, 0.22)',
      background: tokens.colors.surfaceStrong,
    } satisfies CSSProperties,
    bodyCell: {
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      minHeight: 74,
      position: 'relative',
    } satisfies CSSProperties,
    bodyCellDragging: {
      zIndex: 4,
      boxShadow: '0 12px 24px rgba(4, 10, 20, 0.16)',
      background: tokens.colors.surfaceStrong,
    } satisfies CSSProperties,
    productBodyCell: {
      alignItems: 'stretch',
    } satisfies CSSProperties,
    previewCell: {
      background: tokens.colors.surfaceMuted,
      borderLeft: `1px solid ${tokens.colors.lineStrong}`,
    } satisfies CSSProperties,
    previewContent: {
      opacity: 0.52,
      filter: 'blur(0.75px)',
    } satisfies CSSProperties,
    previewLabel: {
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.35,
    } satisfies CSSProperties,
    cellText: {
      color: tokens.colors.text,
      fontSize: 13,
      lineHeight: '18px',
      margin: 0,
    } satisfies CSSProperties,
    numericText: numericTextBase,
    warningText: {
      color: '#b4234a',
      fontWeight: 700,
    } satisfies CSSProperties,
    productCell: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 4,
      minWidth: 0,
    } satisfies CSSProperties,
    productName: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: 700,
      lineHeight: '18px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } satisfies CSSProperties,
    productMeta: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: '15px',
    } satisfies CSSProperties,
    headerTitleButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      width: '100%',
      padding: 0,
      border: 0,
      background: 'transparent',
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      textAlign: 'left',
    } satisfies CSSProperties,
    headerTitleText: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: 700,
      lineHeight: '16px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    } satisfies CSSProperties,
    headerTitleTextActive: {
      color: tokens.colors.text,
    } satisfies CSSProperties,
    headerMetaRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    } satisfies CSSProperties,
    headerActionRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
      minHeight: 24,
    } satisfies CSSProperties,
    dragHint: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    } satisfies CSSProperties,
    iconButton: {
      width: 24,
      height: 24,
      borderRadius: 999,
      border: `1px solid ${tokens.colors.lineStrong}`,
      background: tokens.colors.surfaceStrong,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: tokens.colors.text,
      padding: 0,
      boxSizing: 'border-box',
    } satisfies CSSProperties,
    ghostButton: {
      width: 26,
      height: 26,
    } satisfies CSSProperties,
    sortBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    } satisfies CSSProperties,
    editorHint: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: '18px',
      marginTop: 12,
    } satisfies CSSProperties,
  };
}

function renderCellContent({
  row,
  columnId,
  categoriaLabel,
  styles,
}: {
  row: MonthlyConsumptionRow;
  columnId: ConsumoColumnId;
  categoriaLabel: string | null;
  styles: ReturnType<typeof buildWebStyles>;
}) {
  const projection = buildProjection(row);
  const projectedWarning =
    projection.projectedSufficiencyDays != null && projection.projectedSufficiencyDays <= 30;
  const currentSufficiency = toNumber(row.suficiencia_em_dias);
  const isCurrentWarning = currentSufficiency <= 30;
  const textBase = styles.cellText;

  if (columnId === 'product') {
    return (
      <div style={styles.productCell}>
        <div style={styles.productName}>{row.nome_produto ?? '—'}</div>
        {categoriaLabel ? <div style={styles.productMeta}>{categoriaLabel}</div> : null}
      </div>
    );
  }

  if (columnId === 'code') {
    return <span style={textBase}>{row.codigo_produto}</span>;
  }

  if (columnId === 'currentStock') {
    return (
      <span style={{ ...textBase, ...styles.numericText }}>
        {formatDecimal(toNumber(row.estoque_atual), 0)}
      </span>
    );
  }

  if (columnId === 'projectedEndingStock') {
    return (
      <span
        style={{
          ...textBase,
          ...styles.numericText,
          ...(projectedWarning ? styles.warningText : null),
        }}>
        {projection.projectedEndingStock == null
          ? '—'
          : formatDecimal(projection.projectedEndingStock, 0)}
      </span>
    );
  }

  if (columnId === 'currentSufficiency') {
    return (
      <span
        style={{
          ...textBase,
          ...styles.numericText,
          ...(isCurrentWarning ? styles.warningText : null),
        }}>
        {formatDecimal(currentSufficiency)}
      </span>
    );
  }

  if (columnId === 'projectedSufficiency') {
    return (
      <span
        style={{
          ...textBase,
          ...styles.numericText,
          ...(projectedWarning ? styles.warningText : null),
        }}>
        {projection.projectedSufficiencyDays == null
          ? '—'
          : formatDecimal(projection.projectedSufficiencyDays)}
      </span>
    );
  }

  if (columnId === 'monthConsumption') {
    return (
      <span style={{ ...textBase, ...styles.numericText, ...styles.warningText }}>
        {formatDecimal(toNumber(row.consumo_mes_ate_hoje), 0)}
      </span>
    );
  }

  if (columnId === 'cmm') {
    return (
      <span style={{ ...textBase, ...styles.numericText }}>
        {formatDecimal(toNumber(row.consumo_medio), 0)}
      </span>
    );
  }

  if (columnId === 'percentCmm') {
    return (
      <span style={{ ...textBase, ...styles.numericText, ...styles.warningText }}>
        {`${formatDecimal(toNumber(row.percentual_consumido) * 100, 0)}%`}
      </span>
    );
  }

  if (columnId === 'firstSnapshot') {
    return (
      <span style={{ ...textBase, ...styles.numericText }}>
        {row.data_snapshot_inicio
          ? new Date(row.data_snapshot_inicio).toLocaleDateString('pt-BR')
          : '—'}
      </span>
    );
  }

  return null;
}

function SortIndicator({ direction, styles }: { direction: false | 'asc' | 'desc'; styles: ReturnType<typeof buildWebStyles> }) {
  const iconName = direction === 'asc' ? 'chevronUp' : direction === 'desc' ? 'chevronDown' : null;
  return (
    <span style={styles.sortBadge}>
      {direction ? (
        <>
          <AppIcon name={iconName!} size={14} />
          <span>{direction === 'asc' ? 'Menor' : 'Maior'}</span>
        </>
      ) : (
        <span>Ordenar</span>
      )}
    </span>
  );
}

function HeaderIconButton({
  label,
  onPress,
  children,
  styles,
  variant,
  stopPropagation,
}: {
  label: string;
  onPress?: () => void;
  children: React.ReactNode;
  styles: ReturnType<typeof buildWebStyles>;
  variant?: 'default' | 'ghost';
  stopPropagation?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
      onMouseDown={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        onPress?.();
      }}
      style={{
        ...styles.iconButton,
        ...(variant === 'ghost' ? styles.ghostButton : null),
      }}>
      {children}
    </button>
  );
}

function SortableHeaderCell({
  column,
  sortDirection,
  isEditing,
  isDraggingEnabled,
  onSort,
  onHide,
  styles,
}: {
  column: ConsumoColumnDefinition;
  sortDirection: false | 'asc' | 'desc';
  isEditing: boolean;
  isDraggingEnabled: boolean;
  onSort: () => void;
  onHide: () => void;
  styles: ReturnType<typeof buildWebStyles>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: !isDraggingEnabled,
  });
  const dragBindings = isEditing && isDraggingEnabled ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      {...dragBindings}
      style={{
        ...styles.headerCell,
        ...(isEditing && isDraggingEnabled ? styles.headerCellEditable : null),
        ...(isDragging ? styles.headerCellDragging : null),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 7 : 1,
      }}>
      {isEditing ? (
        <>
          <div style={styles.headerTitleButton} title={column.description}>
            <span style={styles.headerTitleText}>{column.label}</span>
            <span style={styles.dragHint}>
              <AppIcon name="chevronLeft" size={12} />
              <span>Arrastar horizontal</span>
              <AppIcon name="chevronRight" size={12} />
            </span>
          </div>
          <div style={styles.headerActionRow}>
            {!column.required ? (
              <HeaderIconButton
                label={`Ocultar ${column.label}`}
                onPress={onHide}
                styles={styles}
                stopPropagation>
                <AppIcon name="blocked" size={13} />
              </HeaderIconButton>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <button type="button" onClick={onSort} style={styles.headerTitleButton} title={column.description}>
            <span
              style={{
                ...styles.headerTitleText,
                ...(sortDirection ? styles.headerTitleTextActive : null),
              }}>
              {column.label}
            </span>
            <SortIndicator direction={sortDirection} styles={styles} />
          </button>

          <div style={styles.headerActionRow}>
            <div style={{ minWidth: 1 }} />
          </div>
        </>
      )}
    </div>
  );
}

const columnHelper = createColumnHelper<MonthlyConsumptionRow>();

export default function ConsumoScreenWeb() {
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const webStyles = useMemo(() => buildWebStyles(tokens), [tokens]);
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

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [isColumnsEditorOpen, setColumnsEditorOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [draggingColumnId, setDraggingColumnId] = useState<ConsumoColumnId | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [columnLayout, setColumnLayout] = useState<ConsumoColumnLayout>(() => {
    const cached = readCachedValue<ConsumoColumnLayout | ConsumoColumnId[]>(
      CONSUMO_COLUMNS_CACHE_KEY,
      CONSUMO_COLUMNS_CACHE_TTL_MS
    );
    return normalizeColumnLayout(cached?.value);
  });

  const deferredSearch = useDeferredValue(search);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, deferredSearch, sorting]);

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

    return withConsumption.filter((row) =>
      matchesQuery([row.nome_produto ?? undefined, row.codigo_produto], deferredSearch)
    );
  }, [monthlyConsumptionRows, categoryFilter, deferredSearch]);

  const monthlyConsumptionWarning =
    warning && warning.includes('a apuração de consumo do mês') ? warning : null;
  const hasAnySnapshot = monthlyConsumptionRows.some((row) => row.data_snapshot_inicio != null);

  const visibleColumns = useMemo(
    () =>
      columnLayout.visibleIds
        .map((columnId) => getColumnDefinition(columnId))
        .filter((column): column is ConsumoColumnDefinition => !!column),
    [columnLayout.visibleIds]
  );
  const hiddenColumns = useMemo(
    () =>
      columnLayout.hiddenIds
        .map((columnId) => getColumnDefinition(columnId))
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

  const columnOrder = useMemo(
    () => [...columnLayout.visibleIds, ...columnLayout.hiddenIds],
    [columnLayout.hiddenIds, columnLayout.visibleIds]
  );
  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        CONSUMO_COLUMN_OPTIONS.map((column) => [column.id, columnLayout.visibleIds.includes(column.id)])
      ),
    [columnLayout.visibleIds]
  );

  const tableColumns = useMemo(
    () => [
      columnHelper.accessor((row) => row.nome_produto ?? '', { id: 'product' }),
      columnHelper.accessor((row) => row.codigo_produto, { id: 'code' }),
      columnHelper.accessor((row) => toNumber(row.estoque_atual), { id: 'currentStock' }),
      columnHelper.accessor((row) => buildProjection(row).projectedEndingStock ?? Number.POSITIVE_INFINITY, {
        id: 'projectedEndingStock',
      }),
      columnHelper.accessor((row) => toNumber(row.suficiencia_em_dias), { id: 'currentSufficiency' }),
      columnHelper.accessor((row) => buildProjection(row).projectedSufficiencyDays ?? Number.POSITIVE_INFINITY, {
        id: 'projectedSufficiency',
      }),
      columnHelper.accessor((row) => toNumber(row.consumo_mes_ate_hoje), { id: 'monthConsumption' }),
      columnHelper.accessor((row) => toNumber(row.consumo_medio), { id: 'cmm' }),
      columnHelper.accessor((row) => toNumber(row.percentual_consumido) * 100, { id: 'percentCmm' }),
      columnHelper.accessor((row) => parseIsoDate(row.data_snapshot_inicio)?.getTime() ?? Number.POSITIVE_INFINITY, {
        id: 'firstSnapshot',
      }),
    ],
    []
  );

  const table = useReactTable({
    data: filteredRows,
    columns: tableColumns,
    state: {
      sorting,
      columnOrder,
      columnVisibility,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = paginate(sortedRows, safePage, pageSize);
  const tableMinWidth = renderedColumns.reduce((sum, column) => sum + column.width, 0);
  const gridTemplateColumns = buildGridTemplate(renderedColumns);

  function moveColumn(columnId: ConsumoColumnId, targetList: 'visible' | 'hidden', targetIndex: number) {
    const column = getColumnDefinition(columnId);
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingColumnId(null);
    setDragOffsetX(0);
    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as ConsumoColumnId;
    const overId = over.id as ConsumoColumnId;

    setColumnLayout((current) => {
      const oldIndex = current.visibleIds.indexOf(activeId);
      const newIndex = current.visibleIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) {
        return current;
      }

      return normalizeColumnLayout({
        visibleIds: arrayMove(current.visibleIds, oldIndex, newIndex),
        hiddenIds: current.hiddenIds,
      });
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingColumnId(event.active.id as ConsumoColumnId);
    setDragOffsetX(0);
  }

  function handleDragMove(event: DragMoveEvent) {
    setDragOffsetX(event.delta.x);
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setDraggingColumnId(null);
    setDragOffsetX(0);
  }

  function toggleSort(columnId: ConsumoColumnId) {
    const currentDirection = table.getColumn(columnId)?.getIsSorted() ?? false;
    setSorting((current) => {
      const rest = current.filter((item) => item.id !== columnId);
      if (currentDirection === 'asc') {
        return [{ id: columnId, desc: true }, ...rest];
      }
      if (currentDirection === 'desc') {
        return [{ id: columnId, desc: false }, ...rest];
      }
      return [{ id: columnId, desc: false }, ...rest];
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

      {error ? <InfoBanner title="Falha ao carregar apuração" description={error} tone="danger" /> : null}
      {warning ? <InfoBanner title="Atualização parcial da base" description={warning} tone="warning" /> : null}
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
          subtitle={`${sortedRows.length} produto(s) com consumo acumulado acima da média mensal, ordenados pela menor suficiência projetada ao fim do mês`}
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

        {isColumnsEditorOpen ? (
          <Text style={styles.editorHint}>
            Arraste os cabeçalhos visíveis para reordenar. As colunas ocultas aparecem no fim da grade para restauração.
          </Text>
        ) : null}

        {loading ? (
          <EmptyState title="Carregando apuração" description="Consultando snapshot do mês e estoque atual." />
        ) : sortedRows.length === 0 ? (
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
          <div style={webStyles.tableShell}>
            <div style={webStyles.tableScroller}>
              <div style={{ ...webStyles.tableViewport, minWidth: tableMinWidth }}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToHorizontalAxis]}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={visibleColumns.map((column) => column.id)}
                    strategy={horizontalListSortingStrategy}>
                    <div
                      style={{
                        ...webStyles.headerRow,
                        gridTemplateColumns,
                      }}>
                      {visibleColumns.map((column) => (
                        <SortableHeaderCell
                          key={column.id}
                          column={column}
                          sortDirection={table.getColumn(column.id)?.getIsSorted() ?? false}
                          isEditing={isColumnsEditorOpen}
                          isDraggingEnabled={isColumnsEditorOpen && visibleColumns.length > 1}
                          onSort={() => toggleSort(column.id)}
                          onHide={() => moveColumn(column.id, 'hidden', 0)}
                          styles={webStyles}
                        />
                      ))}

                      {isColumnsEditorOpen
                        ? hiddenColumns.map((column) => (
                            <div
                              key={column.id}
                              style={{ ...webStyles.headerCell, ...webStyles.previewCell }}>
                              <button
                                type="button"
                                onClick={() => toggleSort(column.id)}
                                style={webStyles.headerTitleButton}
                                title={column.description}>
                                <span style={webStyles.headerTitleText}>{column.label}</span>
                                <SortIndicator
                                  direction={table.getColumn(column.id)?.getIsSorted() ?? false}
                                  styles={webStyles}
                                />
                              </button>
                              <div style={webStyles.headerMetaRow}>
                                <span style={webStyles.previewLabel}>Oculta</span>
                                <HeaderIconButton
                                  label={`Adicionar ${column.label} de volta`}
                                  onPress={() => moveColumn(column.id, 'visible', columnLayout.visibleIds.length)}
                                  styles={webStyles}
                                  variant="ghost">
                                  <AppIcon name="plus" size={14} />
                                </HeaderIconButton>
                              </div>
                            </div>
                          ))
                        : null}
                    </div>
                  </SortableContext>
                </DndContext>

                {pageRows.map((rowModel) => {
                  const row = rowModel.original;
                  const categoriaLabel =
                    categoryFilter === 'todos'
                      ? getCategoriaMaterialLabel(normalizeCategoria(row.categoria_material))
                      : null;

                  return (
                    <div
                      key={`${row.codigo_unidade}-${row.codigo_produto}`}
                      style={{
                        ...webStyles.bodyRow,
                        gridTemplateColumns,
                      }}>
                      {renderedColumns.map((column, index) => {
                        const isPreview = column.preview === true;
                        const cellBase = {
                          ...webStyles.bodyCell,
                          ...(column.id === 'product' ? webStyles.productBodyCell : null),
                          ...(isPreview ? webStyles.previewCell : null),
                          ...(draggingColumnId === column.id && !isPreview
                            ? {
                                ...webStyles.bodyCellDragging,
                                transform: `translate3d(${dragOffsetX}px, 0, 0)`,
                              }
                            : null),
                          ...(index === 0 ? { paddingLeft: 18 } : null),
                        } satisfies CSSProperties;

                        return (
                          <div key={column.id} style={cellBase}>
                            <div style={isPreview ? webStyles.previewContent : undefined}>
                              {renderCellContent({
                                row,
                                columnId: column.id,
                                categoriaLabel,
                                styles: webStyles,
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {sortedRows.length > 0 ? (
          <PaginationFooter
            totalItems={sortedRows.length}
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

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
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
    editorHint: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
  });
