import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionBadge, LevelBadge } from '@/features/almox/components/badges';
import {
  ActionButton,
  EmptyState,
  FieldInput,
  FormField,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { getCategoriaMaterialLabel } from '@/features/almox/data';
import { almoxTheme } from '@/features/almox/tokens';
import { EmailConfig } from '@/features/almox/types';
import { formatDecimal } from '@/features/almox/utils';

export default function SettingsScreen() {
  const { dataset, categoryFilter, emailConfig, error, refreshing, syncError, syncingBase, syncBase, usingCachedData } = useAlmoxData();
  const [config, setConfig] = useState<EmailConfig>(emailConfig);
  const alertItems = dataset.emailPreviewItems;
  const formattedSync = dataset.lastSync
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dataset.lastSync))
    : 'sem sincronização';

  return (
    <ScreenScrollView>
      <PageHeader
        title="Configurações"
        subtitle={`Tela preparada para SMTP e alertas automáticos. Base atual sincronizada em ${formattedSync}.`}
        aside={
          <ActionButton
            label={syncingBase ? 'Sincronizando...' : 'Atualizar base'}
            icon="refresh"
            tone="neutral"
            onPress={() => void syncBase()}
            disabled={refreshing || syncingBase}
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

      {usingCachedData ? (
        <InfoBanner
          title="Base local recente em validação"
          description="As prévias abriram com a última base salva na sessão anterior. O Supabase está sincronizando em background e os números podem mudar em instantes."
          tone="info"
        />
      ) : null}

      <InfoBanner
        title="Integração pendente"
        description="Salvar configuração, enviar alertas e forçar reenvio seguem desabilitados. A prévia dos itens, porém, já usa a base real do Supabase."
        tone="warning"
      />

      <SectionCard>
        <SectionTitle
          title="Configuração de e-mail"
          subtitle="Os campos abaixo são editáveis localmente para validar o formulário."
          icon="mail"
        />

        <View style={styles.formGrid}>
          <FormField label="Servidor SMTP">
            <FieldInput
              value={config.smtp_host}
              onChangeText={(value) => setConfig((current) => ({ ...current, smtp_host: value }))}
              placeholder="smtp.hospital.local"
            />
          </FormField>

          <View style={styles.inlineFields}>
            <View style={styles.flexField}>
              <FormField label="Porta">
                <FieldInput
                  value={String(config.smtp_port)}
                  onChangeText={(value) =>
                    setConfig((current) => ({
                      ...current,
                      smtp_port: Number(value.replace(/\D/g, '') || 0),
                    }))
                  }
                  keyboardType="numeric"
                  placeholder="587"
                />
              </FormField>
            </View>
            <View style={styles.flexField}>
              <FormField label="Remetente">
                <FieldInput
                  value={config.email_user}
                  onChangeText={(value) => setConfig((current) => ({ ...current, email_user: value }))}
                  placeholder="alertas@hmsa.local"
                />
              </FormField>
            </View>
          </View>

          <FormField label="Senha / App password">
            <FieldInput
              value={config.email_pass}
              onChangeText={(value) => setConfig((current) => ({ ...current, email_pass: value }))}
              secureTextEntry
              placeholder="************"
            />
          </FormField>

          <FormField label="Destinatário">
            <FieldInput
              value={config.email_destination}
              onChangeText={(value) => setConfig((current) => ({ ...current, email_destination: value }))}
              placeholder="suprimentos@hmsa.local"
            />
          </FormField>
        </View>

        <Pressable
          onPress={() =>
            setConfig((current) => ({
              ...current,
              auto_send_on_sync: !current.auto_send_on_sync,
            }))
          }
          style={[
            styles.toggle,
            config.auto_send_on_sync ? styles.toggleActive : null,
          ]}>
          <View style={styles.toggleMain}>
            <Text style={styles.toggleTitle}>Envio automático após sincronização</Text>
            <Text style={styles.toggleText}>
              {config.auto_send_on_sync
                ? 'Ligado visualmente. A gravação real ainda está bloqueada.'
                : 'Desligado visualmente. O estado não é persistido nesta fase.'}
            </Text>
          </View>
          <View style={[styles.toggleTrack, config.auto_send_on_sync ? styles.toggleTrackActive : null]}>
            <View style={[styles.toggleThumb, config.auto_send_on_sync ? styles.toggleThumbActive : null]} />
          </View>
        </Pressable>

        <View style={styles.actionGroup}>
          <ActionButton label="Salvar" icon="save" disabled />
          <ActionButton label="Enviar alerta" icon="send" tone="warning" disabled />
          <ActionButton label="Forçar reenvio" icon="send" tone="danger" disabled />
          <ActionButton label="Preview do e-mail" icon="eye" tone="neutral" disabled />
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Prévia dos alertas"
          subtitle={`${alertItems.length} item(ns) apareceriam no e-mail de notificação`}
          icon="eye"
        />
        {alertItems.length === 0 ? (
          <EmptyState
            title="Nenhum alerta na base atual"
            description="A importação mais recente não trouxe itens críticos ou em alerta para o resumo de e-mail."
          />
        ) : (
          <View style={styles.previewList}>
            {alertItems.map((item) => (
              <View key={`${item.categoria_material}-${item.product_code}`} style={styles.previewRow}>
                <View style={styles.previewMain}>
                  <Text style={styles.previewName}>{item.product_name}</Text>
                  <Text style={styles.previewMeta}>
                    {item.product_code}
                    {categoryFilter === 'todos' ? ` • ${getCategoriaMaterialLabel(item.categoria_material)}` : ''}
                    {` • ${formatDecimal(item.sufficiency_days)} dias`}
                  </Text>
                </View>
                <View style={styles.previewBadges}>
                  <LevelBadge level={item.level} />
                  <ActionBadge action={item.action} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle title="Dica de configuração" subtitle="Boas práticas para SMTP institucional." icon="info" />
        <Text style={styles.tipText}>
          Prefira credenciais dedicadas ao almoxarifado, autenticação por app password e uma caixa de destino compartilhada
          entre suprimentos e coordenação assistencial.
        </Text>
      </SectionCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  formGrid: {
    gap: almoxTheme.spacing.md,
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  flexField: {
    flexGrow: 1,
    flexBasis: 220,
  },
  toggle: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
  },
  toggleActive: {
    borderColor: '#b7e3cc',
    backgroundColor: '#eaf8f1',
  },
  toggleMain: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: almoxTheme.colors.surfaceStrong,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleTrackActive: {
    backgroundColor: '#b9ecd9',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: almoxTheme.colors.white,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  actionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
  },
  previewList: {
    gap: almoxTheme.spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: almoxTheme.colors.line,
  },
  previewMain: {
    flex: 1,
    gap: 4,
  },
  previewName: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  previewMeta: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  previewBadges: {
    gap: almoxTheme.spacing.xs,
    alignItems: 'flex-end',
  },
  tipText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
