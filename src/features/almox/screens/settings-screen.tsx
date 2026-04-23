import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  FieldInput,
  FormField,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import {
  ConfiguracaoSistema,
  ConfiguracaoSistemaKey,
  ConfiguracaoSistemaValidationIssue,
  PROCESSO_TOTAL_PARCELAS_MAX,
  configuracaoSistemaIgual,
  configuracaoSistemaKeys,
  configuracaoSistemaPadrao,
  getLevelRangeLabels,
  normalizarConfiguracaoSistema,
  processoPrazoCategorias,
  processoPrazoParcelaDefinitions,
  processoPrazoTipos,
  validarConfiguracaoSistema,
} from '@/features/almox/configuracao';
import { almoxTheme, levelColors } from '@/features/almox/tokens';
import { Level } from '@/features/almox/types';

type ConfigDraft = Record<ConfiguracaoSistemaKey, string | boolean>;

type ConfigFieldDefinition = {
  key: ConfiguracaoSistemaKey;
  label: string;
  suffix: string;
  helper: string;
  decimal?: boolean;
};

type ConfigFieldGroup = {
  title: string;
  subtitle: string;
  fields: ConfigFieldDefinition[];
  children?: ConfigFieldGroup[];
};

const coverageFields: ConfigFieldDefinition[] = [
  {
    key: 'criticoDias',
    label: 'Crítico até',
    suffix: 'dias',
    helper: 'Limite superior da faixa de maior pressão depois de estoque zerado.',
  },
  {
    key: 'altoDias',
    label: 'Alto até',
    suffix: 'dias',
    helper: 'Faixa que ainda atende, mas já pede ação rápida.',
  },
  {
    key: 'medioDias',
    label: 'Médio até',
    suffix: 'dias',
    helper: 'Última faixa monitorada antes do risco baixo.',
  },
  {
    key: 'baixoDias',
    label: 'Baixo até',
    suffix: 'dias',
    helper: 'Acima desse valor o item passa para estável.',
  },
];

const riskFields: ConfigFieldDefinition[] = [
  {
    key: 'riscoAltoDias',
    label: 'Risco alto até',
    suffix: 'dias',
    helper: 'Usado nos painéis de risco de ruptura.',
  },
  {
    key: 'riscoMedioDias',
    label: 'Risco médio até',
    suffix: 'dias',
    helper: 'Itens acima desse limite ficam estáveis no risco de ruptura.',
  },
  {
    key: 'prioridadeUrgenteDias',
    label: 'Prioridade urgente até',
    suffix: 'dias',
    helper: 'Define prioridade urgente na lista de compras.',
  },
  {
    key: 'prioridadeAltaDias',
    label: 'Prioridade alta até',
    suffix: 'dias',
    helper: 'Acima desse limite a prioridade de compra volta ao normal.',
  },
];

