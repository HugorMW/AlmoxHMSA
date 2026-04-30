import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ActionBadge, LevelBadge } from "@/features/almox/components/badges";
import {
  ActionButton,
  AppIcon,
  SearchField,
} from "@/features/almox/components/common";
import { DataTableShell } from "@/features/almox/components/data-table-shell";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import { useThemedStyles } from "@/features/almox/theme-provider";
import { AlmoxTheme } from "@/features/almox/tokens";
import {
  Action,
  Level,
  Product,
  ProductProcessSummary,
} from "@/features/almox/types";
import { usePersistentUserPreference } from "@/features/almox/use-persistent-user-preference";
import { formatDecimal } from "@/features/almox/utils";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PRODUCT_TABLE_COLUMNS_CACHE_TTL_MS = 365 * DAY_IN_MS;
const EMPTY_LEGACY_CACHE_KEYS: string[] = [];

const OBSERVATION_EMPHASIS_REGEX =
  /(Estoque:|Entrada:|VALIDAR USO|Processo:|Parcela:|Cobrança:|Compra:|Remanejamento:|Contingência:|Backup:|Objetivo:|Limite:|Próximo passo:|Status:|Consumo:|sem processo aberto|retirar da lista se obsoleto|E-DOCS\s+[A-Za-z0-9./-]+|(?:ARP|Processo Simplificado|Processo Excepcional|Processo de Dispensa)\s+[A-Za-z0-9./-]+|P\d+|\b(?:HMSA|HEC|HDDS|HABF)\b|\d{2}\/\d{2}\/\d{4}|\+\d+d|>\s*\d+\s+anos|\d+\s+un\.|\d+\s+dias|\d+%|(?:há|daqui a)\s+\d+\s+(?:ano\(s\)|mes\(es\)|dia\(s\))|hoje)/g;

type ProductColumnId =
  | "product"
  | "code"
  | "days"
  | "level"
  | "process"
  | "action"
  | "hospital"
  | "observation";

type ProductColumnDefinition = {
  id: ProductColumnId;
  label: string;
  width: number;
  required?: boolean;
};

type ProductRenderedColumn = ProductColumnDefinition & {
  preview?: boolean;
};

type ProductColumnListKind = "visible" | "hidden";

type ProductColumnLayout = {
  visibleIds: ProductColumnId[];
  hiddenIds: ProductColumnId[];
};

const PRODUCT_TABLE_COLUMN_OPTIONS: ProductColumnDefinition[] = [
  {
    id: "product",
    label: "Produto",
    width: 300,
    required: true,
  },
  {
    id: "code",
    label: "Código",
    width: 60,
  },
  {
    id: "days",
    label: "Dias",
    width: 50,
  },
  {
    id: "level",
    label: "Nível",
    width: 110,
  },
  {
    id: "process",
    label: "Processos",
    width: 150,
  },
  {
    id: "action",
    label: "Ação",
    width: 180,
  },
  {
    id: "hospital",
    label: "Hospital compatível",
    width: 220,
  },
  {
    id: "observation",
    label: "Obs. operacional",
    width: 360,
  },
];

const DEFAULT_VISIBLE_PRODUCT_COLUMNS = PRODUCT_TABLE_COLUMN_OPTIONS.map(
  (column) => column.id,
);

const LEVEL_SORT_ORDER: Record<Level, number> = {
  URGENTE: 0,
  CRÍTICO: 1,
  ALTO: 2,
  MÉDIO: 3,
  BAIXO: 4,
  ESTÁVEL: 5,
};

export type ProductTableSortState = {
  column: ProductColumnId;
  direction: "asc" | "desc";
};

