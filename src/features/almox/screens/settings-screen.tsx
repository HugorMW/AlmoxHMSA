import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ActionButton,
  AppIcon,
  FieldInput,
  FormField,
  InfoBanner,
  PageHeader,
  ScreenScrollView,
  SectionCard,
  SectionTitle,
} from '@/features/almox/components/common';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { useConfirmAction } from '@/features/almox/confirm-action';
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
import {
  PRODUCT_TABLE_SCREEN_OPTIONS,
  ProductTableAdminConfig,
  ProductTableScreenKey,
  normalizarProductTableAdminConfig,
  productTableAdminConfigIgual,
  productTableAdminConfigPadrao,
} from '@/features/almox/product-table-screen-config';
import {
  PRODUCT_TABLE_COLUMN_OPTIONS,
  ProductColumnId,
} from '@/features/almox/product-table-columns';
import { AlmoxTheme, levelColors } from '@/features/almox/tokens';
import { useThemedStyles } from '@/features/almox/theme-provider';
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
      suffix: 'dias',
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

function cloneProductTableAdminConfig(config: ProductTableAdminConfig) {
  return normalizarProductTableAdminConfig(config);
}

const PRODUCT_TABLE_SCREEN_ICONS: Record<
  ProductTableScreenKey,
  Parameters<typeof AppIcon>[0]['name']
> = {
  dashboard: 'dashboard',
  products: 'products',
  orders: 'orders',
};

