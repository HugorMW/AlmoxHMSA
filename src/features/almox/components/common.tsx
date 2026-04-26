import { Link, Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { almoxTheme } from '@/features/almox/tokens';

type IconName =
  | 'dashboard'
  | 'products'
  | 'loans'
  | 'orders'
  | 'processes'
  | 'blacklist'
  | 'settings'
  | 'refresh'
  | 'upload'
  | 'package'
  | 'alert'
  | 'cart'
  | 'borrow'
  | 'lend'
  | 'downtrend'
  | 'uptrend'
  | 'spark'
  | 'search'
  | 'download'
  | 'mail'
  | 'eye'
  | 'eyeOff'
  | 'edit'
  | 'filter'
  | 'send'
  | 'save'
  | 'bell'
  | 'bellOff'
  | 'plus'
  | 'trash'
  | 'blocked'
  | 'hospital'
  | 'trophy'
  | 'file'
  | 'receipt'
  | 'clock'
  | 'info'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronLeft'
  | 'chevronRight'
  | 'check'
  | 'logout'
  | 'opme'
  | 'consumo'
  | 'monitor';

const iconMap: Record<IconName, keyof typeof MaterialCommunityIcons.glyphMap> = {
  dashboard: 'view-dashboard-outline',
  products: 'package-variant-closed',
  loans: 'swap-horizontal',
  orders: 'cart-outline',
  processes: 'timeline-clock-outline',
  blacklist: 'playlist-remove',
  settings: 'cog-outline',
  refresh: 'refresh',
  upload: 'upload-outline',
  package: 'clipboard-list-outline',
  alert: 'alert-outline',
  cart: 'cart-outline',
  borrow: 'arrow-down-bold-circle-outline',
  lend: 'arrow-up-bold-circle-outline',
  downtrend: 'chart-line-variant',
  uptrend: 'chart-timeline-variant',
  spark: 'lightbulb-on-outline',
  search: 'magnify',
  download: 'download',
  mail: 'email-outline',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
  edit: 'pencil-outline',
  filter: 'filter-variant',
  send: 'send-outline',
  save: 'content-save-outline',
  bell: 'bell-outline',
  bellOff: 'bell-off-outline',
  plus: 'plus-circle-outline',
  trash: 'trash-can-outline',
  blocked: 'cancel',
  hospital: 'hospital-box-outline',
  trophy: 'trophy-outline',
  file: 'file-document-outline',
  receipt: 'receipt-text-outline',
  clock: 'clock-outline',
  info: 'information-outline',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  check: 'check',
  logout: 'logout',
  opme: 'medical-bag',
  consumo: 'speedometer',
  monitor: 'monitor-dashboard',
};

type ButtonTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const buttonTones = {
  primary: { background: almoxTheme.colors.brandStrong, foreground: almoxTheme.colors.black },
  success: { background: '#2a8f7b', foreground: almoxTheme.colors.white },
  warning: { background: '#b57433', foreground: almoxTheme.colors.white },
  danger: { background: '#b85773', foreground: almoxTheme.colors.white },
  neutral: { background: almoxTheme.colors.surfaceStrong, foreground: almoxTheme.colors.text },
} as const;

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500] as const;
export type PageSize = number;

const MIN_CUSTOM_PAGE_SIZE = 1;
const MAX_CUSTOM_PAGE_SIZE = 500;

export function AppIcon({
  name,
  size = 16,
  color = almoxTheme.colors.textMuted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={iconMap[name]} size={size} color={color} />;
}

export function ScreenScrollView({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.pageInner}>{children}</View>
    </ScrollView>
  );
}

export function PageHeader({
  title,
  subtitle,
  aside,
  tooltip,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>{title}</Text>
          {tooltip ? <HelpHint text={tooltip} /> : null}
        </View>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {aside ? <View style={styles.pageAside}>{aside}</View> : null}
    </View>
  );
}

