import React, { useDeferredValue, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import {
  ActionButton,
  EmptyState,
  InfoBanner,
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
  getLevelTooltips,
} from "@/features/almox/configuracao";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import {
  createExportTimestamp,
  exportRowsToExcel,
} from "@/features/almox/excel";
import { AlmoxTheme } from "@/features/almox/tokens";
import { useAppTheme, useThemedStyles } from "@/features/almox/theme-provider";
import { Level, OrderItem } from "@/features/almox/types";
import { matchesQuery, paginate } from "@/features/almox/utils";

const levelOrder: Level[] = [
  "URGENTE",
  "CRÍTICO",
  "ALTO",
  "MÉDIO",
  "BAIXO",
  "ESTÁVEL",
];

const ORDERS_COLUMNS_CACHE_KEY_PREFIX = "almox:orders:columns:v1";
const ORDERS_COLUMNS_PREFERENCE_SCOPE = "orders.columns";

export default function OrdersScreen() {
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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
    syncError,
    syncNotice,
    syncingBase,
    syncBase,
    usingCachedData,
    systemConfig,
    openProcessSummaryByProductCode,
    productTableAdminConfig,
  } = useAlmoxData();
  const items = dataset.orderItems;
  const levelTooltips = useMemo(
    () => getLevelTooltips(systemConfig),
    [systemConfig],
  );
  const actionTooltips = useMemo(
    () => getActionTooltips(systemConfig),
    [systemConfig],
  );

  const grouped = useMemo(
    () =>
      levelOrder.reduce<Record<Level, OrderItem[]>>((accumulator, level) => {
        accumulator[level] = items.filter((item) => item.level === level);
        return accumulator;
      }, {} as Record<Level, OrderItem[]>),
    [items],
  );

  const filteredItems = useMemo(() => {
    const matched = items.filter((item) =>
      matchesQuery([item.product_name, item.product_code], deferredSearch),
    );

    return sortProductsForTable(
      matched,
      tableSort,
      openProcessSummaryByProductCode,
    ) as OrderItem[];
  }, [deferredSearch, items, openProcessSummaryByProductCode, tableSort]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = paginate(filteredItems, safePage, pageSize);
  const ordersTableColumns = productTableAdminConfig.orders;

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      await exportRowsToExcel({
        fileName: `pedidos_hmsa_${createExportTimestamp()}`,
        sheetName: "Pedidos HMSA",
        rows: filteredItems.map((item) => ({
          Nível: item.level,
          Categoria: getCategoriaMaterialLabel(item.categoria_material),
          "Código do produto": item.product_code,
          Produto: item.product_name,
          "Dias de suficiência": item.sufficiency_days,
          "Consumo médio mensal": item.avg_monthly_consumption,
          "Quantidade sugerida": item.qty_to_buy,
          "Observação curta": item.observation_summary ?? "",
          "Observação detalhada": item.observation_detail ?? "",
        })),
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
        title="Pedidos"
        subtitle="Pré-visualização do pedido automático usando a base real importada."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={syncingBase ? "Sincronizando..." : "Atualizar estoque"}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase("estoque")}
              disabled={refreshing || syncingBase}
            />
            <ActionButton label="Gerar pedido" icon="cart" disabled />
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
          description={`${error} A fila de compra abaixo usa a última leitura bem-sucedida do banco.`}
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
          description="A fila de compra abriu com a última base salva na sessão anterior. O Supabase está sincronizando em background e as prioridades podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <InfoBanner
        title={
          loading
            ? "Carregando regras de compra"
            : "Automação parcialmente bloqueada"
        }
        description={
          loading
            ? "Consultando os itens elegíveis no Supabase para montar a prévia do pedido."
            : "A exportação Excel da prévia já está disponível. A geração automática do pedido real continua bloqueada."
        }
        tone={loading ? "info" : "warning"}
      />

      <SectionCard>
        <SectionTitle
          title="Regras da versão visual"
          subtitle="A lógica abaixo reproduz a intenção do pedido automático original."
          icon="file"
        />
        <View style={styles.ruleList}>
          <Text style={styles.ruleItem}>
            1. Itens do HMSA com cobertura de até 30 dias entram na fila de
            compra.
          </Text>
          <Text style={styles.ruleItem}>
            2. Produtos com possibilidade de empréstimo continuam fora da lista
            de compra.
          </Text>
          <Text style={styles.ruleItem}>
            3. Quantidade sugerida = CMM x 2 para recompor cerca de 60 dias.
          </Text>
        </View>
      </SectionCard>

      {items.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Nenhum item elegível para pedido"
            description="A carga atual não trouxe itens do HMSA dentro da régua de compra definida."
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <SectionTitle
              title="Resumo do pedido"
              subtitle={`${items.length} item(ns) simulados para compra`}
              icon="orders"
            />
            <View style={styles.summaryRow}>
              {levelOrder.map((level) => (
                <SummaryMetric
                  key={level}
                  label={level}
                  value={`${grouped[level].length}`}
                  color={
                    level === "URGENTE" || level === "CRÍTICO"
                      ? tokens.colors.red
                      : level === "ALTO"
                        ? tokens.colors.orange
                        : tokens.colors.brand
                  }
                />
              ))}
              <SummaryMetric
                label="Qtd. total"
                value={`${items.reduce((sum, item) => sum + item.qty_to_buy, 0)}`}
                color={tokens.colors.brand}
              />
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title="Itens do pedido"
              subtitle={`${filteredItems.length} item(ns) encontrados`}
              icon="orders"
            />
            <ProductTable
              items={pageItems}
              showActionColumns
              showProcessColumn
              showObservationColumn
              showMaterialLabel={categoryFilter === "todos"}
              levelTooltips={levelTooltips}
              actionTooltips={actionTooltips}
              processSummaryByProductCode={openProcessSummaryByProductCode}
              doadorSeguroDias={systemConfig.doadorSeguroDias}
              pisoDoadorAposEmprestimoDias={
                systemConfig.pisoDoadorAposEmprestimoDias
              }
              sorting={tableSort}
              onSortChange={setTableSort}
              search={{
                value: search,
                onChangeText: (value) => {
                  setSearch(value);
                  setPage(1);
                },
                placeholder: "Buscar produto ou código...",
              }}
              editableColumns={{
                scope: ORDERS_COLUMNS_PREFERENCE_SCOPE,
                cacheKeyPrefix: ORDERS_COLUMNS_CACHE_KEY_PREFIX,
                bottomScrollbarId: "orders-table-bottom-scrollbar",
              }}
              enabledColumns={ordersTableColumns.enabledColumns}
              defaultVisibleColumns={ordersTableColumns.defaultVisibleColumns}
            />
          </SectionCard>

          <SectionCard>
            <PaginationFooter
              totalItems={filteredItems.length}
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
          </SectionCard>
        </>
      )}
    </ScreenScrollView>
  );
}

function SummaryMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.summaryMetric, { borderColor: `${color}55` }]}>
      <View style={[styles.summaryDot, { backgroundColor: color }]} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    headerActions: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    ruleList: {
      gap: tokens.spacing.sm,
    },
    ruleItem: {
      color: tokens.colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    summaryMetric: {
      flexGrow: 1,
      flexBasis: 180,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      backgroundColor: tokens.colors.surfaceMuted,
      padding: tokens.spacing.md,
      gap: 6,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    summaryDot: {
      width: 12,
      height: 12,
      borderRadius: 999,
    },
    summaryValue: {
      color: tokens.colors.text,
      fontSize: 20,
      fontWeight: "800",
    },
    summaryLabel: {
      color: tokens.colors.textMuted,
      fontSize: 12,
    },
  });