export function getNextProductTableSort(
  current: ProductTableSortState | null | undefined,
  column: ProductColumnId,
): ProductTableSortState {
  if (!current || current.column !== column) {
    return { column, direction: "asc" };
  }

  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortProductsForTable(
  items: Product[],
  sorting: ProductTableSortState | null | undefined,
  processSummaryByProductCode: Record<string, ProductProcessSummary>,
) {
  if (!sorting) {
    return [...items];
  }

  const sorted = [...items];
  sorted.sort((left, right) =>
    compareProductsForTable(left, right, sorting, processSummaryByProductCode),
  );
  return sorted;
}

function compareProductsForTable(
  left: Product,
  right: Product,
  sorting: ProductTableSortState,
  processSummaryByProductCode: Record<string, ProductProcessSummary>,
) {
  const direction = sorting.direction === "asc" ? 1 : -1;

  const compareText = (leftValue?: string | null, rightValue?: string | null) =>
    String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "pt-BR");

  const compareNumber = (
    leftValue?: number | null,
    rightValue?: number | null,
    nullValue = Number.POSITIVE_INFINITY,
  ) => {
    const safeLeft = leftValue == null ? nullValue : leftValue;
    const safeRight = rightValue == null ? nullValue : rightValue;
    return safeLeft - safeRight;
  };

  let result = 0;

  switch (sorting.column) {
    case "product":
      result =
        compareText(left.product_name, right.product_name) ||
        compareText(left.product_code, right.product_code);
      break;
    case "code":
      result =
        compareText(left.product_code, right.product_code) ||
        compareText(left.product_name, right.product_name);
      break;
    case "days":
      result =
        compareNumber(left.sufficiency_days, right.sufficiency_days, 0) ||
        compareText(left.product_name, right.product_name);
      break;
    case "level":
      result =
        compareNumber(
          LEVEL_SORT_ORDER[left.level],
          LEVEL_SORT_ORDER[right.level],
          0,
        ) || compareText(left.product_name, right.product_name);
      break;
    case "process": {
      const leftSummary = processSummaryByProductCode[left.product_code];
      const rightSummary = processSummaryByProductCode[right.product_code];
      result =
        compareNumber(
          leftSummary?.total_open ?? 0,
          rightSummary?.total_open ?? 0,
          0,
        ) || compareText(left.product_name, right.product_name);
      break;
    }
    case "action":
      result =
        compareText(left.action, right.action) ||
        compareText(left.product_name, right.product_name);
      break;
    case "hospital":
      result =
        compareText(left.suggested_hospital, right.suggested_hospital) ||
        compareNumber(
          left.donor_sufficiency,
          right.donor_sufficiency,
          Number.POSITIVE_INFINITY,
        ) ||
        compareText(left.product_name, right.product_name);
      break;
    case "observation":
      result =
        compareText(left.observation_summary, right.observation_summary) ||
        compareText(left.product_name, right.product_name);
      break;
    default:
      result = 0;
  }

  return result * direction;
}

function normalizeProductColumnIds(value: unknown) {
  const validIds = new Set<ProductColumnId>(
    PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => column.id),
  );
  const uniqueIds = new Set<ProductColumnId>();
  const normalizedIds: ProductColumnId[] = [];

  if (!Array.isArray(value)) {
    return normalizedIds;
  }

  for (const rawId of value) {
    if (typeof rawId !== "string") {
      continue;
    }

    const columnId = rawId as ProductColumnId;
    if (!validIds.has(columnId) || uniqueIds.has(columnId)) {
      continue;
    }

    uniqueIds.add(columnId);
    normalizedIds.push(columnId);
  }

  return normalizedIds;
}

function normalizeProductColumnLayout(value: unknown): ProductColumnLayout {
  const defaultOrder = PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => column.id);
  const requiredIds = PRODUCT_TABLE_COLUMN_OPTIONS.filter(
    (column) => column.required,
  ).map((column) => column.id);

  if (Array.isArray(value)) {
    const normalizedVisibleIds = normalizeProductColumnIds(value);
    const visibleIds = defaultOrder.filter(
      (columnId) =>
        requiredIds.includes(columnId) ||
        normalizedVisibleIds.includes(columnId),
    );
    const hiddenIds = defaultOrder.filter(
      (columnId) => !visibleIds.includes(columnId),
    );
    return { visibleIds, hiddenIds };
  }

  const rawValue =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  const requestedVisibleIds = normalizeProductColumnIds(rawValue?.visibleIds);
  const requestedHiddenIds = normalizeProductColumnIds(
    rawValue?.hiddenIds,
  ).filter((columnId) => !requestedVisibleIds.includes(columnId));

  const visibleIds = [
    ...requiredIds.filter(
      (columnId) => !requestedVisibleIds.includes(columnId),
    ),
    ...requestedVisibleIds,
  ];
  const hiddenIds = [...requestedHiddenIds];

  for (const columnId of defaultOrder) {
    if (!visibleIds.includes(columnId) && !hiddenIds.includes(columnId)) {
      hiddenIds.push(columnId);
    }
  }

  return {
    visibleIds:
      visibleIds.length > 0 ? visibleIds : DEFAULT_VISIBLE_PRODUCT_COLUMNS,
    hiddenIds,
  };
}

function moveColumnId(
  list: ProductColumnId[],
  columnId: ProductColumnId,
  targetIndex: number,
) {
  const nextList = list.filter((item) => item !== columnId);
  const safeIndex = Math.max(0, Math.min(targetIndex, nextList.length));
  nextList.splice(safeIndex, 0, columnId);
  return nextList;
}

function buildAvailableColumns({
  showActionColumns,
  showProcessColumn,
  showObservationColumn,
}: {
  showActionColumns: boolean;
  showProcessColumn: boolean;
  showObservationColumn: boolean;
}) {
  return PRODUCT_TABLE_COLUMN_OPTIONS.filter((column) => {
    if (column.id === "process") {
      return showProcessColumn;
    }

    if (column.id === "action" || column.id === "hospital") {
      return showActionColumns;
    }

    if (column.id === "observation") {
      return showObservationColumn;
    }

    return true;
  });
}