export function SectionCard({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return <View style={[styles.card, accent ? { borderColor: accent } : null]}>{children}</View>;
}

export function SectionTitle({
  title,
  subtitle,
  icon,
  tooltip,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tooltip?: string;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleText}>
        <View style={styles.sectionTitleTop}>
          {icon ? <AppIcon name={icon} size={16} color={almoxTheme.colors.brand} /> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
          {tooltip ? <HelpHint text={tooltip} /> : null}
        </View>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function HelpHint({
  text,
  align = 'end',
  onVisibilityChange,
}: {
  text: string;
  align?: 'start' | 'end';
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  const setVisible = React.useCallback(
    (visible: boolean) => {
      setShowTooltip(visible);
      onVisibilityChange?.(visible);
    },
    [onVisibilityChange]
  );

  return (
    <Pressable
      onHoverIn={() => setVisible(true)}
      onHoverOut={() => setVisible(false)}
      onPressIn={() => setVisible(true)}
      onPressOut={() => setVisible(false)}
      style={[styles.helpHintWrap, showTooltip ? styles.helpHintWrapActive : null]}>
      {showTooltip ? (
        <View
          pointerEvents="none"
          style={[styles.helpHintTooltip, align === 'start' ? styles.helpHintTooltipStart : styles.helpHintTooltipEnd]}>
          <Text style={styles.helpHintTooltipText}>{text}</Text>
        </View>
      ) : null}
      <View style={styles.helpHintBadge}>
        <AppIcon name="info" size={14} color={almoxTheme.colors.textMuted} />
      </View>
    </Pressable>
  );
}

export function InfoBanner({
  title,
  description,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'info';
}) {
  const palette = {
    neutral: {
      background: almoxTheme.colors.surfaceMuted,
      border: almoxTheme.colors.lineStrong,
      color: almoxTheme.colors.textSoft,
    },
    warning: {
      background: 'rgba(251, 191, 36, 0.14)',
      border: 'rgba(251, 191, 36, 0.45)',
      color: almoxTheme.colors.amber,
    },
    danger: {
      background: 'rgba(248, 113, 113, 0.14)',
      border: 'rgba(248, 113, 113, 0.45)',
      color: almoxTheme.colors.red,
    },
    success: {
      background: 'rgba(52, 211, 153, 0.14)',
      border: 'rgba(52, 211, 153, 0.45)',
      color: almoxTheme.colors.green,
    },
    info: {
      background: 'rgba(140, 168, 217, 0.12)',
      border: 'rgba(140, 168, 217, 0.26)',
      color: almoxTheme.colors.brandStrong,
    },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.bannerTitle, { color: palette.color }]}>{title}</Text>
      <Text style={styles.bannerDescription}>{description}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  icon,
  tone = 'primary',
  disabled,
  loading,
  onPress,
  href,
}: {
  label: string;
  icon?: IconName;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  href?: Href;
}) {
  const isDisabled = disabled || loading;
  const palette = buttonTones[tone];
  const button = (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isDisabled ? almoxTheme.colors.surfaceStrong : palette.background,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator size={15} color={almoxTheme.colors.textMuted} />
      ) : icon ? (
        <AppIcon name={icon} size={15} color={isDisabled ? almoxTheme.colors.textMuted : palette.foreground} />
      ) : null}
      <Text style={[styles.buttonText, { color: isDisabled ? almoxTheme.colors.textMuted : palette.foreground }]}>{label}</Text>
    </Pressable>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        {button}
      </Link>
    );
  }

  return button;
}

export function InlineTabs<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { label: string; value: T; tooltip?: string }[];
  value: T;
  onChange: (nextValue: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <View style={styles.inlineTabs}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <InlineTabButton
            key={option.value}
            label={option.label}
            tooltip={option.tooltip}
            isActive={isActive}
            size={size}
            onPress={() => onChange(option.value)}
          />
        );
      })}
    </View>
  );
}

