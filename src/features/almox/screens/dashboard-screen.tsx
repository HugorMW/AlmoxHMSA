import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import {
  ActionBadge,
  LevelBadge,
  RuptureBadge,
} from "@/features/almox/components/badges";
import { DistributionChart } from "@/features/almox/components/charts";
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from "@/features/almox/components/common";
import { ProductTable } from "@/features/almox/components/product-table";
import {
  getActionTooltips,
  getLevelRangeLabels,
  getLevelTooltips,
  getLimiteCompraDias,
} from "@/features/almox/configuracao";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import { almoxTheme, levelColors } from "@/features/almox/tokens";
import { DetailItem, Hospital, Level } from "@/features/almox/types";
import { formatDecimal, paginate } from "@/features/almox/utils";

type PanelKey = "transfer" | "rupture";
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
  const [activePanel, setActivePanel] = useState<PanelKey | null>("transfer");
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
  const limiteCompraDias = getLimiteCompraDias(systemConfig);
  const activeHospital = dataset.hospitals.includes(dashboardHospital)
    ? dashboardHospital
    : "HMSA";

  const dashboard = dataset.dashboardByHospital[activeHospital];
  const intelligence = dataset.intelligenceDetails;

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

  const intelligenceCards = [
    {
      key: "transfer" as const,
      title: "Redistribuir",
      value: `${dashboard.kpi.to_borrow}`,
      icon: "borrow" as const,
      color: almoxTheme.colors.cyan,
      subtitle: "Itens com potencial de remanejamento entre unidades",
      tooltip: `Conta itens do HMSA com até ${limiteCompraDias} dias de cobertura quando outro hospital tem o mesmo item com mais de ${systemConfig.doadorSeguroDias} dias e continua com pelo menos ${systemConfig.pisoDoadorAposEmprestimoDias} dias depois de emprestar.`,
    },
    {
      key: "rupture" as const,
      title: "Risco de ruptura",
      value: `${dashboard.kpi.rupture_risk_count}`,
      icon: "alert" as const,
      color: almoxTheme.colors.rose,
      subtitle: "Produtos que pedem ação antes da próxima virada",
      tooltip: `Risco alto até ${systemConfig.riscoAltoDias} dias e risco médio até ${systemConfig.riscoMedioDias} dias. Abaixo dessa faixa o item pede ação prioritária.`,
    },
  ];

  const panelItems: Record<PanelKey, DetailItem[]> = {
    transfer: intelligence.transfer_items,
    rupture: intelligence.rupture_items,
  };

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
            ? almoxTheme.colors.brand
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

      <View style={styles.metricGrid}>
        <MetricCard
          label="Comprar"
          value={`${dashboard.kpi.to_buy}`}
          icon="cart"
          color={almoxTheme.colors.rose}
          hint={`Até ${limiteCompraDias} dias sem hospital para emprestar.`}
          tooltip={`Item do HMSA com até ${limiteCompraDias} dias e sem outro hospital com o mesmo item acima de ${systemConfig.doadorSeguroDias} dias de cobertura. Sem opção segura de empréstimo, a recomendação vira comprar.`}
        />
        <MetricCard
          label="Pegar emprestado"
          value={`${dashboard.kpi.to_borrow}`}
          icon="borrow"
          color={almoxTheme.colors.cyan}
          hint={`Até ${limiteCompraDias} dias com outro hospital podendo ajudar.`}
          tooltip={`Item do HMSA com até ${limiteCompraDias} dias e outro hospital com o mesmo item acima de ${systemConfig.doadorSeguroDias} dias, mantendo pelo menos ${systemConfig.pisoDoadorAposEmprestimoDias} dias após a transferência.`}
        />
        <MetricCard
          label="Pode emprestar"
          value={`${dashboard.kpi.can_lend}`}
          icon="lend"
          color={almoxTheme.colors.teal}
          hint={`Cobertura a partir de ${systemConfig.podeEmprestarDias} dias.`}
          tooltip={`Itens com pelo menos ${systemConfig.podeEmprestarDias} dias de cobertura no HMSA. Eles podem ser analisados como estoque com folga para ajudar outras unidades.`}
        />
      </View>

      {activeHospital === "HMSA" ? (
        <>
          <View style={styles.metricGrid}>
            {intelligenceCards.map((card) => {
              const isActive = activePanel === card.key;
              return (
                <InsightCard
                  key={card.key}
                  title={card.title}
                  value={card.value}
                  icon={card.icon}
                  color={card.color}
                  subtitle={card.subtitle}
                  tooltip={card.tooltip}
                  isActive={isActive}
                  onPress={() =>
                    setActivePanel((current) =>
                      current === card.key ? null : card.key,
                    )
                  }
                />
              );
            })}
          </View>

          {activePanel ? (
            <SectionCard
              accent={
                intelligenceCards.find((card) => card.key === activePanel)
                  ?.color
              }
            >
              <SectionTitle
                title={
                  intelligenceCards.find((card) => card.key === activePanel)
                    ?.title ?? "Detalhes"
                }
                subtitle={`${panelItems[activePanel].length} itens com recomendação contextual na base atual`}
                icon="spark"
              />
              {panelItems[activePanel].length === 0 ? (
                <EmptyState
                  title="Nenhum item nesta leitura"
                  description="A base carregada não trouxe itens para este recorte do painel."
                />
              ) : (
                <View style={styles.detailList}>
                  {panelItems[activePanel].map((item) => (
                    <View
                      key={`${item.categoria_material ?? "material_hospitalar"}-${item.product_code}`}
                      style={styles.detailRow}
                    >
                      <View style={styles.detailMain}>
                        <Text style={styles.detailTitle}>
                          {item.product_name}
                        </Text>
                        <Text style={styles.detailMeta}>
                          {item.product_code}
                          {showMaterialLabel && item.categoria_material
                            ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
                            : ""}
                          {` • ${formatDecimal(item.sufficiency_days)} dias de cobertura`}
                        </Text>
                        <Text style={styles.detailRecommendation}>
                          {item.recommendation}
                        </Text>
                      </View>
                      <View style={styles.detailAside}>
                        {item.action ? (
                          <ActionBadge action={item.action} />
                        ) : null}
                        {item.suggested_hospital ? (
                          <Text style={styles.detailTag}>
                            {item.suggested_hospital}
                            {item.donor_sufficiency
                              ? ` • ${item.donor_sufficiency.toFixed(0)}d`
                              : ""}
                          </Text>
                        ) : null}
                        {item.donor_current_stock != null ? (
                          <Text style={styles.detailTag}>
                            Estoque doador:{" "}
                            {formatDecimal(item.donor_current_stock, 0)}
                          </Text>
                        ) : null}
                        {item.nova_suf_doador != null ? (
                          <Text style={styles.detailTag}>
                            Suficiência projetada doador:{" "}
                            {formatDecimal(item.nova_suf_doador, 0)}d
                          </Text>
                        ) : null}
                        {item.qty_transfer ? (
                          <Text style={styles.detailTag}>
                            Qtd. sugerida: {item.qty_transfer}
                          </Text>
                        ) : null}
                        {item.excess_qty ? (
                          <Text style={styles.detailTag}>
                            Excedente estimado: {item.excess_qty}
                          </Text>
                        ) : null}
                        {item.projected_suf ? (
                          <Text style={styles.detailTag}>
                            Após ação: {item.projected_suf.toFixed(0)}d
                          </Text>
                        ) : null}
                        {item.rupture_risk ? (
                          <RuptureBadge risk={item.rupture_risk} />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>
          ) : null}
        </>
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Insights operacionais"
          subtitle="Leituras rápidas geradas a partir da base importada"
          icon="spark"
        />
        {dashboard.insights.length === 0 ? (
          <EmptyState
            title="Sem insights disponíveis"
            description="O processamento atual não gerou leituras operacionais para este hospital."
          />
        ) : (
          <View style={styles.insightList}>
            {dashboard.insights.map((insight) => (
              <InfoBanner
                key={insight}
                title="Leitura recomendada"
                description={insight}
                tone="info"
              />
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title={`Distribuição por suficiência (${activeHospital})`}
          subtitle="Faixas que ajudam a localizar estoques críticos e excedentes."
          icon="dashboard"
        />
        <DistributionChart data={dashboard.chart_data} />
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title={`Top 10 mais críticos (${activeHospital})`}
          subtitle="Itens ordenados por menor cobertura disponível."
          icon="alert"
        />
        {dashboard.top10_critical.length === 0 ? (
          <EmptyState
            title="Nenhum item crítico"
            description="A base atual não retornou itens para a lista crítica deste hospital."
          />
        ) : (
          <View style={styles.criticalList}>
            {dashboard.top10_critical.map((item) => (
              <View
                key={`${item.categoria_material}-${item.product_code}-${item.hospital}`}
                style={styles.criticalRow}
              >
                <View style={styles.criticalMain}>
                  <Text style={styles.criticalName}>{item.product_name}</Text>
                  <Text style={styles.criticalMeta}>
                    {item.product_code}
                    {showMaterialLabel
                      ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
                      : ""}
                    {` • ${formatDecimal(item.sufficiency_days)} dias`}
                  </Text>
                </View>
                <View style={styles.criticalBadges}>
                  <LevelBadge level={item.level} />
                  <ActionBadge action={item.action} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Ranking de suficiência média"
          subtitle="Média de cobertura por hospital para leitura executiva."
          icon="trophy"
        />
        {dashboard.hospital_ranking.length === 0 ? (
          <EmptyState
            title="Ranking indisponível"
            description="Ainda não há dados suficientes para comparar os hospitais."
          />
        ) : (
          <View style={styles.rankingList}>
            {dashboard.hospital_ranking.map((item, index) => (
              <View key={item.hospital} style={styles.rankingRow}>
                <View style={styles.rankingLeft}>
                  <View style={styles.rankingBadge}>
                    <AppIcon
                      name={index < 3 ? "trophy" : "hospital"}
                      size={15}
                      color={
                        index < 3
                          ? almoxTheme.colors.amber
                          : almoxTheme.colors.textMuted
                      }
                    />
                  </View>
                  <View>
                    <Text style={styles.rankingHospital}>{item.hospital}</Text>
                    <Text style={styles.rankingMeta}>
                      {item.total_products} itens monitorados
                    </Text>
                  </View>
                </View>
                <Text style={styles.rankingValue}>
                  {item.avg_sufficiency.toFixed(0)}d
                </Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
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

function MetricCard({
  label,
  value,
  icon,
  color,
  hint,
  tooltip,
}: {
  label: string;
  value: string;
  icon?: Parameters<typeof AppIcon>[0]["name"];
  color?: string;
  hint?: string;
  tooltip: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={({ pressed }) => [
        styles.metricCard,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      {showTooltip ? <CardTooltip text={tooltip} /> : null}
      {icon && color ? (
        <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
          <AppIcon name={icon} size={18} color={color} />
        </View>
      ) : null}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </Pressable>
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
          ? { borderColor: palette.background, backgroundColor: "#f4f8ff" }
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

function InsightCard({
  title,
  value,
  icon,
  color,
  subtitle,
  tooltip,
  isActive,
  onPress,
}: {
  title: string;
  value: string;
  icon: Parameters<typeof AppIcon>[0]["name"];
  color: string;
  subtitle: string;
  tooltip: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={({ pressed }) => [
        styles.metricCard,
        styles.metricCardPressable,
        isActive ? { borderColor: color, backgroundColor: "#eef5ff" } : null,
        pressed ? styles.metricCardPressed : null,
      ]}
    >
      {showTooltip ? <CardTooltip text={tooltip} /> : null}
      <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
        <AppIcon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{title}</Text>
      <Text style={styles.metricHint}>{subtitle}</Text>
    </Pressable>
  );
}

function CardTooltip({ text }: { text: string }) {
  return (
    <View pointerEvents="none" style={styles.tooltipBubble}>
      <Text style={styles.tooltipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dataStatusStrip: {
    minHeight: 58,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: almoxTheme.spacing.md,
  },
  dataStatusItem: {
    gap: 2,
    minWidth: 180,
  },
  dataStatusLabel: {
    color: almoxTheme.colors.brand,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dataStatusValue: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  dataStatusPill: {
    marginLeft: "auto",
    borderRadius: almoxTheme.radii.pill,
    borderWidth: 1,
    borderColor: "#bce4cc",
    backgroundColor: "#edf9f2",
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: 7,
  },
  dataStatusPillWarning: {
    borderColor: "#f5ca8f",
    backgroundColor: "#fff5e7",
  },
  dataStatusPillText: {
    color: almoxTheme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: almoxTheme.spacing.md,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 160,
    minHeight: 142,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.xs,
    position: "relative",
    overflow: "visible",
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  levelMetricCard: {
    borderTopWidth: 4,
    paddingTop: almoxTheme.spacing.md,
  },
  levelCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: almoxTheme.spacing.xs,
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
    color: almoxTheme.colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  metricLabelTitle: {
    color: almoxTheme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  metricHint: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  rangeBadge: {
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: 3,
    borderRadius: almoxTheme.radii.sm,
  },
  rangeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  proportionBarTrack: {
    height: 5,
    borderRadius: almoxTheme.radii.pill,
    backgroundColor: almoxTheme.colors.surfaceStrong,
    overflow: "hidden",
    marginTop: almoxTheme.spacing.xs,
  },
  proportionBarFill: {
    height: "100%",
    borderRadius: almoxTheme.radii.pill,
  },
  proportionText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  totalHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: almoxTheme.spacing.md,
    padding: almoxTheme.spacing.lg,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  totalHeroActive: {
    borderColor: almoxTheme.colors.brand,
    backgroundColor: "#f4f8ff",
  },
  totalHeroMain: {
    flex: 1,
    gap: 4,
  },
  totalHeroLabel: {
    color: almoxTheme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  totalHeroSub: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  totalHeroValue: {
    color: almoxTheme.colors.brand,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  tooltipBubble: {
    position: "absolute",
    left: almoxTheme.spacing.sm,
    right: almoxTheme.spacing.sm,
    bottom: "100%",
    marginBottom: almoxTheme.spacing.xs,
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: almoxTheme.spacing.sm,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surface,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 20,
  },
  tooltipText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  detailList: {
    gap: almoxTheme.spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: almoxTheme.spacing.md,
    paddingBottom: almoxTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
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
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  detailMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  detailRecommendation: {
    color: almoxTheme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  detailTag: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  insightList: {
    gap: almoxTheme.spacing.sm,
  },
  criticalList: {
    gap: almoxTheme.spacing.sm,
  },
  criticalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  criticalMain: {
    flex: 1,
    gap: 4,
  },
  criticalName: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  criticalMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  criticalBadges: {
    gap: almoxTheme.spacing.xs,
    alignItems: "flex-end",
  },
  rankingList: {
    gap: almoxTheme.spacing.sm,
  },
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: almoxTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  rankingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: almoxTheme.spacing.sm,
  },
  rankingBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: almoxTheme.colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  rankingHospital: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  rankingMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  rankingValue: {
    color: almoxTheme.colors.brand,
    fontSize: 16,
    fontWeight: "800",
  },
  expandHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: almoxTheme.spacing.sm,
    marginVertical: -almoxTheme.spacing.sm,
  },
  expandHandleLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    opacity: 0.45,
  },
  expandHandleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: almoxTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  listPanelTitle: {
    color: almoxTheme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  listPanelMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  listPanelBody: {
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.md,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});
