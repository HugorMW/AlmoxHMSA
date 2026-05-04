import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAlmoxData } from "@/features/almox/almox-provider";
import {
  ActionButton,
  AppIcon,
  EmptyState,
  FieldInput,
  FormField,
  InfoBanner,
  InlineTabs,
  PageHeader,
  PageSize,
  PaginationFooter,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from "@/features/almox/components/common";
import {
  getExclusaoCmmMenorQueUmKey,
  getExclusaoCmmMenorQueUmPorCategoria,
} from "@/features/almox/configuracao";
import { useConfirmAction } from "@/features/almox/confirm-action";
import { getCategoriaMaterialLabel } from "@/features/almox/data";
import { useAppTheme, useThemedStyles } from "@/features/almox/theme-provider";
import { AlmoxTheme } from "@/features/almox/tokens";
import {
  CategoriaMaterial,
  CmmExceptionItem,
  FiltroCategoriaMaterial,
} from "@/features/almox/types";
import { formatDecimal, matchesQuery } from "@/features/almox/utils";

const FEEDBACK_AUTO_DISMISS_MS = 5000;

const categoryOptions: { label: string; value: FiltroCategoriaMaterial }[] = [
  { label: "Todos", value: "todos" },
  { label: "Hospitalar", value: "material_hospitalar" },
  { label: "Farmacológico", value: "material_farmacologico" },
];

type ExceptionRow = {
  cd_produto: string;
  ds_produto: string;
  categoria_material: CategoriaMaterial;
  cmm: number | null;
  estoque_atual: number | null;
  source: "hidden" | "saved";
};

type ExceptionTab = "ocultos" | "ativas";
type MainTab = "bloqueados" | "regra";

const DEFAULT_BLACKLIST_PAGE_SIZE: PageSize = 25;

const mainTabOptions: { label: string; value: MainTab }[] = [
  { label: "Bloqueio Produtos Manual", value: "bloqueados" },
  { label: "Bloqueio Produtos Automática (CMM<1)", value: "regra" },
];

function compareExceptionRowsByStock(left: ExceptionRow, right: ExceptionRow) {
  const leftStock = left.estoque_atual ?? Number.NEGATIVE_INFINITY;
  const rightStock = right.estoque_atual ?? Number.NEGATIVE_INFINITY;

  return (
    rightStock - leftStock ||
    left.categoria_material.localeCompare(right.categoria_material) ||
    left.ds_produto.localeCompare(right.ds_produto, "pt-BR") ||
    left.cd_produto.localeCompare(right.cd_produto)
  );
}

const lowConsumptionRuleOptions: {
  categoria: CategoriaMaterial;
  label: string;
  pluralLabel: string;
}[] = [
  {
    categoria: "material_hospitalar",
    label: "Hospitalar",
    pluralLabel: "hospitalares",
  },
  {
    categoria: "material_farmacologico",
    label: "Farmacológico",
    pluralLabel: "farmacológicos",
  },
];

function buildLowConsumptionToggleConfirmation(
  categoriaLabel: string,
  nextValue: boolean,
) {
  const actionLabel = nextValue ? "ativar" : "desativar";
  const resultLabel = nextValue
    ? `ocultar itens ${categoriaLabel} com CMM menor que 1 dos cálculos, mantendo apenas as exceções marcadas no HMSA`
    : `voltar a incluir itens ${categoriaLabel} com CMM menor que 1 nos cálculos`;
  return {
    title: "Confirmar alteração",
    message: `Confirma ${actionLabel} esta regra? Isso vai ${resultLabel}.`,
    confirmLabel: nextValue ? "Ativar" : "Desativar",
  };
}

export default function BlacklistScreen() {
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const confirmAction = useConfirmAction();
  const [mainTab, setMainTab] = useState<MainTab>("bloqueados");
  const [search, setSearch] = useState("");
  const [newCode, setNewCode] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(
    DEFAULT_BLACKLIST_PAGE_SIZE,
  );
  const [exceptionTab, setExceptionTab] = useState<ExceptionTab>("ocultos");
  const [exceptionSearch, setExceptionSearch] = useState("");
  const [exceptionCategoryFilter, setExceptionCategoryFilter] =
    useState<FiltroCategoriaMaterial>("todos");
  const [updatingExceptionCode, setUpdatingExceptionCode] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const {
    blacklistItems,
    blacklistSummary,
    cmmExceptionItems,
    lowConsumptionCandidates: hiddenLowConsumptionItems,
    findHmsaProductNameByCode,
    findHmsaProductCategoryByCode,
    addBlacklistItem,
    removeBlacklistItem,
    addCmmExceptionItem,
    removeCmmExceptionItem,
    usingCachedData,
    warning,
    systemConfig,
    systemConfigLoading,
    systemConfigSaving,
    systemConfigError,
    saveSystemConfig,
  } = useAlmoxData();
  const [categoryFilter, setCategoryFilter] =
    useState<FiltroCategoriaMaterial>("todos");

  const deferredSearch = useDeferredValue(search);
  const deferredExceptionSearch = useDeferredValue(exceptionSearch);

  const items = useMemo(() => {
    return blacklistItems.filter((item) => {
      if (!matchesQuery([item.cd_produto, item.ds_produto], deferredSearch)) {
        return false;
      }
      if (categoryFilter === "todos") {
        return true;
      }
      const categoria = findHmsaProductCategoryByCode(item.cd_produto);
      return categoria === categoryFilter;
    });
  }, [
    blacklistItems,
    deferredSearch,
    categoryFilter,
    findHmsaProductCategoryByCode,
  ]);

  const exceptionRows = useMemo<ExceptionRow[]>(() => {
    const hiddenItemCodes = new Set(
      hiddenLowConsumptionItems.map((item) => item.cd_produto),
    );
    const hiddenRows: ExceptionRow[] = hiddenLowConsumptionItems.map(
      (item) => ({
        cd_produto: item.cd_produto,
        ds_produto: item.ds_produto,
        categoria_material: item.categoria_material,
        cmm: item.cmm,
        estoque_atual: item.estoque_atual,
        source: "hidden",
      }),
    );

    const savedRows: ExceptionRow[] = cmmExceptionItems
      .filter((item) => !hiddenItemCodes.has(item.cd_produto))
      .map((item) => ({
        cd_produto: item.cd_produto,
        ds_produto: item.ds_produto,
        categoria_material: item.categoria_material ?? "material_hospitalar",
        cmm: null,
        estoque_atual: null,
        source: "saved",
      }));

    return [...hiddenRows, ...savedRows]
      .filter((item) => {
        if (
          exceptionCategoryFilter !== "todos" &&
          item.categoria_material !== exceptionCategoryFilter
        ) {
          return false;
        }

        return matchesQuery(
          [item.cd_produto, item.ds_produto],
          deferredExceptionSearch,
        );
      })
      .sort(compareExceptionRowsByStock);
  }, [
    hiddenLowConsumptionItems,
    cmmExceptionItems,
    exceptionCategoryFilter,
    deferredExceptionSearch,
  ]);

  const exceptionByCode = useMemo(() => {
    return new Map(cmmExceptionItems.map((item) => [item.cd_produto, item]));
  }, [cmmExceptionItems]);

  const lowConsumptionStatsByCategory = useMemo(() => {
    const stats = {
      material_hospitalar: {
        activeHidden: 0,
        exceptions: 0,
      },
      material_farmacologico: {
        activeHidden: 0,
        exceptions: 0,
      },
    };

    for (const item of cmmExceptionItems) {
      const categoria =
        item.categoria_material ??
        findHmsaProductCategoryByCode(item.cd_produto) ??
        "material_hospitalar";
      stats[categoria].exceptions += 1;
    }

    for (const item of hiddenLowConsumptionItems) {
      const categoria = item.categoria_material;

      if (
        getExclusaoCmmMenorQueUmPorCategoria(systemConfig, categoria) &&
        !exceptionByCode.has(item.cd_produto)
      ) {
        stats[categoria].activeHidden += 1;
      }
    }

    return stats;
  }, [
    cmmExceptionItems,
    exceptionByCode,
    findHmsaProductCategoryByCode,
    hiddenLowConsumptionItems,
    systemConfig,
  ]);

  const activeLowConsumptionRuleCount = useMemo(
    () =>
      lowConsumptionRuleOptions.filter((option) =>
        getExclusaoCmmMenorQueUmPorCategoria(systemConfig, option.categoria),
      ).length,
    [systemConfig],
  );

  const activeExceptionRows = useMemo<ExceptionRow[]>(() => {
    const hiddenItemsByCode = new Map(
      hiddenLowConsumptionItems.map((item) => [item.cd_produto, item]),
    );

    return cmmExceptionItems
      .map((item) => {
        const hiddenItem = hiddenItemsByCode.get(item.cd_produto);

        return {
          cd_produto: item.cd_produto,
          ds_produto: item.ds_produto,
          categoria_material:
            item.categoria_material ??
            hiddenItem?.categoria_material ??
            "material_hospitalar",
          cmm: hiddenItem?.cmm ?? null,
          estoque_atual: hiddenItem?.estoque_atual ?? null,
          source: hiddenItem ? "hidden" : "saved",
        } satisfies ExceptionRow;
      })
      .filter((item) => {
        if (
          exceptionCategoryFilter !== "todos" &&
          item.categoria_material !== exceptionCategoryFilter
        ) {
          return false;
        }

        return matchesQuery(
          [item.cd_produto, item.ds_produto],
          deferredExceptionSearch,
        );
      })
      .sort(compareExceptionRowsByStock);
  }, [
    cmmExceptionItems,
    hiddenLowConsumptionItems,
    exceptionCategoryFilter,
    deferredExceptionSearch,
  ]);

  useEffect(() => {
    const codigo = newCode.trim();

    if (!codigo) {
      setResolvedName("");
      return;
    }

    const suggestedName = findHmsaProductNameByCode(codigo);
    setResolvedName(suggestedName ?? "");
  }, [newCode, findHmsaProductNameByCode]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  const statusBanner = useMemo(() => {
    if (warning) {
      return {
        tone: "warning" as const,
        title: "Atualização parcial da base",
        description: warning,
      };
    }
    if (usingCachedData) {
      return {
        tone: "info" as const,
        title: "Base local recente em validação",
        description:
          "As exclusões e descrições abriram com a última base salva. O Supabase está sincronizando em background.",
      };
    }
    return null;
  }, [warning, usingCachedData]);

  const isFiltered =
    deferredSearch.trim().length > 0 || categoryFilter !== "todos";
  const totalBlacklist = blacklistItems.length;
  const listSummary = isFiltered
    ? `Mostrando ${items.length} de ${totalBlacklist} itens • ${blacklistSummary.hospitalar} hospitalares • ${blacklistSummary.farmacologico} farmacológicos`
    : `${totalBlacklist} item(ns) excluídos • ${blacklistSummary.hospitalar} hospitalares • ${blacklistSummary.farmacologico} farmacológicos`;

  function resetAddForm() {
    setNewCode("");
    setResolvedName("");
  }

  function closeAddForm() {
    setShowAddForm(false);
    resetAddForm();
  }

  async function handleAdd() {
    const cdProduto = newCode.trim();
    if (!cdProduto) {
      setFeedback({
        tone: "danger",
        message: "Informe o cd_produto para bloquear o item no HMSA.",
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await addBlacklistItem({
        cd_produto: cdProduto,
        ds_produto: resolvedName.trim(),
      });
      resetAddForm();
      setShowAddForm(false);
      setFeedback({
        tone: "success",
        message: `Produto ${cdProduto} excluído com sucesso do HMSA.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao salvar a exclusão no Supabase.";
      setFeedback({ tone: "danger", message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(
    id: string,
    cdProduto: string,
    dsProduto: string,
  ) {
    setFeedback(null);
    const confirmed = await confirmAction({
      title: "Remover exclusão",
      message: `Voltar a exibir "${dsProduto || cdProduto}" no HMSA?`,
      confirmLabel: "Remover",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setRemovingId(id);

    try {
      await removeBlacklistItem(id);
      setFeedback({
        tone: "success",
        message: `Produto ${cdProduto} voltou a aparecer no HMSA.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao remover a exclusão do Supabase.";
      setFeedback({ tone: "danger", message });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleToggleLowConsumption(
    categoria: CategoriaMaterial,
    nextValue: boolean,
  ) {
    setFeedback(null);
    const confirmed = await confirmAction(
      buildLowConsumptionToggleConfirmation(
        lowConsumptionRuleOptions.find(
          (option) => option.categoria === categoria,
        )?.pluralLabel ?? "selecionados",
        nextValue,
      ),
    );

    if (!confirmed) {
      return;
    }

    try {
      const key = getExclusaoCmmMenorQueUmKey(categoria);
      await saveSystemConfig({
        ...systemConfig,
        [key]: nextValue,
      });
      setFeedback({
        tone: "success",
        message: nextValue
          ? `Itens ${categoria === "material_hospitalar" ? "hospitalares" : "farmacológicos"} com consumo mensal menor que 1 foram ocultados dos cálculos.`
          : `Itens ${categoria === "material_hospitalar" ? "hospitalares" : "farmacológicos"} com consumo mensal menor que 1 voltaram aos cálculos.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao salvar a exclusão automática.";
      setFeedback({ tone: "danger", message });
    }
  }

  async function handleToggleCmmException(row: ExceptionRow) {
    const activeException = exceptionByCode.get(row.cd_produto);
    setUpdatingExceptionCode(row.cd_produto);
    setFeedback(null);

    try {
      if (activeException?.id) {
        await removeCmmExceptionItem(activeException.id);
        setFeedback({
          tone: "success",
          message: `Produto ${row.cd_produto} deixou de ser exceção da exclusão automática.`,
        });
      } else {
        await addCmmExceptionItem({
          cd_produto: row.cd_produto,
          ds_produto: row.ds_produto,
          categoria_material: row.categoria_material,
        });
        setFeedback({
          tone: "success",
          message: `Produto ${row.cd_produto} continuará aparecendo mesmo com consumo mensal menor que 1.`,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao atualizar a exceção automática.";
      setFeedback({ tone: "danger", message });
    } finally {
      setUpdatingExceptionCode(null);
    }
  }

  return (
    <ScreenScrollView>
      <PageHeader subtitle="Gerencia os cd_produto que devem sumir do site apenas para o HMSA. As demais unidades não são afetadas." />

      {statusBanner ? (
        <InfoBanner
          title={statusBanner.title}
          description={statusBanner.description}
          tone={statusBanner.tone}
        />
      ) : null}

      {feedback ? (
        <InfoBanner
          title={
            feedback.tone === "success"
              ? "Atualização concluída"
              : "Falha ao atualizar exclusões"
          }
          description={feedback.message}
          tone={feedback.tone}
        />
      ) : null}

      <InlineTabs<MainTab>
        options={mainTabOptions}
        value={mainTab}
        onChange={setMainTab}
      />

      {mainTab === "bloqueados" ? (
        <SectionCard>
          <SectionTitle
            title="Itens bloqueados"
            subtitle={listSummary}
            icon="blocked"
            aside={
              <ActionButton
                label={showAddForm ? "Fechar" : "Adicionar item"}
                icon={showAddForm ? "chevronUp" : "plus"}
                tone={showAddForm ? "neutral" : "danger"}
                onPress={() =>
                  showAddForm ? closeAddForm() : setShowAddForm(true)
                }
              />
            }
          />

          {showAddForm ? (
            <View style={styles.addFormBox}>
              <Text style={styles.addFormHint}>
                O cd_produto precisa existir no HMSA. A descrição é preenchida
                automaticamente.
              </Text>
              <View style={styles.addFormGrid}>
                <View style={styles.addFormCodeField}>
                  <FormField label="Código do produto">
                    <FieldInput
                      value={newCode}
                      onChangeText={setNewCode}
                      placeholder="cd_produto"
                    />
                  </FormField>
                </View>
                <View style={styles.addFormNameField}>
                  <FormField label="Descrição (auto)">
                    <FieldInput
                      value={resolvedName}
                      editable={false}
                      placeholder="Preenchimento automático a partir do HMSA"
                      style={styles.readOnlyInput}
                    />
                  </FormField>
                </View>
              </View>
              {newCode.trim() && !resolvedName.trim() ? (
                <Text style={styles.lookupHint}>
                  Nenhum item do HMSA foi encontrado para o código informado.
                </Text>
              ) : null}
              <View style={styles.addFormActions}>
                <ActionButton
                  label="Cancelar"
                  tone="neutral"
                  onPress={closeAddForm}
                  disabled={submitting}
                />
                <ActionButton
                  label={submitting ? "Salvando..." : "Bloquear item"}
                  icon="plus"
                  tone="danger"
                  disabled={
                    submitting || !newCode.trim() || !resolvedName.trim()
                  }
                  onPress={() => void handleAdd()}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.listToolbar}>
            <View style={styles.searchSlot}>
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por código ou descrição..."
              />
            </View>
            <View style={styles.filterRow}>
              {categoryOptions.map((option) => {
                const isActive = option.value === categoryFilter;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setCategoryFilter(option.value)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      isActive ? styles.filterChipActive : null,
                      pressed ? styles.filterChipPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive ? styles.filterChipTextActive : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {items.length === 0 ? (
            <EmptyState
              title={
                isFiltered
                  ? "Nenhum item para o filtro"
                  : "Nenhum item excluído"
              }
              description={
                isFiltered
                  ? "Ajuste a busca ou a categoria para ver itens bloqueados."
                  : "Cadastre um cd_produto para ocultá-lo das telas do HMSA."
              }
            />
          ) : (
            <>
              <View style={styles.list}>
                {pagedItems.map((item) => {
                  const categoria = findHmsaProductCategoryByCode(
                    item.cd_produto,
                  );
                  const isRemoving = removingId === item.id;
                  return (
                    <View key={item.id ?? item.cd_produto} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.name} numberOfLines={2}>
                          {item.ds_produto ||
                            "Produto sem descrição cadastrada"}
                        </Text>
                        <View style={styles.rowMetaRow}>
                          <Text style={styles.metaCode}>{item.cd_produto}</Text>
                          {categoria ? (
                            <View style={styles.categoriaChip}>
                              <Text style={styles.categoriaChipText}>
                                {getCategoriaMaterialLabel(categoria)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <IconButton
                        icon="trash"
                        tone="danger"
                        accessibilityLabel={`Remover ${item.cd_produto}`}
                        disabled={!item.id || isRemoving}
                        onPress={() =>
                          item.id
                            ? void handleRemove(
                                item.id,
                                item.cd_produto,
                                item.ds_produto,
                              )
                            : undefined
                        }
                      />
                    </View>
                  );
                })}
              </View>
              <PaginationFooter
                totalItems={items.length}
                pageItemsCount={pagedItems.length}
                page={safePage}
                totalPages={totalPages}
                pageSize={pageSize}
                itemLabel="itens"
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
              />
            </>
          )}
        </SectionCard>
      ) : null}

      {mainTab === "regra" ? (
        <SectionCard>
          <SectionTitle
            title="Regra automática (CMM<1)"
            subtitle="Oculta itens com consumo mensal menor que 1 por classificação, com exceções pontuais para o HMSA."
            icon="settings"
          />

          <View style={styles.ruleOverviewGrid}>
            <View style={styles.ruleOverviewCard}>
              <Text style={styles.ruleOverviewValue}>
                {activeLowConsumptionRuleCount}/2
              </Text>
              <Text style={styles.ruleOverviewLabel}>
                Classificações ativas
              </Text>
            </View>
            <View style={styles.ruleOverviewCard}>
              <Text style={styles.ruleOverviewValue}>
                {cmmExceptionItems.length}
              </Text>
              <Text style={styles.ruleOverviewLabel}>Exceções no HMSA</Text>
            </View>
            <View style={styles.ruleOverviewCard}>
              <Text style={styles.ruleOverviewValue}>
                {lowConsumptionStatsByCategory.material_hospitalar
                  .activeHidden +
                  lowConsumptionStatsByCategory.material_farmacologico
                    .activeHidden}
              </Text>
              <Text style={styles.ruleOverviewLabel}>Ocultos agora</Text>
            </View>
          </View>

          {systemConfigError ? (
            <View style={styles.inlineError}>
              <AppIcon name="alert" size={14} color={tokens.colors.red} />
              <Text style={styles.inlineErrorText}>
                {systemConfigError} A lista manual continua disponível.
              </Text>
            </View>
          ) : null}

          <View style={styles.ruleBlock}>
            <View style={styles.ruleBlockHeader}>
              <Text style={styles.ruleBlockTitle}>
                1. Ativar por classificação
              </Text>
              <Text style={styles.ruleBlockSubtitle}>
                Defina em qual classificação a regra automática deve valer.
              </Text>
            </View>

            <View style={styles.ruleToggleGrid}>
              {lowConsumptionRuleOptions.map((option) => {
                const stats = lowConsumptionStatsByCategory[option.categoria];
                const isActive = getExclusaoCmmMenorQueUmPorCategoria(
                  systemConfig,
                  option.categoria,
                );

                return (
                  <RuleCategoryCard
                    key={option.categoria}
                    title={option.label}
                    description={`Itens ${option.pluralLabel} com CMM menor que 1 deixam de entrar nos KPIs, listas e recomendações.`}
                    exceptions={stats.exceptions}
                    hiddenCount={stats.activeHidden}
                    value={isActive}
                    disabled={systemConfigLoading || systemConfigSaving}
                    onChange={(nextValue) =>
                      void handleToggleLowConsumption(
                        option.categoria,
                        nextValue,
                      )
                    }
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.ruleBlock}>
            <View style={styles.ruleBlockHeader}>
              <Text style={styles.ruleBlockTitle}>2. Exceções do HMSA</Text>
              <Text style={styles.ruleBlockSubtitle}>
                Escolha quais itens devem continuar visíveis mesmo quando a
                regra estiver ativa.
              </Text>
            </View>

            <Text style={styles.exceptionMeta}>
              Os itens da aba Ocultos vêm da base atual do HMSA com CMM menor
              que 1. A blacklist manual continua tendo prioridade sobre qualquer
              exceção.
            </Text>

            <CmmExceptionsPanel
              rows={exceptionRows}
              activeRows={activeExceptionRows}
              exceptionByCode={exceptionByCode}
              search={exceptionSearch}
              categoryFilter={exceptionCategoryFilter}
              updatingCode={updatingExceptionCode}
              activeTab={exceptionTab}
              onTabChange={setExceptionTab}
              onSearchChange={setExceptionSearch}
              onCategoryFilterChange={setExceptionCategoryFilter}
              onToggleException={(row) => void handleToggleCmmException(row)}
            />
          </View>
        </SectionCard>
      ) : null}
    </ScreenScrollView>
  );
}

function CmmExceptionsPanel({
  rows,
  activeRows,
  exceptionByCode,
  search,
  categoryFilter,
  updatingCode,
  activeTab,
  onTabChange,
  onSearchChange,
  onCategoryFilterChange,
  onToggleException,
}: {
  rows: ExceptionRow[];
  activeRows: ExceptionRow[];
  exceptionByCode: Map<string, CmmExceptionItem>;
  search: string;
  categoryFilter: FiltroCategoriaMaterial;
  updatingCode: string | null;
  activeTab: ExceptionTab;
  onTabChange: (next: ExceptionTab) => void;
  onSearchChange: (value: string) => void;
  onCategoryFilterChange: (value: FiltroCategoriaMaterial) => void;
  onToggleException: (row: ExceptionRow) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const visibleRows = activeTab === "ativas" ? activeRows : rows;

  return (
    <View style={styles.exceptionsPanel}>
      <View style={styles.exceptionsPanelHeader}>
        <Text style={styles.exceptionsPanelTitle}>Ocultos e exceções</Text>
        <Text style={styles.exceptionsPanelSubtitle}>
          Marque itens novos ou em implantação para mantê-los visíveis no app.
        </Text>
      </View>

      <InlineTabs<ExceptionTab>
        size="sm"
        options={[
          { label: `Ocultos (${rows.length})`, value: "ocultos" },
          { label: `Exceções (${activeRows.length})`, value: "ativas" },
        ]}
        value={activeTab}
        onChange={onTabChange}
      />

      <View style={styles.exceptionsFilters}>
        <SearchField
          value={search}
          onChangeText={onSearchChange}
          placeholder="Buscar por código ou descrição..."
        />
        <View style={styles.filterRow}>
          {categoryOptions.map((option) => {
            const isActive = option.value === categoryFilter;
            return (
              <Pressable
                key={option.value}
                onPress={() => onCategoryFilterChange(option.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  isActive ? styles.filterChipActive : null,
                  pressed ? styles.filterChipPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive ? styles.filterChipTextActive : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {visibleRows.length === 0 ? (
        <EmptyState
          title={
            activeTab === "ativas"
              ? "Nenhuma exceção ativa"
              : "Nenhum item oculto"
          }
          description={
            activeTab === "ativas"
              ? "Marque itens na aba Ocultos para mantê-los visíveis mesmo com CMM menor que 1."
              : "A base atual não trouxe itens do HMSA com consumo mensal menor que 1 para este filtro."
          }
        />
      ) : (
        <ScrollView
          style={styles.exceptionsList}
          contentContainerStyle={styles.exceptionsListContent}
          nestedScrollEnabled
        >
          {visibleRows.map((row) => {
            const activeException = exceptionByCode.get(row.cd_produto);
            const isActive = Boolean(activeException);
            const isUpdating = updatingCode === row.cd_produto;

            return (
              <View
                key={`${activeTab}-${row.source}-${row.cd_produto}`}
                style={[
                  styles.exceptionRow,
                  isActive ? styles.exceptionRowActive : null,
                ]}
              >
                <View style={styles.exceptionRowMain}>
                  <Text style={styles.name}>
                    {row.ds_produto || "Produto sem descrição cadastrada"}
                  </Text>
                  <Text style={styles.meta}>
                    Código: {row.cd_produto} •{" "}
                    {getCategoriaMaterialLabel(row.categoria_material)}
                  </Text>
                  <Text style={styles.meta}>
                    CMM:{" "}
                    {row.cmm == null
                      ? "sem dado atual"
                      : formatDecimal(row.cmm, 2)}
                    {" • "}
                    Estoque atual:{" "}
                    {row.estoque_atual == null
                      ? "sem dado atual"
                      : formatDecimal(row.estoque_atual, 0)}
                  </Text>
                </View>
                <View style={styles.exceptionRowActions}>
                  {isActive ? (
                    <Text style={styles.exceptionActiveLabel}>
                      Exceção ativa
                    </Text>
                  ) : null}
                  <ActionButton
                    label={
                      isUpdating
                        ? "Salvando..."
                        : isActive
                          ? "Remover exceção"
                          : "Manter visível"
                    }
                    icon={isActive ? "trash" : "check"}
                    tone={isActive ? "danger" : "success"}
                    disabled={
                      isUpdating ||
                      (row.source === "saved" && !activeException?.id)
                    }
                    onPress={() => onToggleException(row)}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RuleCategoryCard({
  title,
  description,
  exceptions,
  hiddenCount,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  exceptions: number;
  hiddenCount: number;
  value: boolean;
  disabled?: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={[
        styles.ruleCategoryCard,
        value ? styles.ruleCategoryCardActive : null,
        disabled ? styles.ruleCategoryCardDisabled : null,
      ]}
    >
      <View style={styles.ruleCategoryCardHeader}>
        <View style={styles.ruleCategoryCardTitleWrap}>
          <Text style={styles.ruleCategoryCardEyebrow}>{title}</Text>
          <Text style={styles.ruleCategoryCardTitle}>CMM menor que 1</Text>
        </View>
        <View
          style={[
            styles.ruleCategoryStateBadge,
            value ? styles.ruleCategoryStateBadgeActive : null,
          ]}
        >
          <Text
            style={[
              styles.ruleCategoryStateBadgeText,
              value ? styles.ruleCategoryStateBadgeTextActive : null,
            ]}
          >
            {value ? "Ativa" : "Inativa"}
          </Text>
        </View>
      </View>

      <Text style={styles.ruleCategoryDescription}>{description}</Text>

      <View style={styles.ruleCategoryMetrics}>
        <View style={styles.ruleCategoryMetricChip}>
          <Text style={styles.ruleCategoryMetricChipText}>
            {exceptions} exceções
          </Text>
        </View>
        <View style={styles.ruleCategoryMetricChip}>
          <Text style={styles.ruleCategoryMetricChipText}>
            {value ? hiddenCount : 0} ocultos agora
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onChange(!value)}
        style={({ pressed }) => [
          styles.ruleCategoryToggleRow,
          pressed && !disabled ? styles.ruleCategoryToggleRowPressed : null,
        ]}
      >
        <View style={styles.ruleCategoryToggleText}>
          <Text style={styles.ruleCategoryToggleLabel}>
            Aplicar regra nesta classificação
          </Text>
          <Text style={styles.ruleCategoryToggleHint}>
            {value
              ? `${hiddenCount} item(ns) desta classificação estão ocultos pela regra atual.`
              : "Itens desta classificação continuam aparecendo normalmente, salvo blacklist manual."}
          </Text>
        </View>
        <View
          style={[styles.toggleTrack, value ? styles.toggleTrackActive : null]}
        >
          <View
            style={[
              styles.toggleThumb,
              value ? styles.toggleThumbActive : null,
              value ? { backgroundColor: tokens.colors.black } : null,
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

function IconButton({
  icon,
  tone,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  icon: "trash";
  tone: "danger" | "neutral";
  accessibilityLabel: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const activeColor =
    tone === "danger" ? tokens.colors.red : tokens.colors.text;
  const color = disabled ? tokens.colors.textMuted : activeColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled ? styles.iconButtonPressed : null,
        disabled ? styles.iconButtonDisabled : null,
      ]}
    >
      <AppIcon name={icon} size={16} color={color} />
    </Pressable>
  );
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    list: {
      gap: tokens.spacing.xs,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.colors.line,
    },
    rowMain: {
      flex: 1,
      gap: 4,
    },
    rowMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    metaCode: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    categoriaChip: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 2,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceMuted,
    },
    categoriaChipText: {
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
    },
    name: {
      color: tokens.colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    meta: {
      color: tokens.colors.textMuted,
      fontSize: 12,
    },
    readOnlyInput: {
      opacity: 0.78,
    },
    lookupHint: {
      color: tokens.colors.orange,
      fontSize: 12,
      lineHeight: 18,
    },
    addFormBox: {
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    addFormHint: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    addFormGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    addFormCodeField: {
      flexBasis: 180,
      flexGrow: 1,
    },
    addFormNameField: {
      flexBasis: 320,
      flexGrow: 2,
    },
    addFormActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: tokens.spacing.sm,
    },
    listToolbar: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    searchSlot: {
      flexBasis: 240,
      flexGrow: 1,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    iconButtonPressed: {
      opacity: 0.78,
    },
    iconButtonDisabled: {
      opacity: 0.55,
    },
    inlineError: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: "rgba(248, 113, 113, 0.45)",
      backgroundColor: "rgba(248, 113, 113, 0.10)",
    },
    inlineErrorText: {
      flex: 1,
      color: tokens.colors.red,
      fontSize: 12,
      lineHeight: 18,
    },
    exceptionMeta: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    ruleOverviewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    ruleOverviewCard: {
      flexBasis: 180,
      flexGrow: 1,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      padding: tokens.spacing.md,
      gap: 4,
    },
    ruleOverviewValue: {
      color: tokens.colors.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    ruleOverviewLabel: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    ruleBlock: {
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.md,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.line,
    },
    ruleBlockHeader: {
      gap: 4,
    },
    ruleBlockTitle: {
      color: tokens.colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    ruleBlockSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    exceptionsPanel: {
      gap: tokens.spacing.md,
    },
    ruleToggleGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    ruleToggleItem: {
      flexBasis: 320,
      flexGrow: 1,
    },
    ruleCategoryCard: {
      flexBasis: 320,
      flexGrow: 1,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    ruleCategoryCardActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.surfaceActiveSoft,
    },
    ruleCategoryCardDisabled: {
      opacity: 0.6,
    },
    ruleCategoryCardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      flexWrap: "wrap",
    },
    ruleCategoryCardTitleWrap: {
      flex: 1,
      minWidth: 180,
      gap: 2,
    },
    ruleCategoryCardEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    ruleCategoryCardTitle: {
      color: tokens.colors.text,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.3,
    },
    ruleCategoryStateBadge: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 4,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceStrong,
    },
    ruleCategoryStateBadgeActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.brand,
    },
    ruleCategoryStateBadgeText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    ruleCategoryStateBadgeTextActive: {
      color: tokens.colors.black,
    },
    ruleCategoryDescription: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    ruleCategoryMetrics: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    ruleCategoryMetricChip: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceRaised,
    },
    ruleCategoryMetricChipText: {
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
    },
    ruleCategoryToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      paddingTop: tokens.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.line,
    },
    ruleCategoryToggleRowPressed: {
      opacity: 0.84,
    },
    ruleCategoryToggleText: {
      flex: 1,
      gap: 4,
      minWidth: 220,
    },
    ruleCategoryToggleLabel: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    ruleCategoryToggleHint: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    exceptionsPanelHeader: {
      gap: 4,
    },
    exceptionsPanelTitle: {
      color: tokens.colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    exceptionsPanelSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    exceptionsFilters: {
      gap: tokens.spacing.sm,
    },
    exceptionsList: {
      maxHeight: 520,
    },
    exceptionsListContent: {
      gap: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
    },
    exceptionRow: {
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceRaised,
      padding: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
      flexWrap: "wrap",
    },
    exceptionRowActive: {
      borderColor: "rgba(52, 211, 153, 0.38)",
      backgroundColor: "rgba(52, 211, 153, 0.10)",
    },
    exceptionRowMain: {
      flex: 1,
      minWidth: 260,
      gap: 4,
    },
    exceptionRowActions: {
      alignItems: "flex-end",
      gap: tokens.spacing.xs,
    },
    exceptionActiveLabel: {
      color: tokens.colors.green,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    filterChip: {
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.xs,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surface,
    },
    filterChipActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.brand,
    },
    filterChipPressed: {
      opacity: 0.75,
    },
    filterChipText: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    filterChipTextActive: {
      color: "#ffffff",
    },
    toggle: {
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      overflow: "hidden",
    },
    toggleActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.surfaceActiveSoft,
    },
    toggleDisabled: {
      opacity: 0.55,
    },
    toggleHeader: {
      padding: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    togglePressed: {
      opacity: 0.88,
    },
    toggleHeaderText: {
      flex: 1,
      gap: 6,
      minWidth: 220,
    },
    toggleTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    toggleTitle: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    toggleDescription: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    toggleStateBadge: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 4,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceStrong,
    },
    toggleStateBadgeActive: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.brand,
    },
    toggleStateBadgeText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    toggleStateBadgeTextActive: {
      color: tokens.colors.black,
    },
    toggleDetailsButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: tokens.spacing.xs,
      borderTopWidth: 1,
      borderTopColor: tokens.colors.line,
    },
    toggleDetailsButtonPressed: {
      opacity: 0.7,
    },
    toggleDetailsButtonText: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    toggleDetailsBody: {
      paddingHorizontal: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    toggleScopeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    toggleScopeChip: {
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 6,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceRaised,
    },
    toggleScopeChipText: {
      color: tokens.colors.textSoft,
      fontSize: 11,
      fontWeight: "700",
    },
    toggleNote: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
    },
    toggleTrack: {
      width: 50,
      height: 30,
      borderRadius: tokens.radii.pill,
      backgroundColor: tokens.colors.surfaceStrong,
      padding: 3,
      justifyContent: "center",
    },
    toggleTrackActive: {
      backgroundColor: tokens.colors.brand,
    },
    toggleThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: tokens.colors.white,
      borderWidth: 1,
      borderColor: tokens.colors.line,
    },
    toggleThumbActive: {
      alignSelf: "flex-end",
    },
  });