const actionFieldGroups: ConfigFieldGroup[] = [
  {
    title: 'Compra',
    subtitle: 'Quando o HMSA precisa comprar e qual quantidade sugerir.',
    fields: [
      {
        key: 'comprarDias',
        label: 'Comprar quando faltar até',
        suffix: 'dias',
        helper: 'Se a cobertura chegar nesse número de dias, o item entra para compra ou empréstimo.',
      },
      {
        key: 'mesesCompraSugerida',
        label: 'Quantidade sugerida para compra',
        suffix: 'meses de consumo',
        helper: 'Ex.: 2 sugere comprar o suficiente para cerca de dois meses de consumo.',
        decimal: true,
      },
    ],
  },
  {
    title: 'Empréstimos',
    subtitle: 'Regras para pedir ajuda a outra unidade ou identificar estoque que pode ajudar.',
    fields: [],
    children: [
      {
        title: 'Para o HMSA',
        subtitle: 'Quando outro hospital pode ajudar o HMSA sem ficar descoberto.',
        fields: [
          {
            key: 'doadorSeguroDias',
            label: 'Hospital que empresta precisa ter mais de',
            suffix: 'dias',
            helper: 'Outro hospital só pode ajudar se tiver cobertura acima desse valor.',
          },
          {
            key: 'alvoTransferenciaCmm',
            label: 'Quanto o HMSA deve pegar emprestado',
            suffix: 'vezes o consumo mensal',
            helper: 'Use de 0 a 2. Ex.: 1 sugere receber até 1 mês de consumo; 2 sugere até 2 meses. A quantidade final respeita o mínimo que o hospital doador deve manter.',
            decimal: true,
          },
        ],
      },
      {
        title: 'Do HMSA para Demais Unidades',
        subtitle: 'Quando o HMSA pode ser analisado como origem de ajuda para outras unidades.',
        fields: [
          {
            key: 'podeEmprestarDias',
            label: 'Pode emprestar quando tiver',
            suffix: 'dias',
            helper: 'Itens com essa cobertura ou mais aparecem como estoque com folga e podem ser avaliados para emprestar.',
          },
          {
            key: 'pisoDoadorAposEmprestimoDias',
            label: 'Depois de emprestar, deve ficar com',
            suffix: 'dias',
            helper: 'Cobertura mínima que o HMSA deve manter depois de emprestar para outra unidade.',
          },
        ],
      },
    ],
  },
];

function getProcessDeadlineFields(
  categoria: (typeof processoPrazoCategorias)[number]['categoria'],
  tipo: (typeof processoPrazoTipos)[number]['tipo']
): ConfigFieldDefinition[] {
  return processoPrazoParcelaDefinitions
    .filter((definition) => definition.categoria === categoria && definition.tipo === tipo)
    .map((definition) => ({
      key: definition.key,
      label: `Parcela ${definition.parcela}`,
      suffix: 'dias úteis',
      helper: `Vencimento padrão da parcela ${definition.parcela} contado a partir da data de resgate.`,
    }));
}

const levelOrder: { level: Level; label: string }[] = [
  { level: 'URGENTE', label: 'Urgente' },
  { level: 'CRÍTICO', label: 'Crítico' },
  { level: 'ALTO', label: 'Alto' },
  { level: 'MÉDIO', label: 'Médio' },
  { level: 'BAIXO', label: 'Baixo' },
  { level: 'ESTÁVEL', label: 'Estável' },
];

function draftFromConfig(config: ConfiguracaoSistema): ConfigDraft {
  return configuracaoSistemaKeys.reduce<ConfigDraft>((accumulator, key) => {
    accumulator[key] = typeof config[key] === 'boolean' ? config[key] : String(config[key]);
    return accumulator;
  }, {} as ConfigDraft);
}

function getIssueForField(issues: ConfiguracaoSistemaValidationIssue[], key: ConfiguracaoSistemaKey) {
  return issues.find((issue) => issue.fields.includes(key));
}

function coverageChanged(current: ConfiguracaoSistema, next: ConfiguracaoSistema) {
  return coverageFields.some((field) => current[field.key] !== next[field.key]);
}

function confirmCoverageChange() {
  const message = 'Alterar faixas de cobertura reclassifica produtos, KPIs, filtros e pedidos sugeridos. Continuar?';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('Reclassificar produtos', message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Salvar', onPress: () => resolve(true) },
    ]);
  });
}

