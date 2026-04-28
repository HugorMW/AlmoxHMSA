import { Redirect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useIsDeveloper } from '@/features/auth/use-is-developer';
import { AlmoxTheme } from '@/features/almox/tokens';
import { useThemedStyles } from '@/features/almox/theme-provider';

type TabelaMetrica = {
  schema: string;
  tabela: string;
  tamanho_total_bytes: number;
  tamanho_heap_bytes: number;
  tamanho_indices_bytes: number;
  linhas_estimadas: number;
  linhas_mortas: number;
};

type SchemaMetrica = {
  schema: string;
  tamanho_total_bytes: number;
};

type ConexaoMetrica = {
  pid: number;
  usuario: string | null;
  aplicacao: string | null;
  estado: string | null;
  espera_tipo: string | null;
  espera_evento: string | null;
  iniciada_em: string | null;
  duracao_query_segundos: number | null;
  query: string | null;
};

type CacheMetrica = {
  hit: number;
  read: number;
  ratio: number | null;
};

type DbUsagePayload = {
  database_nome: string;
  database_tamanho_bytes: number;
  limite_free_plan_bytes: number;
  top_tabelas: TabelaMetrica[];
  schemas: SchemaMetrica[];
  cache: CacheMetrica;
  conexoes: ConexaoMetrica[];
  medido_em: string;
};

type QueryMetrica = {
  query: string;
  calls: number;
  total_exec_time_ms: number;
  mean_exec_time_ms: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
};

type QueryStatsPayload = {
  habilitado: boolean;
  queries: QueryMetrica[];
  erro?: string;
};

type UsuarioOnline = {
  usuario: string;
  ultimo_acesso_em: string;
  segundos_desde_acesso: number;
  ultima_validacao_em: string | null;
};

type UsuarioRecente = {
  usuario: string;
  ultimo_acesso_em: string | null;
  ultima_validacao_em: string | null;
};

type UsuariosOnlinePayload = {
  janela_minutos: number;
  medido_em: string;
  online: UsuarioOnline[];
  recentes: UsuarioRecente[];
};

type DevUsageResponse = {
  dbUsage: DbUsagePayload;
  queryStats: QueryStatsPayload | null;
  queryStatsError: string | null;
  usuariosOnline: UsuariosOnlinePayload | null;
  usuariosOnlineError: string | null;
  painelUrl: string | null;
};

function formatarBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const expoente = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / Math.pow(1024, expoente);
  return `${valor.toFixed(valor >= 100 || expoente === 0 ? 0 : valor >= 10 ? 1 : 2)} ${unidades[expoente]}`;
}

function formatarPercentual(ratio: number | null | undefined, digits = 1) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

function formatarInteiro(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat('pt-BR').format(Math.round(valor));
}

