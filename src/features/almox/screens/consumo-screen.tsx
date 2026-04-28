import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAlmoxData } from '@/features/almox/almox-provider';
import {
  ActionButton,
  EmptyState,
  InfoBanner,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { AlmoxTheme } from '@/features/almox/tokens';
import { useThemedStyles } from '@/features/almox/theme-provider';
import { CategoriaMaterial } from '@/features/almox/types';
import { formatDecimal, matchesQuery, paginate } from '@/features/almox/utils';
import { getSupabaseClient } from '@/lib/supabase';

type ConsumoRow = {
  categoria_material: CategoriaMaterial | string | null;
  codigo_unidade: string;
  nome_unidade: string | null;
  codigo_produto: string;
  nome_produto: string | null;
  unidade_medida_produto: string | null;
  estoque_atual: number | string | null;
  consumo_medio: number | string | null;
  suficiencia_em_dias: number | string | null;
  data_snapshot_inicio: string | null;
  estoque_inicio_mes: number | string | null;
  consumo_mes_ate_hoje: number | string | null;
  percentual_consumido: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowIsHmsa(codigoUnidade: string) {
  return codigoUnidade.trim().toUpperCase() === 'HMSASOUL';
}

function normalizeCategoria(value: ConsumoRow['categoria_material']): CategoriaMaterial {
  return value === 'material_farmacologico' ? 'material_farmacologico' : 'material_hospitalar';
}

export default function ConsumoScreen() {
  const styles = useThemedStyles(createStyles);
  const { categoryFilter, syncingBase, syncBase, refreshing, syncError, syncNotice } = useAlmoxData();
  const [rows, setRows] = useState<ConsumoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const deferredSearch = useDeferredValue(search);

  const loadConsumo = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('almox_consumo_mes_atual')
        .select('*');

      if (error) throw error;
      setRows((data ?? []) as ConsumoRow[]);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Falha ao consultar a apuração de consumo.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConsumo();
  }, [loadConsumo]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  const filteredRows = useMemo(() => {
    const hmsaRows = rows.filter((row) => rowIsHmsa(row.codigo_unidade));
    const categorizedRows =
      categoryFilter === 'todos'
        ? hmsaRows
        : hmsaRows.filter((row) => normalizeCategoria(row.categoria_material) === categoryFilter);

    const withConsumption = categorizedRows.filter((row) => {
      const consumoMedio = toNumber(row.consumo_medio);
      const consumoMes = toNumber(row.consumo_mes_ate_hoje);
      return consumoMedio > 0 && consumoMes > consumoMedio;
    });

    const matched = withConsumption.filter((row) =>
      matchesQuery([row.nome_produto ?? undefined, row.codigo_produto], deferredSearch)
    );

    return matched.sort((left, right) => {
      const leftPerc = toNumber(left.percentual_consumido);
      const rightPerc = toNumber(right.percentual_consumido);
      return rightPerc - leftPerc;
    });
  }, [rows, categoryFilter, deferredSearch]);

  const hasAnySnapshot = rows.some((row) => row.data_snapshot_inicio != null);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = paginate(filteredRows, safePage, pageSize);

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle="Produtos HMSA que já ultrapassaram o consumo médio mensal antes do mês terminar."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={loading ? 'Atualizando...' : 'Recarregar'}
              icon="refresh"
              tone="neutral"
              onPress={() => void loadConsumo()}
              disabled={loading}
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

      {loadError ? (
        <InfoBanner title="Falha ao carregar apuração" description={loadError} tone="danger" />
      ) : null}

      {syncError ? (
        <InfoBanner title="Falha ao sincronizar com o SISCORE" description={syncError} tone="danger" />
      ) : null}

      {syncNotice ? <InfoBanner title="Sincronizacao da base" description={syncNotice} tone="info" /> : null}

      {!loading && !hasAnySnapshot ? (
        <InfoBanner
          title="Snapshot diário ainda não disponível"
          description="A apuração compara o estoque do primeiro dia do mês com o atual. Assim que a rotina diária gravar o primeiro snapshot, os dados começam a aparecer aqui."
          tone="warning"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Itens acima do consumo médio"
          subtitle={`${filteredRows.length} produto(s) com consumo acumulado acima da média mensal`}
          icon="consumo"
        />
        <SearchField
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Buscar produto ou código..."
        />

        {loading ? (
          <EmptyState title="Carregando apuração" description="Consultando snapshot do mês e estoque atual." />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="Nenhum item em alerta"
            description={
              hasAnySnapshot
                ? 'Nenhum produto ultrapassou o consumo médio mensal até o momento.'
                : 'Aguardando o primeiro snapshot do mês para iniciar a comparação.'
            }
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
                <Text style={[styles.tableHeadCell, styles.codeColumn]}>Código</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Início mês</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Atual</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Consumo mês</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>CMM</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>% CMM</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
              </View>
              {pageRows.map((row) => {
                const consumoMes = toNumber(row.consumo_mes_ate_hoje);
                const consumoMedio = toNumber(row.consumo_medio);
                const percentual = toNumber(row.percentual_consumido) * 100;
                const estoqueInicio = toNumber(row.estoque_inicio_mes);
                const estoqueAtual = toNumber(row.estoque_atual);
                const suf = toNumber(row.suficiencia_em_dias);
                const categoriaLabel =
                  categoryFilter === 'todos'
                    ? getCategoriaMaterialLabel(normalizeCategoria(row.categoria_material))
                    : null;

                return (
                  <View key={`${row.codigo_unidade}-${row.codigo_produto}`} style={styles.tableRow}>
                    <View style={[styles.productColumn, styles.productCell]}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {row.nome_produto ?? '—'}
                      </Text>
                      {categoriaLabel ? <Text style={styles.productMeta}>{categoriaLabel}</Text> : null}
                      {row.data_snapshot_inicio ? (
                        <Text style={styles.productMeta}>
                          Snapshot: {new Date(row.data_snapshot_inicio).toLocaleDateString('pt-BR')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tableCell, styles.codeColumn]}>{row.codigo_produto}</Text>
                    <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(estoqueInicio, 0)}</Text>
                    <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(estoqueAtual, 0)}</Text>
                    <Text style={[styles.tableCell, styles.smallColumn, styles.cellWarning]}>
                      {formatDecimal(consumoMes, 0)}
                    </Text>
                    <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(consumoMedio, 0)}</Text>
                    <Text style={[styles.tableCell, styles.smallColumn, styles.cellWarning]}>
                      {`${formatDecimal(percentual, 0)}%`}
                    </Text>
                    <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(suf)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
        {filteredRows.length > 0 ? (
          <PaginationFooter
            totalItems={filteredRows.length}
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

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  tableWrap: {
    minWidth: 1040,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.lineStrong,
  },
  tableHeadCell: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.line,
  },
  tableCell: {
    color: tokens.colors.text,
    fontSize: 13,
  },
  cellWarning: {
    color: '#b4234a',
    fontWeight: '700',
  },
  productColumn: {
    width: 260,
    paddingRight: tokens.spacing.md,
  },
  codeColumn: {
    width: 120,
  },
  smallColumn: {
    width: 110,
  },
  productCell: {
    gap: 4,
    justifyContent: 'center',
  },
  productName: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  productMeta: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
});

