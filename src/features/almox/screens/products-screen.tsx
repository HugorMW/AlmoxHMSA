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
  HelpHint,
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
  ProductTable,
  ProductTableSortState,
  sortProductsForTable,
} from "@/features/almox/components/product-table";
import {
  getActionTooltips,
  getLevelRangeLabels,
  getLevelTooltips,
} from "@/features/almox/configuracao";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import {
  createExportTimestamp,
  exportRowsToExcel,
} from "@/features/almox/excel";
import { useThemedStyles } from "@/features/almox/theme-provider";
import { AlmoxTheme } from "@/features/almox/tokens";
import { Hospital } from "@/features/almox/types";
import { matchesQuery, paginate } from "@/features/almox/utils";

type ActionFilter =
  | "all"
  | "COMPRAR"
  | "ACOMPANHAR PROCESSO"
  | "COBRAR ENTREGA"
  | "PEGAR EMPRESTADO"
  | "AVALIAR";
type LevelFilter =
  | "all"
  | "URGENTE"
  | "CRÍTICO"
  | "ALTO"
  | "MÉDIO"
  | "BAIXO"
  | "ESTÁVEL";

const PRODUCTS_TABLE_COLUMNS_CACHE_KEY_PREFIX = "almox:products:columns:v1";
const PRODUCTS_TABLE_COLUMNS_PREFERENCE_SCOPE = "products.columns";

