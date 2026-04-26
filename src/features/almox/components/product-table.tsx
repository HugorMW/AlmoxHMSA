import React, { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ActionBadge, LevelBadge } from "@/features/almox/components/badges";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import { almoxTheme } from "@/features/almox/tokens";
import {
  Action,
  Level,
  Product,
  ProductProcessSummary,
} from "@/features/almox/types";
import { formatDecimal } from "@/features/almox/utils";

const OBSERVATION_EMPHASIS_REGEX =
  /(Estoque:|Entrada:|VALIDAR USO|Processo:|Parcela:|Cobrança:|Compra:|Remanejamento:|Contingência:|Backup:|Objetivo:|Limite:|Próximo passo:|Status:|Consumo:|sem processo aberto|retirar da lista se obsoleto|E-DOCS\s+[A-Za-z0-9./-]+|(?:ARP|Processo Simplificado|Processo Excepcional)\s+[A-Za-z0-9./-]+|P\d+|\b(?:HMSA|HEC|HDDS|HABF)\b|\d{2}\/\d{2}\/\d{4}|\+\d+d|>\s*\d+\s+anos|\d+\s+un\.|\d+\s+dias|\d+%|(?:há|daqui a)\s+\d+\s+(?:ano\(s\)|mes\(es\)|dia\(s\))|hoje)/g;