export default function SettingsScreen() {
  const {
    dataset,
    error,
    warning,
    loading,
    refreshing,
    syncError,
    syncNotice,
    syncingBase,
    syncBase,
    usingCachedData,
    systemConfig,
    systemConfigLoading,
    systemConfigSaving,
    systemConfigError,
    systemConfigUpdatedAt,
    refreshSystemConfig,
    saveSystemConfig,
  } = useAlmoxData();
  const [draft, setDraft] = useState<ConfigDraft>(() => draftFromConfig(systemConfig));
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  const draftConfig = useMemo(() => normalizarConfiguracaoSistema(draft), [draft]);
  const validationIssues = useMemo(() => validarConfiguracaoSistema(draftConfig), [draftConfig]);
  const isDirty = useMemo(() => !configuracaoSistemaIgual(draftConfig, systemConfig), [draftConfig, systemConfig]);
  const matchesDefaults = useMemo(
    () => configuracaoSistemaIgual(draftConfig, configuracaoSistemaPadrao),
    [draftConfig]
  );
  const levelRanges = useMemo(() => getLevelRangeLabels(draftConfig), [draftConfig]);

  const formattedSync = dataset.lastSync
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dataset.lastSync))
    : 'sem sincronização';
  const formattedConfig = systemConfigUpdatedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(systemConfigUpdatedAt))
    : systemConfigLoading
      ? 'carregando parâmetros'
      : 'usando padrões locais';

  useEffect(() => {
    setDraft(draftFromConfig(systemConfig));
  }, [systemConfig]);

  useEffect(() => {
    if (!localNotice) {
      return;
    }

    const timeoutId = setTimeout(() => setLocalNotice(null), 4500);
    return () => clearTimeout(timeoutId);
  }, [localNotice]);

  function updateDraft(key: ConfiguracaoSistemaKey, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value.replace(/[^\d,.-]/g, ''),
    }));
  }

  async function handleSave() {
    if (validationIssues.length > 0 || systemConfigSaving) {
      return;
    }

    if (coverageChanged(systemConfig, draftConfig)) {
      const confirmed = await confirmCoverageChange();
      if (!confirmed) {
        return;
      }
    }

    await saveSystemConfig(draftConfig);
    setLocalNotice('Parâmetros salvos. As telas já foram recalculadas com a nova configuração.');
  }

  function handleRestoreDefaults() {
    setDraft(draftFromConfig(configuracaoSistemaPadrao));
    setLocalNotice('Padrões carregados no formulário. Revise e salve para aplicar.');
  }

  return (
    <ScreenScrollView>
      <PageHeader
        title="Configurações"
        subtitle={`Parâmetros do sistema. Base atual sincronizada em ${formattedSync}. Configuração: ${formattedConfig}.`}
        aside={
          <View style={styles.headerActions}>
            <ActionButton
              label={systemConfigLoading ? 'Carregando...' : 'Recarregar parâmetros'}
              icon="refresh"
              tone="neutral"
              onPress={() => void refreshSystemConfig()}
              disabled={systemConfigLoading || systemConfigSaving}
              loading={systemConfigLoading}
            />
            <ActionButton
              label={loading ? 'Carregando...' : syncingBase ? 'Sincronizando...' : 'Atualizar estoque'}
              icon="refresh"
              tone="neutral"
              onPress={() => void syncBase('estoque')}
              disabled={refreshing || syncingBase}
              loading={loading}
            />
          </View>
        }
      />

      {error ? (
        <InfoBanner
          title="Falha ao atualizar a base"
          description={`${error} A prévia abaixo continua usando a última leitura válida do banco.`}
          tone="danger"
        />
      ) : null}

      {warning ? <InfoBanner title="Atualização parcial da base" description={warning} tone="warning" /> : null}

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

      {systemConfigError ? (
        <InfoBanner
          title="Falha nos parâmetros"
          description={`${systemConfigError} O app mantém os padrões locais até a configuração voltar a carregar.`}
          tone="danger"
        />
      ) : null}

      {localNotice ? (
        <InfoBanner
          title="Configuração"
          description={localNotice}
          tone="success"
        />
      ) : null}

      <SectionCard>
        <SectionTitle
          title="Faixas de cobertura"
          subtitle="Definem os níveis exibidos no dashboard, filtros e badges."
          icon="settings"
          tooltip="A faixa urgente continua reservada para estoque zerado. As demais faixas usam os limites informados abaixo."
        />

        <View style={styles.formGrid}>
          {coverageFields.map((field) => (
            <ConfigNumberField
              key={field.key}
              field={field}
              value={String(draft[field.key])}
              issue={getIssueForField(validationIssues, field.key)}
              disabled={systemConfigSaving}
              onChange={updateDraft}
            />
          ))}
        </View>

        <View style={styles.previewGrid}>
          {levelOrder.map((item) => {
            const palette = levelColors[item.level];
            return (
              <View key={item.level} style={[styles.rangePreview, { borderColor: palette.background }]}>
                <Text style={[styles.rangePreviewLabel, { color: palette.background }]}>{item.label}</Text>
                <Text style={styles.rangePreviewText}>{levelRanges[item.level]}</Text>
              </View>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Risco e prioridade"
          subtitle="Controlam risco de ruptura e prioridade na lista de compras."
          icon="alert"
        />
        <View style={styles.formGrid}>
          {riskFields.map((field) => (
            <ConfigNumberField
              key={field.key}
              field={field}
              value={String(draft[field.key])}
              issue={getIssueForField(validationIssues, field.key)}
              disabled={systemConfigSaving}
              onChange={updateDraft}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Regras de ação"
          subtitle="Ajustam quando comprar, quando pedir emprestado e quanto sugerir."
          icon="cart"
        />
        <View style={styles.actionGroups}>
          {actionFieldGroups.map((group, index) => (
            <View
              key={group.title}
              style={[styles.actionGroup, index > 0 ? styles.actionGroupSeparated : null]}>
              <View style={styles.actionGroupHeader}>
                <Text style={styles.actionGroupTitle}>{group.title}</Text>
                <Text style={styles.actionGroupSubtitle}>{group.subtitle}</Text>
              </View>
              {group.fields.length > 0 ? (
                <View style={styles.formGrid}>
                  {group.fields.map((field) => (
                    <ConfigNumberField
                      key={field.key}
                      field={field}
                      value={String(draft[field.key])}
                      issue={getIssueForField(validationIssues, field.key)}
                      disabled={systemConfigSaving}
                      onChange={updateDraft}
                    />
                  ))}
                </View>
              ) : null}
              {group.children ? (
                <View style={styles.actionSubgroups}>
                  {group.children.map((child) => (
                    <View key={child.title} style={styles.actionSubgroup}>
                      <View style={styles.actionSubgroupHeader}>
                        <Text style={styles.actionSubgroupTitle}>{child.title}</Text>
                        <Text style={styles.actionGroupSubtitle}>{child.subtitle}</Text>
                      </View>
                      <View style={styles.formGrid}>
                        {child.fields.map((field) => (
                          <ConfigNumberField
                            key={field.key}
                            field={field}
                            value={String(draft[field.key])}
                            issue={getIssueForField(validationIssues, field.key)}
                            disabled={systemConfigSaving}
                            onChange={updateDraft}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <InfoBanner
          title="Quando o item entra em compra ou empréstimo"
          description={`Com os valores atuais, o item entra em compra ou empréstimo quando tiver até ${draftConfig.comprarDias} dias de cobertura.`}
          tone="info"
        />
      </SectionCard>

      <SectionCard>
        <SectionTitle
          title="Processos"
          subtitle="Prazos padrão por classificação e tipo de processo."
          icon="processes"
          tooltip="Cada prazo é contado em dias úteis a partir da data de resgate informada no processo."
        />
        <View style={styles.actionGroups}>
          {processoPrazoCategorias.map((categoria, index) => (
            <View
              key={categoria.categoria}
              style={[styles.actionGroup, index > 0 ? styles.actionGroupSeparated : null]}>
              <View style={styles.actionGroupHeader}>
                <Text style={styles.actionGroupTitle}>{categoria.label}</Text>
                <Text style={styles.actionGroupSubtitle}>
                  Prazos usados nos processos cadastrados como {categoria.label.toLowerCase()}.
                </Text>
              </View>
              <View style={styles.actionSubgroups}>
                {processoPrazoTipos.map((tipo) => (
                  <View key={`${categoria.categoria}-${tipo.tipo}`} style={styles.actionSubgroup}>
                    <View style={styles.actionSubgroupHeader}>
                      <Text style={styles.actionSubgroupTitle}>{tipo.label}</Text>
                      <Text style={styles.actionGroupSubtitle}>
                        Vencimento padrão de cada parcela desse tipo de processo.
                      </Text>
                    </View>
                    <View style={styles.formGrid}>
                      {getProcessDeadlineFields(categoria.categoria, tipo.tipo).map((field) => (
                        <ConfigNumberField
                          key={field.key}
                          field={field}
                          value={String(draft[field.key])}
                          issue={getIssueForField(validationIssues, field.key)}
                          disabled={systemConfigSaving}
                          onChange={updateDraft}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        <InfoBanner
          title="Parcelas dos processos"
          description={`Novos processos podem ter de 1 a ${PROCESSO_TOTAL_PARCELAS_MAX} parcelas. Os prazos acima recalculam a situação e os vencimentos exibidos na tela de Processos.`}
          tone="info"
        />
      </SectionCard>

      {validationIssues.length > 0 ? (
        <InfoBanner
          title="Revise antes de salvar"
          description={validationIssues.map((issue) => issue.message).join(' ')}
          tone="warning"
        />
      ) : null}

      <View style={styles.footerActions}>
        <ActionButton
          label="Restaurar padrões"
          icon="refresh"
          tone="neutral"
          onPress={handleRestoreDefaults}
          disabled={systemConfigSaving || matchesDefaults}
        />
        <ActionButton
          label={systemConfigSaving ? 'Salvando...' : 'Salvar alterações'}
          icon="save"
          onPress={() => void handleSave()}
          disabled={!isDirty || validationIssues.length > 0 || systemConfigSaving}
          loading={systemConfigSaving}
        />
      </View>
    </ScreenScrollView>
  );
}

function ConfigNumberField({
  field,
  value,
  issue,
  disabled,
  onChange,
}: {
  field: ConfigFieldDefinition;
  value: string;
  issue?: ConfiguracaoSistemaValidationIssue;
  disabled?: boolean;
  onChange: (key: ConfiguracaoSistemaKey, value: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <FormField label={field.label}>
        <View style={styles.inputWithSuffix}>
          <FieldInput
            value={value}
            onChangeText={(nextValue) => onChange(field.key, nextValue)}
            keyboardType={field.decimal ? 'decimal-pad' : 'number-pad'}
            editable={!disabled}
            style={[styles.numberInput, issue ? styles.inputError : null]}
          />
          <Text style={styles.inputSuffix}>{field.suffix}</Text>
        </View>
      </FormField>
      <Text style={[styles.helperText, issue ? styles.errorText : null]}>
        {issue ? issue.message : field.helper}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: almoxTheme.spacing.sm,
    flexWrap: 'wrap',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  actionGroups: {
    gap: almoxTheme.spacing.lg,
  },
  actionGroup: {
    gap: almoxTheme.spacing.md,
  },
  actionGroupSeparated: {
    borderTopWidth: 1,
    borderTopColor: almoxTheme.colors.line,
    paddingTop: almoxTheme.spacing.lg,
  },
  actionGroupHeader: {
    gap: 4,
  },
  actionGroupTitle: {
    color: almoxTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  actionGroupSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionSubgroups: {
    gap: almoxTheme.spacing.md,
  },
  actionSubgroup: {
    gap: almoxTheme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: almoxTheme.colors.lineStrong,
    paddingLeft: almoxTheme.spacing.md,
  },
  actionSubgroupHeader: {
    gap: 4,
  },
  actionSubgroupTitle: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  fieldWrap: {
    flexGrow: 1,
    flexBasis: 230,
    gap: almoxTheme.spacing.xs,
  },
  inputWithSuffix: {
    minHeight: 46,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  numberInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  inputError: {
    color: almoxTheme.colors.rose,
  },
  inputSuffix: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingRight: almoxTheme.spacing.md,
  },
  helperText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  errorText: {
    color: almoxTheme.colors.rose,
    fontWeight: '700',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
  },
  rangePreview: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    padding: almoxTheme.spacing.md,
    gap: 4,
  },
  rangePreviewLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  rangePreviewText: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
  },
});