export function PaginationFooter({
  totalItems,
  pageItemsCount,
  page,
  totalPages,
  pageSize,
  itemLabel = 'item(ns)',
  onPageChange,
  onPageSizeChange,
}: {
  totalItems: number;
  pageItemsCount: number;
  page: number;
  totalPages: number;
  pageSize: PageSize;
  itemLabel?: string;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: PageSize) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const pageSizeValue = String(pageSize);
  const [customPageSizeText, setCustomPageSizeText] = React.useState(pageSizeValue);
  const customPageSize = Number(customPageSizeText);
  const isCustomPageSizeValid =
    Number.isInteger(customPageSize) &&
    customPageSize >= MIN_CUSTOM_PAGE_SIZE &&
    customPageSize <= MAX_CUSTOM_PAGE_SIZE;
  const canApplyCustomPageSize = isCustomPageSizeValid && customPageSize !== pageSize;

  React.useEffect(() => {
    setCustomPageSizeText(pageSizeValue);
  }, [pageSizeValue]);

  function handleApplyCustomPageSize() {
    if (isCustomPageSizeValid) {
      onPageSizeChange(customPageSize);
    }
  }

  return (
    <View style={styles.paginationFooter}>
      <View style={styles.paginationSummary}>
        <Text style={styles.paginationText}>
          Exibindo {pageItemsCount} de {totalItems} {itemLabel}
        </Text>
        <Text style={styles.paginationPageText}>
          Página {safePage} de {safeTotalPages}
        </Text>
      </View>

      <View style={styles.paginationPageSize}>
        <Text style={styles.paginationControlLabel}>Itens por página</Text>
        <InlineTabs
          size="sm"
          options={PAGE_SIZE_OPTIONS.map((option) => ({
            label: String(option),
            value: String(option),
          }))}
          value={pageSizeValue}
          onChange={(nextValue) => {
            const nextPageSize = Number(nextValue);
            if (PAGE_SIZE_OPTIONS.some((option) => option === nextPageSize)) {
              onPageSizeChange(nextPageSize);
            }
          }}
        />
        <View style={styles.paginationCustomSize}>
          <TextInput
            value={customPageSizeText}
            onChangeText={(text) => setCustomPageSizeText(text.replace(/\D/g, '').slice(0, 3))}
            onSubmitEditing={handleApplyCustomPageSize}
            placeholder="Outro"
            placeholderTextColor={almoxTheme.colors.textMuted}
            keyboardType="number-pad"
            style={[
              styles.paginationCustomInput,
              customPageSizeText && !isCustomPageSizeValid ? styles.paginationCustomInputInvalid : null,
            ]}
          />
          <ActionButton
            label="Aplicar"
            tone="neutral"
            disabled={!canApplyCustomPageSize}
            onPress={handleApplyCustomPageSize}
          />
        </View>
      </View>

      <View style={styles.paginationActions}>
        <ActionButton
          label="Anterior"
          tone="neutral"
          disabled={safePage <= 1}
          onPress={() => onPageChange(Math.max(1, safePage - 1))}
        />
        <ActionButton
          label="Próxima"
          tone="neutral"
          disabled={safePage >= safeTotalPages}
          onPress={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
        />
      </View>
    </View>
  );
}

function InlineTabButton({
  label,
  tooltip,
  isActive,
  size,
  onPress,
}: {
  label: string;
  tooltip?: string;
  isActive: boolean;
  size: 'md' | 'sm';
  onPress: () => void;
}) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <View style={styles.inlineTabWrap}>
      {tooltip && showTooltip ? (
        <View pointerEvents="none" style={styles.inlineTabTooltip}>
          <Text style={styles.inlineTabTooltipText}>{tooltip}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={onPress}
        onHoverIn={() => setShowTooltip(true)}
        onHoverOut={() => setShowTooltip(false)}
        onPressIn={() => setShowTooltip(true)}
        onPressOut={() => setShowTooltip(false)}
        style={({ pressed }) => [
          styles.inlineTab,
          size === 'sm' ? styles.inlineTabCompact : null,
          isActive ? styles.inlineTabActive : null,
          pressed && !isActive ? styles.inlineTabPressed : null,
        ]}>
        <Text
          style={[
            styles.inlineTabText,
            size === 'sm' ? styles.inlineTabTextCompact : null,
            isActive ? styles.inlineTabTextActive : null,
          ]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder }: TextInputProps) {
  return (
    <View style={styles.searchField}>
      <AppIcon name="search" size={16} color={almoxTheme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={almoxTheme.colors.textMuted}
        style={styles.searchInput}
      />
    </View>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function FieldInput(props: TextInputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={almoxTheme.colors.textMuted}
      style={[styles.fieldInput, props.style]}
    />
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: almoxTheme.layout.pageBottomPadding,
  },
  pageInner: {
    width: '100%',
    gap: almoxTheme.spacing.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
  },
  pageHeaderText: {
    gap: almoxTheme.spacing.xs,
    flex: 1,
    minWidth: 240,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
    flexWrap: 'wrap',
  },
  pageTitle: {
    color: almoxTheme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.display,
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  pageAside: {
    flexDirection: 'row',
    gap: almoxTheme.spacing.sm,
    flexWrap: 'wrap',
  },
  card: {
    backgroundColor: almoxTheme.colors.surfaceRaised,
    borderRadius: almoxTheme.radii.lg,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    padding: almoxTheme.spacing.lg,
    gap: almoxTheme.spacing.md,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
  },
  sectionTitleText: {
    flex: 1,
    gap: almoxTheme.spacing.xs,
  },
  sectionTitleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    color: almoxTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  banner: {
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    padding: almoxTheme.spacing.md,
    gap: almoxTheme.spacing.xs,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bannerDescription: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    minHeight: 42,
    borderRadius: almoxTheme.radii.md,
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: almoxTheme.spacing.xs,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inlineTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.xs,
  },
  inlineTabWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  inlineTab: {
    paddingHorizontal: almoxTheme.spacing.md,
    paddingVertical: almoxTheme.spacing.sm,
    borderRadius: almoxTheme.radii.pill,
    backgroundColor: almoxTheme.colors.surface,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
  },
  inlineTabCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineTabActive: {
    backgroundColor: 'rgba(140, 168, 217, 0.12)',
    borderColor: 'rgba(140, 168, 217, 0.26)',
  },
  inlineTabPressed: {
    opacity: 0.82,
  },
  inlineTabText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineTabTextCompact: {
    fontSize: 11,
  },
  inlineTabTextActive: {
    color: almoxTheme.colors.brandStrong,
  },
  inlineTabTooltip: {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    marginBottom: almoxTheme.spacing.xs,
    minWidth: 180,
    maxWidth: 280,
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
  inlineTabTooltipText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.md,
    paddingTop: almoxTheme.spacing.sm,
  },
  paginationSummary: {
    gap: 3,
  },
  paginationText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
  },
  paginationPageText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  paginationPageSize: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: almoxTheme.spacing.sm,
    flex: 1,
  },
  paginationControlLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  paginationCustomSize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
  },
  paginationCustomInput: {
    width: 82,
    minHeight: 42,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: 0,
    textAlign: 'center',
  },
  paginationCustomInputInvalid: {
    borderColor: 'rgba(248, 113, 113, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.14)',
  },
  paginationActions: {
    flexDirection: 'row',
    gap: almoxTheme.spacing.sm,
  },
  helpHintWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  helpHintWrapActive: {
    zIndex: 1200,
  },
  helpHintBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: almoxTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
  },
  helpHintTooltip: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: almoxTheme.spacing.xs,
    minWidth: 200,
    maxWidth: 300,
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
  helpHintTooltipStart: {
    left: 0,
  },
  helpHintTooltipEnd: {
    right: 0,
  },
  helpHintTooltipText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  searchField: {
    minHeight: 48,
    borderRadius: almoxTheme.radii.md,
    paddingHorizontal: almoxTheme.spacing.md,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: almoxTheme.colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  field: {
    gap: almoxTheme.spacing.xs,
  },
  fieldLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldInput: {
    minHeight: 46,
    borderRadius: almoxTheme.radii.md,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    paddingHorizontal: almoxTheme.spacing.md,
    color: almoxTheme.colors.text,
    fontSize: 14,
  },
  emptyState: {
    minHeight: 160,
    borderRadius: almoxTheme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: almoxTheme.spacing.xs,
    paddingHorizontal: almoxTheme.spacing.lg,
    backgroundColor: almoxTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
  },
  emptyTitle: {
    color: almoxTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyDescription: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