export function ProductTable({
  items,
  showActionColumns,
  showProcessColumn,
  showObservationColumn,
  showMaterialLabel,
  levelTooltips,
  actionTooltips,
  processSummaryByProductCode,
  doadorSeguroDias,
  pisoDoadorAposEmprestimoDias,
}: {
  items: Product[];
  showActionColumns: boolean;
  showProcessColumn: boolean;
  showObservationColumn: boolean;
  showMaterialLabel: boolean;
  levelTooltips: Record<Level, string>;
  actionTooltips: Record<Action, string>;
  processSummaryByProductCode: Record<string, ProductProcessSummary>;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
}) {
  const minWidth =
    300 +
    100 +
    90 +
    110 +
    (showProcessColumn ? 190 : 0) +
    (showActionColumns ? 180 + 220 : 0) +
    (showObservationColumn ? 360 : 0);
  const headerScrollRef = useRef<ScrollView>(null);
  const webStickyHeaderStyle =
    Platform.OS === "web"
      ? ({ position: "sticky", top: 0, zIndex: 8 } as any)
      : null;

  return (
    <View style={styles.tableOuter}>
      <View style={[styles.tableStickyHeader, webStickyHeaderStyle]}>
        <ScrollView
          ref={headerScrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={[styles.tableWrap, { minWidth }]}>
            <TableHeader
              showProcessColumn={showProcessColumn}
              showActionColumns={showActionColumns}
              showObservationColumn={showObservationColumn}
            />
          </View>
        </ScrollView>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) =>
          headerScrollRef.current?.scrollTo({
            x: event.nativeEvent.contentOffset.x,
            animated: false,
          })
        }
      >
        <View style={[styles.tableWrap, { minWidth }]}>
          {items.map((item) => (
            <ProductRow
              key={`${item.categoria_material}-${item.hospital}-${item.product_code}`}
              item={item}
              showActionColumns={showActionColumns}
              showProcessColumn={showProcessColumn}
              showObservationColumn={showObservationColumn}
              showMaterialLabel={showMaterialLabel}
              levelTooltip={levelTooltips[item.level]}
              actionTooltip={
                item.action ? actionTooltips[item.action] : undefined
              }
              processSummary={processSummaryByProductCode[item.product_code]}
              doadorSeguroDias={doadorSeguroDias}
              pisoDoadorAposEmprestimoDias={pisoDoadorAposEmprestimoDias}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function TableHeader({
  showProcessColumn,
  showActionColumns,
  showObservationColumn,
}: {
  showProcessColumn: boolean;
  showActionColumns: boolean;
  showObservationColumn: boolean;
}) {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
      <Text style={[styles.tableHeadCell, styles.codeColumn]}>Código</Text>
      <Text style={[styles.tableHeadCell, styles.daysColumn]}>Dias</Text>
      <Text style={[styles.tableHeadCell, styles.levelColumn]}>Nível</Text>
      {showProcessColumn ? (
        <Text style={[styles.tableHeadCell, styles.processColumn]}>Processos</Text>
      ) : null}
      {showActionColumns ? (
        <Text style={[styles.tableHeadCell, styles.actionColumn]}>Ação</Text>
      ) : null}
      {showActionColumns ? (
        <Text style={[styles.tableHeadCell, styles.hospitalColumn]}>
          Hospital sugerido
        </Text>
      ) : null}
      {showObservationColumn ? (
        <Text style={[styles.tableHeadCell, styles.observationColumn]}>
          Obs. operacional
        </Text>
      ) : null}
    </View>
  );
}

function ProductRow({
  item,
  showActionColumns,
  showProcessColumn,
  showObservationColumn,
  showMaterialLabel,
  levelTooltip,
  actionTooltip,
  processSummary,
  doadorSeguroDias,
  pisoDoadorAposEmprestimoDias,
}: {
  item: Product;
  showActionColumns: boolean;
  showProcessColumn: boolean;
  showObservationColumn: boolean;
  showMaterialLabel: boolean;
  levelTooltip: string;
  actionTooltip?: string;
  processSummary?: ProductProcessSummary;
  doadorSeguroDias: number;
  pisoDoadorAposEmprestimoDias: number;
}) {
  return (
    <View style={styles.tableRow}>
      <View style={[styles.productColumn, styles.productCell]}>
        <Text style={styles.productName} numberOfLines={1}>
          {item.product_name}
        </Text>
        <Text style={styles.productMeta}>
          CMM: {formatDecimal(item.avg_monthly_consumption)}
          {showMaterialLabel
            ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}`
            : ""}
        </Text>
      </View>
      <Text style={[styles.tableCell, styles.codeColumn]}>
        {item.product_code}
      </Text>
      <Text style={[styles.tableCell, styles.daysColumn]}>
        {formatDecimal(item.sufficiency_days)}
      </Text>
      <View style={[styles.tableBadgeCell, styles.levelColumn]}>
        <HoverInfo text={levelTooltip}>
          <LevelBadge level={item.level} />
        </HoverInfo>
      </View>
      {showProcessColumn ? (
        <View style={[styles.processColumn, styles.productCell]}>
          <ProcessSummaryCell summary={processSummary} />
        </View>
      ) : null}
      {showActionColumns ? (
        <View style={[styles.tableBadgeCell, styles.actionColumn]}>
          {item.action ? (
            <HoverInfo
              text={
                actionTooltip ??
                "Recomendação operacional calculada para este item."
              }
            >
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
                ? `Melhor hospital para emprestar este item. O valor em dias ao lado do hospital mostra a cobertura atual dessa unidade: ${item.donor_sufficiency?.toFixed(0) ?? "sem dado"} dias. Estoque atual da unidade sugerida: ${item.donor_current_stock != null ? formatDecimal(item.donor_current_stock, 0) : "sem dado"}. Cobertura estimada depois do empréstimo: ${item.nova_suf_doador?.toFixed(0) ?? "sem dado"} dias. Mínimo configurado depois de emprestar: ${pisoDoadorAposEmprestimoDias} dias.`
                : `Nenhum hospital encontrado com o mesmo item e mais de ${doadorSeguroDias} dias de cobertura atual.`
            }
          >
            <View style={styles.productCell}>
              <Text style={styles.tableCell}>
                {item.suggested_hospital
                  ? `${item.suggested_hospital}${item.donor_sufficiency ? ` • ${item.donor_sufficiency.toFixed(0)}d` : ""}`
                  : "—"}
              </Text>
              {item.suggested_hospital && item.donor_current_stock != null ? (
                <Text style={styles.productMeta}>
                  Estoque atual: {formatDecimal(item.donor_current_stock, 0)}
                </Text>
              ) : null}
              {item.suggested_hospital && item.nova_suf_doador != null ? (
                <Text style={styles.productMeta}>
                  Suf. projetada doador:{" "}
                  {formatDecimal(item.nova_suf_doador, 0)}d
                </Text>
              ) : null}
            </View>
          </HoverInfo>
        </View>
      ) : null}
      {showObservationColumn ? (
        <View style={[styles.observationColumn, styles.productCell]}>
          <ObservationCell
            summary={item.observation_summary}
            detail={item.observation_detail}
          />
        </View>
      ) : null}
    </View>
  );
}

function ObservationCell({
  summary,
  detail,
}: {
  summary?: string;
  detail?: string;
}) {
  if (!summary && !detail) {
    return <Text style={styles.tableCell}>—</Text>;
  }

  const tooltipText = [summary, detail].filter(Boolean).join("\n");

  return (
    <HoverInfo text={tooltipText} emphasizeText>
      <View style={styles.productCell}>
        {summary ? (
          <Text style={styles.observationSummary} numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
        {detail ? (
          <HighlightedText
            text={detail}
            textStyle={styles.observationDetail}
            emphasisStyle={styles.observationDetailStrong}
          />
        ) : null}
      </View>
    </HoverInfo>
  );
}

function HighlightedText({
  text,
  textStyle,
  emphasisStyle,
  numberOfLines,
}: {
  text: string;
  textStyle: object;
  emphasisStyle: object;
  numberOfLines?: number;
}) {
  const segments = buildHighlightedSegments(text);

  return (
    <Text style={textStyle} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => (
        <Text
          key={`${segment.text}-${index}`}
          style={segment.emphasized ? emphasisStyle : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

function buildHighlightedSegments(text: string) {
  const regex = new RegExp(OBSERVATION_EMPHASIS_REGEX);
  const segments: { text: string; emphasized: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchedText = match[0];

    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        emphasized: false,
      });
    }

    segments.push({
      text: matchedText,
      emphasized: true,
    });
    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      emphasized: false,
    });
  }

  return segments.length > 0 ? segments : [{ text, emphasized: false }];
}

function ProcessSummaryCell({ summary }: { summary?: ProductProcessSummary }) {
  if (!summary || summary.total_open === 0) {
    return <Text style={styles.tableCell}>—</Text>;
  }

  return (
    <HoverInfo text={buildProcessTooltip(summary)}>
      <View style={styles.processList}>
        {summary.entries.map((entry, entryIndex) => {
          const edocsLabel = entry.edocs
            ? `E-DOCS ${entry.edocs}`
            : "E-DOCS não informado";

          return (
            <View
              key={`${entry.edocs}-${entryIndex}`}
              style={styles.processItem}
            >
              <Text style={styles.processEdocs} numberOfLines={1}>
                {edocsLabel}
              </Text>
              <View style={styles.processParcelasList}>
                {entry.parcelas.map((parcela) => (
                  <Text
                    key={`${entry.edocs}-${parcela.numero}`}
                    style={styles.processMeta}
                    numberOfLines={1}
                  >
                    {`P${parcela.numero} ${parcela.data_label}${
                      parcela.adiamento_dias_uteis
                        ? ` +${parcela.adiamento_dias_uteis}d`
                        : ""
                    }`}
                  </Text>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </HoverInfo>
  );
}

function buildProcessTooltip(summary: ProductProcessSummary) {
  return summary.entries
    .map((entry) => {
      const edocsLabel = entry.edocs
        ? `E-DOCS ${entry.edocs}`
        : "E-DOCS não informado";
      const parcelasLabel = entry.parcelas
        .map(
          (parcela) =>
            `P${parcela.numero} ${parcela.data_label}${
              parcela.adiamento_dias_uteis
                ? ` +${parcela.adiamento_dias_uteis}d`
                : ""
            }`,
        )
        .join("\n");
      return `${edocsLabel}\n${parcelasLabel}`;
    })
    .join("\n\n");
}

function HoverInfo({
  text,
  emphasizeText = false,
  children,
}: {
  text: string;
  emphasizeText?: boolean;
  children: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setShowTooltip(true)}
      onHoverOut={() => setShowTooltip(false)}
      onPressIn={() => setShowTooltip(true)}
      onPressOut={() => setShowTooltip(false)}
      style={styles.tooltipAnchor}
    >
      {showTooltip ? (
        <View pointerEvents="none" style={styles.tooltipBubble}>
          {emphasizeText ? (
            <HighlightedText
              text={text}
              textStyle={styles.tooltipText}
              emphasisStyle={styles.tooltipTextStrong}
            />
          ) : (
            <Text style={styles.tooltipText}>{text}</Text>
          )}
        </View>
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tableOuter: {
    gap: 0,
  },
  tableStickyHeader: {
    backgroundColor: almoxTheme.colors.surface,
  },
  tableWrap: {},
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
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.lineStrong,
  },
  tableCell: {
    color: almoxTheme.colors.text,
    fontSize: 13,
  },
  tableBadgeCell: {
    justifyContent: "center",
    overflow: "visible",
  },
  productColumn: {
    width: 300,
    paddingRight: almoxTheme.spacing.md,
  },
  codeColumn: {
    width: 60,
  },
  daysColumn: {
    width: 50,
  },
  levelColumn: {
    width: 110,
  },
  processColumn: {
    width: 150,
  },
  actionColumn: {
    width: 180,
  },
  hospitalColumn: {
    width: 220,
  },
  observationColumn: {
    width: 360,
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
  processList: {
    gap: 8,
  },
  processItem: {
    gap: 4,
  },
  processParcelasList: {
    gap: 2,
  },
  processEdocs: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: almoxTheme.typography.mono,
  },
  processMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  observationSummary: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  observationDetail: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  observationDetailStrong: {
    color: almoxTheme.colors.text,
    fontWeight: "700",
  },
  tooltipAnchor: {
    position: "relative",
    alignSelf: "flex-start",
    overflow: "visible",
  },
  tooltipBubble: {
    position: "absolute",
    left: 0,
    bottom: "100%",
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
  tooltipTextStrong: {
    fontWeight: "700",
  },
});
