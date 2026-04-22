import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  AppIcon,
  EmptyState,
  FieldInput,
  FormField,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { almoxTheme } from '@/features/almox/tokens';
import { CategoriaMaterial, CmmExceptionItem, FiltroCategoriaMaterial } from '@/features/almox/types';
import { formatDecimal, matchesQuery } from '@/features/almox/utils';

const categoryOptions: { label: string; value: FiltroCategoriaMaterial }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Hospitalar', value: 'material_hospitalar' },
  { label: 'Farmacológico', value: 'material_farmacologico' },
];

type ExceptionRow = {
  cd_produto: string;
  ds_produto: string;
  categoria_material: CategoriaMaterial;
  cmm: number | null;
  estoque_atual: number | null;
  source: 'candidate' | 'saved';
};

export default function BlacklistScreen() {
  const [search, setSearch] = useState('');
  const [newCode, setNewCode] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isExceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [exceptionSearch, setExceptionSearch] = useState('');
  const [exceptionCategoryFilter, setExceptionCategoryFilter] = useState<FiltroCategoriaMaterial>('todos');
  const [updatingExceptionCode, setUpdatingExceptionCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const {
    blacklistItems,
    blacklistSummary,
    cmmExceptionItems,
    lowConsumptionCandidates,
    cmmExceptionSummary,
    findHmsaProductNameByCode,
    findHmsaProductCategoryByCode,
    addBlacklistItem,
    removeBlacklistItem,
    addCmmExceptionItem,
    removeCmmExceptionItem,
    usingCachedData,
    systemConfig,
    systemConfigLoading,
    systemConfigSaving,
    systemConfigError,
    saveSystemConfig,
  } = useAlmoxData();
  const [categoryFilter, setCategoryFilter] = useState<FiltroCategoriaMaterial>('todos');

  const deferredSearch = useDeferredValue(search);
  const deferredExceptionSearch = useDeferredValue(exceptionSearch);
  const items = useMemo(() => {
    return blacklistItems.filter((item) => {
      if (!matchesQuery([item.cd_produto, item.ds_produto], deferredSearch)) {
        return false;
      }
      if (categoryFilter === 'todos') {
        return true;
      }
      const categoria = findHmsaProductCategoryByCode(item.cd_produto);
      return categoria === categoryFilter;
    });
  }, [blacklistItems, deferredSearch, categoryFilter, findHmsaProductCategoryByCode]);

  const exceptionRows = useMemo<ExceptionRow[]>(() => {
    const candidateCodes = new Set(lowConsumptionCandidates.map((item) => item.cd_produto));
    const candidateRows: ExceptionRow[] = lowConsumptionCandidates.map((item) => ({
      cd_produto: item.cd_produto,
      ds_produto: item.ds_produto,
      categoria_material: item.categoria_material,
      cmm: item.cmm,
      estoque_atual: item.estoque_atual,
      source: 'candidate',
    }));

    const savedRows: ExceptionRow[] = cmmExceptionItems
      .filter((item) => !candidateCodes.has(item.cd_produto))
      .map((item) => ({
        cd_produto: item.cd_produto,
        ds_produto: item.ds_produto,
        categoria_material: item.categoria_material ?? 'material_hospitalar',
        cmm: null,
        estoque_atual: null,
        source: 'saved',
      }));

    return [...candidateRows, ...savedRows].filter((item) => {
      if (exceptionCategoryFilter !== 'todos' && item.categoria_material !== exceptionCategoryFilter) {
        return false;
      }

      return matchesQuery([item.cd_produto, item.ds_produto], deferredExceptionSearch);
    });
  }, [lowConsumptionCandidates, cmmExceptionItems, exceptionCategoryFilter, deferredExceptionSearch]);

  const exceptionByCode = useMemo(() => {
    return new Map(cmmExceptionItems.map((item) => [item.cd_produto, item]));
  }, [cmmExceptionItems]);

  const activeExceptionRows = useMemo<ExceptionRow[]>(() => {
    const candidatesByCode = new Map(lowConsumptionCandidates.map((item) => [item.cd_produto, item]));

    return cmmExceptionItems
      .map((item) => {
        const candidate = candidatesByCode.get(item.cd_produto);

        return {
          cd_produto: item.cd_produto,
          ds_produto: item.ds_produto,
          categoria_material: item.categoria_material ?? candidate?.categoria_material ?? 'material_hospitalar',
          cmm: candidate?.cmm ?? null,
          estoque_atual: candidate?.estoque_atual ?? null,
          source: candidate ? 'candidate' : 'saved',
        } satisfies ExceptionRow;
      })
      .filter((item) => {
        if (exceptionCategoryFilter !== 'todos' && item.categoria_material !== exceptionCategoryFilter) {
          return false;
        }

        return matchesQuery([item.cd_produto, item.ds_produto], deferredExceptionSearch);
      })
      .sort(
        (left, right) =>
          left.categoria_material.localeCompare(right.categoria_material) ||
          left.ds_produto.localeCompare(right.ds_produto, 'pt-BR') ||
          left.cd_produto.localeCompare(right.cd_produto)
      );
  }, [cmmExceptionItems, lowConsumptionCandidates, exceptionCategoryFilter, deferredExceptionSearch]);

  useEffect(() => {
    const codigo = newCode.trim();

    if (!codigo) {
      setResolvedName('');
      return;
    }

    const suggestedName = findHmsaProductNameByCode(codigo);
    setResolvedName(suggestedName ?? '');
  }, [newCode, findHmsaProductNameByCode]);

  async function handleAdd() {
    const cdProduto = newCode.trim();
    if (!cdProduto) {
      setFeedback({ tone: 'danger', message: 'Informe o cd_produto para bloquear o item no HMSA.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await addBlacklistItem({ cd_produto: cdProduto, ds_produto: resolvedName.trim() });
      setNewCode('');
      setResolvedName('');
      setFeedback({ tone: 'success', message: `Produto ${cdProduto} excluído com sucesso do HMSA.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar a exclusão no Supabase.';
      setFeedback({ tone: 'danger', message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string, cdProduto: string) {
    setRemovingId(id);
    setFeedback(null);

    try {
      await removeBlacklistItem(id);
      setFeedback({ tone: 'success', message: `Produto ${cdProduto} voltou a aparecer no HMSA.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover a exclusão do Supabase.';
      setFeedback({ tone: 'danger', message });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleToggleLowConsumption(nextValue: boolean) {
    setFeedback(null);

    try {
      await saveSystemConfig({
        ...systemConfig,
        excluirCmmMenorQueUm: nextValue,
      });
      setFeedback({
        tone: 'success',
        message: nextValue
          ? 'Itens com consumo mensal menor que 1 foram ocultados dos cálculos.'
          : 'Itens com consumo mensal menor que 1 voltaram aos cálculos.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar a exclusão automática.';
      setFeedback({ tone: 'danger', message });
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
          tone: 'success',
          message: `Produto ${row.cd_produto} deixou de ser exceção da exclusão automática.`,
        });
      } else {
        await addCmmExceptionItem({
          cd_produto: row.cd_produto,
          ds_produto: row.ds_produto,
          categoria_material: row.categoria_material,
        });
        setFeedback({
          tone: 'success',
          message: `Produto ${row.cd_produto} continuará aparecendo mesmo com consumo mensal menor que 1.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar a exceção automática.';
      setFeedback({ tone: 'danger', message });
    } finally {
      setUpdatingExceptionCode(null);
    }
  }

  return (
    <ScreenScrollView>
      <PageHeader
        title="Excluir"
        subtitle="Gerencia os cd_produto que devem sumir do site apenas para o HMSA."
      />

      <InfoBanner
        title="Regra ativa no site"
        description="Tudo que for cadastrado aqui deixa de aparecer nas relações do HMSA. As demais unidades não são afetadas."
        tone="warning"
      />

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="As exclusões e descrições abriram com a última base salva na sessão anterior. O Supabase está sincronizando em background e a lista pode ser atualizada em instantes."
          tone="info"
        />
      ) : null}

      {systemConfigError ? (
        <InfoBanner
          title="Falha nas exclusões automáticas"
          description={`${systemConfigError} A lista manual continua disponível.`}
          tone="danger"
        />
      ) : null}

      {feedback ? (
        <InfoBanner
          title={feedback.tone === 'success' ? 'Atualização concluída' : 'Falha ao atualizar exclusões'}
          description={feedback.message}
          tone={feedback.tone}
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Exclusões automáticas"
          subtitle="Filtros que tiram itens dos cálculos do app sem apagar os dados do banco."
          icon="blocked"
        />
        <ToggleField
          label="Ocultar itens com consumo mensal menor que 1"
          description="Quando ligado, itens que consomem menos de 1 unidade por mês deixam de entrar nos KPIs, listas e recomendações. O dado original continua salvo."
          value={systemConfig.excluirCmmMenorQueUm}
          disabled={systemConfigLoading || systemConfigSaving}
          onChange={(nextValue) => void handleToggleLowConsumption(nextValue)}
        />
        <View style={styles.exceptionSummaryBox}>
          <View style={styles.exceptionSummaryText}>
            <Text style={styles.exceptionSummaryTitle}>Exceções da regra automática</Text>
            <Text style={styles.exceptionSummaryDescription}>
              {cmmExceptionItems.length} item(ns) continuam visíveis mesmo com consumo mensal menor que 1.
              {' '}
              {cmmExceptionSummary.candidates} candidato(s) encontrados na base atual.
            </Text>
            <Text style={styles.exceptionSummaryMeta}>
              {cmmExceptionSummary.hospitalar} hospitalares • {cmmExceptionSummary.farmacologico} farmacológicos
            </Text>
          </View>
          <ActionButton
            label="Gerenciar exceções"
            icon="settings"
            tone="neutral"
            onPress={() => setExceptionModalOpen(true)}
          />
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Adicionar item à exclusão"
          subtitle="O cd_produto precisa existir no HMSA. A descrição é preenchida automaticamente e não pode ser editada."
          icon="plus"
        />
        <View style={styles.formGrid}>
          <FormField label="Código do produto">
            <FieldInput value={newCode} onChangeText={setNewCode} placeholder="cd_produto" />
          </FormField>
          <FormField label="Descrição">
            <FieldInput
              value={resolvedName}
              editable={false}
              placeholder="Preenchimento automático a partir do HMSA"
              style={styles.readOnlyInput}
            />
          </FormField>
        </View>
        {newCode.trim() && !resolvedName.trim() ? (
          <Text style={styles.lookupHint}>Nenhum item do HMSA foi encontrado para o código informado.</Text>
        ) : null}
        <ActionButton
          label={submitting ? 'Salvando...' : 'Adicionar à lista'}
          icon="plus"
          tone="danger"
          disabled={submitting || !newCode.trim() || !resolvedName.trim()}
          onPress={() => void handleAdd()}
        />
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Itens bloqueados"
          subtitle={`${items.length} item(ns) excluídos do HMSA • ${blacklistSummary.hospitalar} hospitalares • ${blacklistSummary.farmacologico} farmacológicos`}
          icon="blocked"
        />
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
                ]}>
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por código ou descrição..." />

        {items.length === 0 ? (
          <EmptyState
            title="Nenhum item excluído"
            description="Cadastre um cd_produto para ocultá-lo das telas do HMSA."
          />
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <View key={item.id ?? item.cd_produto} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.name}>{item.ds_produto || 'Produto sem descrição cadastrada'}</Text>
                  <Text style={styles.meta}>Código: {item.cd_produto} • Unidade: HMSA</Text>
                </View>
                <ActionButton
                  label={removingId === item.id ? 'Removendo...' : 'Remover'}
                  icon="trash"
                  tone="danger"
                  disabled={!item.id || removingId === item.id}
                  onPress={() => (item.id ? void handleRemove(item.id, item.cd_produto) : undefined)}
                />
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <CmmExceptionsModal
        visible={isExceptionModalOpen}
        rows={exceptionRows}
        activeRows={activeExceptionRows}
        exceptionByCode={exceptionByCode}
        search={exceptionSearch}
        categoryFilter={exceptionCategoryFilter}
        updatingCode={updatingExceptionCode}
        onSearchChange={setExceptionSearch}
        onCategoryFilterChange={setExceptionCategoryFilter}
        onToggleException={(row) => void handleToggleCmmException(row)}
        onClose={() => setExceptionModalOpen(false)}
      />
    </ScreenScrollView>
  );
}

function CmmExceptionsModal({
  visible,
  rows,
  activeRows,
  exceptionByCode,
  search,
  categoryFilter,
  updatingCode,
  onSearchChange,
  onCategoryFilterChange,
  onToggleException,
  onClose,
}: {
  visible: boolean;
  rows: ExceptionRow[];
  activeRows: ExceptionRow[];
  exceptionByCode: Map<string, CmmExceptionItem>;
  search: string;
  categoryFilter: FiltroCategoriaMaterial;
  updatingCode: string | null;
  onSearchChange: (value: string) => void;
  onCategoryFilterChange: (value: FiltroCategoriaMaterial) => void;
  onToggleException: (row: ExceptionRow) => void;
  onClose: () => void;
}) {
  const [showActiveExceptions, setShowActiveExceptions] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowActiveExceptions(false);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>Exceções para consumo menor que 1</Text>
              <Text style={styles.modalSubtitle}>
                Marque os itens novos ou em implantação que devem continuar aparecendo no app.
              </Text>
            </View>
            <ActionButton label="Fechar" tone="neutral" onPress={onClose} />
          </View>

          <View style={styles.modalFilters}>
            <SearchField value={search} onChangeText={onSearchChange} placeholder="Buscar por código ou descrição..." />
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
                    ]}>
                    <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.activeExceptionsPanel}>
            <Pressable
              onPress={() => setShowActiveExceptions((current) => !current)}
              style={({ pressed }) => [
                styles.activeExceptionsHeader,
                pressed ? styles.activeExceptionsHeaderPressed : null,
              ]}>
              <View style={styles.activeExceptionsTitleWrap}>
                <Text style={styles.activeExceptionsTitle}>Itens marcados como exceção</Text>
                <Text style={styles.activeExceptionsSubtitle}>
                  {activeRows.length} item(ns) neste filtro continuam visíveis mesmo com CMM menor que 1.
                </Text>
              </View>
              <AppIcon
                name={showActiveExceptions ? 'chevronUp' : 'chevronDown'}
                size={18}
                color={almoxTheme.colors.textMuted}
              />
            </Pressable>

            {showActiveExceptions ? (
              activeRows.length === 0 ? (
                <Text style={styles.activeExceptionsEmpty}>Nenhuma exceção ativa para este filtro.</Text>
              ) : (
                <View style={styles.activeExceptionsList}>
                  {activeRows.map((row) => {
                    const isUpdating = updatingCode === row.cd_produto;

                    return (
                      <View key={`active-${row.cd_produto}`} style={styles.activeExceptionRow}>
                        <View style={styles.activeExceptionMain}>
                          <Text style={styles.name}>{row.ds_produto || 'Produto sem descrição cadastrada'}</Text>
                          <Text style={styles.meta}>
                            Código: {row.cd_produto} • {getCategoriaMaterialLabel(row.categoria_material)}
                          </Text>
                          <Text style={styles.meta}>
                            CMM: {row.cmm == null ? 'sem dado atual' : formatDecimal(row.cmm, 2)}
                            {' • '}
                            Estoque atual: {row.estoque_atual == null ? 'sem dado atual' : formatDecimal(row.estoque_atual, 0)}
                          </Text>
                        </View>
                        <ActionButton
                          label={isUpdating ? 'Removendo...' : 'Remover exceção'}
                          icon="trash"
                          tone="danger"
                          disabled={isUpdating}
                          onPress={() => onToggleException(row)}
                        />
                      </View>
                    );
                  })}
                </View>
              )
            ) : null}
          </View>

          {rows.length === 0 ? (
            <EmptyState
              title="Nenhum candidato encontrado"
              description="A base atual não trouxe itens do HMSA com consumo mensal menor que 1 para este filtro."
            />
          ) : (
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {rows.map((row) => {
                const activeException = exceptionByCode.get(row.cd_produto);
                const isActive = Boolean(activeException);
                const isUpdating = updatingCode === row.cd_produto;

                return (
                  <View key={`${row.source}-${row.cd_produto}`} style={styles.exceptionRow}>
                    <View style={styles.exceptionRowMain}>
                      <Text style={styles.name}>{row.ds_produto || 'Produto sem descrição cadastrada'}</Text>
                      <Text style={styles.meta}>
                        Código: {row.cd_produto} • {getCategoriaMaterialLabel(row.categoria_material)}
                      </Text>
                      <Text style={styles.meta}>
                        CMM: {row.cmm == null ? 'sem dado atual' : formatDecimal(row.cmm, 2)}
                        {' • '}
                        Estoque atual: {row.estoque_atual == null ? 'sem dado atual' : formatDecimal(row.estoque_atual, 0)}
                      </Text>
                    </View>
                    <View style={styles.exceptionRowActions}>
                      {isActive ? <Text style={styles.exceptionActiveLabel}>Exceção ativa</Text> : null}
                      <ActionButton
                        label={isUpdating ? 'Salvando...' : isActive ? 'Remover exceção' : 'Manter visível'}
                        icon={isActive ? 'trash' : 'check'}
                        tone={isActive ? 'danger' : 'success'}
                        disabled={isUpdating || (row.source === 'saved' && !activeException?.id)}
                        onPress={() => onToggleException(row)}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ToggleField({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggle,
        value ? styles.toggleActive : null,
        pressed && !disabled ? styles.togglePressed : null,
        disabled ? styles.toggleDisabled : null,
      ]}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleTitle}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <View style={[styles.toggleTrack, value ? styles.toggleTrackActive : null]}>
        <View style={[styles.toggleThumb, value ? styles.toggleThumbActive : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  formGrid: {
    gap: almoxTheme.spacing.md,
  },
  list: {
    gap: almoxTheme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  readOnlyInput: {
    opacity: 0.78,
  },
  lookupHint: {
    color: almoxTheme.colors.orange,
    fontSize: 12,
    lineHeight: 18,
  },
  exceptionSummaryBox: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
    flexWrap: 'wrap',
  },
  exceptionSummaryText: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  exceptionSummaryTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  exceptionSummaryDescription: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  exceptionSummaryMeta: {
    color: almoxTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    padding: almoxTheme.spacing.lg,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 980,
    maxHeight: '92%',
    alignSelf: 'center',
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.md,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
    flexWrap: 'wrap',
  },
  modalHeaderText: {
    flex: 1,
    minWidth: 260,
    gap: 4,
  },
  modalTitle: {
    color: almoxTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  modalFilters: {
    gap: almoxTheme.spacing.sm,
  },
  activeExceptionsPanel: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  activeExceptionsHeader: {
    minHeight: 62,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
  },
  activeExceptionsHeaderPressed: {
    opacity: 0.86,
  },
  activeExceptionsTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  activeExceptionsTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  activeExceptionsSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  activeExceptionsEmpty: {
    borderTopWidth: 1,
    borderTopColor: almoxTheme.colors.line,
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
  },
  activeExceptionsList: {
    borderTopWidth: 1,
    borderTopColor: almoxTheme.colors.line,
    padding: almoxTheme.spacing.sm,
    gap: almoxTheme.spacing.sm,
  },
  activeExceptionRow: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
    flexWrap: 'wrap',
  },
  activeExceptionMain: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  modalList: {
    maxHeight: 520,
  },
  modalListContent: {
    gap: almoxTheme.spacing.sm,
    paddingBottom: almoxTheme.spacing.sm,
  },
  exceptionRow: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    padding: almoxTheme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
    flexWrap: 'wrap',
  },
  exceptionRowMain: {
    flex: 1,
    minWidth: 260,
    gap: 4,
  },
  exceptionRowActions: {
    alignItems: 'flex-end',
    gap: almoxTheme.spacing.xs,
  },
  exceptionActiveLabel: {
    color: almoxTheme.colors.green,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
    marginBottom: almoxTheme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
  },
  filterChipActive: {
    borderColor: almoxTheme.colors.brand,
    backgroundColor: almoxTheme.colors.brand,
  },
  filterChipPressed: {
    opacity: 0.75,
  },
  filterChipText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  toggle: {
    minHeight: 72,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
  },
  toggleActive: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  togglePressed: {
    opacity: 0.88,
  },
  toggleDisabled: {
    opacity: 0.55,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  toggleDescription: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: almoxTheme.radii.pill,
    backgroundColor: almoxTheme.colors.surfaceStrong,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: almoxTheme.colors.brand,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: almoxTheme.colors.white,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});