function buildBottomScrollbarId(scope: string, explicitId?: string) {
  if (explicitId) {
    return explicitId;
  }

  const sanitizedScope =
    scope
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-") || "product-table";

  return `${sanitizedScope}-bottom-scrollbar`;
}

type ProductTableCommonProps = {
  items: Product[];
  showActionColumns: boolean;
  showProcessColumn: boolean;
  showObservationColumn: boolean;
  showMaterialLabel: boolean;
  levelTooltips: Record<Level, string>;
  actionTooltips: Record<Action, string>;
  processSummaryByProductCode: Record<string, ProductProcessSummary>;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
  sorting?: ProductTableSortState | null;
  onSortChange?: (nextSorting: ProductTableSortState) => void;
  search?: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
  };
};

type ProductTableEditableColumnsConfig = {
  scope: string;
  cacheKeyPrefix: string;
  cacheTtlMs?: number;
  legacyCacheKeys?: string[];
  editorButtonLabel?: string;
  bottomScrollbarId?: string;
};

type ProductTableColumnsEditorControl = {
  isOpen?: boolean;
  onOpenChange?: (nextIsOpen: boolean) => void;
  hideButton?: boolean;
};

type ProductTableProps = ProductTableCommonProps & {
  editableColumns?: ProductTableEditableColumnsConfig;
  bottomScrollbarId?: string;
  columnsEditor?: ProductTableColumnsEditorControl;
};

export function ProductTable({
  editableColumns,
  bottomScrollbarId,
  columnsEditor,
  ...props
}: ProductTableProps) {
  if (editableColumns) {
    return (
      <EditableProductTable
        {...props}
        editableColumns={editableColumns}
        columnsEditor={columnsEditor}
      />
    );
  }

  return (
    <SimpleProductTable {...props} bottomScrollbarId={bottomScrollbarId} />
  );
}

function SimpleProductTable(
  props: ProductTableCommonProps & {
    bottomScrollbarId?: string;
  },
) {
  const styles = useThemedStyles(createStyles);
  const columns = useMemo(
    () =>
      buildAvailableColumns({
        showActionColumns: props.showActionColumns,
        showProcessColumn: props.showProcessColumn,
        showObservationColumn: props.showObservationColumn,
      }),
    [
      props.showActionColumns,
      props.showObservationColumn,
      props.showProcessColumn,
    ],
  );
  const tableMinWidth = useMemo(
    () => columns.reduce((sum, column) => sum + column.width, 0),
    [columns],
  );

  return (
    <View style={styles.tableOuter}>
      {props.search ? (
        <View style={styles.tableToolbar}>
          <View style={styles.tableToolbarSearch}>
            <SearchField
              value={props.search.value}
              onChangeText={props.search.onChangeText}
              placeholder={
                props.search.placeholder ?? "Buscar produto ou código..."
              }
            />
          </View>
        </View>
      ) : null}
      <DataTableShell
        tableMinWidth={tableMinWidth}
        bottomScrollbarId={props.bottomScrollbarId}
        wrapStyle={styles.tableWrap}
        stickyHeaderContainerStyle={styles.tableStickyHeader}
        bottomScrollbarShellStyle={styles.tableBottomScrollbarShell}
        bottomScrollbarSpacerStyle={styles.tableBottomScrollbarSpacer}
        header={
          <TableHeaderRow
            columns={columns}
            sorting={props.sorting}
            onSortChange={props.onSortChange}
          />
        }
        body={props.items.map((item) => (
          <ProductRow
            key={`${item.categoria_material}-${item.hospital}-${item.product_code}`}
            item={item}
            columns={columns}
            showMaterialLabel={props.showMaterialLabel}
            levelTooltip={props.levelTooltips[item.level]}
            actionTooltip={
              item.action ? props.actionTooltips[item.action] : undefined
            }
            processSummary={props.processSummaryByProductCode[item.product_code]}
            doadorSeguroDias={props.doadorSeguroDias}
            pisoDoadorAposEmprestimoDias={props.pisoDoadorAposEmprestimoDias}
          />
        ))}
      />
    </View>
  );
}

