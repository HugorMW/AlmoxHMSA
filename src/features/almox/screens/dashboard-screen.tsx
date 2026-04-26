import React, { useMemo, useState } from "react";
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
import { ProductTable } from "@/features/almox/components/product-table";
import {
  getActionTooltips,
  getLevelRangeLabels,
  getLevelTooltips,
} from "@/features/almox/configuracao";
import { AlmoxTheme, levelColors } from "@/features/almox/tokens";
import { useAppTheme } from "@/features/almox/theme-provider";
import { Hospital, Level } from "@/features/almox/types";
import { paginate } from "@/features/almox/utils";

type SelectedView = "all" | Level;

const LEVEL_LABEL: Record<Level, string> = {
  URGENTE: "Urgente",
  CRÍTICO: "Crítico",
  ALTO: "Alto",
  MÉDIO: "Médio",
  BAIXO: "Baixo",
  ESTÁVEL: "Estável",
};

export default function DashboardScreen() {
  const { tokens } = useAppTheme();
  const styles = useDashboardStyles();
  const [selectedView, setSelectedView] = useState<SelectedView>("all");
  const [listCollapsed, setListCollapsed] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState<PageSize>(10);
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
    systemConfig,
    dashboardHospital,
    openProcessSummaryByProductCode,
  } = useAlmoxData();
  const showMaterialLabel = categoryFilter === "todos";
  const levelRanges = getLevelRangeLabels(systemConfig);
  const levelTooltips = getLevelTooltips(systemConfig);
  const actionTooltips = useMemo(
    () => getActionTooltips(systemConfig),
    [systemConfig],
  );
  const activeHospital = dataset.hospitals.includes(dashboardHospital)
    ? dashboardHospital
    : "HMSA";

  const dashboard = dataset.dashboardByHospital[activeHospital];

  const filteredProducts = useMemo(() => {
    const allHospitalProducts = dataset.productsByHospital[activeHospital] ?? [];
    const base =
      selectedView === "all"
        ? allHospitalProducts
        : allHospitalProducts.filter((item) => item.level === selectedView);
    return [...base].sort(
      (left, right) =>
        left.sufficiency_days - right.sufficiency_days ||
        left.product_name.localeCompare(right.product_name, "pt-BR"),
    );
  }, [dataset.productsByHospital, activeHospital, selectedView]);

  const listTotalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / listPageSize),
  );
  const listSafePage = Math.min(listPage, listTotalPages);
  const listPageItems = paginate(filteredProducts, listSafePage, listPageSize);
  const showActionColumns = activeHospital === "HMSA";
  const showProcessColumn = activeHospital === "HMSA";
  const showObservationColumn = activeHospital === "HMSA";

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
        title="Dashboard"
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
        />
        <LevelMetricCard
          label="Crítico"
          value={dashboard.kpi.critical}
          total={dashboard.kpi.total_products}
          level="CRÍTICO"
          range={levelRanges["CRÍTICO"]}
          isActive={selectedView === "CRÍTICO"}
          onPress={() => handleSelectView("CRÍTICO")}
        />
        <LevelMetricCard
          label="Alto"
          value={dashboard.kpi.high}
          total={dashboard.kpi.total_products}
          level="ALTO"
          range={levelRanges.ALTO}
          isActive={selectedView === "ALTO"}
          onPress={() => handleSelectView("ALTO")}
        />
        <LevelMetricCard
          label="Médio"
          value={dashboard.kpi.medium}
          total={dashboard.kpi.total_products}
          level="MÉDIO"
          range={levelRanges["MÉDIO"]}
          isActive={selectedView === "MÉDIO"}
          onPress={() => handleSelectView("MÉDIO")}
        />
        <LevelMetricCard
          label="Baixo"
          value={dashboard.kpi.low}
          total={dashboard.kpi.total_products}
          level="BAIXO"
          range={levelRanges.BAIXO}
          isActive={selectedView === "BAIXO"}
          onPress={() => handleSelectView("BAIXO")}
        />
        <LevelMetricCard
          label="Estável"
          value={dashboard.kpi.stable}
          total={dashboard.kpi.total_products}
          level="ESTÁVEL"
          range={levelRanges["ESTÁVEL"]}
          isActive={selectedView === "ESTÁVEL"}
          onPress={() => handleSelectView("ESTÁVEL")}
        />
      </View>

      <ExpandHandle
        accent={
          selectedView === "all"
            ? tokens.colors.brand
            : levelColors[selectedView].background
        }
        collapsed={listCollapsed}
        onPress={() => setListCollapsed((prev) => !prev)}
      />

      {!listCollapsed ? (
        <View style={styles.listPanelBody}>
          <Text style={styles.listPanelTitle}>
            {selectedView === "all"
              ? "Todos os produtos"
              : `Produtos — ${LEVEL_LABEL[selectedView]}`}
            <Text
              style={styles.listPanelMeta}
            >{`  •  ${filteredProducts.length} produto(s) em ${activeHospital}`}</Text>
          </Text>
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
}: {
  label: string;
  value: number;
  total: number;
  level: Level;
  range: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const { tokens } = useAppTheme();
  const styles = useDashboardStyles();
  const palette = levelColors[level];
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

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
    </Pressable>
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
  collapsed,
  onPress,
}: {
  accent: string;
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
      <View style={[styles.expandHandleIcon, { borderColor: accent }]}>
        <AppIcon
          name={collapsed ? "chevronDown" : "chevronUp"}
          size={16}
          color={accent}
        />
      </View>
      <View style={[styles.expandHandleLine, { backgroundColor: accent }]} />
    </Pressable>
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
  });
}