export default function ProductsScreen() {
  const styles = useThemedStyles(createStyles);
  const searchInputRef = useRef<TextInput>(null);
  const [search, setSearch] = useState("");
  const [isTableSearchOpen, setTableSearchOpen] = useState(false);
  const [isColumnsEditorOpen, setColumnsEditorOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [headerSort, setHeaderSort] = useState<ProductTableSortState | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
    dashboardHospital,
  } = useAlmoxData();
  const levelTooltips = useMemo(
    () => getLevelTooltips(systemConfig),
    [systemConfig],
  );
  const actionTooltips = useMemo(
    () => getActionTooltips(systemConfig),
    [systemConfig],
  );
  const levelRanges = useMemo(
    () => getLevelRangeLabels(systemConfig),
    [systemConfig],
  );
  const deferredSearch = useDeferredValue(search);
  const activeHospital: Hospital = dataset.hospitals.includes(dashboardHospital)
    ? dashboardHospital
    : "HMSA";
  const activeCategoryLabel =
    categoryFilter === "material_hospitalar"
      ? "Hospitalar"
      : categoryFilter === "material_farmacologico"
        ? "Farmacológico"
        : "Todos";
  const effectiveSort = useMemo<ProductTableSortState>(
    () => headerSort ?? { column: "days", direction: "asc" },
    [headerSort],
  );

  useEffect(() => {
    setPage(1);
  }, [activeHospital]);

  useEffect(() => {
    if (!isTableSearchOpen) {
      return;
    }

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [isTableSearchOpen]);

  useEffect(() => {
    if (activeHospital !== "HMSA" && actionFilter !== "all") {
      setActionFilter("all");
    }
  }, [activeHospital, actionFilter]);

  const isSearchExpanded = isTableSearchOpen || search.length > 0;

  const filteredItems = useMemo(() => {
    const items = dataset.productsByHospital[activeHospital] ?? [];
    const nextItems = items.filter((item) => {
      if (actionFilter !== "all" && item.action !== actionFilter) {
        return false;
      }
      if (levelFilter !== "all" && item.level !== levelFilter) {
        return false;
      }

      return matchesQuery(
        [item.product_name, item.product_code],
        deferredSearch,
      );
    });

    return sortProductsForTable(
      nextItems,
      effectiveSort,
      openProcessSummaryByProductCode,
    );
  }, [
    dataset.productsByHospital,
    activeHospital,
    actionFilter,
    levelFilter,
    deferredSearch,
    effectiveSort,
    openProcessSummaryByProductCode,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = paginate(filteredItems, safePage, pageSize);

  const showActionColumns = activeHospital === "HMSA";
  const showProcessColumn = activeHospital === "HMSA";
  const showObservationColumn = activeHospital === "HMSA";

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      await exportRowsToExcel({
        fileName: `produtos_${activeHospital}_${categoryFilter}_${createExportTimestamp()}`,
        sheetName: `Produtos ${activeHospital}`,
        rows: filteredItems.map((item) => {
          const processSummary =
            item.hospital === "HMSA"
              ? openProcessSummaryByProductCode[item.product_code]
              : undefined;

          return {
            Hospital: item.hospital,
            Categoria: getCategoriaMaterialLabel(item.categoria_material),
            "Código do produto": item.product_code,
            Produto: item.product_name,
            "Dias de suficiência": item.sufficiency_days,
            "Consumo médio mensal": item.avg_monthly_consumption,
            Nível: item.level,
            "Processos em aberto": processSummary?.total_open ?? "",
            "Processos atrasados": processSummary?.overdue_count ?? "",
            "Processos críticos": processSummary?.critical_count ?? "",
            Ação: item.action ?? "",
            "Observação curta": item.observation_summary ?? "",
            "Observação detalhada": item.observation_detail ?? "",
            "Unidade doadora": item.suggested_hospital ?? "",
            "Unidade doadora - Suficiência atual (dias)":
              item.donor_sufficiency ?? "",
            "Unidade doadora - Estoque atual": item.donor_current_stock ?? "",
            "Unidade doadora - Suficiência após transferência":
              item.nova_suf_doador ?? "",
            "Quantidade sugerida para transferência": item.qty_transfer ?? "",
            "HMSA - Suficiência após transferência": item.projected_suf ?? "",
            "Classificação operacional": item.classification ?? "",
          };
        }),
      });
    } catch (caughtError) {
      setExportError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível gerar o arquivo Excel.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle="Consulta da carteira do hospital atualmente selecionado no cabeçalho do app, com filtros locais sobre a base sincronizada."
        tooltip="Tela de consulta operacional da carteira do hospital em foco. Aqui você aplica filtros locais, reordena a grade pelo cabeçalho e entende a ação sugerida para cada item."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={syncingBase ? "Sincronizando..." : "Atualizar estoque"}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase("estoque")}
              disabled={refreshing || syncingBase}
            />
            <ActionButton
              label={exporting ? "Exportando..." : "Exportar Excel"}
              icon="download"
              tone="success"
              onPress={() => void handleExport()}
              disabled={exporting || filteredItems.length === 0}
            />
          </View>
        }
      />

      {exportError ? (
        <InfoBanner
          title="Falha ao exportar Excel"
          description={exportError}
          tone="danger"
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

      {error ? (
        <InfoBanner
          title="Falha ao atualizar a base"
          description={`${error} A listagem abaixo mostra a última base disponível no app.`}
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

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="A listagem abriu com a última base salva na sessão anterior. O Supabase está sincronizando em background e os resultados podem ser atualizados em instantes."
          tone="info"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Filtros"
          subtitle={`${filteredItems.length} produto(s) encontrados • Hospital atual: ${activeHospital} • Classificação atual: ${activeCategoryLabel}`}
          icon="products"
          tooltip="Refine por busca, ação e nível sobre o hospital atualmente selecionado no cabeçalho do app. A ordenação da grade é feita clicando no título das colunas."
          aside={
            <Pressable
              onPress={() => setFiltersCollapsed((current) => !current)}
              style={({ pressed }) => [
                styles.filtersToggle,
                pressed ? styles.filtersTogglePressed : null,
              ]}
            >
              <Text style={styles.filtersToggleText}>
                {filtersCollapsed ? "Mostrar" : "Ocultar"}
              </Text>
              <AppIcon
                name={filtersCollapsed ? "chevronDown" : "chevronUp"}
                size={14}
                color={styles.filtersToggleText.color as string}
              />
            </Pressable>
          }
        />
        {!filtersCollapsed ? (
          <>
            {showActionColumns ? (
              <View style={styles.filterBlock}>
                <View style={styles.filterLabelRow}>
                  <Text style={styles.filterLabel}>Ações</Text>
                  <HelpHint
                    text={`Filtra a recomendação calculada para o HMSA. Empréstimo só aparece quando outro hospital tem o mesmo item com mais de ${systemConfig.doadorSeguroDias} dias de cobertura.`}
                  />
                </View>
                <InlineTabs
                  options={[
                    {
                      label: "Todas",
                      value: "all" as const,
                      tooltip:
                        "Mostra todas as recomendações operacionais calculadas para os itens do HMSA.",
                    },
                    {
                      label: "Comprar",
                      value: "COMPRAR" as const,
                      tooltip: actionTooltips.COMPRAR,
                    },
                    {
                      label: "Acompanhar processo",
                      value: "ACOMPANHAR PROCESSO" as const,
                      tooltip: actionTooltips["ACOMPANHAR PROCESSO"],
                    },
                    {
                      label: "Cobrar entrega",
                      value: "COBRAR ENTREGA" as const,
                      tooltip: actionTooltips["COBRAR ENTREGA"],
                    },
                    {
                      label: "Pegar emprestado",
                      value: "PEGAR EMPRESTADO" as const,
                      tooltip: actionTooltips["PEGAR EMPRESTADO"],
                    },
                    {
                      label: "Avaliar",
                      value: "AVALIAR" as const,
                      tooltip: actionTooltips.AVALIAR,
                    },
                  ]}
                  value={actionFilter}
                  onChange={(nextFilter) => {
                    setActionFilter(nextFilter);
                    setPage(1);
                  }}
                />
              </View>
            ) : null}

            <View style={styles.filterBlock}>
              <View style={styles.filterLabelRow}>
                <Text style={styles.filterLabel}>Níveis</Text>
                <HelpHint
                  text={`Filtra a faixa de cobertura. Urgente para estoque zerado, crítico ${levelRanges["CRÍTICO"]}, alto ${levelRanges.ALTO}, médio ${levelRanges["MÉDIO"]}, baixo ${levelRanges.BAIXO} e estável ${levelRanges["ESTÁVEL"]}.`}
                />
              </View>
              <InlineTabs
                options={[
                  {
                    label: "Todos",
                    value: "all" as const,
                    tooltip: "Mostra todas as faixas de cobertura em dias.",
                  },
                  {
                    label: "Urgente",
                    value: "URGENTE" as const,
                    tooltip: levelTooltips.URGENTE,
                  },
                  {
                    label: "Crítico",
                    value: "CRÍTICO" as const,
                    tooltip: levelTooltips["CRÍTICO"],
                  },
                  {
                    label: "Alto",
                    value: "ALTO" as const,
                    tooltip: levelTooltips.ALTO,
                  },
                  {
                    label: "Médio",
                    value: "MÉDIO" as const,
                    tooltip: levelTooltips["MÉDIO"],
                  },
                  {
                    label: "Baixo",
                    value: "BAIXO" as const,
                    tooltip: levelTooltips.BAIXO,
                  },
                  {
                    label: "Estável",
                    value: "ESTÁVEL" as const,
                    tooltip: levelTooltips["ESTÁVEL"],
                  },
                ]}
                value={levelFilter}
                onChange={(nextFilter) => {
                  setLevelFilter(nextFilter);
                  setPage(1);
                }}
              />
            </View>

            <InfoBanner
              title={loading ? "Carregando dados reais" : "Integrações pendentes"}
              description={
                loading
                  ? "Consultando os produtos no Supabase. Os filtros locais serão aplicados assim que a carga terminar."
                  : "A exportação Excel já usa os filtros e a ordenação atuais. A integração com pedido de compra real continua pendente."
              }
              tone={loading ? "info" : "warning"}
            />
          </>
        ) : null}
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Lista de produtos"
          subtitle={`Página ${safePage} de ${totalPages}`}
          icon="package"
          tooltip="Tabela detalhada da carteira filtrada. Os badges de nível, ação e hospital sugerido também têm explicações ao passar o mouse."
          aside={
            <View style={styles.tableTitleActions}>
              <View style={styles.tableTitleSearchWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSearchExpanded ? "Campo de busca aberto" : "Abrir busca"
                  }
                  onPress={() => setTableSearchOpen(true)}
                  style={({ pressed }) => [
                    styles.tableTitleSearch,
                    isSearchExpanded ? styles.tableTitleSearchExpanded : null,
                    pressed ? styles.tableTitleSearchPressed : null,
                  ]}
                >
                  <AppIcon
                    name="search"
                    size={16}
                    color={styles.tableTitleSearchIcon.color as string}
                  />
                  {isSearchExpanded ? (
                    <TextInput
                      ref={searchInputRef}
                      value={search}
                      onChangeText={(value) => {
                        setSearch(value);
                        setPage(1);
                      }}
                      placeholder="Buscar produto ou código..."
                      placeholderTextColor={
                        styles.tableTitleSearchPlaceholder.color as string
                      }
                      style={styles.tableTitleSearchInput}
                      onBlur={() => {
                        if (!search.trim()) {
                          setTableSearchOpen(false);
                        }
                      }}
                    />
                  ) : null}
                </Pressable>
              </View>
              <ActionButton
                label={isColumnsEditorOpen ? "Fechar edição" : "Editar colunas"}
                icon="edit"
                tone="neutral"
                onPress={() => setColumnsEditorOpen((current) => !current)}
              />
            </View>
          }
        />

        {pageItems.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description="Ajuste os filtros ou aguarde a carga inicial para visualizar os itens desta unidade."
          />
        ) : (
          <ProductTable
            items={pageItems}
            showActionColumns={showActionColumns}
            showProcessColumn={showProcessColumn}
            showObservationColumn={showObservationColumn}
            showMaterialLabel={categoryFilter === "todos"}
            levelTooltips={levelTooltips}
            actionTooltips={actionTooltips}
            processSummaryByProductCode={openProcessSummaryByProductCode}
            doadorSeguroDias={systemConfig.doadorSeguroDias}
            pisoDoadorAposEmprestimoDias={
              systemConfig.pisoDoadorAposEmprestimoDias
            }
            sorting={effectiveSort}
            onSortChange={(nextSorting) => {
              setHeaderSort(nextSorting);
              setPage(1);
            }}
            editableColumns={{
              scope: PRODUCTS_TABLE_COLUMNS_PREFERENCE_SCOPE,
              cacheKeyPrefix: PRODUCTS_TABLE_COLUMNS_CACHE_KEY_PREFIX,
              bottomScrollbarId: "products-table-bottom-scrollbar",
            }}
            columnsEditor={{
              isOpen: isColumnsEditorOpen,
              onOpenChange: setColumnsEditorOpen,
              hideButton: true,
            }}
          />
        )}

        <PaginationFooter
          totalItems={filteredItems.length}
          pageItemsCount={pageItems.length}
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
      </SectionCard>
    </ScreenScrollView>
  );
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    headerActions: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    filtersToggle: {
      minHeight: 30,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    filtersTogglePressed: {
      opacity: 0.88,
    },
    filtersToggleText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    filterBlock: {
      gap: tokens.spacing.xs,
    },
    filterLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flexWrap: "wrap",
    },
    filterLabel: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    currentHospitalCard: {
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceStrong,
      borderRadius: tokens.radii.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xxs,
    },
    currentHospitalLabel: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    currentHospitalValue: {
      color: tokens.colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    tableTitleSearchWrap: {
      minWidth: 44,
      alignItems: "flex-end",
    },
    tableTitleActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
      justifyContent: "flex-end",
    },
    tableTitleSearch: {
      minHeight: 40,
      width: 40,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.xs,
      overflow: "hidden",
    },
    tableTitleSearchExpanded: {
      width: 280,
      justifyContent: "flex-start",
      backgroundColor: tokens.colors.surfaceRaised,
    },
    tableTitleSearchPressed: {
      opacity: 0.88,
    },
    tableTitleSearchIcon: {
      color: tokens.colors.textMuted,
    },
    tableTitleSearchPlaceholder: {
      color: tokens.colors.textMuted,
    },
    tableTitleSearchInput: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: 13,
      paddingVertical: 0,
    },
  });
