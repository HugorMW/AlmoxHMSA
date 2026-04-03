import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionBadge, LevelBadge, RuptureBadge } from '@/features/almox/components/badges';
import { DistributionChart } from '@/features/almox/components/charts';
import {
  ActionButton,
  AppIcon,
  EmptyState,
  InfoBanner,
  InlineTabs,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { almoxTheme } from '@/features/almox/tokens';
import { DetailItem, Hospital } from '@/features/almox/types';
import { formatDecimal } from '@/features/almox/utils';

type PanelKey = 'transfer' | 'idle' | 'rupture';

export default function DashboardScreen() {
  const [activeHospital, setActiveHospital] = useState<Hospital>('HMSA');
  const [activePanel, setActivePanel] = useState<PanelKey | null>('transfer');
  const { dataset, categoryFilter, error, loading, refreshing, lastRefreshAt, syncError, syncNotice, syncingBase, syncBase, usingCachedData } = useAlmoxData();
  const showMaterialLabel = categoryFilter === 'todos';

  const dashboard = dataset.dashboardByHospital[activeHospital];
  const intelligence = dataset.intelligenceDetails;
  const hospitalOptions = dataset.hospitals;

  const formattedSync = dashboard.last_sync
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dashboard.last_sync))
    : loading
      ? 'carregando base'
      : 'sem importação com mudança';
  const formattedRefresh = lastRefreshAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastRefreshAt))
    : loading
      ? 'carregando leitura'
      : 'sem leitura recente';

  const intelligenceCards = [
    {
      key: 'transfer' as const,
      title: 'Redistribuir',
      value: `${dashboard.kpi.to_borrow}`,
      icon: 'borrow' as const,
      color: almoxTheme.colors.cyan,
      subtitle: 'Itens com potencial de remanejamento entre unidades',
      tooltip:
        'Conta apenas itens do HMSA com até 15 dias de cobertura e doador compatível da mesma categoria com mais de 100 dias em estoque.',
    },
    {
      key: 'idle' as const,
      title: 'Acima da faixa',
      value: `${dashboard.kpi.can_lend}`,
      icon: 'lend' as const,
      color: almoxTheme.colors.amber,
      subtitle: 'Produtos com cobertura excedente e revisão recomendada',
      tooltip:
        'Mostra itens com mais de 120 dias de cobertura. Eles podem ser analisados como origem de redistribuição, preservando piso seguro no doador.',
    },
    {
      key: 'rupture' as const,
      title: 'Risco de ruptura',
      value: `${dashboard.kpi.rupture_risk_count}`,
      icon: 'alert' as const,
      color: almoxTheme.colors.rose,
      subtitle: 'Produtos que pedem ação antes da próxima virada',
      tooltip:
        'Risco alto até 10 dias e risco médio entre 11 e 25 dias. Abaixo dessa faixa o item pede ação prioritária.',
    },
  ];

  const panelItems: Record<PanelKey, DetailItem[]> = {
    transfer: intelligence.transfer_items,
    idle: intelligence.idle_items,
    rupture: intelligence.rupture_items,
  };

  return (
    <ScreenScrollView>
      <PageHeader
        title="Dashboard"
        subtitle={`Base operacional conectada ao Supabase. Última importação com mudança: ${formattedSync}. Última leitura do app: ${formattedRefresh}.`}
        aside={
          <ActionButton
            label={syncingBase ? 'Sincronizando...' : 'Atualizar base'}
            icon="refresh"
            tone="neutral"
            onPress={() => void syncBase()}
            disabled={refreshing || syncingBase}
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
          description="A tela abriu com a última base salva na sessão anterior. O Supabase está sendo consultado em background e os números podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <InfoBanner
        title="Origem dos dados"
        description={
          loading
            ? 'Consultando a view pública do Supabase para montar o dashboard real do almoxarifado.'
            : 'Indicadores calculados a partir da importação mais recente do SISCORE já persistida no banco.'
        }
        tone={loading ? 'info' : 'success'}
      />

      <SectionCard>
        <SectionTitle
          title="Visão por hospital"
          subtitle="Troque a unidade para comparar cobertura e criticidade."
          icon="hospital"
        />
        <InlineTabs
          options={hospitalOptions.map((hospital) => ({ label: hospital, value: hospital }))}
          value={activeHospital}
          onChange={(nextHospital) => {
            setActiveHospital(nextHospital);
            if (nextHospital !== 'HMSA') {
              setActivePanel(null);
            } else if (!activePanel) {
              setActivePanel('transfer');
            }
          }}
        />
      </SectionCard>

      <View style={styles.metricGrid}>
        <MetricCard
          label="Total"
          value={`${dashboard.kpi.total_products}`}
          icon="package"
          color={almoxTheme.colors.blue}
          hint="Itens válidos após filtros e exclusões do HMSA."
          tooltip="Quantidade total de itens visíveis após aplicar categoria selecionada, bloqueios do HMSA e validações da base."
        />
        <MetricCard
          label="Críticos"
          value={`${dashboard.kpi.critical}`}
          icon="alert"
          color={almoxTheme.colors.red}
          hint="Cobertura de até 7 dias."
          tooltip="Itens com suficiência de 0 a 7 dias. São os produtos com maior pressão de abastecimento."
        />
        <MetricCard
          label="Em alerta"
          value={`${dashboard.kpi.alert}`}
          icon="alert"
          color={almoxTheme.colors.orange}
          hint="Cobertura entre 8 e 15 dias."
          tooltip="Itens com suficiência entre 8 e 15 dias. Ainda não romperam, mas já entram na faixa de atenção imediata."
        />
        <MetricCard
          label="Estáveis"
          value={`${dashboard.kpi.medium + dashboard.kpi.high}`}
          icon="uptrend"
          color={almoxTheme.colors.green}
          hint="Cobertura acima de 30 dias."
          tooltip="Agrupa os itens com mais de 30 dias de cobertura, fora da faixa curta de abastecimento."
        />
      </View>

      <View style={styles.metricGrid}>
        <MetricCard
          label="Comprar"
          value={`${dashboard.kpi.to_buy}`}
          icon="cart"
          color={almoxTheme.colors.rose}
          hint="Até 15 dias sem doador seguro."
          tooltip="Item do HMSA com até 15 dias e sem doador da mesma categoria com mais de 100 dias do medicamento em estoque. Sem doador seguro, a recomendação vira comprar."
        />
        <MetricCard
          label="Pegar emprestado"
          value={`${dashboard.kpi.to_borrow}`}
          icon="borrow"
          color={almoxTheme.colors.cyan}
          hint="Até 15 dias com doador compatível."
          tooltip="Item do HMSA com até 15 dias e doador da mesma categoria e mesmo cd_pro_fat acima de 100 dias."
        />
        <MetricCard
          label="Avaliar"
          value={`${dashboard.kpi.to_evaluate}`}
          icon="spark"
          color={almoxTheme.colors.violet}
          hint="Regra atual não usa essa faixa."
          tooltip="Com a regra atual, empréstimo só é considerado quando o HMSA tem 15 dias ou menos. Por isso esta faixa tende a ficar zerada."
        />
        <MetricCard
          label="Pode emprestar"
          value={`${dashboard.kpi.can_lend}`}
          icon="lend"
          color={almoxTheme.colors.teal}
          hint="Cobertura acima de 120 dias."
          tooltip="Itens com mais de 120 dias de cobertura no HMSA. Eles podem ser analisados como excedente, desde que o doador permaneça acima de 100 dias após a cessão."
        />
      </View>

      {activeHospital === 'HMSA' ? (
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
                  onPress={() => setActivePanel((current) => (current === card.key ? null : card.key))}
                />
              );
            })}
          </View>

          {activePanel ? (
            <SectionCard accent={intelligenceCards.find((card) => card.key === activePanel)?.color}>
              <SectionTitle
                title={intelligenceCards.find((card) => card.key === activePanel)?.title ?? 'Detalhes'}
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
                    <View key={`${item.categoria_material ?? 'material_hospitalar'}-${item.product_code}`} style={styles.detailRow}>
                      <View style={styles.detailMain}>
                        <Text style={styles.detailTitle}>{item.product_name}</Text>
                        <Text style={styles.detailMeta}>
                          {item.product_code}
                          {showMaterialLabel && item.categoria_material
                            ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
                            : ''}
                          {` • ${formatDecimal(item.sufficiency_days)} dias de cobertura`}
                        </Text>
                        <Text style={styles.detailRecommendation}>{item.recommendation}</Text>
                      </View>
                      <View style={styles.detailAside}>
                        {item.action ? <ActionBadge action={item.action} /> : null}
                        {item.suggested_hospital ? (
                          <Text style={styles.detailTag}>
                            {item.suggested_hospital}
                            {item.donor_sufficiency ? ` • ${item.donor_sufficiency.toFixed(0)}d` : ''}
                          </Text>
                        ) : null}
                        {item.donor_current_stock != null ? (
                          <Text style={styles.detailTag}>Estoque doador: {formatDecimal(item.donor_current_stock, 0)}</Text>
                        ) : null}
                        {item.nova_suf_doador != null ? (
                          <Text style={styles.detailTag}>Suficiência projetada doador: {formatDecimal(item.nova_suf_doador, 0)}d</Text>
                        ) : null}
                        {item.qty_transfer ? <Text style={styles.detailTag}>Qtd. sugerida: {item.qty_transfer}</Text> : null}
                        {item.excess_qty ? <Text style={styles.detailTag}>Excedente estimado: {item.excess_qty}</Text> : null}
                        {item.projected_suf ? <Text style={styles.detailTag}>Após ação: {item.projected_suf.toFixed(0)}d</Text> : null}
                        {item.rupture_risk ? <RuptureBadge risk={item.rupture_risk} /> : null}
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
              <InfoBanner key={insight} title="Leitura recomendada" description={insight} tone="info" />
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
              <View key={`${item.categoria_material}-${item.product_code}-${item.hospital}`} style={styles.criticalRow}>
                <View style={styles.criticalMain}>
                  <Text style={styles.criticalName}>{item.product_name}</Text>
                  <Text style={styles.criticalMeta}>
                    {item.product_code}
                    {showMaterialLabel ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}` : ''}
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
                      name={index < 3 ? 'trophy' : 'hospital'}
                      size={15}
                      color={index < 3 ? almoxTheme.colors.amber : almoxTheme.colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text style={styles.rankingHospital}>{item.hospital}</Text>
                    <Text style={styles.rankingMeta}>{item.total_products} itens monitorados</Text>
                  </View>
                </View>
                <Text style={styles.rankingValue}>{item.avg_sufficiency.toFixed(0)}d</Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </ScreenScrollView>
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
  icon: Parameters<typeof AppIcon>[0]['name'];
  color: string;
  hint: string;
  tooltip: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={({ pressed }) => [styles.metricCard, pressed ? styles.metricCardPressed : null]}>
      {showTooltip ? <CardTooltip text={tooltip} /> : null}
      <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
        <AppIcon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
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
  icon: Parameters<typeof AppIcon>[0]['name'];
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
        isActive ? { borderColor: color, backgroundColor: '#eef5ff' } : null,
        pressed ? styles.metricCardPressed : null,
      ]}>
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 142,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.xs,
    position: 'relative',
    overflow: 'visible',
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  metricCardPressable: {
    justifyContent: 'space-between',
  },
  metricCardPressed: {
    opacity: 0.9,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    color: almoxTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metricLabel: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  metricHint: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  tooltipBubble: {
    position: 'absolute',
    left: almoxTheme.spacing.sm,
    right: almoxTheme.spacing.sm,
    bottom: '100%',
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
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
    alignItems: 'flex-end',
  },
  detailTitle: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontWeight: '700',
  },
  criticalMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  criticalBadges: {
    gap: almoxTheme.spacing.xs,
    alignItems: 'flex-end',
  },
  rankingList: {
    gap: almoxTheme.spacing.sm,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: almoxTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  rankingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
  },
  rankingBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: almoxTheme.colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingHospital: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rankingMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  rankingValue: {
    color: almoxTheme.colors.brand,
    fontSize: 16,
    fontWeight: '800',
  },
});
