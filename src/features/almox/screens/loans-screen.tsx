import React, { useDeferredValue, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionBadge, LevelBadge, RuptureBadge, ScoreBadge } from '@/features/almox/components/badges';
import {
  ActionButton,
  EmptyState,
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
import { almoxTheme } from '@/features/almox/tokens';
import { Product } from '@/features/almox/types';
import { formatDecimal, matchesQuery } from '@/features/almox/utils';

type LoanTab = 'need' | 'lend';

export default function LoansScreen() {
  const [activeTab, setActiveTab] = useState<LoanTab>('need');
  const [search, setSearch] = useState('');
  const { dataset, categoryFilter, error, loading, refreshing, syncError, syncingBase, syncBase, usingCachedData } = useAlmoxData();
  const deferredSearch = useDeferredValue(search);

  const needItems = dataset.loansNeeded.filter((item) =>
    matchesQuery([item.product_name, item.product_code, item.suggested_hospital], deferredSearch)
  );
  const lendItems = dataset.canLend.filter((item) =>
    matchesQuery([item.product_name, item.product_code], deferredSearch)
  );

  const activeItems = activeTab === 'need' ? needItems : lendItems;

  return (
    <ScreenScrollView>
      <PageHeader
        title="Empréstimos"
        subtitle="Painel focado em redistribuição entre unidades e itens com sobra operacional."
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
          description={`${error} As sugestões de empréstimo exibem a última leitura válida do banco.`}
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
          subtitle={`${activeItems.length} item(ns) na visão atual`}
          icon="loans"
        />
        <InlineTabs
          options={[
            { label: `Pegar emprestado (${needItems.length})`, value: 'need' as const },
            { label: `Pode emprestar (${lendItems.length})`, value: 'lend' as const },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar produto, código ou hospital..."
        />
        <View style={activeTab === 'need' ? styles.needBanner : styles.lendBanner}>
          <Text style={styles.bannerTitle}>
            {activeTab === 'need' ? 'Itens que HMSA precisa remanejar' : 'Itens que HMSA pode ceder'}
          </Text>
          <Text style={styles.bannerText}>
            {loading
              ? 'Carregando a análise de redistribuição a partir do Supabase.'
              : activeTab === 'need'
                ? 'Lista ordenada por criticidade e aderência de remanejamento interno.'
                : 'Estoque local acima da faixa segura, com indicação do risco após eventual empréstimo.'}
          </Text>
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title={activeTab === 'need' ? 'Sugestões de captação' : 'Potencial de cessão'}
          subtitle="Tabela adaptada para React Native com leitura horizontal quando necessário."
          icon={activeTab === 'need' ? 'borrow' : 'lend'}
        />
        {activeItems.length === 0 ? (
          <EmptyState
            title="Nenhum item encontrado"
            description="A base atual não gerou itens para este recorte ou o termo buscado não encontrou correspondências."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeTab === 'need' ? (
              <NeedTable items={needItems} showMaterialLabel={categoryFilter === 'todos'} />
            ) : (
              <LendTable items={lendItems} showMaterialLabel={categoryFilter === 'todos'} />
            )}
          </ScrollView>
        )}
      </SectionCard>
    </ScreenScrollView>
  );
}

function NeedTable({ items, showMaterialLabel }: { items: Product[]; showMaterialLabel: boolean }) {
  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Score</Text>
        <Text style={[styles.tableHeadCell, styles.actionColumn]}>Ação</Text>
        <Text style={[styles.tableHeadCell, styles.hospitalColumn]}>Hospital</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Qtd.</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Pós-ação</Text>
      </View>
      {items.map((item) => (
        <View key={`${item.categoria_material}-${item.product_code}-need`} style={styles.tableRow}>
          <View style={[styles.productColumn, styles.productCell]}>
            <Text style={styles.productName} numberOfLines={1}>
              {item.product_name}
            </Text>
            {showMaterialLabel ? <Text style={styles.productMeta}>{getCategoriaMaterialLabel(item.categoria_material)}</Text> : null}
            {item.rupture_risk ? <RuptureBadge risk={item.rupture_risk} /> : null}
          </View>
          <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(item.sufficiency_days)}</Text>
          <View style={[styles.smallColumn, styles.tableBadgeCell]}>
            <ScoreBadge score={item.score} classification={item.classification} />
          </View>
          <View style={[styles.actionColumn, styles.tableBadgeCell]}>
            <ActionBadge action={item.action} />
          </View>
          <View style={[styles.hospitalColumn, styles.productCell]}>
            <Text style={styles.tableCell}>
              {item.suggested_hospital}
              {item.donor_sufficiency ? ` • ${item.donor_sufficiency.toFixed(0)}d` : ''}
            </Text>
            {item.donor_current_stock != null ? (
              <Text style={styles.productMeta}>Estoque atual: {formatDecimal(item.donor_current_stock, 0)}</Text>
            ) : null}
            {item.nova_suf_doador ? (
              <Text style={styles.productMeta}>Suf. projetada doador: {item.nova_suf_doador.toFixed(0)}d</Text>
            ) : null}
          </View>
          <Text style={[styles.tableCell, styles.smallColumn]}>{item.qty_transfer ?? '—'}</Text>
          <Text style={[styles.tableCell, styles.smallColumn]}>
            {item.projected_suf ? `${item.projected_suf.toFixed(0)}d` : '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LendTable({ items, showMaterialLabel }: { items: Product[]; showMaterialLabel: boolean }) {
  return (
    <View style={styles.tableWrap}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
        <Text style={[styles.tableHeadCell, styles.codeColumn]}>Código</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>CMM</Text>
        <Text style={[styles.tableHeadCell, styles.smallColumn]}>Nível</Text>
        <Text style={[styles.tableHeadCell, styles.actionColumn]}>Risco futuro</Text>
      </View>
      {items.map((item) => (
        <View key={`${item.categoria_material}-${item.product_code}-lend`} style={styles.tableRow}>
          <View style={[styles.productColumn, styles.productCell]}>
            <Text style={styles.productName} numberOfLines={1}>
              {item.product_name}
            </Text>
            <Text style={styles.productMeta}>
              Cobertura alta na unidade base
              {showMaterialLabel ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}` : ''}
            </Text>
          </View>
          <Text style={[styles.tableCell, styles.codeColumn]}>{item.product_code}</Text>
          <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(item.sufficiency_days)}</Text>
          <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(item.avg_monthly_consumption)}</Text>
          <View style={[styles.smallColumn, styles.tableBadgeCell]}>
            <LevelBadge level={item.level} />
          </View>
          <View style={[styles.actionColumn, styles.tableBadgeCell]}>
            <RuptureBadge risk={item.rupture_risk} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  needBanner: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.35)',
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    padding: almoxTheme.spacing.md,
    gap: 6,
  },
  lendBanner: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.35)',
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    padding: almoxTheme.spacing.md,
    gap: 6,
  },
  bannerTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  bannerText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  tableWrap: {
    minWidth: 1040,
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
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  tableCell: {
    color: almoxTheme.colors.text,
    fontSize: 13,
  },
  tableBadgeCell: {
    justifyContent: 'center',
  },
  productColumn: {
    width: 260,
    paddingRight: almoxTheme.spacing.md,
  },
  codeColumn: {
    width: 120,
  },
  smallColumn: {
    width: 110,
  },
  actionColumn: {
    width: 170,
  },
  hospitalColumn: {
    width: 190,
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
});