export default function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const confirmAction = useConfirmAction();
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
    productTableAdminConfig,
    productTableAdminConfigLoading,
    productTableAdminConfigSaving,
    productTableAdminConfigError,
    productTableAdminConfigUpdatedAt,
    refreshProductTableAdminConfig,
    saveProductTableAdminConfig,
  } = useAlmoxData();
  const [draft, setDraft] = useState<ConfigDraft>(() => draftFromConfig(systemConfig));
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [columnConfigDraft, setColumnConfigDraft] = useState<ProductTableAdminConfig>(() =>
    cloneProductTableAdminConfig(productTableAdminConfig)
  );
  const [columnConfigNotice, setColumnConfigNotice] = useState<string | null>(null);
  const [selectedTableScreen, setSelectedTableScreen] = useState<ProductTableScreenKey>('dashboard');

  const draftConfig = useMemo(() => normalizarConfiguracaoSistema(draft), [draft]);
  const validationIssues = useMemo(() => validarConfiguracaoSistema(draftConfig), [draftConfig]);
  const isDirty = useMemo(() => !configuracaoSistemaIgual(draftConfig, systemConfig), [draftConfig, systemConfig]);
  const isColumnConfigDirty = useMemo(
    () => !productTableAdminConfigIgual(columnConfigDraft, productTableAdminConfig),
    [columnConfigDraft, productTableAdminConfig]
  );
  const matchesDefaults = useMemo(
    () => configuracaoSistemaIgual(draftConfig, configuracaoSistemaPadrao),
    [draftConfig]
  );
  const columnConfigMatchesDefaults = useMemo(
    () => productTableAdminConfigIgual(columnConfigDraft, productTableAdminConfigPadrao),
    [columnConfigDraft]
  );
  const levelRanges = useMemo(() => getLevelRangeLabels(draftConfig), [draftConfig]);
  const selectedTableScreenOption = useMemo(
    () => PRODUCT_TABLE_SCREEN_OPTIONS.find((screen) => screen.key === selectedTableScreen) ?? PRODUCT_TABLE_SCREEN_OPTIONS[0],
    [selectedTableScreen]
  );
  const selectedTableScreenConfig = columnConfigDraft[selectedTableScreen];
  const selectedEnabledCount = selectedTableScreenConfig.enabledColumns.length;
  const selectedDefaultVisibleCount = selectedTableScreenConfig.defaultVisibleColumns.length;

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

  useEffect(() => {
    setColumnConfigDraft(cloneProductTableAdminConfig(productTableAdminConfig));
  }, [productTableAdminConfig]);

  useEffect(() => {
    if (!columnConfigNotice) {
      return;
    }

    const timeoutId = setTimeout(() => setColumnConfigNotice(null), 4500);
    return () => clearTimeout(timeoutId);
  }, [columnConfigNotice]);

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
      const confirmed = await confirmAction({
        title: 'Reclassificar produtos',
        message:
          'Alterar faixas de cobertura reclassifica produtos, KPIs, filtros e pedidos sugeridos. Continuar?',
        confirmLabel: 'Salvar',
      });
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

  function handleToggleEnabledColumn(screenKey: ProductTableScreenKey, columnId: ProductColumnId) {
    setColumnConfigDraft((current) => {
      const currentConfig = current[screenKey];
      const columnDefinition = PRODUCT_TABLE_COLUMN_OPTIONS.find((column) => column.id === columnId);
      const isRequired = columnDefinition?.required === true;
      const enabled = currentConfig.enabledColumns.includes(columnId);

      if (enabled && isRequired) {
        return current;
      }

      const nextEnabledColumns = enabled
        ? currentConfig.enabledColumns.filter((id) => id !== columnId)
        : [...currentConfig.enabledColumns, columnId];
      const nextDefaultVisibleColumns = enabled
        ? currentConfig.defaultVisibleColumns.filter((id) => id !== columnId)
        : currentConfig.defaultVisibleColumns;

      return {
        ...current,
        [screenKey]: normalizarProductTableAdminConfig({
          ...current,
          [screenKey]: {
            enabledColumns: nextEnabledColumns,
            defaultVisibleColumns: nextDefaultVisibleColumns,
          },
        })[screenKey],
      };
    });
  }

  function handleToggleDefaultVisibleColumn(screenKey: ProductTableScreenKey, columnId: ProductColumnId) {
    setColumnConfigDraft((current) => {
      const currentConfig = current[screenKey];
      if (!currentConfig.enabledColumns.includes(columnId)) {
        return current;
      }

      const columnDefinition = PRODUCT_TABLE_COLUMN_OPTIONS.find((column) => column.id === columnId);
      const isRequired = columnDefinition?.required === true;
      const visibleByDefault = currentConfig.defaultVisibleColumns.includes(columnId);

      if (visibleByDefault && isRequired) {
        return current;
      }

      const nextDefaultVisibleColumns = visibleByDefault
        ? currentConfig.defaultVisibleColumns.filter((id) => id !== columnId)
        : [...currentConfig.defaultVisibleColumns, columnId];

      return {
        ...current,
        [screenKey]: normalizarProductTableAdminConfig({
          ...current,
          [screenKey]: {
            enabledColumns: currentConfig.enabledColumns,
            defaultVisibleColumns: nextDefaultVisibleColumns,
          },
        })[screenKey],
      };
    });
  }

  function handleRestoreProductTableDefaults() {
    setColumnConfigDraft(cloneProductTableAdminConfig(productTableAdminConfigPadrao));
    setColumnConfigNotice('Padrões de colunas carregados. Salve para aplicar nas telas.');
  }

  async function handleSaveProductTableColumns() {
    if (productTableAdminConfigSaving) {
      return;
    }

    await saveProductTableAdminConfig(columnConfigDraft);
    setColumnConfigNotice('Disponibilidade de colunas salva. As tabelas já usam a nova regra.');
  }

  return (
    <ScreenScrollView>
      <PageHeader
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
              label={productTableAdminConfigLoading ? 'Carregando colunas...' : 'Recarregar colunas'}
              icon="refresh"
              tone="neutral"
              onPress={() => void refreshProductTableAdminConfig()}
              disabled={productTableAdminConfigLoading || productTableAdminConfigSaving}
              loading={productTableAdminConfigLoading}
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

      {productTableAdminConfigError ? (
        <InfoBanner
          title="Falha nas colunas das tabelas"
          description={productTableAdminConfigError}
          tone="danger"
        />
      ) : null}

      {columnConfigNotice ? (
        <InfoBanner
          title="Colunas das tabelas"
          description={columnConfigNotice}
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
          tooltip="Cada prazo é contado em dias corridos a partir da data de resgate informada no processo."
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

      <SectionCard>
        <View style={styles.tableAdminPanel}>
          <View style={styles.tableAdminHeader}>
            <View style={styles.tableAdminHeaderText}>
              <Text style={styles.tableAdminEyebrow}>Configuração global</Text>
              <Text style={styles.tableAdminTitle}>Colunas por tela</Text>
              <Text style={styles.tableAdminSubtitle}>
                Controla quais colunas podem ser usadas e quais começam visíveis. Atualização:{' '}
                {productTableAdminConfigUpdatedAt
                  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                      new Date(productTableAdminConfigUpdatedAt)
                    )
                  : productTableAdminConfigLoading
                    ? 'carregando configuração'
                    : 'usando padrão'}
                .
              </Text>
            </View>

            <View style={styles.tableAdminHeaderActions}>
              <Pressable
                onPress={handleRestoreProductTableDefaults}
                disabled={productTableAdminConfigSaving || columnConfigMatchesDefaults}
                style={({ pressed }) => [
                  styles.tableAdminGhostButton,
                  (productTableAdminConfigSaving || columnConfigMatchesDefaults) ? styles.tableAdminButtonDisabled : null,
                  pressed && !(productTableAdminConfigSaving || columnConfigMatchesDefaults)
                    ? styles.tableAdminButtonPressed
                    : null,
                ]}>
                <Text style={styles.tableAdminGhostButtonText}>Restaurar</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSaveProductTableColumns()}
                disabled={!isColumnConfigDirty || productTableAdminConfigSaving}
                style={({ pressed }) => [
                  styles.tableAdminPrimaryButton,
                  (!isColumnConfigDirty || productTableAdminConfigSaving) ? styles.tableAdminButtonDisabled : null,
                  pressed && !(!isColumnConfigDirty || productTableAdminConfigSaving)
                    ? styles.tableAdminButtonPressed
                    : null,
                ]}>
                <Text style={styles.tableAdminPrimaryButtonText}>
                  {productTableAdminConfigSaving ? 'Salvando...' : 'Salvar'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.tableAdminTabs}>
            {PRODUCT_TABLE_SCREEN_OPTIONS.map((screen) => {
              const active = screen.key === selectedTableScreen;
              return (
                <Pressable
                  key={screen.key}
                  onPress={() => setSelectedTableScreen(screen.key)}
                  style={({ pressed }) => [
                    styles.tableAdminTab,
                    active ? styles.tableAdminTabActive : null,
                    pressed ? styles.tableAdminTabPressed : null,
                  ]}>
                  <AppIcon
                    name={PRODUCT_TABLE_SCREEN_ICONS[screen.key]}
                    size={14}
                    color={
                      active
                        ? (styles.tableAdminTabIconActive.color as string)
                        : (styles.tableAdminTabIcon.color as string)
                    }
                  />
                  <Text style={[styles.tableAdminTabText, active ? styles.tableAdminTabTextActive : null]}>
                    {screen.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.tableAdminLegend}>
            <Text style={styles.tableAdminLegendLabel}>Legenda:</Text>
            <View style={styles.tableAdminRequiredBadge}>
              <Text style={styles.tableAdminRequiredBadgeText}>Obrigatória</Text>
            </View>
            <View style={styles.tableAdminLegendItem}>
              <View style={[styles.tableAdminSwitch, styles.tableAdminSwitchOn, styles.tableAdminSwitchLegend]}>
                <View style={styles.tableAdminSwitchThumb} />
              </View>
              <Text style={styles.tableAdminLegendText}>Liberada e disponível no editor do usuário</Text>
            </View>
            <View style={styles.tableAdminLegendItem}>
              <View style={[styles.tableAdminCheckbox, styles.tableAdminCheckboxChecked]}>
                <AppIcon name="check" size={12} color={styles.tableAdminCheckboxIcon.color as string} />
              </View>
              <Text style={styles.tableAdminLegendText}>Padrão visível para usuários novos ou sem preferência</Text>
            </View>
          </View>

          <View style={styles.tableAdminScreenHintRow}>
            <Text style={styles.tableAdminScreenTitle}>{selectedTableScreenOption.label}</Text>
            <Text style={styles.tableAdminScreenHint}>{selectedTableScreenOption.subtitle}</Text>
          </View>

          <View style={styles.tableAdminTable}>
            <View style={styles.tableAdminTableHeader}>
              <View style={styles.tableAdminColumnCell}>
                <Text style={styles.tableAdminTableHeaderText}>Coluna</Text>
              </View>
              <View style={styles.tableAdminEnabledCell}>
                <Text style={styles.tableAdminTableHeaderText}>Liberada</Text>
              </View>
              <View style={styles.tableAdminDefaultCell}>
                <Text style={styles.tableAdminTableHeaderText}>Padrão visível</Text>
              </View>
            </View>

            {PRODUCT_TABLE_COLUMN_OPTIONS.map((column, index) => {
              const enabled = selectedTableScreenConfig.enabledColumns.includes(column.id);
              const visibleByDefault = selectedTableScreenConfig.defaultVisibleColumns.includes(column.id);
              const isRequired = column.required === true;
              const rowMuted = !enabled && !isRequired;

              return (
                <View
                  key={`${selectedTableScreen}-${column.id}`}
                  style={[
                    styles.tableAdminRow,
                    rowMuted ? styles.tableAdminRowMuted : null,
                    isRequired ? styles.tableAdminRowRequired : null,
                  ]}>
                  <View style={styles.tableAdminColumnCell}>
                    <Text style={styles.tableAdminColumnIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    <View style={styles.tableAdminColumnTextWrap}>
                      <View style={styles.tableAdminColumnTop}>
                        <Text style={[styles.tableAdminColumnLabel, rowMuted ? styles.tableAdminColumnLabelMuted : null]}>
                          {column.label}
                        </Text>
                        {isRequired ? (
                          <View style={styles.tableAdminRequiredBadgeInline}>
                            <Text style={styles.tableAdminRequiredBadgeInlineText}>Obrigatória</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={styles.tableAdminEnabledCell}>
                    <ColumnPermissionSwitch
                      value={enabled}
                      disabled={isRequired}
                      onPress={() => handleToggleEnabledColumn(selectedTableScreen, column.id)}
                    />
                  </View>

                  <View style={styles.tableAdminDefaultCell}>
                    {!enabled && !isRequired ? (
                      <Text style={styles.tableAdminUnavailableText}>não liberada</Text>
                    ) : (
                      <ColumnVisibilityCheckbox
                        checked={visibleByDefault}
                        disabled={!enabled || isRequired}
                        onPress={() => handleToggleDefaultVisibleColumn(selectedTableScreen, column.id)}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.tableAdminFooter}>
            <Text style={styles.tableAdminFooterText}>
              {selectedEnabledCount} liberadas • {selectedDefaultVisibleCount} padrão visível
            </Text>
            <Text style={styles.tableAdminFooterText}>Configuração global — afeta todos os usuários</Text>
          </View>
        </View>
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
  const styles = useThemedStyles(createStyles);
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

function ColumnPermissionSwitch({
  value,
  disabled,
  onPress,
}: {
  value: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tableAdminSwitch,
        value ? styles.tableAdminSwitchOn : null,
        disabled ? styles.tableAdminSwitchDisabled : null,
        pressed && !disabled ? styles.tableAdminSwitchPressed : null,
        { justifyContent: value ? 'flex-end' : 'flex-start' },
      ]}>
      <View style={styles.tableAdminSwitchThumb} />
    </Pressable>
  );
}

function ColumnVisibilityCheckbox({
  checked,
  disabled,
  onPress,
}: {
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tableAdminCheckbox,
        checked ? styles.tableAdminCheckboxChecked : null,
        disabled ? styles.tableAdminCheckboxDisabled : null,
        pressed && !disabled ? styles.tableAdminCheckboxPressed : null,
      ]}>
      {checked ? (
        <AppIcon name="check" size={12} color={styles.tableAdminCheckboxIcon.color as string} />
      ) : null}
    </Pressable>
  );
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  actionGroups: {
    gap: tokens.spacing.lg,
  },
  actionGroup: {
    gap: tokens.spacing.md,
  },
  actionGroupSeparated: {
    borderTopWidth: 1,
    borderTopColor: tokens.colors.line,
    paddingTop: tokens.spacing.lg,
  },
  actionGroupHeader: {
    gap: 4,
  },
  actionGroupTitle: {
    color: tokens.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  actionGroupSubtitle: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionSubgroups: {
    gap: tokens.spacing.md,
  },
  actionSubgroup: {
    gap: tokens.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.lineStrong,
    paddingLeft: tokens.spacing.md,
  },
  actionSubgroupHeader: {
    gap: 4,
  },
  actionSubgroupTitle: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  fieldWrap: {
    flexGrow: 1,
    flexBasis: 230,
    gap: tokens.spacing.xs,
  },
  inputWithSuffix: {
    minHeight: 46,
    borderRadius: tokens.radii.md,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surfaceRaised,
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
    color: tokens.colors.rose,
  },
  inputSuffix: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingRight: tokens.spacing.md,
  },
  helperText: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  errorText: {
    color: tokens.colors.rose,
    fontWeight: '700',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  rangePreview: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: tokens.radii.md,
    borderWidth: 1,
    backgroundColor: tokens.colors.surfaceMuted,
    padding: tokens.spacing.md,
    gap: 4,
  },
  rangePreviewLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  rangePreviewText: {
    color: tokens.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tableAdminPanel: {
    borderRadius: tokens.radii.lg,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surfaceMuted,
    overflow: 'hidden',
  },
  tableAdminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.line,
  },
  tableAdminHeaderText: {
    flex: 1,
    minWidth: 280,
    gap: 6,
  },
  tableAdminEyebrow: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontFamily: tokens.typography.mono,
  },
  tableAdminTitle: {
    color: tokens.colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  tableAdminSubtitle: {
    color: tokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 720,
  },
  tableAdminHeaderActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  tableAdminGhostButton: {
    minHeight: 40,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminGhostButtonText: {
    color: tokens.colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  tableAdminPrimaryButton: {
    minHeight: 40,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.colors.brand,
    backgroundColor: tokens.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminPrimaryButtonText: {
    color: tokens.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  tableAdminButtonDisabled: {
    opacity: 0.5,
  },
  tableAdminButtonPressed: {
    opacity: 0.86,
  },
  tableAdminTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.line,
  },
  tableAdminTab: {
    minHeight: 42,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  tableAdminTabActive: {
    borderBottomColor: tokens.colors.brand,
  },
  tableAdminTabPressed: {
    opacity: 0.82,
  },
  tableAdminTabText: {
    color: tokens.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  tableAdminTabTextActive: {
    color: tokens.colors.brandStrong,
  },
  tableAdminTabIcon: {
    color: tokens.colors.textMuted,
  },
  tableAdminTabIconActive: {
    color: tokens.colors.brandStrong,
  },
  tableAdminLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.line,
    backgroundColor: tokens.colors.surfaceRaised,
  },
  tableAdminLegendLabel: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: tokens.typography.mono,
  },
  tableAdminLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    minHeight: 24,
  },
  tableAdminLegendText: {
    color: tokens.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 240,
  },
  tableAdminRequiredBadge: {
    minHeight: 22,
    paddingHorizontal: tokens.spacing.sm,
    borderRadius: tokens.radii.pill,
    backgroundColor: tokens.colors.surfaceActiveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminRequiredBadgeText: {
    color: tokens.colors.brandStrong,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: tokens.typography.mono,
  },
  tableAdminScreenHintRow: {
    gap: 4,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.line,
  },
  tableAdminScreenTitle: {
    color: tokens.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  tableAdminScreenHint: {
    color: tokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  tableAdminTable: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  tableAdminTableHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.lineStrong,
  },
  tableAdminTableHeaderText: {
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: tokens.typography.mono,
  },
  tableAdminRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.line,
  },
  tableAdminRowMuted: {
    backgroundColor: tokens.colors.surfaceRaised,
  },
  tableAdminRowRequired: {
    backgroundColor: tokens.colors.surfaceActiveSoft,
  },
  tableAdminColumnCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  tableAdminEnabledCell: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminDefaultCell: {
    width: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminColumnIndex: {
    width: 22,
    color: tokens.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: tokens.typography.mono,
  },
  tableAdminColumnTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tableAdminColumnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  tableAdminColumnLabel: {
    color: tokens.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  tableAdminColumnLabelMuted: {
    color: tokens.colors.textMuted,
  },
  tableAdminRequiredBadgeInline: {
    minHeight: 20,
    paddingHorizontal: tokens.spacing.xs,
    borderRadius: tokens.radii.pill,
    backgroundColor: tokens.colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminRequiredBadgeInlineText: {
    color: tokens.colors.brandStrong,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontFamily: tokens.typography.mono,
  },
  tableAdminUnavailableText: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    fontFamily: tokens.typography.mono,
  },
  tableAdminSwitch: {
    width: 38,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surfaceStrong,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableAdminSwitchLegend: {
    transform: [{ scale: 0.95 }],
  },
  tableAdminSwitchOn: {
    borderColor: tokens.colors.brand,
    backgroundColor: tokens.colors.brand,
  },
  tableAdminSwitchDisabled: {
    opacity: 0.78,
  },
  tableAdminSwitchPressed: {
    opacity: 0.86,
  },
  tableAdminSwitchThumb: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: tokens.colors.white,
  },
  tableAdminCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAdminCheckboxChecked: {
    borderColor: tokens.colors.brand,
    backgroundColor: tokens.colors.brand,
  },
  tableAdminCheckboxDisabled: {
    opacity: 0.78,
  },
  tableAdminCheckboxPressed: {
    opacity: 0.86,
  },
  tableAdminCheckboxIcon: {
    color: tokens.colors.white,
  },
  tableAdminFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.lineStrong,
    backgroundColor: tokens.colors.surfaceRaised,
  },
  tableAdminFooterText: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    fontFamily: tokens.typography.mono,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
});

