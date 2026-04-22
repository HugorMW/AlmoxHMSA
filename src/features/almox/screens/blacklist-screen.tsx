import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
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
import { almoxTheme } from '@/features/almox/tokens';
import { FiltroCategoriaMaterial } from '@/features/almox/types';
import { matchesQuery } from '@/features/almox/utils';

const categoryOptions: Array<{ label: string; value: FiltroCategoriaMaterial }> = [
  { label: 'Todos', value: 'todos' },
  { label: 'Hospitalar', value: 'material_hospitalar' },
  { label: 'Farmacológico', value: 'material_farmacologico' },
];

export default function BlacklistScreen() {
  const [search, setSearch] = useState('');
  const [newCode, setNewCode] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const {
    blacklistItems,
    blacklistSummary,
    findHmsaProductNameByCode,
    findHmsaProductCategoryByCode,
    addBlacklistItem,
    removeBlacklistItem,
    usingCachedData,
    systemConfig,
    systemConfigLoading,
    systemConfigSaving,
    systemConfigError,
    saveSystemConfig,
  } = useAlmoxData();
  const [categoryFilter, setCategoryFilter] = useState<FiltroCategoriaMaterial>('todos');

  const deferredSearch = useDeferredValue(search);
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
    </ScreenScrollView>
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
