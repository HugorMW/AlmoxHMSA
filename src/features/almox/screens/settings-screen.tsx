import React from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  ActionButton,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { almoxTheme } from '@/features/almox/tokens';

export default function SettingsScreen() {
  const { dataset, error, loading, refreshing, syncError, syncNotice, syncingBase, syncBase, usingCachedData } = useAlmoxData();
  const formattedSync = dataset.lastSync
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dataset.lastSync))
    : 'sem sincronização';

  return (
    <ScreenScrollView>
      <PageHeader
        title="Configurações"
        subtitle={`Parâmetros do sistema. Base atual sincronizada em ${formattedSync}.`}
        aside={
          <ActionButton
            label={loading ? 'Carregando...' : syncingBase ? 'Sincronizando...' : 'Atualizar estoque'}
            icon="refresh"
            tone="neutral"
            onPress={() => void syncBase('estoque')}
            disabled={refreshing || syncingBase}
            loading={loading}
          />
        }
      />

      {error ? (
        <InfoBanner
          title="Falha ao atualizar a base"
          description={`${error} A prévia abaixo continua usando a última leitura válida do banco.`}
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
          description="As prévias abriram com a última base salva na sessão anterior. O Supabase está sincronizando em background e os números podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Parâmetros editáveis"
          subtitle="Em breve você poderá ajustar faixas de cobertura, risco, prioridade e regras de ação."
          icon="info"
        />
        <Text style={styles.placeholderText}>
          As regras que definem o que é Crítico, Alto, Médio, Baixo e quais itens entram em cada ação (Comprar, Pegar emprestado, Pode emprestar...) hoje estão fixas no código. A próxima iteração traz essas regras para esta tela.
        </Text>
      </SectionCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  placeholderText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