function formatarDataHora(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatarTempoDecorrido(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return '—';
  if (segundos < 60) return `${Math.floor(segundos)}s atrás`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min atrás`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h atrás`;
  const dias = Math.floor(horas / 24);
  return `${dias} d atrás`;
}

function corDoGauge(percent: number) {
  if (percent >= 0.85) return '#dc2626';
  if (percent >= 0.6) return '#ea580c';
  return '#16a34a';
}

function abrirLinkExterno(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}

export default function DevScreen() {
  const styles = useThemedStyles(createStyles);
  const isDeveloper = useIsDeveloper();
  const [data, setData] = useState<DevUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dev/db-usage', { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as DevUsageResponse;
      setData(payload);
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'Falha inesperada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDeveloper) {
      void carregar();
    }
  }, [isDeveloper, carregar]);

  if (!isDeveloper) {
    return <Redirect href="/" />;
  }

  const dbUsage = data?.dbUsage;
  const percentualUso = dbUsage
    ? Math.min(dbUsage.database_tamanho_bytes / dbUsage.limite_free_plan_bytes, 1)
    : 0;
  const corGauge = corDoGauge(percentualUso);
  const maiorTabelaBytes = dbUsage?.top_tabelas[0]?.tamanho_total_bytes ?? 0;
  const maiorSchemaBytes = dbUsage?.schemas[0]?.tamanho_total_bytes ?? 0;

  return (
    <ScreenScrollView>
      <PageHeader
        subtitle={
          dbUsage
            ? `Última leitura: ${formatarDataHora(dbUsage.medido_em)}`
            : 'Monitoramento do Supabase Free Plan.'
        }
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={loading ? 'Atualizando...' : 'Atualizar'}
              icon="refresh"
              tone="neutral"
              onPress={() => void carregar()}
              disabled={loading}
              loading={loading}
            />
            {data?.painelUrl ? (
              <ActionButton
                label="Painel Supabase"
                icon="monitor"
                tone="primary"
                onPress={() => abrirLinkExterno(data.painelUrl!)}
              />
            ) : null}
          </View>
        }
      />

      <InfoBanner
        title="Tela restrita"
        description="Somente visível para você. Os dados vêm direto do Postgres via service_role e não são cacheados — cada atualização consome um pouco de egress."
        tone="info"
      />

      {error ? (
        <InfoBanner title="Falha ao ler métricas" description={error} tone="danger" />
      ) : null}

      {dbUsage ? (
        <>
          <SectionCard>
            <SectionTitle
              title="Tamanho do banco"
              subtitle="Limite do Free Plan: 500 MB. Ao ultrapassar, o projeto pode entrar em modo somente leitura."
              icon="monitor"
            />
            <View style={styles.gaugeRow}>
              <View style={styles.gaugeValue}>
                <Text style={styles.gaugeTotal}>{formatarBytes(dbUsage.database_tamanho_bytes)}</Text>
                <Text style={styles.gaugeLimit}>de {formatarBytes(dbUsage.limite_free_plan_bytes)}</Text>
              </View>
              <View style={styles.gaugePercentBox}>
                <Text style={[styles.gaugePercent, { color: corGauge }]}>
                  {formatarPercentual(percentualUso, 1)}
                </Text>
                <Text style={styles.gaugePercentLabel}>do limite</Text>
              </View>
            </View>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: `${percentualUso * 100}%`, backgroundColor: corGauge }]} />
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title="Schemas"
              subtitle="Quanto cada schema contribui para o total do banco."
              icon="info"
            />
            {dbUsage.schemas.length === 0 ? (
              <EmptyState title="Sem schemas ainda" description="Nada para mostrar." />
            ) : (
              <View style={styles.list}>
                {dbUsage.schemas.map((schema) => {
                  const largura = maiorSchemaBytes > 0 ? (schema.tamanho_total_bytes / maiorSchemaBytes) * 100 : 0;
                  return (
                    <View key={schema.schema} style={styles.listRow}>
                      <View style={styles.listLabelRow}>
                        <Text style={styles.listLabel}>{schema.schema}</Text>
                        <Text style={styles.listValue}>{formatarBytes(schema.tamanho_total_bytes)}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${largura}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title="Top 10 tabelas"
              subtitle="Heap + índices. Mostra também linhas mortas para detectar necessidade de VACUUM."
              icon="info"
            />
            {dbUsage.top_tabelas.length === 0 ? (
              <EmptyState title="Sem tabelas" description="Nada para mostrar." />
            ) : (
              <View style={styles.list}>
                {dbUsage.top_tabelas.map((tabela) => {
                  const largura = maiorTabelaBytes > 0 ? (tabela.tamanho_total_bytes / maiorTabelaBytes) * 100 : 0;
                  const indexRatio =
                    tabela.tamanho_total_bytes > 0
                      ? (tabela.tamanho_indices_bytes / tabela.tamanho_total_bytes) * 100
                      : 0;
                  return (
                    <View key={`${tabela.schema}.${tabela.tabela}`} style={styles.listRow}>
                      <View style={styles.listLabelRow}>
                        <Text style={styles.listLabel}>
                          {tabela.schema}.{tabela.tabela}
                        </Text>
                        <Text style={styles.listValue}>{formatarBytes(tabela.tamanho_total_bytes)}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${largura}%` }]} />
                      </View>
                      <Text style={styles.listHint}>
                        {formatarInteiro(tabela.linhas_estimadas)} linhas · índice {indexRatio.toFixed(0)}% · {formatarInteiro(tabela.linhas_mortas)} mortas
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title="Cache do Postgres"
              subtitle="Quanto das leituras bate em cache quente. Ideal > 99%."
              icon="info"
            />
            <View style={styles.cacheRow}>
              <View style={styles.cacheCell}>
                <Text style={styles.cacheLabel}>Hit ratio</Text>
                <Text style={styles.cacheValue}>{formatarPercentual(dbUsage.cache.ratio, 2)}</Text>
              </View>
              <View style={styles.cacheCell}>
                <Text style={styles.cacheLabel}>Blocos em cache</Text>
                <Text style={styles.cacheValueSecondary}>{formatarInteiro(dbUsage.cache.hit)}</Text>
              </View>
              <View style={styles.cacheCell}>
                <Text style={styles.cacheLabel}>Blocos lidos do disco</Text>
                <Text style={styles.cacheValueSecondary}>{formatarInteiro(dbUsage.cache.read)}</Text>
              </View>
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title={`Usuários online (${data?.usuariosOnline?.online.length ?? 0})`}
              subtitle={
                data?.usuariosOnline
                  ? `Acesso autenticado nos últimos ${data.usuariosOnline.janela_minutos} min. Usa ultimo_acesso_em atualizado a cada checagem de sessão.`
                  : 'Sem dados de presença ainda.'
              }
              icon="info"
            />
            <UsuariosOnlineBlock
              payload={data?.usuariosOnline ?? null}
              erro={data?.usuariosOnlineError ?? null}
            />
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title={`Conexões (${dbUsage.conexoes.length})`}
              subtitle="Sessões abertas contra o banco — excluindo a própria leitura desta tela."
              icon="info"
            />
            {dbUsage.conexoes.length === 0 ? (
              <EmptyState title="Sem outras conexões" description="Só a desta tela estava ativa no momento da leitura." />
            ) : (
              <View style={styles.connectionList}>
                {dbUsage.conexoes.map((conexao) => (
                  <View key={conexao.pid} style={styles.connectionRow}>
                    <View style={styles.connectionHead}>
                      <Text style={styles.connectionPid}>#{conexao.pid}</Text>
                      <Text style={styles.connectionUser}>
                        {conexao.usuario ?? '—'}
                        {conexao.aplicacao ? ` · ${conexao.aplicacao}` : ''}
                      </Text>
                      <Text style={[styles.connectionState, conexao.estado === 'active' ? styles.connectionStateActive : null]}>
                        {conexao.estado ?? 'idle'}
                      </Text>
                    </View>
                    <Text style={styles.connectionMeta}>
                      {conexao.duracao_query_segundos != null ? `${conexao.duracao_query_segundos}s nesta query` : 'sem query'}
                      {conexao.espera_evento ? ` · aguardando ${conexao.espera_tipo}/${conexao.espera_evento}` : ''}
                    </Text>
                    {conexao.query ? (
                      <Text style={styles.connectionQuery} numberOfLines={3}>
                        {conexao.query}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          <SectionCard>
            <SectionTitle
              title="Top queries"
              subtitle={
                data?.queryStats?.habilitado
                  ? 'Acumulado desde o último reset de pg_stat_statements.'
                  : 'Extensão pg_stat_statements não disponível — peça ao Supabase para habilitar.'
              }
              icon="info"
            />
            <TopQueriesList stats={data?.queryStats ?? null} erro={data?.queryStatsError ?? null} />
          </SectionCard>
        </>
      ) : loading ? (
        <EmptyState title="Carregando métricas..." description="Aguarde a primeira leitura." />
      ) : (
        <EmptyState
          title="Sem dados ainda"
          description="Clique em Atualizar para buscar as métricas do Postgres."
        />
      )}
    </ScreenScrollView>
  );
}

function UsuariosOnlineBlock({
  payload,
  erro,
}: {
  payload: UsuariosOnlinePayload | null;
  erro: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  if (erro) {
    return <InfoBanner title="Falha ao ler usuários" description={erro} tone="warning" />;
  }

  if (!payload) {
    return <EmptyState title="Sem dados" description="Nada para mostrar ainda." />;
  }

  return (
    <View style={styles.userBlock}>
      {payload.online.length === 0 ? (
        <EmptyState
          title="Ninguém online agora"
          description={`Nenhum usuário autenticou nos últimos ${payload.janela_minutos} min.`}
        />
      ) : (
        <View style={styles.userList}>
          {payload.online.map((u) => (
            <View key={u.usuario} style={styles.userRow}>
              <View style={styles.userDot} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{u.usuario}</Text>
                <Text style={styles.userMeta}>
                  {formatarTempoDecorrido(u.segundos_desde_acesso)} · sessão desde{' '}
                  {u.ultima_validacao_em ? formatarDataHora(u.ultima_validacao_em) : '—'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {payload.recentes.length > 0 ? (
        <View style={styles.userRecentBlock}>
          <Text style={styles.userRecentTitle}>Recentes (fora da janela)</Text>
          <View style={styles.userList}>
            {payload.recentes.slice(0, 10).map((u) => (
              <View key={`recente-${u.usuario}`} style={styles.userRowCompact}>
                <Text style={styles.userNameSoft}>{u.usuario}</Text>
                <Text style={styles.userMeta}>
                  {u.ultimo_acesso_em
                    ? `acesso em ${formatarDataHora(u.ultimo_acesso_em)}`
                    : u.ultima_validacao_em
                      ? `login em ${formatarDataHora(u.ultima_validacao_em)}`
                      : 'sem acesso registrado'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TopQueriesList({ stats, erro }: { stats: QueryStatsPayload | null; erro: string | null }) {
  const styles = useThemedStyles(createStyles);
  if (erro) {
    return <InfoBanner title="Falha ao ler top queries" description={erro} tone="warning" />;
  }

  if (!stats || !stats.habilitado) {
    return (
      <EmptyState
        title="pg_stat_statements desativado"
        description="Sem essa extensão não é possível ver o ranking de queries lentas pelo app."
      />
    );
  }

  if (stats.erro) {
    return <InfoBanner title="Erro no pg_stat_statements" description={stats.erro} tone="warning" />;
  }

  if (stats.queries.length === 0) {
    return <EmptyState title="Sem estatísticas" description="Extensão habilitada, mas sem dados acumulados." />;
  }

  return (
    <View style={styles.queryList}>
      {stats.queries.map((query, index) => (
        <View key={`${index}-${query.calls}`} style={styles.queryRow}>
          <View style={styles.queryHead}>
            <Text style={styles.queryMeta}>
              {formatarInteiro(query.calls)} chamadas · média {query.mean_exec_time_ms.toFixed(2)} ms · total {query.total_exec_time_ms.toFixed(0)} ms
            </Text>
          </View>
          <Text style={styles.queryBody} numberOfLines={4}>
            {query.query}
          </Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: tokens.spacing.sm,
  },
  gaugeValue: {
    gap: 2,
  },
  gaugeTotal: {
    color: tokens.colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  gaugeLimit: {
    color: tokens.colors.textMuted,
    fontSize: 12,
  },
  gaugePercentBox: {
    alignItems: 'flex-end',
  },
  gaugePercent: {
    fontSize: 20,
    fontWeight: '800',
  },
  gaugePercentLabel: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  gaugeTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceStrong,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 999,
  },
  list: {
    gap: tokens.spacing.sm,
  },
  listRow: {
    gap: 4,
  },
  listLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: tokens.spacing.xs,
  },
  listLabel: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  listValue: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  listHint: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceStrong,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: tokens.colors.brand,
  },
  cacheRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  cacheCell: {
    flexGrow: 1,
    flexBasis: 150,
    gap: 4,
  },
  cacheLabel: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  cacheValue: {
    color: tokens.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cacheValueSecondary: {
    color: tokens.colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  userBlock: {
    gap: tokens.spacing.md,
  },
  userList: {
    gap: tokens.spacing.xs,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.line,
  },
  userRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: tokens.spacing.xs,
    paddingVertical: 2,
  },
  userDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  userNameSoft: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  userMeta: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  userRecentBlock: {
    gap: tokens.spacing.xs,
    paddingTop: tokens.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.line,
  },
  userRecentTitle: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  connectionList: {
    gap: tokens.spacing.sm,
  },
  connectionRow: {
    gap: 4,
    paddingVertical: tokens.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.line,
  },
  connectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  connectionPid: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  connectionUser: {
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  connectionState: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  connectionStateActive: {
    color: '#16a34a',
  },
  connectionMeta: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  connectionQuery: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    fontFamily: tokens.typography.mono,
    backgroundColor: tokens.colors.surfaceMuted,
    padding: tokens.spacing.xs,
    borderRadius: tokens.radii.sm,
  },
  queryList: {
    gap: tokens.spacing.sm,
  },
  queryRow: {
    gap: 4,
    paddingVertical: tokens.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.line,
  },
  queryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  queryMeta: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  queryBody: {
    color: tokens.colors.textSoft,
    fontSize: 11,
    fontFamily: tokens.typography.mono,
    backgroundColor: tokens.colors.surfaceMuted,
    padding: tokens.spacing.xs,
    borderRadius: tokens.radii.sm,
  },
});

