import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import { PriorityBadge } from "@/features/almox/components/badges";
import {
  ActionButton,
  EmptyState,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from "@/features/almox/components/common";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import {
  createExportTimestamp,
  exportRowsToExcel,
} from "@/features/almox/excel";
import { almoxTheme } from "@/features/almox/tokens";
import { OrderItem, Priority } from "@/features/almox/types";
import { formatDecimal } from "@/features/almox/utils";

export default function OrdersScreen() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { dataset, categoryFilter, error, loading, refreshing, syncError, syncNotice, syncingBase, syncBase, usingCachedData } =
    useAlmoxData();
  const items = dataset.orderItems;
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const priorityOrder = { URGENTE: 0, ALTA: 1, NORMAL: 2 } as const;
        return (
          priorityOrder[left.priority] - priorityOrder[right.priority] ||
          left.sufficiency_days - right.sufficiency_days ||
          left.product_name.localeCompare(right.product_name, "pt-BR")
        );
      }),
    [items],
  );
  const grouped: Record<Priority, OrderItem[]> = {
    URGENTE: sortedItems.filter((item) => item.priority === "URGENTE"),
    ALTA: sortedItems.filter((item) => item.priority === "ALTA"),
    NORMAL: sortedItems.filter((item) => item.priority === "NORMAL"),
  };

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      await exportRowsToExcel({
        fileName: `pedidos_hmsa_${createExportTimestamp()}`,
        sheetName: "Pedidos HMSA",
        rows: sortedItems.map((item) => ({
          Prioridade: item.priority,
          Categoria: getCategoriaMaterialLabel(item.categoria_material),
          "Código do produto": item.product_code,
          Produto: item.product_name,
          "Dias de suficiência": item.sufficiency_days,
          "Consumo médio mensal": item.avg_monthly_consumption,
          "Quantidade sugerida": item.qty_to_buy,
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
        subtitle="Pré-visualização do pedido automático com agrupamento por prioridade, usando a base real importada."
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={syncingBase ? "Sincronizando..." : "Atualizar base"}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase()}
              disabled={refreshing || syncingBase}
            />
            <ActionButton label="Gerar pedido" icon="cart" disabled />
            <ActionButton
              label={exporting ? "Exportando..." : "Exportar Excel"}
              icon="download"
              tone="success"
              onPress={() => void handleExport()}
              disabled={exporting || sortedItems.length === 0}
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
              <SummaryMetric
                label="Urgente"
                value={`${grouped.URGENTE.length}`}
                color={almoxTheme.colors.red}
              />
              <SummaryMetric
                label="Alta"
                value={`${grouped.ALTA.length}`}
                color={almoxTheme.colors.orange}
              />
              <SummaryMetric
                label="Normal"
                value={`${grouped.NORMAL.length}`}
                color={almoxTheme.colors.amber}
              />
              <SummaryMetric
                label="Qtd. total"
                value={`${items.reduce((sum, item) => sum + item.qty_to_buy, 0)}`}
                color={almoxTheme.colors.brand}
              />
            </View>
          </SectionCard>

          {(["URGENTE", "ALTA", "NORMAL"] as const).map((priority) =>
            grouped[priority].length > 0 ? (
              <PrioritySection
                key={priority}
                priority={priority}
                items={grouped[priority]}
                showMaterialLabel={categoryFilter === "todos"}
              />
            ) : null,
          )}
        </>
      )}
    </ScreenScrollView>
  );
}

function PrioritySection({
  priority,
  items,
  showMaterialLabel,
}: {
  priority: Priority;
  items: OrderItem[];
  showMaterialLabel: boolean;
}) {
  return (
    <SectionCard>
      <SectionTitle
        title={`Prioridade ${priority}`}
        subtitle={`${items.length} item(ns) nesta faixa`}
        icon="alert"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadCell, styles.productColumn]}>
              Produto
            </Text>
            <Text style={[styles.tableHeadCell, styles.codeColumn]}>
              Código
            </Text>
            <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
            <Text style={[styles.tableHeadCell, styles.smallColumn]}>CMM</Text>
            <Text style={[styles.tableHeadCell, styles.smallColumn]}>Qtd.</Text>
            <Text style={[styles.tableHeadCell, styles.smallColumn]}>
              Status
            </Text>
          </View>
          {items.map((item) => (
            <View
              key={`${item.categoria_material}-${item.product_code}`}
              style={styles.tableRow}
            >
              <View style={[styles.productColumn, styles.productCell]}>
                <Text style={styles.productName} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={styles.productMeta}>
                  Reposição recomendada para estoque-alvo de 60 dias
                  {showMaterialLabel
                    ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
                    : ""}
                </Text>
              </View>
              <Text style={[styles.tableCell, styles.codeColumn]}>
                {item.product_code}
              </Text>
              <Text style={[styles.tableCell, styles.smallColumn]}>
                {formatDecimal(item.sufficiency_days)}
              </Text>
              <Text style={[styles.tableCell, styles.smallColumn]}>
                {formatDecimal(item.avg_monthly_consumption)}
              </Text>
              <Text style={[styles.tableCell, styles.smallColumn]}>
                {item.qty_to_buy}
              </Text>
              <View style={[styles.smallColumn, styles.badgeCell]}>
                <PriorityBadge priority={priority} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SectionCard>
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
  return (
    <View style={[styles.summaryMetric, { borderColor: `${color}55` }]}>
      <View style={[styles.summaryDot, { backgroundColor: color }]} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    gap: almoxTheme.spacing.sm,
    flexWrap: "wrap",
  },
  ruleList: {
    gap: almoxTheme.spacing.sm,
  },
  ruleItem: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  emptyText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: almoxTheme.spacing.md,
  },
  summaryMetric: {
    flexGrow: 1,
    flexBasis: 180,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    gap: 6,
    shadowColor: almoxTheme.colors.black,
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
    color: almoxTheme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  summaryLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  tableWrap: {
    minWidth: 940,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: almoxTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.lineStrong,
  },
  tableHeadCell: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  productColumn: {
    width: 280,
    paddingRight: almoxTheme.spacing.md,
  },
  codeColumn: {
    width: 120,
  },
  smallColumn: {
    width: 110,
  },
  productCell: {
    gap: 4,
    justifyContent: "center",
  },
  productName: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  productMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  tableCell: {
    color: almoxTheme.colors.text,
    fontSize: 13,
  },
  badgeCell: {
    justifyContent: "center",
  },
});