function EditableProductTable({
  editableColumns,
  columnsEditor,
  ...props
}: ProductTableCommonProps & {
  editableColumns: ProductTableEditableColumnsConfig;
  columnsEditor?: ProductTableColumnsEditorControl;
}) {
  const styles = useThemedStyles(createStyles);
  const [internalIsColumnsEditorOpen, setInternalColumnsEditorOpen] =
    useState(false);
  const isColumnsEditorOpen =
    columnsEditor?.isOpen ?? internalIsColumnsEditorOpen;
  const legacyCacheKeys = useMemo(
    () => editableColumns.legacyCacheKeys ?? EMPTY_LEGACY_CACHE_KEYS,
    [editableColumns.legacyCacheKeys],
  );
  const { value: columnLayout, setValue: setColumnLayout } =
    usePersistentUserPreference<ProductColumnLayout>({
      scope: editableColumns.scope,
      cacheKeyPrefix: editableColumns.cacheKeyPrefix,
      cacheTtlMs:
        editableColumns.cacheTtlMs ?? PRODUCT_TABLE_COLUMNS_CACHE_TTL_MS,
      legacyCacheKeys,
      normalize: normalizeProductColumnLayout,
    });

  const availableColumns = useMemo(
    () =>
      buildAvailableColumns({
        showActionColumns: props.showActionColumns,
        showProcessColumn: props.showProcessColumn,
        showObservationColumn: props.showObservationColumn,
      }),
    [
      props.showActionColumns,
      props.showObservationColumn,
      props.showProcessColumn,
    ],
  );
  const availableIds = useMemo(
    () => new Set(availableColumns.map((column) => column.id)),
    [availableColumns],
  );
  const visibleColumns = useMemo(
    () =>
      columnLayout.visibleIds
        .map((columnId) =>
          PRODUCT_TABLE_COLUMN_OPTIONS.find((column) => column.id === columnId),
        )
        .filter(
          (column): column is ProductColumnDefinition =>
            !!column && availableIds.has(column.id),
        ),
    [availableIds, columnLayout.visibleIds],
  );
  const hiddenColumns = useMemo(
    () =>
      columnLayout.hiddenIds
        .map((columnId) =>
          PRODUCT_TABLE_COLUMN_OPTIONS.find((column) => column.id === columnId),
        )
        .filter(
          (column): column is ProductColumnDefinition =>
            !!column && availableIds.has(column.id),
        ),
    [availableIds, columnLayout.hiddenIds],
  );
  const renderedColumns = useMemo<ProductRenderedColumn[]>(
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
    [hiddenColumns, isColumnsEditorOpen, visibleColumns],
  );
  const tableMinWidth = useMemo(
    () => renderedColumns.reduce((sum, column) => sum + column.width, 0),
    [renderedColumns],
  );
  const firstPreviewColumnId = hiddenColumns[0]?.id ?? null;
  const webPreviewBlurStyle =
    Platform.OS === "web" ? ({ filter: "blur(0.75px)" } as const) : null;
  const bottomScrollbarId = useMemo(
    () =>
      buildBottomScrollbarId(
        editableColumns.scope,
        editableColumns.bottomScrollbarId,
      ),
    [editableColumns.bottomScrollbarId, editableColumns.scope],
  );

  function setColumnsEditorOpen(nextIsOpen: boolean) {
    columnsEditor?.onOpenChange?.(nextIsOpen);

    if (columnsEditor?.isOpen === undefined) {
      setInternalColumnsEditorOpen(nextIsOpen);
    }
  }

  function moveColumn(
    columnId: ProductColumnId,
    targetList: ProductColumnListKind,
    targetIndex: number,
  ) {
    const column = PRODUCT_TABLE_COLUMN_OPTIONS.find(
      (item) => item.id === columnId,
    );
    if (column?.required && targetList === "hidden") {
      return;
    }

    setColumnLayout((current) => {
      const nextVisibleIds = current.visibleIds.filter((id) => id !== columnId);
      const nextHiddenIds = current.hiddenIds.filter((id) => id !== columnId);

      if (targetList === "visible") {
        return normalizeProductColumnLayout({
          visibleIds: moveColumnId(nextVisibleIds, columnId, targetIndex),
          hiddenIds: nextHiddenIds,
        });
      }

      return normalizeProductColumnLayout({
        visibleIds: nextVisibleIds,
        hiddenIds: moveColumnId(nextHiddenIds, columnId, targetIndex),
      });
    });
  }

  return (
    <View style={styles.tableOuter}>
      {props.search || !columnsEditor?.hideButton ? (
        <View style={styles.tableToolbar}>
          {props.search ? (
            <View style={styles.tableToolbarSearch}>
              <SearchField
                value={props.search.value}
                onChangeText={props.search.onChangeText}
                placeholder={
                  props.search.placeholder ?? "Buscar produto ou código..."
                }
              />
            </View>
          ) : (
            <View style={styles.tableToolbarSpacer} />
          )}
          {!columnsEditor?.hideButton ? (
            <ActionButton
              label={
                isColumnsEditorOpen
                  ? "Fechar edição"
                  : (editableColumns.editorButtonLabel ?? "Editar colunas")
              }
              icon="edit"
              tone="neutral"
              onPress={() => setColumnsEditorOpen(!isColumnsEditorOpen)}
            />
          ) : null}
        </View>
      ) : null}
      <DataTableShell
        tableMinWidth={tableMinWidth}
        bottomScrollbarId={bottomScrollbarId}
        wrapStyle={styles.tableWrap}
        stickyHeaderContainerStyle={styles.tableStickyHeader}
        bottomScrollbarShellStyle={styles.tableBottomScrollbarShell}
        bottomScrollbarSpacerStyle={styles.tableBottomScrollbarSpacer}
        header={
          <TableHeaderRow
            columns={renderedColumns}
            isColumnsEditorOpen={isColumnsEditorOpen}
            visibleColumns={visibleColumns}
            firstPreviewColumnId={firstPreviewColumnId}
            onMoveColumn={moveColumn}
            sorting={props.sorting}
            onSortChange={props.onSortChange}
          />
        }
        body={props.items.map((item) => (
          <ProductRow
            key={`${item.categoria_material}-${item.hospital}-${item.product_code}`}
            item={item}
            columns={renderedColumns}
            showMaterialLabel={props.showMaterialLabel}
            levelTooltip={props.levelTooltips[item.level]}
            actionTooltip={
              item.action ? props.actionTooltips[item.action] : undefined
            }
            processSummary={props.processSummaryByProductCode[item.product_code]}
            doadorSeguroDias={props.doadorSeguroDias}
            pisoDoadorAposEmprestimoDias={props.pisoDoadorAposEmprestimoDias}
            firstPreviewColumnId={firstPreviewColumnId}
            webPreviewBlurStyle={webPreviewBlurStyle}
          />
        ))}
      />
    </View>
  );
}

