import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  InlineTabs,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from "@/features/almox/components/common";
import {
  isDynamicDaysSortColumn,
  ProductTable,
  ProductTableSortState,
  resolveProductTableDefaultSort,
  sortProductsForTable,
} from "@/features/almox/components/product-table";
import {
  getActionTooltips,
  getLevelTooltips,
} from "@/features/almox/configuracao";
import { useThemedStyles } from "@/features/almox/theme-provider";
import { AlmoxTheme } from "@/features/almox/tokens";
import { ProductColumnId } from "@/features/almox/product-table-columns";
import { matchesQuery, paginate } from "@/features/almox/utils";

type LoanTab = "need" | "lend";

const LOANS_NEED_COLUMNS_CACHE_KEY_PREFIX = "almox:loans:need:columns:v1";
const LOANS_NEED_COLUMNS_PREFERENCE_SCOPE = "loans.need.columns";
const LOANS_LEND_COLUMNS_CACHE_KEY_PREFIX = "almox:loans:lend:columns:v1";
const LOANS_LEND_COLUMNS_PREFERENCE_SCOPE = "loans.lend.columns";

const LOANS_NEED_ENABLED_COLUMNS: ProductColumnId[] = [
  "product",
  "code",
  "days",
  "adjustedDays",
  "rawStock",
  "adjustedStock",
  "cmm",
  "score",
  "risk",
  "action",
  "hospital",
  "postAction",
];

const LOANS_NEED_DEFAULT_VISIBLE_COLUMNS: ProductColumnId[] = [
  "product",
  "days",
  "adjustedDays",
  "rawStock",
  "adjustedStock",
  "score",
  "risk",
  "action",
  "hospital",
  "postAction",
];

const LOANS_LEND_ENABLED_COLUMNS: ProductColumnId[] = [
  "product",
  "code",
  "days",
  "adjustedDays",
  "rawStock",
  "adjustedStock",
  "cmm",
  "level",
  "risk",
];

const LOANS_LEND_DEFAULT_VISIBLE_COLUMNS: ProductColumnId[] = [
  "product",
  "code",
  "days",
  "adjustedDays",
  "rawStock",
  "adjustedStock",
  "cmm",
  "level",
  "risk",
];

const LOANS_COLUMN_LABELS: Partial<Record<ProductColumnId, string>> = {
  days: "Suf. atual",
  adjustedDays: "Suf. ajust.",
  postAction: "Suf. pós-ação",
};

const LOANS_COLUMN_VALUE_SUFFIXES: Partial<Record<ProductColumnId, string>> = {
  days: "d",
  adjustedDays: "d",
};

const LOANS_NEED_DEFAULT_SORT: Partial<ProductTableSortState> = {
  direction: "asc",
};

const LOANS_LEND_DEFAULT_SORT: Partial<ProductTableSortState> = {
  direction: "desc",
};

