import { useRouter } from "expo-router";
import React, { useDeferredValue, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
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
import {
  computeProcessStatus,
  hasAndamentoComAlerta,
} from "@/features/almox/process-utils";
import { useAppTheme } from "@/features/almox/theme-provider";
import { AlmoxTheme, levelColors } from "@/features/almox/tokens";
import { Hospital, Level } from "@/features/almox/types";
import { matchesQuery, paginate } from "@/features/almox/utils";

type SelectedView = "all" | Level;

const DASHBOARD_PRODUCT_COLUMNS_CACHE_KEY_PREFIX =
  "almox:dashboard:products:columns:v1";
const DASHBOARD_PRODUCT_COLUMNS_PREFERENCE_SCOPE =
  "dashboard.products.columns";

const LEVEL_LABEL: Record<Level, string> = {
  URGENTE: "Urgente",
  CRÍTICO: "Crítico",
  ALTO: "Alto",
  MÉDIO: "Médio",
  BAIXO: "Baixo",
  ESTÁVEL: "Estável",
};

export default function DashboardScreen() {
  const { mode, tokens } = useAppTheme();
  const styles = useDashboardStyles();
  const [selectedView, setSelectedView] = useState<SelectedView>("all");
  const [listCollapsed, setListCollapsed] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState("");
  const [tableSort, setTableSort] = useState<ProductTableSortState>({
    column: "days",
    direction: "asc",
  });
  const {
    dataset,
    categoryFilter,
    error,
    warning,
    loading,
    refreshing,
    lastRefreshAt,
    syncError,
    syncNotice,
    syncingBase,
    syncBase,
    usingCachedData,
    processItems,
    systemConfig,
    dashboardHospital,
    openProcessSummaryByProductCode,
    kpiHistoricoByHospital,
    productTableAdminConfig,
  } = useAlmoxData();
  const showMaterialLabel = categoryFilter === "todos";
  const levelRanges = getLevelRangeLabels(systemConfig);
  const levelTooltips = getLevelTooltips(systemConfig);
  const actionTooltips = useMemo(
    () => getActionTooltips(systemConfig),
    [systemConfig],
  );
  const deferredSearch = useDeferredValue(search);
  const activeHospital = dataset.hospitals.includes(dashboardHospital)
    ? dashboardHospital
    : "HMSA";

  const dashboard = dataset.dashboardByHospital[activeHospital];

  const filteredProducts = useMemo(() => {
    const allHospitalProducts =
      dataset.productsByHospital[activeHospital] ?? [];
    const base =
      selectedView === "all"
        ? allHospitalProducts
        : allHospitalProducts.filter((item) => item.level === selectedView);
    const matched = base.filter((item) =>
      matchesQuery([item.product_name, item.product_code], deferredSearch),
    );
    return sortProductsForTable(
      matched,
      tableSort,
      openProcessSummaryByProductCode,
    );
  }, [
    dataset.productsByHospital,
    activeHospital,
    selectedView,
    deferredSearch,
    tableSort,
    openProcessSummaryByProductCode,
  ]);

  const listTotalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / listPageSize),
  );
  const listSafePage = Math.min(listPage, listTotalPages);
  const listPageItems = paginate(filteredProducts, listSafePage, listPageSize);
  const showActionColumns = activeHospital === "HMSA";
  const showProcessColumn = activeHospital === "HMSA";
  const showObservationColumn = activeHospital === "HMSA";
  const dashboardTableColumns = productTableAdminConfig.dashboard;

  const attentionCounts = useMemo(() => {
    const hmsaProducts = dataset.productsByHospital.HMSA ?? [];
    const summaries = openProcessSummaryByProductCode;
    let buyUrgent = 0;

    for (const product of hmsaProducts) {
      const summary = summaries[product.product_code];
      const hasOpen = !!summary && summary.total_open > 0;
      if (product.action === "COMPRAR" && !hasOpen) {
        buyUrgent += 1;
      }
    }

    const activeProcesses = processItems.filter((item) => !item.ignorado);
    const processOverdue = activeProcesses.filter(
      (item) => computeProcessStatus(item, systemConfig) === "atrasado",
    ).length;
    const processNearDue = activeProcesses.filter((item) => {
      const status = computeProcessStatus(item, systemConfig);
      return status !== "atrasado" && status !== "cancelado" && hasAndamentoComAlerta(item, systemConfig);
    }).length;
    const collecting = activeProcesses.filter((item) => {
      const status = computeProcessStatus(item, systemConfig);
      return item.critico && status === "atrasado";
    }).length;

    return { buyUrgent, processOverdue, processNearDue, collecting };
  }, [dataset.productsByHospital, openProcessSummaryByProductCode, processItems, systemConfig]);

  const seriesByLevel = useMemo(() => {
    const history = kpiHistoricoByHospital[activeHospital] ?? [];
    return {
      URGENTE: history.map((point) => point.urgent),
      CRÍTICO: history.map((point) => point.critical),
      ALTO: history.map((point) => point.high),
      MÉDIO: history.map((point) => point.medium),
      BAIXO: history.map((point) => point.low),
      ESTÁVEL: history.map((point) => point.stable),
    } satisfies Record<Level, number[]>;
  }, [kpiHistoricoByHospital, activeHospital]);

  const compositionSegments = useMemo(() => {
    const total = dashboard.kpi.total_products;
    if (total <= 0)
      return [] as { level: Level; value: number; percent: number }[];
    return (
      [
        { level: "URGENTE" as Level, value: dashboard.kpi.urgent },
        { level: "CRÍTICO" as Level, value: dashboard.kpi.critical },
        { level: "ALTO" as Level, value: dashboard.kpi.high },
        { level: "MÉDIO" as Level, value: dashboard.kpi.medium },
        { level: "BAIXO" as Level, value: dashboard.kpi.low },
        { level: "ESTÁVEL" as Level, value: dashboard.kpi.stable },
      ] as const
    )
      .filter((segment) => segment.value > 0)
      .map((segment) => ({
        ...segment,
        percent: (segment.value / total) * 100,
      }));
  }, [dashboard.kpi]);

  function handleSelectView(view: SelectedView) {
    if (selectedView === view) {
      setListCollapsed((prev) => !prev);
      return;
    }
    setSelectedView(view);
    setListCollapsed(false);
    setListPage(1);
  }

  const formattedSync = dashboard.last_sync
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(dashboard.last_sync))
    : loading
      ? "carregando base"
      : "sem importação com mudança";
  const formattedRefresh = lastRefreshAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(lastRefreshAt))
    : loading
      ? "carregando leitura"
      : "sem leitura recente";

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle="Resumo calculado com a última atualização disponível."
        aside={
          <ActionButton
            label={
              loading
                ? "Carregando..."
                : syncingBase
                  ? "Sincronizando..."
                  : "Atualizar estoque"
            }
            icon="refresh"
            tone="neutral"
            onPress={() => void syncBase("estoque")}
            disabled={refreshing || syncingBase}
            loading={loading}
          />
        }
      />

      {error ? (
        <InfoBanner
          title="Falha ao atualizar a base"
          description={`${error} Os últimos dados carregados continuam visíveis enquanto a conexão não normaliza.`}
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
          description="A tela abriu com a última base salva. O sistema está conferindo se existe atualização mais recente e os números podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <DataStatusStrip
        loading={loading}
        usingCachedData={usingCachedData}
        formattedSync={formattedSync}
        formattedRefresh={formattedRefresh}
      />

      {activeHospital === "HMSA" ? (
        <AttentionStrip counts={attentionCounts} />
      ) : null}

      <TotalHero
        value={dashboard.kpi.total_products}
        hospital={activeHospital}
        isActive={selectedView === "all"}
        onPress={() => handleSelectView("all")}
      />

      <View style={styles.metricGrid}>
        <LevelMetricCard
          label="Urgente"
          value={dashboard.kpi.urgent}
          total={dashboard.kpi.total_products}
          level="URGENTE"
          range={levelRanges.URGENTE}
          isActive={selectedView === "URGENTE"}
          onPress={() => handleSelectView("URGENTE")}
          series={seriesByLevel.URGENTE}
        />
        <LevelMetricCard
          label="Crítico"
          value={dashboard.kpi.critical}
          total={dashboard.kpi.total_products}
          level="CRÍTICO"
          range={levelRanges["CRÍTICO"]}
          isActive={selectedView === "CRÍTICO"}
          onPress={() => handleSelectView("CRÍTICO")}
          series={seriesByLevel["CRÍTICO"]}
        />
        <LevelMetricCard
          label="Alto"
          value={dashboard.kpi.high}
          total={dashboard.kpi.total_products}
          level="ALTO"
          range={levelRanges.ALTO}
          isActive={selectedView === "ALTO"}
          onPress={() => handleSelectView("ALTO")}
          series={seriesByLevel.ALTO}
        />
        <LevelMetricCard
          label="Médio"
          value={dashboard.kpi.medium}
          total={dashboard.kpi.total_products}
          level="MÉDIO"
          range={levelRanges["MÉDIO"]}
          isActive={selectedView === "MÉDIO"}
          onPress={() => handleSelectView("MÉDIO")}
          series={seriesByLevel["MÉDIO"]}
        />
        <LevelMetricCard
          label="Baixo"
          value={dashboard.kpi.low}
          total={dashboard.kpi.total_products}
          level="BAIXO"
          range={levelRanges.BAIXO}
          isActive={selectedView === "BAIXO"}
          onPress={() => handleSelectView("BAIXO")}
          series={seriesByLevel.BAIXO}
        />
        <LevelMetricCard
          label="Estável"
          value={dashboard.kpi.stable}
          total={dashboard.kpi.total_products}
          level="ESTÁVEL"
          range={levelRanges["ESTÁVEL"]}
          isActive={selectedView === "ESTÁVEL"}
          onPress={() => handleSelectView("ESTÁVEL")}
          series={seriesByLevel["ESTÁVEL"]}
        />
      </View>

      <ExpandHandle
        accent={
          selectedView === "all"
            ? tokens.colors.brand
            : levelColors[selectedView].background
        }
        iconBackground={
          selectedView === "all"
            ? tokens.colors.brand
            : levelColors[selectedView].background
        }
        iconColor={
          selectedView === "all"
            ? mode === "dark"
              ? tokens.colors.black
              : tokens.colors.white
            : levelColors[selectedView].foreground
        }
        collapsed={listCollapsed}
        onPress={() => setListCollapsed((prev) => !prev)}
      />

      {!listCollapsed ? (
        <View style={styles.listPanelBody}>
          <View style={styles.listPanelHeader}>
            <View style={styles.listPanelTitleWrap}>
              <Text style={styles.listPanelTitle}>
                {selectedView === "all"
                  ? "Todos os produtos"
                  : `Produtos — ${LEVEL_LABEL[selectedView]}`}
              </Text>
              <Text
                style={styles.listPanelMeta}
              >{`${filteredProducts.length} produto(s) em ${activeHospital}`}</Text>
            </View>
          </View>
          {filteredProducts.length === 0 ? (
            <EmptyState
              title="Nenhum produto nesta classificação"
              description="A base atual não trouxe produtos para este recorte do hospital selecionado."
            />
          ) : (
            <>
              <ProductTable
                items={listPageItems}
                showActionColumns={showActionColumns}
                showProcessColumn={showProcessColumn}
                showObservationColumn={showObservationColumn}
                showMaterialLabel={showMaterialLabel}
                levelTooltips={levelTooltips}
                actionTooltips={actionTooltips}
                processSummaryByProductCode={openProcessSummaryByProductCode}
                doadorSeguroDias={systemConfig.doadorSeguroDias}
                pisoDoadorAposEmprestimoDias={
                  systemConfig.pisoDoadorAposEmprestimoDias
                }
                sorting={tableSort}
                onSortChange={(nextSorting) => {
                  setTableSort(nextSorting);
                  setListPage(1);
                }}
                search={{
                  value: search,
                  onChangeText: (value) => {
                    setSearch(value);
                    setListPage(1);
                  },
                  placeholder: "Buscar produto ou código...",
                }}
                editableColumns={{
                  scope: DASHBOARD_PRODUCT_COLUMNS_PREFERENCE_SCOPE,
                  cacheKeyPrefix:
                    DASHBOARD_PRODUCT_COLUMNS_CACHE_KEY_PREFIX,
                  bottomScrollbarId: "dashboard-products-bottom-scrollbar",
                }}
                enabledColumns={dashboardTableColumns.enabledColumns}
                defaultVisibleColumns={
                  dashboardTableColumns.defaultVisibleColumns
                }
              />
              <PaginationFooter
                totalItems={filteredProducts.length}
                pageItemsCount={listPageItems.length}
                page={listSafePage}
                totalPages={listTotalPages}
                pageSize={listPageSize}
                itemLabel="produto(s)"
                onPageChange={setListPage}
                onPageSizeChange={(nextPageSize) => {
                  setListPageSize(nextPageSize);
                  setListPage(1);
                }}
              />
            </>
          )}
        </View>
      ) : null}
      {dataset.hospitals.length > 1 ? (
        <HospitalLevelHeatmap
          hospitals={dataset.hospitals}
          dashboardByHospital={dataset.dashboardByHospital}
          activeHospital={activeHospital}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function DataStatusStrip({
  loading,
  usingCachedData,
  formattedSync,
  formattedRefresh,
}: {
  loading: boolean;
  usingCachedData: boolean;
  formattedSync: string;
  formattedRefresh: string;
}) {
  const styles = useDashboardStyles();
  return (
    <View style={styles.dataStatusStrip}>
      <View style={styles.dataStatusItem}>
        <Text style={styles.dataStatusLabel}>Dados usados</Text>
        <Text style={styles.dataStatusValue}>
          {loading ? "Atualizando informações" : "Última importação do SISCORE"}
        </Text>
      </View>
      <View style={styles.dataStatusItem}>
        <Text style={styles.dataStatusLabel}>Base atualizada em</Text>
        <Text style={styles.dataStatusValue}>{formattedSync}</Text>
      </View>
      <View style={styles.dataStatusItem}>
        <Text style={styles.dataStatusLabel}>Tela atualizada em</Text>
        <Text style={styles.dataStatusValue}>{formattedRefresh}</Text>
      </View>
      {usingCachedData ? (
        <View style={[styles.dataStatusPill, styles.dataStatusPillWarning]}>
          <Text style={styles.dataStatusPillText}>
            Mostrando cópia temporária
          </Text>
        </View>
      ) : (
        <View style={styles.dataStatusPill}>
          <Text style={styles.dataStatusPillText}>Dados salvos no sistema</Text>
        </View>
      )}
    </View>
  );
}

function LevelMetricCard({
  label,
  value,
  total,
  level,
  range,
  isActive,
  onPress,
  series,
}: {
  label: string;
  value: number;
  total: number;
  level: Level;
  range: string;
  isActive: boolean;
  onPress: () => void;
  series?: number[];
}) {
  const { tokens } = useAppTheme();
  const styles = useDashboardStyles();
  const palette = levelColors[level];
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const trend =
    series && series.length >= 2 ? series[series.length - 1] - series[0] : 0;
  const trendLabel =
    series && series.length >= 2
      ? trend > 0
        ? `+${trend} desde ${series.length} dias`
        : trend < 0
          ? `${trend} desde ${series.length} dias`
          : `estável em ${series.length} dias`
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        styles.levelMetricCard,
        { borderTopColor: palette.background },
        isActive
          ? {
              borderColor: palette.background,
              backgroundColor: tokens.colors.surfaceStrong,
              shadowColor: palette.background,
              shadowOpacity: 0.18,
              shadowRadius: 20,
            }
          : null,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      <View style={styles.levelCardHeader}>
        <Text style={styles.metricLabelTitle}>{label}</Text>
        <View
          style={[styles.rangeBadge, { backgroundColor: palette.background }]}
        >
          <Text style={[styles.rangeBadgeText, { color: palette.foreground }]}>
            {range}
          </Text>
        </View>
      </View>

      <Text style={styles.metricValue}>{value}</Text>

      <View style={styles.proportionBarTrack}>
        <View
          style={[
            styles.proportionBarFill,
            { backgroundColor: palette.background, width: `${percent}%` },
          ]}
        />
      </View>
      <Text style={styles.proportionText}>{percent}% do total</Text>

      {series && series.length >= 2 ? (
        <View style={styles.sparklineWrap}>
          <Sparkline values={series} color={palette.background} />
          {trendLabel ? (
            <Text
              style={[
                styles.sparklineLabel,
                trend > 0
                  ? { color: tokens.colors.red }
                  : trend < 0
                    ? { color: tokens.colors.green }
                    : null,
              ]}
            >
              {trendLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const styles = useDashboardStyles();
  const max = Math.max(...values, 1);
  return (
    <View style={styles.sparklineBars}>
      {values.map((value, index) => {
        const height =
          max > 0 ? Math.max(2, Math.round((value / max) * 22)) : 2;
        return (
          <View
            key={index}
            style={[
              styles.sparklineBar,
              {
                height,
                backgroundColor: color,
                opacity: index === values.length - 1 ? 1 : 0.55,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function TotalHero({
  value,
  hospital,
  isActive,
  onPress,
}: {
  value: number;
  hospital: Hospital;
  isActive: boolean;
  onPress: () => void;
}) {
  const styles = useDashboardStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.totalHero,
        isActive ? styles.totalHeroActive : null,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      <View style={styles.totalHeroMain}>
        <Text style={styles.totalHeroLabel}>Total de produtos</Text>
        <Text style={styles.totalHeroSub}>
          Itens monitorados em {hospital} na base atual
        </Text>
      </View>
      <Text style={styles.totalHeroValue}>{value}</Text>
    </Pressable>
  );
}

function ExpandHandle({
  accent,
  iconBackground,
  iconColor,
  collapsed,
  onPress,
}: {
  accent: string;
  iconBackground: string;
  iconColor: string;
  collapsed: boolean;
  onPress: () => void;
}) {
  const styles = useDashboardStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.expandHandle,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      <View style={[styles.expandHandleLine, { backgroundColor: accent }]} />
      <View
        style={[
          styles.expandHandleIcon,
          {
            borderColor: accent,
            backgroundColor: iconBackground,
          },
        ]}
      >
        <AppIcon
          name={collapsed ? "chevronDown" : "chevronUp"}
          size={16}
          color={iconColor}
        />
      </View>
      <View style={[styles.expandHandleLine, { backgroundColor: accent }]} />
    </Pressable>
  );
}

type AttentionCounts = {
  buyUrgent: number;
  processOverdue: number;
  processNearDue: number;
  collecting: number;
};

function AttentionStrip({ counts }: { counts: AttentionCounts }) {
  const { tokens } = useAppTheme();
  const styles = useDashboardStyles();
  const router = useRouter();

  const cards: {
    key: keyof AttentionCounts;
    label: string;
    hint: string;
    icon: Parameters<typeof AppIcon>[0]["name"];
    color: string;
    onPress: () => void;
  }[] = [
    {
      key: "buyUrgent",
      label: "Comprar urgente",
      hint: "Sem processo aberto",
      icon: "cart",
      color: tokens.colors.rose,
      onPress: () => router.navigate("/orders"),
    },
    {
      key: "processOverdue",
      label: "Processos atrasados",
      hint: "Parcelas vencidas",
      icon: "alert",
      color: tokens.colors.red,
      onPress: () =>
        router.navigate({ pathname: "/processes", params: { attention: "overdue" } }),
    },
    {
      key: "processNearDue",
      label: "Vencendo em breve",
      hint: "Parcelas em até 7 dias",
      icon: "clock",
      color: tokens.colors.amber,
      onPress: () =>
        router.navigate({ pathname: "/processes", params: { attention: "near_due" } }),
    },
    {
      key: "collecting",
      label: "Em cobrança",
      hint: "Crítico com atraso",
      icon: "send",
      color: tokens.colors.violet,
      onPress: () =>
        router.navigate({ pathname: "/processes", params: { attention: "collecting" } }),
    },
  ];

  return (
    <View style={styles.attentionStrip}>
      <View style={styles.attentionStripHeader}>
        <AppIcon name="spark" size={14} color={tokens.colors.brand} />
        <Text style={styles.attentionStripTitle}>Atenção hoje</Text>
        <Text style={styles.attentionStripHint}>
          Toque em um card para abrir o detalhe
        </Text>
      </View>
      <View style={styles.attentionStripGrid}>
        {cards.map((card) => (
          <Pressable
            key={card.key}
            onPress={card.onPress}
            style={({ pressed }) => [
              styles.attentionCard,
              { borderLeftColor: card.color },
              pressed ? styles.metricCardPressed : null,
            ]}
          >
            <View style={styles.attentionCardTop}>
              <View
                style={[
                  styles.attentionIcon,
                  { backgroundColor: `${card.color}22` },
                ]}
              >
                <AppIcon name={card.icon} size={16} color={card.color} />
              </View>
              <Text style={[styles.attentionValue, { color: card.color }]}>
                {counts[card.key]}
              </Text>
            </View>
            <Text style={styles.attentionLabel}>{card.label}</Text>
            <Text style={styles.attentionHint}>{card.hint}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const COMPOSITION_LABELS: Record<Level, string> = {
  URGENTE: "Urgente",
  CRÍTICO: "Crítico",
  ALTO: "Alto",
  MÉDIO: "Médio",
  BAIXO: "Baixo",
  ESTÁVEL: "Estável",
};

function CompositionBar({
  segments,
  total,
}: {
  segments: { level: Level; value: number; percent: number }[];
  total: number;
}) {
  const styles = useDashboardStyles();

  return (
    <View style={styles.compositionWrap}>
      <View style={styles.compositionHeader}>
        <Text style={styles.compositionTitle}>Composição da carteira</Text>
        <Text style={styles.compositionTotal}>{total} itens</Text>
      </View>
      <View style={styles.compositionBar}>
        {segments.map((segment) => (
          <View
            key={segment.level}
            style={[
              styles.compositionSegment,
              {
                flex: segment.percent,
                backgroundColor: levelColors[segment.level].background,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.compositionLegend}>
        {segments.map((segment) => (
          <View key={segment.level} style={styles.compositionLegendItem}>
            <View
              style={[
                styles.compositionLegendDot,
                { backgroundColor: levelColors[segment.level].background },
              ]}
            />
            <Text style={styles.compositionLegendLabel}>
              {COMPOSITION_LABELS[segment.level]}
            </Text>
            <Text style={styles.compositionLegendValue}>
              {segment.value} · {segment.percent.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const HEATMAP_LEVELS: Level[] = [
  "URGENTE",
  "CRÍTICO",
  "ALTO",
  "MÉDIO",
  "BAIXO",
  "ESTÁVEL",
];

function HospitalLevelHeatmap({
  hospitals,
  dashboardByHospital,
  activeHospital,
}: {
  hospitals: Hospital[];
  dashboardByHospital: Record<
    Hospital,
    {
      kpi: {
        urgent: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
        stable: number;
        total_products: number;
      };
    }
  >;
  activeHospital: Hospital;
}) {
  const styles = useDashboardStyles();
  const { tokens } = useAppTheme();
  const [collapsed, setCollapsed] = useState(true);

  const rows = hospitals.map((hospital) => {
    const kpi = dashboardByHospital[hospital]?.kpi;
    const total = kpi?.total_products ?? 0;
    const cells = HEATMAP_LEVELS.map((level) => {
      const value =
        level === "URGENTE"
          ? (kpi?.urgent ?? 0)
          : level === "CRÍTICO"
            ? (kpi?.critical ?? 0)
            : level === "ALTO"
              ? (kpi?.high ?? 0)
              : level === "MÉDIO"
                ? (kpi?.medium ?? 0)
                : level === "BAIXO"
                  ? (kpi?.low ?? 0)
                  : (kpi?.stable ?? 0);
      const ratio = total > 0 ? value / total : 0;
      return { level, value, ratio };
    });
    return { hospital, total, cells };
  });

  return (
    <View style={styles.heatmapWrap}>
      <View style={styles.heatmapHeader}>
        <View style={styles.heatmapHeaderText}>
          <Text style={styles.heatmapTitle}>Distribuição por hospital</Text>
          <Text style={styles.heatmapHint}>
            Intensidade representa a fatia do nível na carteira
          </Text>
        </View>
        <Pressable
          onPress={() => setCollapsed((prev) => !prev)}
          style={({ pressed }) => [
            styles.heatmapToggle,
            pressed ? styles.metricCardPressed : null,
          ]}
        >
          <Text style={styles.heatmapToggleText}>
            {collapsed ? "Mostrar" : "Ocultar"}
          </Text>
          <AppIcon
            name={collapsed ? "chevronDown" : "chevronUp"}
            size={14}
            color={tokens.colors.textMuted}
          />
        </Pressable>
      </View>
      {!collapsed ? (
        <View>
          <View style={styles.heatmapHeadRow}>
            <View style={styles.heatmapRowLabel} />
            {HEATMAP_LEVELS.map((level) => (
              <View key={level} style={styles.heatmapHeadCell}>
                <View
                  style={[
                    styles.heatmapHeadDot,
                    { backgroundColor: levelColors[level].background },
                  ]}
                />
                <Text style={styles.heatmapHeadText}>{level}</Text>
              </View>
            ))}
          </View>
          {rows.map((row) => (
            <View key={row.hospital} style={styles.heatmapRow}>
              <View
                style={[
                  styles.heatmapRowLabel,
                  row.hospital === activeHospital
                    ? styles.heatmapRowLabelActive
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.heatmapRowLabelText,
                    row.hospital === activeHospital
                      ? styles.heatmapRowLabelTextActive
                      : null,
                  ]}
                >
                  {row.hospital}
                </Text>
                <Text style={styles.heatmapRowLabelMeta}>{row.total}</Text>
              </View>
              {row.cells.map((cell) => {
                const palette = levelColors[cell.level];
                const minOpacity = cell.value > 0 ? 0.18 : 0.04;
                const opacity = Math.max(minOpacity, Math.min(0.95, cell.ratio));
                return (
                  <View
                    key={cell.level}
                    style={[
                      styles.heatmapCell,
                      {
                        backgroundColor:
                          cell.value > 0
                            ? `${palette.background}`
                            : tokens.colors.surfaceMuted,
                        opacity,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.heatmapCellText,
                        cell.value > 0
                          ? { color: palette.foreground }
                          : { color: tokens.colors.textMuted },
                      ]}
                    >
                      {cell.value}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function useDashboardStyles() {
  const { tokens } = useAppTheme();
  return useMemo(() => createDashboardStyles(tokens), [tokens]);
}

function createDashboardStyles(tokens: AlmoxTheme) {
  return StyleSheet.create({
    dataStatusStrip: {
      minHeight: 58,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    dataStatusItem: {
      gap: 2,
      minWidth: 180,
    },
    dataStatusLabel: {
      color: tokens.colors.brand,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    dataStatusValue: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    dataStatusPill: {
      marginLeft: "auto",
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(52, 211, 153, 0.45)",
      backgroundColor: "rgba(52, 211, 153, 0.14)",
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: 7,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    dataStatusPillWarning: {
      borderColor: "rgba(251, 191, 36, 0.45)",
      backgroundColor: "rgba(251, 191, 36, 0.14)",
    },
    dataStatusPillText: {
      color: tokens.colors.text,
      fontSize: 11,
      fontWeight: "800",
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    metricCard: {
      flexGrow: 1,
      flexBasis: 160,
      minHeight: 142,
      borderRadius: tokens.radii.lg,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.xs,
      position: "relative",
      overflow: "visible",
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    levelMetricCard: {
      borderTopWidth: 3,
      paddingTop: tokens.spacing.md,
    },
    levelCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.xs,
    },
    metricCardPressable: {
      justifyContent: "space-between",
    },
    metricCardPressed: {
      opacity: 0.9,
    },
    metricIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    metricValue: {
      color: tokens.colors.text,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    metricLabel: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    metricLabelTitle: {
      color: tokens.colors.text,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    metricHint: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    rangeBadge: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 4,
      borderRadius: tokens.radii.sm,
    },
    rangeBadgeText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    proportionBarTrack: {
      height: 5,
      borderRadius: tokens.radii.pill,
      backgroundColor: tokens.colors.surfaceStrong,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      overflow: "hidden",
      marginTop: tokens.spacing.xs,
    },
    proportionBarFill: {
      height: "100%",
      borderRadius: tokens.radii.pill,
    },
    proportionText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 2,
    },
    totalHero: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      padding: tokens.spacing.lg,
      borderRadius: tokens.radii.lg,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    totalHeroActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.surfaceStrong,
    },
    totalHeroMain: {
      flex: 1,
      gap: 4,
    },
    totalHeroLabel: {
      color: tokens.colors.text,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    totalHeroSub: {
      color: tokens.colors.textMuted,
      fontSize: 12,
    },
    totalHeroValue: {
      color: tokens.colors.brandStrong,
      fontSize: 32,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    tooltipBubble: {
      position: "absolute",
      left: tokens.spacing.sm,
      right: tokens.spacing.sm,
      bottom: "100%",
      marginBottom: tokens.spacing.xs,
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
    detailList: {
      gap: tokens.spacing.md,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.colors.line,
    },
    detailMain: {
      flex: 1,
      gap: 6,
    },
    detailAside: {
      width: 180,
      gap: 8,
      alignItems: "flex-end",
    },
    detailTitle: {
      color: tokens.colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    detailMeta: {
      color: tokens.colors.textMuted,
      fontSize: 12,
    },
    detailRecommendation: {
      color: tokens.colors.textSoft,
      fontSize: 12,
      lineHeight: 18,
    },
    detailTag: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    insightList: {
      gap: tokens.spacing.sm,
    },
    criticalList: {
      gap: tokens.spacing.sm,
    },
    criticalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.colors.line,
    },
    criticalMain: {
      flex: 1,
      gap: 4,
    },
    criticalName: {
      color: tokens.colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    criticalMeta: {
      color: tokens.colors.textMuted,
      fontSize: 12,
    },
    criticalBadges: {
      gap: tokens.spacing.xs,
      alignItems: "flex-end",
    },
    rankingList: {
      gap: tokens.spacing.sm,
    },
    rankingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.colors.line,
    },
    rankingLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    rankingBadge: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: tokens.colors.surfaceStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    rankingHospital: {
      color: tokens.colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    rankingMeta: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    rankingValue: {
      color: tokens.colors.brand,
      fontSize: 16,
      fontWeight: "800",
    },
    expandHandle: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginVertical: -tokens.spacing.sm,
    },
    expandHandleLine: {
      flex: 1,
      height: 3,
      borderRadius: 1,
      opacity: 0.35,
    },
    expandHandleIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      backgroundColor: tokens.colors.surfaceRaised,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    listPanelTitle: {
      color: tokens.colors.text,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    listPanelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      flexWrap: "wrap",
    },
    listPanelTitleWrap: {
      flex: 1,
      gap: 4,
      minWidth: 220,
    },
    listPanelMeta: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    listPanelBody: {
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
      borderRadius: tokens.radii.lg,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },

    attentionStrip: {
      gap: tokens.spacing.sm,
    },
    attentionStripHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    attentionStripTitle: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    attentionStripHint: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      marginLeft: tokens.spacing.xs,
    },
    attentionStripGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    attentionCard: {
      flexGrow: 1,
      flexBasis: 180,
      minHeight: 92,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      borderLeftWidth: 4,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 4,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    attentionCardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    attentionIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    attentionValue: {
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    attentionLabel: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    attentionHint: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    compositionWrap: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surface,
    },
    compositionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    compositionTitle: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    compositionTotal: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    compositionBar: {
      height: 14,
      flexDirection: "row",
      borderRadius: tokens.radii.pill,
      overflow: "hidden",
      backgroundColor: tokens.colors.surfaceStrong,
    },
    compositionSegment: {
      height: "100%",
    },
    compositionLegend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    compositionLegendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    compositionLegendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    compositionLegendLabel: {
      color: tokens.colors.text,
      fontSize: 11,
      fontWeight: "700",
    },
    compositionLegendValue: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    heatmapWrap: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surface,
    },
    heatmapHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    heatmapHeaderText: {
      flex: 1,
      minWidth: 220,
      gap: 2,
    },
    heatmapTitle: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    heatmapHint: {
      color: tokens.colors.textMuted,
      fontSize: 11,
    },
    heatmapToggle: {
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
    heatmapToggleText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    heatmapHeadRow: {
      flexDirection: "row",
      gap: 4,
      paddingBottom: 4,
    },
    heatmapHeadCell: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    heatmapHeadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    heatmapHeadText: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    heatmapRow: {
      flexDirection: "row",
      gap: 4,
      marginTop: 4,
    },
    heatmapRowLabel: {
      width: 64,
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: 6,
      borderRadius: tokens.radii.sm,
      backgroundColor: tokens.colors.surfaceMuted,
      justifyContent: "center",
    },
    heatmapRowLabelActive: {
      backgroundColor: tokens.colors.surfaceActiveSoft,
      borderWidth: 1,
      borderColor: tokens.colors.brand,
    },
    heatmapRowLabelText: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    heatmapRowLabelTextActive: {
      color: tokens.colors.brand,
    },
    heatmapRowLabelMeta: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      fontWeight: "600",
    },
    heatmapCell: {
      flex: 1,
      minHeight: 38,
      borderRadius: tokens.radii.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    heatmapCellText: {
      fontSize: 13,
      fontWeight: "800",
    },
    sparklineWrap: {
      marginTop: tokens.spacing.xs,
      gap: 4,
    },
    sparklineBars: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 2,
      height: 24,
    },
    sparklineBar: {
      flex: 1,
      minWidth: 2,
      borderRadius: 1,
    },
    sparklineLabel: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
    },
  });
}
