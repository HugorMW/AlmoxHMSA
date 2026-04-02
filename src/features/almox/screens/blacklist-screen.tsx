import React, { useDeferredValue, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { matchesQuery } from '@/features/almox/utils';

export default function BlacklistScreen() {
  const [search, setSearch] = useState('');
  const [newCode, setNewCode] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const { blacklistItems, blacklistSummary, findHmsaProductNameByCode, addBlacklistItem, removeBlacklistItem, usingCachedData } = useAlmoxData();

  const deferredSearch = useDeferredValue(search);
  const items = blacklistItems.filter((item) =>
    matchesQuery([item.cd_produto, item.ds_produto], deferredSearch)
  );

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

      {feedback ? (
        <InfoBanner
          title={feedback.tone === 'success' ? 'Atualização concluída' : 'Falha ao atualizar exclusões'}
          description={feedback.message}
          tone={feedback.tone}
        />
      ) : null}

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
});
