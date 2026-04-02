import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { readCachedValue, readSessionFlag, writeCachedValue, writeSessionFlag } from '@/features/almox/cache';
import {
  ActionButton,
  AppIcon,
  EmptyState,
  FieldInput,
  FormField,
  InfoBanner,
  InlineTabs,
  PageHeader,
  ScreenScrollView,
  SearchField,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { almoxTheme } from '@/features/almox/tokens';
import {
  NotaFiscalItem,
  NotaFiscalResumo,
  NotaFiscalStatusSincronizacao,
} from '@/features/almox/types';
import { getSupabaseClient } from '@/lib/supabase';
import { formatDecimal, matchesQuery, paginate } from '@/features/almox/utils';
import { useAlmoxData } from '@/features/almox/almox-provider';

const PAGE_SIZE = 8;
const NOTAS_CACHE_KEY = 'almox:notas-fiscais:v1';
const NOTAS_SESSION_KEY = 'almox:notas-fiscais:session:v1';
const NOTAS_CACHE_TTL_MS = 5 * 60 * 1000;
const NOTA_ITENS_CACHE_TTL_MS = 10 * 60 * 1000;

type StatusFilter = 'all' | NotaFiscalStatusSincronizacao | 'multiplas_datas';

type NotaFiscalItemVisual = NotaFiscalItem & {
  duplicado_entre_dias: boolean;
};

type NotaFiscalUnificada = {
  visualizacao_id: string;
  note_ids: string[];
  lote_importacao_atual_id: string | null;
  data_referencia: string | null;
  importado_em: string | null;
  unidade_id: string;
  codigo_unidade: string;
  nome_unidade: string;
  unidade_origem_siscore: string;
  nome_fornecedor: string;
  numero_documento: string;
  data_entrada_inicial: string;
  data_entrada_final: string;
  datas_entrada: string[];
  status_sincronizacao: NotaFiscalStatusSincronizacao;
  quantidade_itens: number;
  quantidade_entrada_total: number;
  valor_total_nota: number;
  ultima_vez_vista_em: string;
  removida_em: string | null;
  criado_em: string;
  atualizado_em: string;
  quantidade_lancamentos_brutos: number;
  quantidade_datas: number;
  possui_multiplas_datas: boolean;
};

function parseNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getTodayBrazilDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeFilterDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function getStatusLabel(value: NotaFiscalStatusSincronizacao) {
  const labels: Record<NotaFiscalStatusSincronizacao, string> = {
    ativo: 'Ativa',
    alterado: 'Alterada',
    removido_no_siscore: 'Removida',
    reativado: 'Reativada',
  };

  return labels[value];
}

function getStatusPalette(value: NotaFiscalStatusSincronizacao) {
  const palette: Record<NotaFiscalStatusSincronizacao, { background: string; foreground: string }> = {
    ativo: { background: '#e5f7eb', foreground: '#1f7a4e' },
    alterado: { background: '#fff4d6', foreground: '#9f7514' },
    removido_no_siscore: { background: '#ffe3e8', foreground: '#b4234a' },
    reativado: { background: '#dff2ff', foreground: '#176ab5' },
  };

  return palette[value];
}

function getStatusPrioritario(statuses: NotaFiscalStatusSincronizacao[]) {
  if (statuses.every((status) => status === 'removido_no_siscore')) {
    return 'removido_no_siscore';
  }

  if (statuses.includes('alterado')) {
    return 'alterado';
  }

  if (statuses.includes('reativado')) {
    return 'reativado';
  }

  if (statuses.includes('ativo')) {
    return 'ativo';
  }

  return statuses[0] ?? 'ativo';
}

function obterChaveVisualizacao(note: NotaFiscalResumo) {
  return `${note.codigo_unidade}::${note.nome_fornecedor.trim().toUpperCase()}::${note.numero_documento.trim()}`;
}

function resumirPeriodo(datas: string[]) {
  if (!datas.length) {
    return '—';
  }

  if (datas.length === 1) {
    return formatDate(datas[0]);
  }

  return `${formatDate(datas[0])} até ${formatDate(datas[datas.length - 1])}`;
}

function unificarNotas(rawNotes: NotaFiscalResumo[]) {
  const groups = new Map<string, NotaFiscalResumo[]>();

  for (const note of rawNotes) {
    const key = obterChaveVisualizacao(note);
    const current = groups.get(key) ?? [];
    current.push(note);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([groupKey, group]) => {
    const sortedGroup = [...group].sort((left, right) => left.data_entrada.localeCompare(right.data_entrada));
    const datasEntrada = [...new Set(sortedGroup.map((note) => note.data_entrada))];
    const latestVisibleNote = [...sortedGroup].sort(
      (left, right) =>
        right.data_entrada.localeCompare(left.data_entrada) ||
        right.atualizado_em.localeCompare(left.atualizado_em)
    )[0];

    return {
      visualizacao_id: groupKey,
      note_ids: sortedGroup.map((note) => note.nota_fiscal_id),
      lote_importacao_atual_id: latestVisibleNote.lote_importacao_atual_id,
      data_referencia: latestVisibleNote.data_referencia,
      importado_em: latestVisibleNote.importado_em,
      unidade_id: latestVisibleNote.unidade_id,
      codigo_unidade: latestVisibleNote.codigo_unidade,
      nome_unidade: latestVisibleNote.nome_unidade,
      unidade_origem_siscore: latestVisibleNote.unidade_origem_siscore,
      nome_fornecedor: latestVisibleNote.nome_fornecedor,
      numero_documento: latestVisibleNote.numero_documento,
      data_entrada_inicial: datasEntrada[0],
      data_entrada_final: datasEntrada[datasEntrada.length - 1],
      datas_entrada: datasEntrada,
      status_sincronizacao: getStatusPrioritario(sortedGroup.map((note) => note.status_sincronizacao)),
      quantidade_itens: sortedGroup.reduce((sum, note) => sum + note.quantidade_itens, 0),
      quantidade_entrada_total: latestVisibleNote.quantidade_entrada_total,
      valor_total_nota: latestVisibleNote.valor_total_nota,
      ultima_vez_vista_em: latestVisibleNote.ultima_vez_vista_em,
      removida_em:
        sortedGroup.every((note) => Boolean(note.removida_em))
          ? [...sortedGroup]
              .map((note) => note.removida_em)
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? null
          : null,
      criado_em: sortedGroup.map((note) => note.criado_em).sort()[0],
      atualizado_em: latestVisibleNote.atualizado_em,
      quantidade_lancamentos_brutos: sortedGroup.length,
      quantidade_datas: datasEntrada.length,
      possui_multiplas_datas: datasEntrada.length > 1,
    } satisfies NotaFiscalUnificada;
  });
}

function getNotaItensCacheKey(note: NotaFiscalUnificada) {
  return `almox:nota-itens:${note.visualizacao_id}:${note.atualizado_em}`;
}

async function loadNotasFiscais() {
  const supabase = getSupabaseClient();
  const rows: NotaFiscalResumo[] = [];
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const end = start + pageSize - 1;
    const { data, error } = await supabase
      .from('almox_notas_fiscais_hmsa')
      .select('*')
      .order('data_entrada', { ascending: false })
      .order('atualizado_em', { ascending: false })
      .range(start, end);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as NotaFiscalResumo[];
    rows.push(
      ...pageRows.map((row) => ({
        ...row,
        quantidade_itens: parseNumber(row.quantidade_itens),
        quantidade_itens_duplicados: parseNumber(row.quantidade_itens_duplicados),
        quantidade_entrada_total: parseNumber(row.quantidade_entrada_total),
        valor_total_nota: parseNumber(row.valor_total_nota),
      }))
    );

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows;
}

async function loadNotaFiscalItens(noteIds: string[]) {
  if (!noteIds.length) {
    return [];
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('almox_nota_fiscal_itens_hmsa')
    .select('*')
    .in('nota_fiscal_id', noteIds)
    .order('data_entrada', { ascending: true })
    .order('sequencia_item', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as NotaFiscalItem[]).map((item) => ({
    ...item,
    quantidade_entrada: item.quantidade_entrada == null ? null : parseNumber(item.quantidade_entrada),
    valor_unitario: item.valor_unitario == null ? null : parseNumber(item.valor_unitario),
    valor_total: item.valor_total == null ? null : parseNumber(item.valor_total),
  }));
}

export default function InvoicesScreen() {
  const { syncBase, syncError, syncNotice, syncingBase } = useAlmoxData();
  const [notes, setNotes] = useState<NotaFiscalResumo[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [noteItems, setNoteItems] = useState<NotaFiscalItemVisual[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const hasLoadedRef = React.useRef(false);
  const allowSessionCacheRef = React.useRef(false);

  const deferredSearch = useDeferredValue(search);
  const unifiedNotes = useMemo(() => unificarNotas(notes), [notes]);

  async function refresh() {
    const initialLoad = !hasLoadedRef.current;

    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

      try {
        const nextNotes = await loadNotasFiscais();
        setNotes(nextNotes);
        setUsingCachedData(false);
        hasLoadedRef.current = true;
        writeSessionFlag(NOTAS_SESSION_KEY);

        const nextUnifiedNotes = unificarNotas(nextNotes);
        setSelectedGroupId((current) => {
          if (current && nextUnifiedNotes.some((note) => note.visualizacao_id === current)) {
            return current;
          }
          return nextUnifiedNotes[0]?.visualizacao_id ?? null;
        });
      } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao consultar notas fiscais no Supabase.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const sessionLoaded = readSessionFlag(NOTAS_SESSION_KEY);
    allowSessionCacheRef.current = sessionLoaded;
    const cached = readCachedValue<NotaFiscalResumo[]>(NOTAS_CACHE_KEY, NOTAS_CACHE_TTL_MS);
    if (sessionLoaded && cached) {
      setNotes(cached.value);
      const cachedUnifiedNotes = unificarNotas(cached.value);
      setSelectedGroupId(cachedUnifiedNotes[0]?.visualizacao_id ?? null);
      hasLoadedRef.current = true;
      setUsingCachedData(true);
      setLoading(false);
    }

    void refresh();
  }, []);

  useEffect(() => {
    if (!notes.length) {
      return;
    }

    writeCachedValue(NOTAS_CACHE_KEY, notes);
  }, [notes]);

  useEffect(() => {
    const selectedGroup = unifiedNotes.find((note) => note.visualizacao_id === selectedGroupId) ?? null;

    if (!selectedGroup) {
      setNoteItems([]);
      return;
    }

    let cancelled = false;
    const itemsCacheKey = getNotaItensCacheKey(selectedGroup);
    const cachedItems = allowSessionCacheRef.current
      ? readCachedValue<NotaFiscalItemVisual[]>(itemsCacheKey, NOTA_ITENS_CACHE_TTL_MS)
      : null;

    if (cachedItems) {
      setNoteItems(cachedItems.value);
      setItemsLoading(false);
    } else {
      setItemsLoading(true);
    }

    if (cachedItems?.isFresh) {
      return () => {
        cancelled = true;
      };
    }

    void loadNotaFiscalItens(selectedGroup.note_ids)
      .then((items) => {
        if (!cancelled) {
          const datesByCode = new Map<string, Set<string>>();
          for (const item of items) {
            const current = datesByCode.get(item.codigo_produto) ?? new Set<string>();
            current.add(item.data_entrada);
            datesByCode.set(item.codigo_produto, current);
          }

          const nextItems = items.map((item) => ({
              ...item,
              duplicado_entre_dias: (datesByCode.get(item.codigo_produto)?.size ?? 0) > 1,
            }));

          setNoteItems(nextItems);
          writeCachedValue(itemsCacheKey, nextItems);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao consultar itens da nota fiscal.');
          setNoteItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setItemsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, unifiedNotes]);

  const filteredNotes = useMemo(() => {
    const normalizedDateFrom = normalizeFilterDate(dateFrom);
    const normalizedDateTo = normalizeFilterDate(dateTo);

    return unifiedNotes.filter((note) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'multiplas_datas'
            ? note.possui_multiplas_datas
            : note.status_sincronizacao === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      const overlapsDateRange =
        (!normalizedDateFrom || note.data_entrada_final >= normalizedDateFrom) &&
        (!normalizedDateTo || note.data_entrada_inicial <= normalizedDateTo);

      if (!overlapsDateRange) {
        return false;
      }

      return matchesQuery(
        [note.numero_documento, note.nome_fornecedor, note.codigo_unidade],
        deferredSearch
      );
    });
  }, [unifiedNotes, statusFilter, deferredSearch, dateFrom, dateTo]);

  useEffect(() => {
    if (!filteredNotes.length) {
      setSelectedGroupId(null);
      return;
    }

    if (!selectedGroupId || !filteredNotes.some((note) => note.visualizacao_id === selectedGroupId)) {
      setSelectedGroupId(filteredNotes[0].visualizacao_id);
    }
  }, [filteredNotes, selectedGroupId]);

  const totalPages = Math.max(1, Math.ceil(filteredNotes.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageNotes = paginate(filteredNotes, safePage, PAGE_SIZE);
  const selectedNote = filteredNotes.find((note) => note.visualizacao_id === selectedGroupId) ?? null;
  const todayBrazil = getTodayBrazilDate();

  useEffect(() => {
    setPage(1);
  }, [statusFilter, deferredSearch, dateFrom, dateTo]);

  const summary = useMemo(() => {
    return {
      totalNotas: notes.length,
      totalNotasUnificadas: unifiedNotes.length,
      totalItens: notes.reduce((sum, note) => sum + note.quantidade_itens, 0),
      totalValorBruto: notes.reduce((sum, note) => sum + note.valor_total_nota, 0),
      totalValorUnificado: unifiedNotes.reduce((sum, note) => sum + note.valor_total_nota, 0),
      totalMultiplasDatas: unifiedNotes.filter((note) => note.possui_multiplas_datas).length,
      totalNotasHoje: unifiedNotes.filter((note) => note.data_entrada_final === todayBrazil).length,
    };
  }, [notes, unifiedNotes, todayBrazil]);

  const selectedNoteSummary = useMemo(() => {
    if (!selectedNote) {
      return {
        quantidadeCodigosRepetidosEntreDias: 0,
      };
    }

    const codes = new Map<string, Set<string>>();
    for (const item of noteItems) {
      if (!selectedNote.note_ids.includes(item.nota_fiscal_id)) {
        continue;
      }

      const current = codes.get(item.codigo_produto) ?? new Set<string>();
      current.add(item.data_entrada);
      codes.set(item.codigo_produto, current);
    }

    return {
      quantidadeCodigosRepetidosEntreDias: [...codes.values()].filter((dates) => dates.size > 1).length,
    };
  }, [noteItems, selectedNote]);

  async function handleSyncBase() {
    await syncBase();
    await refresh();
  }

  return (
    <ScreenScrollView>
      <PageHeader
        title="Notas fiscais"
        subtitle="Cada documento é identificado por fornecedor, número e data de entrada. A consolidação só agrupa quando o mesmo fornecedor e número reaparecem em dias diferentes."
        aside={
          <ActionButton
            label={syncingBase ? 'Sincronizando...' : refreshing ? 'Atualizando...' : 'Atualizar base'}
            icon="refresh"
            tone="neutral"
            onPress={() => void handleSyncBase()}
            disabled={refreshing || syncingBase}
          />
        }
      />

      {error ? (
        <InfoBanner
          title="Falha ao carregar notas fiscais"
          description={`${error} A tela continuará vazia ou com os últimos dados em memória até a próxima tentativa.`}
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

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="A tela abriu com a última lista salva na sessão anterior. O Supabase está sincronizando em background e os documentos podem ser atualizados em instantes."
          tone="info"
        />
      ) : null}

      <InfoBanner
        title={loading ? 'Carregando reconciliação do SISCORE' : usingCachedData ? 'Base local recente do SISCORE' : 'Espelho atual do SISCORE'}
        description={
          loading
            ? 'Consultando as views públicas de notas fiscais do Supabase e preparando os detalhes da nota selecionada.'
            : usingCachedData
              ? 'A lista abaixo está sendo exibida a partir da última sessão concluída enquanto a atualização em background valida documentos, itens e status no Supabase.'
              : 'A lista mostra primeiro os documentos por data de entrada. A versão consolidada junta apenas os casos em que o mesmo fornecedor e número de documento aparecem em dias diferentes.'
        }
        tone={loading || usingCachedData ? 'info' : 'success'}
      />

      <View style={styles.metricGrid}>
        <SummaryCard
          label="Documentos lançados"
          value={`${summary.totalNotas}`}
          caption="Contagem por data"
          tooltip="Total de documentos do SISCORE considerando fornecedor, número e data de entrada. Se o mesmo documento reaparecer em outro dia, ele entra novamente aqui."
          color={almoxTheme.colors.blue}
        />
        <SummaryCard
          label="Documentos consolidados"
          value={`${summary.totalNotasUnificadas}`}
          caption="Leitura sem repetição"
          tooltip="Agrupa documentos com o mesmo fornecedor e número quando eles reaparecem em dias diferentes. Serve para leitura operacional sem contar o mesmo documento várias vezes."
          color={almoxTheme.colors.violet}
        />
        <SummaryCard
          label="Produtos lançados"
          value={`${summary.totalItens}`}
          caption="Linhas de item"
          tooltip="Total de linhas de produtos registradas nas notas atualmente visíveis. Um documento pode ter vários produtos."
          color={almoxTheme.colors.teal}
        />
        <SummaryCard
          label="Valor lançado"
          value={formatCurrency(summary.totalValorBruto)}
          caption="Soma por data"
          tooltip="Soma do valor total dos documentos considerando cada data de entrada separadamente."
          color={almoxTheme.colors.amber}
        />
        <SummaryCard
          label="Valor consolidado"
          value={formatCurrency(summary.totalValorUnificado)}
          caption="Sem dupla contagem"
          tooltip="Usa um único valor total por documento consolidado. Quando o mesmo documento reaparece em dias diferentes, considera a última leitura para evitar dupla contagem."
          color={almoxTheme.colors.green}
        />
        <SummaryCard
          label="Documentos recorrentes"
          value={`${summary.totalMultiplasDatas}`}
          caption="Mesmo doc. em outros dias"
          tooltip="Quantidade de documentos que reapareceram em mais de uma data de entrada com o mesmo fornecedor e número."
          color={almoxTheme.colors.rose}
        />
      </View>

      <SectionCard>
        <SectionTitle
          title="Filtros"
          subtitle={`${filteredNotes.length} documento(s) encontrados na visualização atual`}
          icon="receipt"
        />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por fornecedor, número da nota ou unidade..."
        />

        <View style={styles.filterRow}>
          <FormField label="Data inicial">
            <FieldInput value={dateFrom} onChangeText={setDateFrom} placeholder="DD/MM/AAAA" />
          </FormField>
          <FormField label="Data final">
            <FieldInput value={dateTo} onChangeText={setDateTo} placeholder="DD/MM/AAAA" />
          </FormField>
          {dateFrom || dateTo ? (
            <View style={styles.filterActionWrap}>
              <ActionButton
                label="Limpar datas"
                tone="neutral"
                onPress={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              />
            </View>
          ) : null}
        </View>

        <InlineTabs
          options={[
            { label: 'Todas', value: 'all' as const },
            { label: 'Ativas', value: 'ativo' as const },
            { label: 'Alteradas', value: 'alterado' as const },
            { label: 'Reativadas', value: 'reativado' as const },
            { label: 'Removidas', value: 'removido_no_siscore' as const },
            { label: 'Em mais de um dia', value: 'multiplas_datas' as const },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          size="sm"
        />
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Lista de notas"
          subtitle={`Página ${safePage} de ${totalPages} • Total de notas: ${filteredNotes.length} • Notas com entrada hoje: ${summary.totalNotasHoje}`}
          icon="file"
        />

        {pageNotes.length === 0 ? (
          <EmptyState
            title="Nenhuma nota fiscal encontrada"
            description="Ajuste os filtros ou aguarde a próxima sincronização para visualizar notas do HMSA."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadCell, styles.dateColumn]}>Data</Text>
                <Text style={[styles.tableHeadCell, styles.documentColumn]}>Documento</Text>
                <Text style={[styles.tableHeadCell, styles.supplierColumn]}>Fornecedor</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Dias</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Itens</Text>
                <Text style={[styles.tableHeadCell, styles.smallColumn]}>Qtd.</Text>
                <Text style={[styles.tableHeadCell, styles.valueColumn]}>Valor</Text>
                <Text style={[styles.tableHeadCell, styles.statusColumn]}>Status</Text>
              </View>

              {pageNotes.map((note) => (
                <Pressable
                  key={note.visualizacao_id}
                  onPress={() => setSelectedGroupId(note.visualizacao_id)}
                  style={({ pressed }) => [
                    styles.tableRow,
                    note.visualizacao_id === selectedGroupId ? styles.tableRowActive : null,
                    pressed ? styles.tableRowPressed : null,
                  ]}>
                  <Text style={[styles.tableCell, styles.dateColumn]}>{resumirPeriodo(note.datas_entrada)}</Text>
                  <View style={[styles.documentColumn, styles.documentCell]}>
                    <Text style={styles.documentText}>{note.numero_documento}</Text>
                    <Text style={styles.documentMeta}>
                      {note.codigo_unidade} • {note.quantidade_lancamentos_brutos} lançamento(s)
                    </Text>
                  </View>
                  <Text style={[styles.tableCell, styles.supplierColumn]} numberOfLines={1}>
                    {note.nome_fornecedor}
                  </Text>
                  <Text style={[styles.tableCell, styles.smallColumn]}>{note.quantidade_datas}</Text>
                  <Text style={[styles.tableCell, styles.smallColumn]}>{note.quantidade_itens}</Text>
                  <Text style={[styles.tableCell, styles.smallColumn]}>{formatDecimal(note.quantidade_entrada_total, 0)}</Text>
                  <Text style={[styles.tableCell, styles.valueColumn]}>{formatCurrency(note.valor_total_nota)}</Text>
                  <View style={[styles.statusColumn, styles.statusCell]}>
                    <StatusChip label={getStatusLabel(note.status_sincronizacao)} palette={getStatusPalette(note.status_sincronizacao)} />
                    {note.possui_multiplas_datas ? (
                      <StatusChip
                        label={`${note.quantidade_datas} datas`}
                        palette={{ background: '#fff4d6', foreground: '#9f7514' }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        <View style={styles.paginationRow}>
          <Text style={styles.paginationText}>
            Exibindo {pageNotes.length} de {filteredNotes.length} documentos unificados
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

      <SectionCard>
        <SectionTitle
          title="Detalhes do documento"
          subtitle={selectedNote ? `${selectedNote.nome_fornecedor} • ${selectedNote.numero_documento}` : 'Selecione um documento para ver os itens'}
          icon="receipt"
        />

        {!selectedNote ? (
          <EmptyState
            title="Nenhuma nota selecionada"
            description="Escolha uma nota na lista acima para visualizar os itens e o status detalhado."
          />
        ) : (
          <>
            <View style={styles.detailSummary}>
              <DetailMetric label="Fornecedor" value={selectedNote.nome_fornecedor} />
              <DetailMetric label="Documento" value={selectedNote.numero_documento} />
              <DetailMetric label="Período" value={resumirPeriodo(selectedNote.datas_entrada)} />
              <DetailMetric label="Lançamentos" value={`${selectedNote.quantidade_lancamentos_brutos}`} />
              <DetailMetric label="Qtd. entrada" value={formatDecimal(selectedNote.quantidade_entrada_total, 0)} />
              <DetailMetric label="Valor total" value={formatCurrency(selectedNote.valor_total_nota)} />
              <DetailMetric label="Última leitura" value={formatDateTime(selectedNote.ultima_vez_vista_em)} />
            </View>

            {selectedNote.possui_multiplas_datas ? (
              <InfoBanner
                title="Documento unificado para visualização"
                description={`Este documento apareceu em ${selectedNote.quantidade_datas} data(s) de entrada e ${selectedNote.quantidade_lancamentos_brutos} lançamento(s) brutos no SISCORE. Para evitar dupla contagem, a tela usa a última leitura do documento para quantidade de entrada e valor total.`}
                tone="info"
              />
            ) : null}

            {selectedNote.removida_em ? (
              <InfoBanner
                title="Nota removida no SISCORE"
                description={`Essa nota não apareceu na exportação mais recente e foi marcada como removida em ${formatDateTime(selectedNote.removida_em)}.`}
                tone="danger"
              />
            ) : null}

            {selectedNoteSummary.quantidadeCodigosRepetidosEntreDias > 0 ? (
              <InfoBanner
                title="Conferência recomendada"
                description={`Após a unificação, ${selectedNoteSummary.quantidadeCodigosRepetidosEntreDias} código(s) de produto aparecem em mais de uma data de entrada para este documento.`}
                tone="warning"
              />
            ) : null}

            <InfoBanner
              title="Totais do documento"
              description="Quantidade de entrada e valor total pertencem ao documento fiscal. Por isso, esses campos aparecem no resumo da nota e não em cada item individual."
              tone="info"
            />

            {itemsLoading ? (
              <InfoBanner
                title="Carregando itens da nota"
                description="Consultando os itens detalhados no Supabase."
                tone="info"
              />
            ) : noteItems.length === 0 ? (
              <EmptyState
                title="Sem itens detalhados"
                description="A nota selecionada não possui itens disponíveis na view atual."
              />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.itemsTableWrap}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeadCell, styles.dateColumn]}>Data</Text>
                    <Text style={[styles.tableHeadCell, styles.codeColumn]}>Código</Text>
                    <Text style={[styles.tableHeadCell, styles.productColumn]}>Produto</Text>
                    <Text style={[styles.tableHeadCell, styles.speciesColumn]}>Espécie</Text>
                  </View>

                  {noteItems.map((item) => (
                    <View
                      key={item.nota_fiscal_item_id}
                      style={[styles.tableRow, item.duplicado_entre_dias ? styles.itemRowDuplicated : null]}>
                      <Text style={[styles.tableCell, styles.dateColumn]}>{formatDate(item.data_entrada)}</Text>
                      <Text style={[styles.tableCell, styles.codeColumn]}>{item.codigo_produto}</Text>
                      <View style={[styles.productColumn, styles.productCell]}>
                        <Text style={styles.documentText} numberOfLines={1}>
                          {item.descricao_produto}
                        </Text>
                        <Text style={styles.documentMeta}>
                          Linha {item.sequencia_item}
                          {item.nome_produto_vinculado ? ` • Vinculado ao estoque` : ' • Sem vínculo automático'}
                        </Text>
                      </View>
                      <View style={[styles.speciesColumn, styles.productCell]}>
                        <Text style={styles.tableCell} numberOfLines={1}>
                          {item.descricao_especie || '—'}
                        </Text>
                        {item.duplicado_entre_dias ? (
                          <Text style={styles.duplicateHint}>Codigo repetido em datas diferentes</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </>
        )}
      </SectionCard>
    </ScreenScrollView>
  );
}

function SummaryCard({
  label,
  value,
  caption,
  tooltip,
  color,
}: {
  label: string;
  value: string;
  caption: string;
  tooltip: string;
  color: string;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <Pressable
      onHoverIn={() => setTooltipVisible(true)}
      onHoverOut={() => setTooltipVisible(false)}
      onPressIn={() => setTooltipVisible(true)}
      onPressOut={() => setTooltipVisible(false)}
      style={({ pressed }) => [
        styles.summaryCard,
        { borderColor: `${color}40` },
        tooltipVisible ? styles.summaryCardActive : null,
        pressed ? styles.summaryCardPressed : null,
      ]}>
      {tooltipVisible ? <SummaryCardTooltip text={tooltip} /> : null}
      <View style={[styles.summaryDot, { backgroundColor: color }]} />
      <Text style={styles.summaryValue}>{value}</Text>
      <View style={styles.summaryLabelRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={styles.summaryHint}>{caption}</Text>
    </Pressable>
  );
}

function SummaryCardTooltip({ text }: { text: string }) {
  return (
    <View pointerEvents="none" style={styles.summaryTooltipBubble}>
      <Text style={styles.summaryTooltipText}>{text}</Text>
    </View>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailMetric}>
      <Text style={styles.detailMetricLabel}>{label}</Text>
      <Text style={styles.detailMetricValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatusChip({
  label,
  palette,
}: {
  label: string;
  palette: { background: string; foreground: string };
}) {
  return (
    <View style={[styles.statusChip, { backgroundColor: palette.background }]}>
      <Text style={[styles.statusChipText, { color: palette.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
    overflow: 'visible',
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 132,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    backgroundColor: almoxTheme.colors.surface,
    padding: almoxTheme.spacing.lg,
    gap: 6,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: 'visible',
    position: 'relative',
    zIndex: 1,
  },
  summaryCardActive: {
    zIndex: 200,
    elevation: 20,
  },
  summaryCardPressed: {
    opacity: 0.92,
  },
  summaryTooltipBubble: {
    position: 'absolute',
    left: almoxTheme.spacing.sm,
    right: almoxTheme.spacing.sm,
    bottom: '100%',
    marginBottom: almoxTheme.spacing.xs,
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
  summaryTooltipText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  summaryDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  summaryValue: {
    color: almoxTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryHint: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  tableWrap: {
    minWidth: 980,
  },
  itemsTableWrap: {
    minWidth: 760,
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
  tableRowActive: {
    backgroundColor: '#eef5ff',
  },
  tableRowPressed: {
    opacity: 0.88,
  },
  itemRowDuplicated: {
    backgroundColor: '#fffaf0',
  },
  tableCell: {
    color: almoxTheme.colors.text,
    fontSize: 13,
  },
  dateColumn: {
    width: 110,
  },
  documentColumn: {
    width: 140,
  },
  supplierColumn: {
    width: 260,
  },
  smallColumn: {
    width: 90,
  },
  valueColumn: {
    width: 130,
  },
  statusColumn: {
    width: 220,
  },
  codeColumn: {
    width: 110,
  },
  productColumn: {
    width: 290,
    paddingRight: almoxTheme.spacing.md,
  },
  speciesColumn: {
    width: 260,
  },
  documentCell: {
    gap: 3,
    justifyContent: 'center',
  },
  productCell: {
    gap: 4,
    justifyContent: 'center',
  },
  documentText: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  documentMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
  },
  statusCell: {
    gap: 6,
    justifyContent: 'center',
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: almoxTheme.radii.pill,
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: almoxTheme.spacing.xxs,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
    alignItems: 'flex-end',
  },
  filterActionWrap: {
    paddingBottom: 1,
  },
  detailSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  detailMetric: {
    flexGrow: 1,
    flexBasis: 180,
    gap: 4,
    minWidth: 0,
  },
  detailMetricLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailMetricValue: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  duplicateHint: {
    color: almoxTheme.colors.orange,
    fontSize: 11,
    fontWeight: '700',
  },
});