export default function LoansScreen() {
  const styles = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<LoanTab>("need");
  const [search, setSearch] = useState("");
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isColumnsEditorOpen, setColumnsEditorOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [needSort, setNeedSort] = useState<ProductTableSortState | null>(null);
  const [lendSort, setLendSort] = useState<ProductTableSortState | null>(null);
  const {
    dataset,
    categoryFilter,
    error,
    warning,
    loading,
    refreshing,
    syncError,
    syncNotice,
    syncingBase,
    syncBase,
    usingCachedData,
    systemConfig,
    openProcessSummaryByProductCode,
  } = useAlmoxData();
  const levelTooltips = useMemo(
    () => getLevelTooltips(systemConfig),
    [systemConfig],
  );
  const actionTooltips = useMemo(
    () => getActionTooltips(systemConfig),
    [systemConfig],
  );
  const needDefaultSort = useMemo(
    () =>
      resolveProductTableDefaultSort(
        Boolean(systemConfig.usarDiasAjustadosParaClassificacao),
        LOANS_NEED_DEFAULT_SORT,
      ),
    [systemConfig.usarDiasAjustadosParaClassificacao],
  );
  const lendDefaultSort = useMemo(
    () =>
      resolveProductTableDefaultSort(
        Boolean(systemConfig.usarDiasAjustadosParaClassificacao),
        LOANS_LEND_DEFAULT_SORT,
      ),
    [systemConfig.usarDiasAjustadosParaClassificacao],
  );

  const needItemsBase = dataset.loansNeeded;
  const lendItemsBase = dataset.canLend;
  const activeBaseCount =
    activeTab === "need" ? needItemsBase.length : lendItemsBase.length;
  const showMaterialLabel = categoryFilter === "todos";
  const effectiveNeedSort = needSort ?? needDefaultSort;
  const effectiveLendSort = lendSort ?? lendDefaultSort;
  const activeSort = activeTab === "need" ? effectiveNeedSort : effectiveLendSort;
  const isSearchExpanded = isSearchOpen || search.trim().length > 0;
  const tableColumns =
    activeTab === "need"
      ? {
          enabled: LOANS_NEED_ENABLED_COLUMNS,
          defaults: LOANS_NEED_DEFAULT_VISIBLE_COLUMNS,
          editable: {
            scope: LOANS_NEED_COLUMNS_PREFERENCE_SCOPE,
            cacheKeyPrefix: LOANS_NEED_COLUMNS_CACHE_KEY_PREFIX,
          },
          searchPlaceholder: "Buscar produto, código ou hospital...",
        }
      : {
          enabled: LOANS_LEND_ENABLED_COLUMNS,
          defaults: LOANS_LEND_DEFAULT_VISIBLE_COLUMNS,
          editable: {
            scope: LOANS_LEND_COLUMNS_PREFERENCE_SCOPE,
            cacheKeyPrefix: LOANS_LEND_COLUMNS_CACHE_KEY_PREFIX,
          },
          searchPlaceholder: "Buscar produto ou código...",
        };

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [isSearchOpen]);

  useEffect(() => {
    setNeedSort((current) =>
      current && isDynamicDaysSortColumn(current.column)
        ? { ...current, column: needDefaultSort.column }
        : current,
    );
  }, [needDefaultSort.column]);

  useEffect(() => {
    setLendSort((current) =>
      current && isDynamicDaysSortColumn(current.column)
        ? { ...current, column: lendDefaultSort.column }
        : current,
    );
  }, [lendDefaultSort.column]);

  const needItems = useMemo(() => {
    const matched = needItemsBase.filter((item) =>
      matchesQuery(
        [item.product_name, item.product_code, item.suggested_hospital],
        deferredSearch,
      ),
    );
    return sortProductsForTable(
      matched,
      effectiveNeedSort,
      openProcessSummaryByProductCode,
    );
  }, [
    deferredSearch,
    effectiveNeedSort,
    needItemsBase,
    openProcessSummaryByProductCode,
  ]);

  const lendItems = useMemo(() => {
    const matched = lendItemsBase.filter((item) =>
      matchesQuery([item.product_name, item.product_code], deferredSearch),
    );
    return sortProductsForTable(
      matched,
      effectiveLendSort,
      openProcessSummaryByProductCode,
    );
  }, [
    deferredSearch,
    effectiveLendSort,
    lendItemsBase,
    openProcessSummaryByProductCode,
  ]);

  const activeItems = activeTab === "need" ? needItems : lendItems;
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = paginate(activeItems, safePage, pageSize);

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle="Painel focado em redistribuição entre unidades e itens com sobra operacional."
        aside={
          <ActionButton
            label={syncingBase ? "Sincronizando..." : "Atualizar estoque"}
            icon="refresh"
            tone="neutral"
            onPress={() => void syncBase("estoque")}
            disabled={refreshing || syncingBase}
          />
        }
      />

      {error ? (
        <InfoBanner
          title="Falha ao atualizar a base"
          description={`${error} As sugestões de empréstimo exibem a última leitura válida do banco.`}
          tone="danger"
        />
      ) : null}

      {warning ? (
        <InfoBanner
          title="Atualização parcial da base"
          description={warning}
          tone="warning"
        />
      ) : null}

      {syncError ? (
        <InfoBanner
          title="Falha ao sincronizar com o SISCORE"
          description={syncError}
          tone="danger"
        />
      ) : null}

      {syncNotice ? (
        <InfoBanner
          title="Sincronizacao da base"
          description={syncNotice}
          tone="info"
        />
      ) : null}

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="As sugestões abriram com a última base salva na sessão anterior. O Supabase está sendo consultado em background e as recomendações podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Cenário de redistribuição"
          subtitle={`${activeBaseCount} item(ns) na visão atual`}
          icon="loans"
        />
        <InlineTabs
          options={[
            {
              label: `Pegar emprestado (${needItemsBase.length})`,
              value: "need" as const,
            },
            {
              label: `Pode emprestar (${lendItemsBase.length})`,
              value: "lend" as const,
            },
          ]}
          value={activeTab}
          onChange={(nextTab) => {
            setActiveTab(nextTab);
            setPage(1);
          }}
        />
        <View style={activeTab === "need" ? styles.needBanner : styles.lendBanner}>
          <Text style={styles.bannerTitle}>
            {activeTab === "need"
              ? "Itens que HMSA precisa remanejar"
              : "Itens que HMSA pode ceder"}
          </Text>
          <Text style={styles.bannerText}>
            {loading
              ? "Carregando a análise de redistribuição a partir do Supabase."
              : activeTab === "need"
                ? "Lista unificada com busca, ordenação e colunas configuráveis para captar estoque de outras unidades."
                : "Lista unificada com busca, ordenação e colunas configuráveis para avaliar estoque que pode ser cedido."}
          </Text>
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title={activeTab === "need" ? "Sugestões de captação" : "Potencial de cessão"}
          subtitle={`${activeItems.length} item(ns) encontrados na visão atual`}
          icon={activeTab === "need" ? "borrow" : "lend"}
          aside={
            <View style={styles.tableHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSearchExpanded ? "Campo de busca aberto" : "Abrir busca"}
                onPress={() => setSearchOpen(true)}
                style={({ pressed }) => [
                  styles.inlineSearch,
                  isSearchExpanded ? styles.inlineSearchExpanded : null,
                  pressed ? styles.inlineSearchPressed : null,
                ]}
              >
                <AppIcon
                  name="search"
                  size={16}
                  color={styles.inlineSearchIcon.color as string}
                />
                {isSearchExpanded ? (
                  <TextInput
                    ref={searchInputRef}
                    value={search}
                    onChangeText={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                    placeholder={tableColumns.searchPlaceholder}
                    placeholderTextColor={styles.inlineSearchPlaceholder.color as string}
                    style={styles.inlineSearchInput}
                    onBlur={() => {
                      if (!search.trim()) {
                        setSearchOpen(false);
                      }
                    }}
                  />
                ) : null}
              </Pressable>
              <ActionButton
                label={isColumnsEditorOpen ? "Fechar edição" : "Editar colunas"}
                icon="edit"
                tone="neutral"
                onPress={() => setColumnsEditorOpen((current) => !current)}
              />
            </View>
          }
        />
        {activeItems.length === 0 ? (
          <EmptyState
            title="Nenhum item encontrado"
            description="A base atual não gerou itens para este recorte ou o termo buscado não encontrou correspondências."
          />
        ) : (
          <ProductTable
            items={pageItems}
            enabledColumns={tableColumns.enabled}
            defaultVisibleColumns={tableColumns.defaults}
            editableColumns={tableColumns.editable}
            columnLabels={LOANS_COLUMN_LABELS}
            columnValueSuffixes={LOANS_COLUMN_VALUE_SUFFIXES}
            columnsEditor={{
              isOpen: isColumnsEditorOpen,
              onOpenChange: setColumnsEditorOpen,
              hideButton: true,
            }}
            showMaterialLabel={showMaterialLabel}
            levelTooltips={levelTooltips}
            actionTooltips={actionTooltips}
            processSummaryByProductCode={openProcessSummaryByProductCode}
            doadorSeguroDias={systemConfig.doadorSeguroDias}
            pisoDoadorAposEmprestimoDias={
              systemConfig.pisoDoadorAposEmprestimoDias
            }
            sorting={activeSort}
            onSortChange={(nextSorting) => {
              if (activeTab === "need") {
                setNeedSort(nextSorting);
              } else {
                setLendSort(nextSorting);
              }
              setPage(1);
            }}
          />
        )}
        {activeItems.length > 0 ? (
          <PaginationFooter
            totalItems={activeItems.length}
            pageItemsCount={pageItems.length}
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            itemLabel="item(ns)"
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
    needBanner: {
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: "rgba(249, 115, 22, 0.35)",
      backgroundColor: "rgba(249, 115, 22, 0.12)",
      padding: tokens.spacing.md,
      gap: 6,
    },
    lendBanner: {
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: "rgba(20, 184, 166, 0.35)",
      backgroundColor: "rgba(20, 184, 166, 0.12)",
      padding: tokens.spacing.md,
      gap: 6,
    },
    bannerTitle: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    bannerText: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    tableHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    inlineSearch: {
      minHeight: 44,
      width: 44,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.sm,
      overflow: "hidden",
    },
    inlineSearchExpanded: {
      width: 280,
      justifyContent: "flex-start",
    },
    inlineSearchPressed: {
      opacity: 0.84,
    },
    inlineSearchIcon: {
      color: tokens.colors.textMuted,
    },
    inlineSearchInput: {
      flex: 1,
      minWidth: 120,
      color: tokens.colors.text,
      fontSize: 14,
      paddingVertical: 0,
    },
    inlineSearchPlaceholder: {
      color: tokens.colors.textMuted,
    },
  });
