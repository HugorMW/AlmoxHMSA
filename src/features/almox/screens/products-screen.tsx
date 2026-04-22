import React, { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionBadge, LevelBadge } from '@/features/almox/components/badges';
import {
  ActionButton,
  EmptyState,
  HelpHint,
  InfoBanner,
  InlineTabs,
  PageHeader,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { createExportTimestamp, exportRowsToExcel } from '@/features/almox/excel';
import { almoxTheme } from '@/features/almox/tokens';
import { Action, Hospital, Level, Product } from '@/features/almox/types';
import { formatDecimal, paginate, matchesQuery } from '@/features/almox/utils';

const PAGE_SIZE = 8;
type ActionFilter = 'all' | 'COMPRAR' | 'PEGAR EMPRESTADO' | 'AVALIAR';
type LevelFilter = 'all' | 'URGENTE' | 'CRÍTICO' | 'ALTO' | 'MÉDIO' | 'BAIXO' | 'ESTÁVEL';
type SortOption = 'dias_asc' | 'dias_desc' | 'nome_asc' | 'codigo_asc';

const levelTooltips: Record<Level, string> = {
  URGENTE: 'Estoque zerado. Ação imediata para evitar indisponibilidade do item.',
  CRÍTICO: 'Cobertura de 0 a 7 dias. Faixa com maior risco de ruptura.',
  ALTO: 'Cobertura entre 8 e 15 dias. Ainda atende, mas já pede ação rápida.',
  MÉDIO: 'Cobertura entre 16 e 30 dias. Sai da urgência curta, mas ainda merece acompanhamento.',
  BAIXO: 'Cobertura entre 31 e 60 dias. Faixa operacional mais confortável.',
  ESTÁVEL: 'Cobertura acima de 60 dias. Indica estoque folgado e possível excedente.',
};

const actionTooltips: Record<Action, string> = {
  COMPRAR:
    'Recomendado quando o HMSA está com até 15 dias sem doador seguro acima de 100 dias, ou quando já entrou na faixa de 16 a 30 dias.',
  'PEGAR EMPRESTADO':
    'Recomendado quando o HMSA está com até 15 dias e existe doador da mesma categoria e do mesmo cd_pro_fat acima de 100 dias.',
  AVALIAR:
    'Faixa mantida para leitura operacional, mas a regra atual prioriza apenas compra ou empréstimo até 15 dias.',
  'PODE EMPRESTAR':
    'Item com folga acima de 120 dias. Pode entrar como origem de redistribuição, preservando piso seguro no doador.',
  OK: 'Item fora da faixa crítica e sem necessidade de ação imediata.',
  'EXECUTAR AGORA': 'Ação imediata priorizada em fluxos operacionais específicos.',
  'BAIXA PRIORIDADE': 'Item monitorado, mas sem urgência operacional no momento.',
};

export default function ProductsScreen() {
  const [activeHospital, setActiveHospital] = useState<Hospital>('HMSA');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('dias_asc');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { dataset, categoryFilter, error, loading, refreshing, syncError, syncNotice, syncingBase, syncBase, usingCachedData } = useAlmoxData();

  const deferredSearch = useDeferredValue(search);
  const hospitals = dataset.hospitals;
  const items = dataset.productsByHospital[activeHospital] ?? [];

  const filteredItems = useMemo(() => {
    const nextItems = items.filter((item) => {
      if (actionFilter !== 'all' && item.action !== actionFilter) {
        return false;
      }
      if (levelFilter !== 'all' && item.level !== levelFilter) {
        return false;
      }

      return matchesQuery([item.product_name, item.product_code], deferredSearch);
    });

    nextItems.sort((left, right) => {
      switch (sortOption) {
        case 'dias_asc':
          return left.sufficiency_days - right.sufficiency_days || left.product_name.localeCompare(right.product_name, 'pt-BR');
        case 'dias_desc':
          return right.sufficiency_days - left.sufficiency_days || left.product_name.localeCompare(right.product_name, 'pt-BR');
        case 'nome_asc':
          return left.product_name.localeCompare(right.product_name, 'pt-BR') || left.product_code.localeCompare(right.product_code, 'pt-BR');
        case 'codigo_asc':
          return left.product_code.localeCompare(right.product_code, 'pt-BR') || left.product_name.localeCompare(right.product_name, 'pt-BR');
        default:
          return 0;
      }
    });

    return nextItems;
  }, [items, actionFilter, levelFilter, deferredSearch, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = paginate(filteredItems, safePage, PAGE_SIZE);

  const showActionColumns = activeHospital === 'HMSA';

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      await exportRowsToExcel({
        fileName: `produtos_${activeHospital}_${categoryFilter}_${createExportTimestamp()}`,
        sheetName: `Produtos ${activeHospital}`,
        rows: filteredItems.map((item) => ({
          Hospital: item.hospital,
          Categoria: getCategoriaMaterialLabel(item.categoria_material),
          'Código do produto': item.product_code,
          Produto: item.product_name,
          'Dias de suficiência': item.sufficiency_days,
          'Consumo médio mensal': item.avg_monthly_consumption,
          Nível: item.level,
          Ação: item.action ?? '',
          'Unidade doadora': item.suggested_hospital ?? '',
          'Unidade doadora - Suficiência atual (dias)': item.donor_sufficiency ?? '',
          'Unidade doadora - Estoque atual': item.donor_current_stock ?? '',
          'Unidade doadora - Suficiência após transferência': item.nova_suf_doador ?? '',
          'Quantidade sugerida para transferência': item.qty_transfer ?? '',
          'HMSA - Suficiência após transferência': item.projected_suf ?? '',
          'Classificação operacional': item.classification ?? '',
        })),
      });
    } catch (caughtError) {
      setExportError(caughtError instanceof Error ? caughtError.message : 'Não foi possível gerar o arquivo Excel.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ScreenScrollView>
      <PageHeader
        title="Produtos"
        subtitle="Exploração da carteira completa por hospital, com filtros locais sobre a base sincronizada."
        tooltip="Tela de consulta operacional da carteira. Aqui você compara hospitais, aplica filtros locais e entende a ação sugerida para cada item."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={syncingBase ? 'Sincronizando...' : 'Atualizar estoque'}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase('estoque')}
              disabled={refreshing || syncingBase}
            />
            <ActionButton
              label={exporting ? 'Exportando...' : 'Exportar Excel'}
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

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="A listagem abriu com a última base salva na sessão anterior. O Supabase está sincronizando em background e os resultados podem ser atualizados em instantes."
          tone="info"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Hospital e filtros"
          subtitle={`${filteredItems.length} produto(s) encontrados nesta visualização`}
          icon="products"
          tooltip="Escolha o hospital, refine por busca, ação e nível. Os filtros atuam apenas sobre a base já carregada para esta tela."
        />
        <InlineTabs
          options={hospitals.map((hospital) => ({ label: hospital, value: hospital }))}
          value={activeHospital}
          onChange={(nextHospital) => {
            setActiveHospital(nextHospital);
            setActionFilter('all');
            setLevelFilter('all');
            setPage(1);
          }}
        />

        <SearchField
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Buscar por produto ou código..."
        />

        {showActionColumns ? (
          <View style={styles.filterBlock}>
            <View style={styles.filterLabelRow}>
              <Text style={styles.filterLabel}>Ações</Text>
              <HelpHint text="Filtra a recomendação operacional calculada para o HMSA. Empréstimo só aparece quando há doador seguro acima de 100 dias." />
            </View>
            <InlineTabs
              options={[
                {
                  label: 'Todas',
                  value: 'all' as const,
                  tooltip: 'Mostra todas as recomendações operacionais calculadas para os itens do HMSA.',
                },
                {
                  label: 'Comprar',
                  value: 'COMPRAR' as const,
                  tooltip:
                    'Item com até 15 dias sem doador seguro acima de 100 dias, ou já na faixa de 16 a 30 dias sem redistribuição prioritária.',
                },
                {
                  label: 'Pegar emprestado',
                  value: 'PEGAR EMPRESTADO' as const,
                  tooltip:
                    'Item do HMSA com até 15 dias e doador da mesma categoria e do mesmo cd_pro_fat acima de 100 dias.',
                },
                {
                  label: 'Avaliar',
                  value: 'AVALIAR' as const,
                  tooltip:
                    'Faixa mantida para leitura operacional, mas a regra atual tende a não priorizar essa saída.',
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
            <Text style={styles.filterLabel}>Ordenação</Text>
            <HelpHint text="Reordena a lista já filtrada. Você pode priorizar menor cobertura, maior cobertura, nome do produto ou código." />
          </View>
          <InlineTabs
            options={[
              {
                label: 'Menor cobertura',
                value: 'dias_asc' as const,
                tooltip: 'Mostra primeiro os itens com menos dias de cobertura.',
              },
              {
                label: 'Maior cobertura',
                value: 'dias_desc' as const,
                tooltip: 'Mostra primeiro os itens com mais dias de cobertura.',
              },
              {
                label: 'Nome A-Z',
                value: 'nome_asc' as const,
                tooltip: 'Ordena alfabeticamente pelo nome do produto.',
              },
              {
                label: 'Código',
                value: 'codigo_asc' as const,
                tooltip: 'Ordena pelo código do produto na base.',
              },
            ]}
            value={sortOption}
            onChange={(nextSort) => {
              setSortOption(nextSort);
              setPage(1);
            }}
          />
        </View>

        <View style={styles.filterBlock}>
          <View style={styles.filterLabelRow}>
            <Text style={styles.filterLabel}>Níveis</Text>
            <HelpHint text="Filtra a faixa de cobertura. Urgente para estoque zerado, crítico até 7 dias, alto até 15, médio até 30, baixo até 60 e estável acima disso." />
          </View>
          <InlineTabs
            options={[
              {
                label: 'Todos',
                value: 'all' as const,
                tooltip: 'Mostra todas as faixas de cobertura em dias.',
              },
              {
                label: 'Urgente',
                value: 'URGENTE' as const,
                tooltip: 'Itens com estoque zerado. Demandam ação imediata.',
              },
              {
                label: 'Crítico',
                value: 'CRÍTICO' as const,
                tooltip: 'Cobertura de 0 a 7 dias. Faixa de maior risco de ruptura.',
              },
              {
                label: 'Alto',
                value: 'ALTO' as const,
                tooltip: 'Cobertura entre 8 e 15 dias. Já pede atenção imediata.',
              },
              {
                label: 'Médio',
                value: 'MÉDIO' as const,
                tooltip: 'Cobertura entre 16 e 30 dias. Situação ainda monitorada.',
              },
              {
                label: 'Baixo',
                value: 'BAIXO' as const,
                tooltip: 'Cobertura entre 31 e 60 dias. Faixa operacional confortável.',
              },
              {
                label: 'Estável',
                value: 'ESTÁVEL' as const,
                tooltip: 'Cobertura acima de 60 dias. Pode indicar excedente.',
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
          title={loading ? 'Carregando dados reais' : 'Integrações pendentes'}
          description={
            loading
              ? 'Consultando os produtos no Supabase. Os filtros locais serão aplicados assim que a carga terminar.'
              : 'A exportação Excel já usa os filtros e a ordenação atuais. A integração com pedido de compra real continua pendente.'
          }
          tone={loading ? 'info' : 'warning'}
        />
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Lista de produtos"
          subtitle={`Página ${safePage} de ${totalPages}`}
          icon="package"
          tooltip="Tabela detalhada da carteira filtrada. Os badges de nível, ação e hospital sugerido também têm explicações ao passar o mouse."
        />

        {pageItems.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description="Ajuste os filtros ou aguarde a carga inicial para visualizar os itens desta unidade."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
                <Text style={[styles.tableHeadCell, styles.codeColumn]}>Código</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Nível</Text>
                {showActionColumns ? <Text style={[styles.tableHeadCell, styles.actionColumn]}>Ação</Text> : null}
                {showActionColumns ? <Text style={[styles.tableHeadCell, styles.hospitalColumn]}>Hospital sugerido</Text> : null}
              </View>

              {pageItems.map((item) => (
                <ProductRow
                  key={`${item.categoria_material}-${item.hospital}-${item.product_code}`}
                  item={item}
                  showActionColumns={showActionColumns}
                  showMaterialLabel={categoryFilter === 'todos'}
                />
              ))}
            </View>
          </ScrollView>
        )}

        <View style={styles.paginationRow}>
          <Text style={styles.paginationText}>
            Exibindo {pageItems.length} de {filteredItems.length} itens
          </Text>
          <View style={styles.paginationActions}>
            <ActionButton
              label="Anterior"
              tone="neutral"
              disabled={safePage <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            />
            <ActionButton
              label="Próxima"
              tone="neutral"
              disabled={safePage >= totalPages}
              onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </View>
        </View>
      </SectionCard>
    </ScreenScrollView>
  );
}

function ProductRow({
  item,
  showActionColumns,
  showMaterialLabel,
}: {
  item: Product;
  showActionColumns: boolean;
  showMaterialLabel: boolean;
}) {
  return (
    <View style={styles.tableRow}>
      <View style={[styles.productColumn, styles.productCell]}>
        <Text style={styles.productName} numberOfLines={1}>
          {item.product_name}
        </Text>
        <Text style={styles.productMeta}>
          CMM: {formatDecimal(item.avg_monthly_consumption)}
          {showMaterialLabel ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}` : ''}
        </Text>
      </View>
      <Text style={[styles.tableCell, styles.codeColumn]}>{item.product_code}</Text>
      <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(item.sufficiency_days)}</Text>
      <View style={[styles.tableBadgeCell, styles.smallColumn]}>
        <HoverInfo text={levelTooltips[item.level]}>
          <LevelBadge level={item.level} />
        </HoverInfo>
      </View>
      {showActionColumns ? (
        <View style={[styles.tableBadgeCell, styles.actionColumn]}>
          {item.action ? (
            <HoverInfo text={actionTooltips[item.action]}>
              <ActionBadge action={item.action} />
            </HoverInfo>
          ) : (
            <Text style={styles.tableCell}>—</Text>
          )}
        </View>
      ) : null}
      {showActionColumns ? (
        <View style={[styles.hospitalColumn, styles.productCell]}>
          <HoverInfo
            text={
              item.suggested_hospital
                ? `Melhor hospital doador encontrado para o mesmo cd_pro_fat e a mesma categoria. O valor em dias ao lado do hospital representa a suficiência atual do estoque dessa unidade doadora: ${item.donor_sufficiency?.toFixed(0) ?? 'sem dado'} dias. Estoque atual da unidade sugerida: ${item.donor_current_stock != null ? formatDecimal(item.donor_current_stock, 0) : 'sem dado'}. Suficiência projetada do doador após a cessão sugerida: ${item.nova_suf_doador?.toFixed(0) ?? 'sem dado'} dias.`
                : 'Nenhum doador seguro encontrado com mais de 100 dias de suficiência atual para este item.'
            }>
            <View style={styles.productCell}>
              <Text style={styles.tableCell}>
                {item.suggested_hospital
                  ? `${item.suggested_hospital}${item.donor_sufficiency ? ` • ${item.donor_sufficiency.toFixed(0)}d` : ''}`
                  : '—'}
              </Text>
              {item.suggested_hospital && item.donor_current_stock != null ? (
                <Text style={styles.productMeta}>Estoque atual: {formatDecimal(item.donor_current_stock, 0)}</Text>
              ) : null}
              {item.suggested_hospital && item.nova_suf_doador != null ? (
                <Text style={styles.productMeta}>Suf. projetada doador: {formatDecimal(item.nova_suf_doador, 0)}d</Text>
              ) : null}
            </View>
          </HoverInfo>
        </View>
      ) : null}
    </View>
  );
}

function HoverInfo({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={styles.tooltipAnchor}>
      {showTooltip ? <View pointerEvents="none" style={styles.tooltipBubble}><Text style={styles.tooltipText}>{text}</Text></View> : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: almoxTheme.spacing.sm,
    flexWrap: 'wrap',
  },
  filterBlock: {
    gap: almoxTheme.spacing.xs,
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
    flexWrap: 'wrap',
  },
  filterLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableWrap: {
    minWidth: 920,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: almoxTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.lineStrong,
  },
  tableHeadCell: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  tableCell: {
    color: almoxTheme.colors.text,
    fontSize: 13,
  },
  tableBadgeCell: {
    justifyContent: 'center',
    overflow: 'visible',
  },
  productColumn: {
    width: 300,
    paddingRight: almoxTheme.spacing.md,
  },
  codeColumn: {
    width: 120,
  },
  smallColumn: {
    width: 110,
  },
  actionColumn: {
    width: 180,
  },
  hospitalColumn: {
    width: 220,
  },
  productCell: {
    gap: 4,
    justifyContent: 'center',
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
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  paginationText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  paginationActions: {
    flexDirection: 'row',
    gap: almoxTheme.spacing.sm,
  },
  tooltipAnchor: {
    position: 'relative',
    alignSelf: 'flex-start',
    overflow: 'visible',
  },
  tooltipBubble: {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    marginBottom: almoxTheme.spacing.xs,
    minWidth: 200,
    maxWidth: 280,
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
});