function TableHeaderRow({
  columns,
  isColumnsEditorOpen = false,
  visibleColumns = [],
  firstPreviewColumnId = null,
  onMoveColumn,
  sorting,
  onSortChange,
}: {
  columns: ProductRenderedColumn[];
  isColumnsEditorOpen?: boolean;
  visibleColumns?: ProductColumnDefinition[];
  firstPreviewColumnId?: ProductColumnId | null;
  onMoveColumn?: (
    columnId: ProductColumnId,
    targetList: ProductColumnListKind,
    targetIndex: number,
  ) => void;
  sorting?: ProductTableSortState | null;
  onSortChange?: (nextSorting: ProductTableSortState) => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.tableHeader}>
      {columns.map((column, index) => {
        const visibleIndex = visibleColumns.findIndex(
          (item) => item.id === column.id,
        );
        const canMoveLeft = visibleIndex > 0;
        const canMoveRight =
          visibleIndex > -1 && visibleIndex < visibleColumns.length - 1;
        const isPreview = column.preview === true;
        const isPreviewStart = isPreview && firstPreviewColumnId === column.id;
        const isSorted = sorting?.column === column.id;
        const sortable = !isPreview && !isColumnsEditorOpen && !!onSortChange;

        return (
          <View
            key={column.id}
            style={[
              styles.tableHeadColumn,
              index > 0 ? styles.tableHeadColumnDivider : null,
              getColumnStyle(styles, column.id),
              isPreview ? styles.previewColumn : null,
              isPreviewStart ? styles.previewColumnStart : null,
            ]}
          >
            {sortable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ordenar por ${column.label}`}
                onPress={() =>
                  onSortChange(getNextProductTableSort(sorting, column.id))
                }
                style={({ pressed }) => [
                  styles.headerSortButton,
                  pressed ? styles.headerSortButtonPressed : null,
                ]}
              >
                <View style={styles.headerSortLabelRow}>
                  <Text
                    style={[
                      styles.tableHeadCell,
                      isPreview ? styles.previewHeadCell : null,
                      isSorted ? styles.tableHeadCellActive : null,
                    ]}
                  >
                    {column.label}
                  </Text>
                  {isSorted ? (
                    <AppIcon
                      name={
                        sorting?.direction === "asc"
                          ? "chevronUp"
                          : "chevronDown"
                      }
                      size={12}
                      color={styles.tableHeadCellActive.color as string}
                    />
                  ) : null}
                </View>
              </Pressable>
            ) : (
              <Text
                style={[
                  styles.tableHeadCell,
                  isPreview ? styles.previewHeadCell : null,
                ]}
              >
                {column.label}
              </Text>
            )}

            {isPreview && onMoveColumn ? (
              <View style={styles.previewHeaderMeta}>
                <Text style={styles.previewHeaderHint}>Oculta</Text>
                <HeaderActionButton
                  icon="plus"
                  label={`Adicionar ${column.label} de volta`}
                  onPress={() =>
                    onMoveColumn(column.id, "visible", Number.MAX_SAFE_INTEGER)
                  }
                />
              </View>
            ) : isColumnsEditorOpen && onMoveColumn ? (
              <View style={styles.headerColumnActions}>
                <HeaderActionButton
                  icon="chevronLeft"
                  label="Mover à esquerda"
                  disabled={!canMoveLeft}
                  onPress={() =>
                    onMoveColumn(column.id, "visible", visibleIndex - 1)
                  }
                />
                <HeaderActionButton
                  icon="chevronRight"
                  label="Mover à direita"
                  disabled={!canMoveRight}
                  onPress={() =>
                    onMoveColumn(column.id, "visible", visibleIndex + 1)
                  }
                />
                <HeaderActionButton
                  icon="blocked"
                  label={
                    column.required ? "Coluna obrigatória" : "Ocultar coluna"
                  }
                  disabled={column.required}
                  onPress={() => onMoveColumn(column.id, "hidden", 0)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ProductRow({
  item,
  columns,
  showMaterialLabel,
  levelTooltip,
  actionTooltip,
  processSummary,
  doadorSeguroDias,
  pisoDoadorAposEmprestimoDias,
  firstPreviewColumnId = null,
  webPreviewBlurStyle = null,
}: {
  item: Product;
  columns: ProductRenderedColumn[];
  showMaterialLabel: boolean;
  levelTooltip: string;
  actionTooltip?: string;
  processSummary?: ProductProcessSummary;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
  firstPreviewColumnId?: ProductColumnId | null;
  webPreviewBlurStyle?: object | null;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.tableRow}>
      {columns.map((column) => {
        const isPreview = column.preview === true;
        const isPreviewStart = isPreview && firstPreviewColumnId === column.id;

        return (
          <View
            key={column.id}
            style={[
              styles.cellBox,
              getColumnStyle(styles, column.id),
              isPreview ? styles.previewColumn : null,
              isPreviewStart ? styles.previewColumnStart : null,
            ]}
          >
            <View
              style={[
                isPreview ? styles.previewContent : null,
                isPreview ? webPreviewBlurStyle : null,
              ]}
            >
              {renderProductColumnContent({
                columnId: column.id,
                item,
                showMaterialLabel,
                levelTooltip,
                actionTooltip,
                processSummary,
                doadorSeguroDias,
                pisoDoadorAposEmprestimoDias,
                styles,
              })}
            </View>
            {isPreview ? (
              <View pointerEvents="none" style={styles.previewWash} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function renderProductColumnContent({
  columnId,
  item,
  showMaterialLabel,
  levelTooltip,
  actionTooltip,
  processSummary,
  doadorSeguroDias,
  pisoDoadorAposEmprestimoDias,
  styles,
}: {
  columnId: ProductColumnId;
  item: Product;
  showMaterialLabel: boolean;
  levelTooltip: string;
  actionTooltip?: string;
  processSummary?: ProductProcessSummary;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
  styles: ReturnType<typeof createStyles>;
}) {
  switch (columnId) {
    case "product":
      return (
        <View style={styles.productCell}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.product_name}
          </Text>
          <Text style={styles.productMeta}>
            CMM: {formatDecimal(item.avg_monthly_consumption)}
            {showMaterialLabel
              ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
              : ""}
          </Text>
        </View>
      );
    case "code":
      return <Text style={styles.tableCell}>{item.product_code}</Text>;
    case "days":
      return (
        <Text style={[styles.tableCell, styles.daysColumnText]}>
          {formatDecimal(item.sufficiency_days)}
        </Text>
      );
    case "level":
      return (
        <View style={styles.tableBadgeCell}>
          <HoverInfo text={levelTooltip}>
            <LevelBadge level={item.level} />
          </HoverInfo>
        </View>
      );
    case "process":
      return (
        <View style={styles.productCell}>
          <ProcessSummaryCell summary={processSummary} />
        </View>
      );
    case "action":
      return (
        <View style={styles.tableBadgeCell}>
          {item.action ? (
            <HoverInfo
              text={
                actionTooltip ??
                "Recomendação operacional calculada para este item."
              }
            >
              <ActionBadge action={item.action} />
            </HoverInfo>
          ) : (
            <Text style={styles.tableCell}>—</Text>
          )}
        </View>
      );
    case "hospital":
      return (
        <HoverInfo
          text={
            item.suggested_hospital
              ? `Melhor hospital para emprestar este item. O valor em dias ao lado do hospital mostra a cobertura atual dessa unidade: ${
                  item.donor_sufficiency?.toFixed(0) ?? "sem dado"
                } dias. Estoque atual da unidade sugerida: ${
                  item.donor_current_stock != null
                    ? formatDecimal(item.donor_current_stock, 0)
                    : "sem dado"
                }. Cobertura estimada depois do empréstimo: ${
                  item.nova_suf_doador?.toFixed(0) ?? "sem dado"
                } dias. Mínimo configurado depois de emprestar: ${pisoDoadorAposEmprestimoDias} dias.`
              : `Nenhum hospital encontrado com o mesmo item e mais de ${doadorSeguroDias} dias de cobertura atual.`
          }
        >
          <View style={styles.productCell}>
            <Text style={styles.tableCell}>
              {item.suggested_hospital
                ? `${item.suggested_hospital}${
                    item.donor_sufficiency
                      ? ` • ${item.donor_sufficiency.toFixed(0)}d`
                      : ""
                  }`
                : "—"}
            </Text>
            {item.suggested_hospital && item.donor_current_stock != null ? (
              <Text style={styles.productMeta}>
                Estoque atual: {formatDecimal(item.donor_current_stock, 0)}
              </Text>
            ) : null}
            {item.suggested_hospital && item.nova_suf_doador != null ? (
              <Text style={styles.productMeta}>
                Suf. projetada doador: {formatDecimal(item.nova_suf_doador, 0)}d
              </Text>
            ) : null}
          </View>
        </HoverInfo>
      );
    case "observation":
      return (
        <ObservationCell
          summary={item.observation_summary}
          detail={item.observation_detail}
        />
      );
    default:
      return null;
  }
}

function ObservationCell({
  summary,
  detail,
}: {
  summary?: string | null;
  detail?: string | null;
}) {
  const styles = useThemedStyles(createStyles);

  if (!summary && !detail) {
    return <Text style={styles.tableCell}>—</Text>;
  }

  return (
    <HoverInfo text={detail ?? summary ?? "Sem detalhes."} emphasizeText>
      <View style={styles.productCell}>
        {summary ? (
          <Text style={styles.observationSummary}>{summary}</Text>
        ) : null}
        {detail ? (
          <HighlightedText
            text={detail}
            textStyle={styles.observationDetail}
            emphasisStyle={styles.observationDetailStrong}
            numberOfLines={8}
          />
        ) : null}
      </View>
    </HoverInfo>
  );
}

function HighlightedText({
  text,
  textStyle,
  emphasisStyle,
  numberOfLines,
}: {
  text: string;
  textStyle: object;
  emphasisStyle: object;
  numberOfLines?: number;
}) {
  const segments = useMemo(() => splitObservationText(text), [text]);

  return (
    <Text style={textStyle as any} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => (
        <Text
          key={`${segment.text}-${index}`}
          style={segment.emphasized ? (emphasisStyle as any) : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

function splitObservationText(text: string) {
  const segments: { text: string; emphasized: boolean }[] = [];
  let lastIndex = 0;

  text.replace(
    OBSERVATION_EMPHASIS_REGEX,
    (matchedText, _capture, matchIndex: number) => {
      if (matchIndex > lastIndex) {
        segments.push({
          text: text.slice(lastIndex, matchIndex),
          emphasized: false,
        });
      }

      segments.push({
        text: matchedText,
        emphasized: true,
      });
      lastIndex = matchIndex + matchedText.length;
      return matchedText;
    },
  );

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      emphasized: false,
    });
  }

  return segments.length > 0 ? segments : [{ text, emphasized: false }];
}

function ProcessSummaryCell({ summary }: { summary?: ProductProcessSummary }) {
  const styles = useThemedStyles(createStyles);

  if (!summary || summary.total_open === 0) {
    return <Text style={styles.tableCell}>—</Text>;
  }

  return (
    <HoverInfo text={buildProcessTooltip(summary)}>
      <View style={styles.processList}>
        {summary.entries.map((entry, entryIndex) => {
          const edocsLabel = entry.edocs
            ? `E-DOCS ${entry.edocs}`
            : "E-DOCS não informado";

          return (
            <View
              key={`${entry.edocs}-${entryIndex}`}
              style={styles.processItem}
            >
              <Text style={styles.processEdocs} numberOfLines={1}>
                {edocsLabel}
              </Text>
              <View style={styles.processParcelasList}>
                {entry.parcelas.map((parcela) => (
                  <Text
                    key={`${entry.edocs}-${parcela.numero}`}
                    style={styles.processMeta}
                    numberOfLines={1}
                  >
                    {`P${parcela.numero} ${parcela.data_label}${
                      parcela.adiamento_dias_uteis
                        ? ` +${parcela.adiamento_dias_uteis}d`
                        : ""
                    }`}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </HoverInfo>
  );
}

function buildProcessTooltip(summary: ProductProcessSummary) {
  return summary.entries
    .map((entry) => {
      const edocsLabel = entry.edocs
        ? `E-DOCS ${entry.edocs}`
        : "E-DOCS não informado";
      const parcelasLabel = entry.parcelas
        .map(
          (parcela) =>
            `P${parcela.numero} ${parcela.data_label}${
              parcela.adiamento_dias_uteis
                ? ` +${parcela.adiamento_dias_uteis}d`
                : ""
            }`,
        )
        .join("\n");
      return `${edocsLabel}\n${parcelasLabel}`;
    })
    .join("\n\n");
}

function HoverInfo({
  text,
  emphasizeText = false,
  children,
}: {
  text: string;
  emphasizeText?: boolean;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={styles.tooltipAnchor}
    >
      {showTooltip ? (
        <View pointerEvents="none" style={styles.tooltipBubble}>
          {emphasizeText ? (
            <HighlightedText
              text={text}
              textStyle={styles.tooltipText}
              emphasisStyle={styles.tooltipTextStrong}
            />
          ) : (
            <Text style={styles.tooltipText}>{text}</Text>
          )}
        </View>
      ) : null}
      {children}
    </Pressable>
  );
}

function HeaderActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "chevronLeft" | "chevronRight" | "blocked" | "plus";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const iconColor = disabled
    ? (styles.headerActionIconDisabled.color as string)
    : (styles.headerActionIcon.color as string);

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
      ]}
    >
      <AppIcon name={icon} size={12} color={iconColor} />
    </Pressable>
  );
}

function getColumnStyle(
  styles: ReturnType<typeof createStyles>,
  columnId: ProductColumnId,
) {
  switch (columnId) {
    case "product":
      return styles.productColumn;
    case "code":
      return styles.codeColumn;
    case "days":
      return styles.daysColumn;
    case "level":
      return styles.levelColumn;
    case "process":
      return styles.processColumn;
    case "action":
      return styles.actionColumn;
    case "hospital":
      return styles.hospitalColumn;
    case "observation":
      return styles.observationColumn;
    default:
      return null;
  }
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    tableOuter: {
      gap: 0,
    },
    tableToolbar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    tableToolbarSearch: {
      flex: 1,
      minWidth: 220,
      maxWidth: 360,
    },
    tableToolbarSpacer: {
      flex: 1,
    },
    tableBottomScrollbarShell: {
      paddingTop: tokens.spacing.xxs,
      paddingBottom: tokens.spacing.xxs,
      marginTop: tokens.spacing.xxs,
      backgroundColor: tokens.colors.surface,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.line,
    },
    tableBottomScrollbarSpacer: {
      minHeight: 1,
    },
    tableStickyHeader: {
      backgroundColor: tokens.colors.surface,
    },
    tableWrap: {
      minWidth: 0,
    },
    tableHeader: {
      flexDirection: "row",
      paddingBottom: tokens.spacing.xxs,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.lineStrong,
      alignItems: "flex-start",
    },
    tableHeadColumn: {
      gap: 6,
      paddingVertical: tokens.spacing.xxs,
    },
    tableHeadColumnDivider: {
      borderLeftWidth: 1,
      borderLeftColor: tokens.colors.line,
    },
    tableHeadCell: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    tableHeadCellActive: {
      color: tokens.colors.text,
    },
    headerSortButton: {
      alignSelf: "flex-start",
    },
    headerSortButtonPressed: {
      opacity: 0.8,
    },
    headerSortLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap",
    },
    headerColumnActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap",
    },
    previewHeaderMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    previewHeaderHint: {
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    headerActionButton: {
      width: 22,
      height: 22,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    headerActionButtonDisabled: {
      opacity: 0.42,
    },
    headerActionButtonPressed: {
      transform: [{ scale: 0.96 }],
    },
    headerActionIcon: {
      color: tokens.colors.text,
    },
    headerActionIconDisabled: {
      color: tokens.colors.textSoft,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 68,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.lineStrong,
    },
    cellBox: {
      minHeight: 68,
      justifyContent: "center",
      position: "relative",
    },
    tableCell: {
      color: tokens.colors.text,
      fontSize: 13,
    },
    daysColumnText: {
      fontWeight: "700",
    },
    tableBadgeCell: {
      justifyContent: "center",
      overflow: "visible",
    },
    productColumn: {
      width: 300,
      paddingRight: tokens.spacing.md,
    },
    codeColumn: {
      width: 60,
    },
    daysColumn: {
      width: 50,
    },
    levelColumn: {
      width: 110,
    },
    processColumn: {
      width: 150,
    },
    actionColumn: {
      width: 180,
    },
    hospitalColumn: {
      width: 220,
    },
    observationColumn: {
      width: 360,
    },
    productCell: {
      gap: 4,
      justifyContent: "center",
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
      opacity: 0.54,
    },
    previewWash: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(10, 14, 20, 0.06)",
    },
    productName: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    productMeta: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    processList: {
      gap: 8,
    },
    processItem: {
      gap: 4,
    },
    processParcelasList: {
      gap: 2,
    },
    processEdocs: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "700",
      fontFamily: tokens.typography.mono,
    },
    processMeta: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    observationSummary: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    observationDetail: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    observationDetailStrong: {
      color: tokens.colors.text,
      fontWeight: "700",
    },
    tooltipAnchor: {
      position: "relative",
      alignSelf: "flex-start",
      overflow: "visible",
    },
    tooltipBubble: {
      position: "absolute",
      left: 0,
      bottom: "100%",
      marginBottom: tokens.spacing.xs,
      minWidth: 200,
      maxWidth: 280,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surface,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
      zIndex: 20,
    },
    tooltipText: {
      color: tokens.colors.text,
      fontSize: 12,
      lineHeight: 18,
    },
    tooltipTextStrong: {
      fontWeight: "700",
    },
  });
