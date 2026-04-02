import { usePathname, Href, Slot, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/auth-provider';
import { useAlmoxData } from '@/features/almox/almox-provider';
import { AppIcon } from '@/features/almox/components/common';
import { almoxTheme } from '@/features/almox/tokens';
import { FiltroCategoriaMaterial } from '@/features/almox/types';

const navigationItems: Array<{
  href: Href;
  label: string;
  hint: string;
  match: string;
  icon: Parameters<typeof AppIcon>[0]['name'];
}> = [
  { href: '/' as Href, label: 'Dashboard', hint: 'Visão geral', match: '/', icon: 'dashboard' },
  { href: '/products' as Href, label: 'Produtos', hint: 'Carteira', match: '/products', icon: 'products' },
  { href: '/loans' as Href, label: 'Emprést.', hint: 'Redistribuição', match: '/loans', icon: 'loans' },
  { href: '/orders' as Href, label: 'Pedidos', hint: 'Reposição', match: '/orders', icon: 'orders' },
  { href: '/invoices' as Href, label: 'Notas', hint: 'Fiscais', match: '/invoices', icon: 'receipt' },
  { href: '/blacklist' as Href, label: 'Excluir', hint: 'Bloqueios', match: '/blacklist', icon: 'blacklist' },
  { href: '/settings' as Href, label: 'Config.', hint: 'Parâmetros', match: '/settings', icon: 'settings' },
];

export function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, session } = useAuth();
  const { categoryFilter, setCategoryFilter } = useAlmoxData();
  const { width } = useWindowDimensions();
  const [isCategoryMenuOpen, setCategoryMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const isHeaderStacked = width < 820;
  const isUltraCompact = width < 560;
  const autoCompactSidebar = width < 920;
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(width < 1240);
  const sidebarCollapsed = autoCompactSidebar || isSidebarCollapsed;
  const sidebarWidth = sidebarCollapsed ? 84 : 248;
  const shellMaxWidth =
    width >= 1680 ? 1560 : width >= 1480 ? 1440 : width >= 1280 ? 1320 : almoxTheme.layout.maxWidth;
  const shellHorizontalPadding = width >= 1480 ? almoxTheme.spacing.sm : almoxTheme.spacing.md;
  const currentItem =
    navigationItems.find((item) => pathname === item.match || (item.match !== '/' && pathname.startsWith(item.match))) ??
    navigationItems[0];
  const materialOptions: Array<{ label: string; value: FiltroCategoriaMaterial }> = [
    { label: 'Todos', value: 'todos' },
    { label: 'Hospitalar', value: 'material_hospitalar' },
    { label: 'Farmacológico', value: 'material_farmacologico' },
  ];
  const currentFilterLabel =
    materialOptions.find((option) => option.value === categoryFilter)?.label ?? 'Todos';

  React.useEffect(() => {
    if (width < 920) {
      setSidebarCollapsed(true);
    }
  }, [width]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logout();
      router.replace('/login');
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.root}>
        <View pointerEvents="none" style={[styles.glow, styles.glowTop]} />
        <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />
        {isCategoryMenuOpen ? (
          <Pressable style={styles.dropdownBackdrop} onPress={() => setCategoryMenuOpen(false)} />
        ) : null}

        <View style={[styles.headerShell, { paddingHorizontal: shellHorizontalPadding }]}>
          <View
            style={[
              styles.header,
              isHeaderStacked ? styles.headerStacked : null,
              { maxWidth: shellMaxWidth },
            ]}>
            <View style={styles.headerMain}>
              <View style={styles.brandMark}>
                <Text style={styles.brandLetter}>H</Text>
              </View>
              <View style={styles.brandText}>
                <Text style={styles.brandEyebrow}>Central logística HMSA</Text>
                <Text style={styles.brandTitle}>Estoque HMSA</Text>
                {!isUltraCompact && width >= 680 ? (
                  <Text style={styles.brandSubtitle}>Painel operacional do almoxarifado hospitalar</Text>
                ) : null}
              </View>
            </View>
            <View style={[styles.headerMeta, isHeaderStacked ? styles.headerMetaStacked : null]}>
              <View style={[styles.headerControls, isHeaderStacked ? styles.headerControlsStacked : null]}>
                <View style={[styles.headerChipRow, isHeaderStacked ? styles.headerChipRowStacked : null]}>
                  <View style={styles.headerChip}>
                    <Text style={styles.headerChipEyebrow}>Base</Text>
                    <Text style={styles.headerChipValue}>{currentFilterLabel}</Text>
                  </View>
                  {session?.usuario ? (
                    <View style={styles.headerChip}>
                      <Text style={styles.headerChipEyebrow}>Usuário</Text>
                      <Text style={styles.headerChipValue}>{session.usuario}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.headerDropdownWrap, isCategoryMenuOpen ? styles.headerDropdownWrapOpen : null]}>
                    <Pressable
                      onPress={() => setCategoryMenuOpen((current) => !current)}
                      style={({ pressed }) => [
                        styles.headerChip,
                        styles.headerDropdownTrigger,
                        isCategoryMenuOpen ? styles.headerDropdownTriggerOpen : null,
                        pressed ? styles.headerDropdownTriggerPressed : null,
                      ]}>
                      <View style={styles.headerDropdownLabelWrap}>
                        <Text style={styles.headerChipEyebrow}>Classificação</Text>
                        <Text style={styles.headerChipValue}>{currentFilterLabel}</Text>
                      </View>
                      <AppIcon
                        name={isCategoryMenuOpen ? 'chevronUp' : 'chevronDown'}
                        size={18}
                        color={almoxTheme.colors.textMuted}
                      />
                    </Pressable>

                    {isCategoryMenuOpen ? (
                      <View style={styles.headerDropdownMenu}>
                        {materialOptions.map((option) => {
                          const isActive = option.value === categoryFilter;

                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => {
                                setCategoryFilter(option.value);
                                setCategoryMenuOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.headerDropdownOption,
                                isActive ? styles.headerDropdownOptionActive : null,
                                pressed ? styles.headerDropdownOptionPressed : null,
                              ]}>
                              <Text
                                style={[
                                  styles.headerDropdownOptionText,
                                  isActive ? styles.headerDropdownOptionTextActive : null,
                                ]}>
                                {option.label}
                              </Text>
                              {isActive ? (
                                <AppIcon name="check" size={16} color={almoxTheme.colors.brand} />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void handleLogout()}
                    disabled={isLoggingOut}
                    style={({ pressed }) => [
                      styles.headerLogoutButton,
                      pressed ? styles.headerDropdownTriggerPressed : null,
                      isLoggingOut ? styles.headerLogoutButtonDisabled : null,
                    ]}>
                    <AppIcon name="logout" size={16} color={almoxTheme.colors.text} />
                    <Text style={styles.headerLogoutText}>{isLoggingOut ? 'Saindo...' : 'Sair'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.workspaceOuter}>
          <View style={styles.workspaceFrame}>
            <View style={[styles.sidebar, { width: sidebarWidth }]}>
              <View style={[styles.sidebarHeader, sidebarCollapsed ? styles.sidebarHeaderCollapsed : null]}>
                {sidebarCollapsed ? (
                  <Text style={styles.sidebarMiniTitle} numberOfLines={1}>
                    Menu
                  </Text>
                ) : (
                  <View style={styles.sidebarHeaderText}>
                    <Text style={styles.sidebarEyebrow} numberOfLines={1}>
                      Navegação
                    </Text>
                    <Text style={styles.sidebarTitle} numberOfLines={1}>
                      Módulos
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => setSidebarCollapsed((current) => !current)}
                  disabled={autoCompactSidebar}
                  style={({ pressed }) => [
                    styles.sidebarToggle,
                    sidebarCollapsed ? styles.sidebarToggleCollapsed : null,
                    autoCompactSidebar ? styles.sidebarToggleDisabled : null,
                    pressed && !autoCompactSidebar ? styles.sidebarTogglePressed : null,
                  ]}>
                  <AppIcon
                    name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'}
                    size={16}
                    color={almoxTheme.colors.textSoft}
                  />
                </Pressable>
              </View>

              <View style={styles.sidebarNav}>
                {navigationItems.map((item) => {
                  const isActive =
                    pathname === item.match || (item.match !== '/' && pathname.startsWith(item.match));

                  return (
                    <Pressable
                      key={item.match}
                      onPress={() => router.navigate(item.href)}
                      style={({ pressed }) => [
                        styles.sidebarItem,
                        sidebarCollapsed ? styles.sidebarItemCollapsed : null,
                        isActive ? styles.sidebarItemActive : null,
                        pressed ? styles.sidebarItemPressed : null,
                      ]}>
                      <View style={[styles.sidebarIconWrap, isActive ? styles.sidebarIconWrapActive : null]}>
                        <AppIcon
                          name={item.icon}
                          size={18}
                          color={isActive ? almoxTheme.colors.white : almoxTheme.colors.textMuted}
                        />
                      </View>

                      {!sidebarCollapsed ? (
                        <View style={styles.sidebarItemText}>
                          <Text style={[styles.sidebarItemLabel, isActive ? styles.sidebarItemLabelActive : null]}>
                            {item.label}
                          </Text>
                          <Text style={[styles.sidebarItemHint, isActive ? styles.sidebarItemHintActive : null]}>
                            {item.hint}
                          </Text>
                        </View>
                      ) : null}

                      {isActive ? <View style={styles.sidebarSelectionBar} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.sidebarFoot, sidebarCollapsed ? styles.sidebarFootCollapsed : null]}>
                {!sidebarCollapsed ? (
                  <>
                    <Text style={styles.sidebarFootLabel}>Agora</Text>
                    <Text style={styles.sidebarFootValue}>{currentItem.label}</Text>
                  </>
                ) : (
                  <AppIcon name={currentItem.icon} size={16} color={almoxTheme.colors.brandStrong} />
                )}
              </View>
            </View>

            <View style={[styles.mainColumn, { paddingHorizontal: shellHorizontalPadding }]}>
              <View style={[styles.contentInner, { maxWidth: shellMaxWidth }]}>
                <Slot />
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: almoxTheme.colors.canvas,
  },
  root: {
    flex: 1,
    backgroundColor: almoxTheme.colors.canvas,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
  },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    opacity: 0.08,
  },
  glowTop: {
    backgroundColor: almoxTheme.colors.brand,
    top: -110,
    left: -110,
  },
  glowBottom: {
    backgroundColor: almoxTheme.colors.emerald,
    bottom: -150,
    right: -150,
  },
  headerShell: {
    width: '100%',
    paddingTop: almoxTheme.spacing.xs,
    paddingBottom: almoxTheme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: almoxTheme.colors.lineStrong,
    backgroundColor: 'rgba(248, 251, 255, 0.92)',
    zIndex: 20,
  },
  header: {
    width: '100%',
    alignSelf: 'center',
    minHeight: almoxTheme.layout.headerHeight,
    backgroundColor: 'transparent',
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.md,
  },
  headerStacked: {
    alignItems: 'flex-start',
    gap: almoxTheme.spacing.sm,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
    flex: 1,
    minWidth: 220,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: almoxTheme.colors.brandStrong,
    shadowColor: almoxTheme.colors.brand,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  brandLetter: {
    color: almoxTheme.colors.white,
    fontSize: 17,
    fontWeight: '900',
  },
  brandText: {
    flex: 1,
    gap: 0,
  },
  brandEyebrow: {
    color: almoxTheme.colors.brand,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  brandTitle: {
    color: almoxTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: almoxTheme.typography.display,
  },
  brandSubtitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 10,
  },
  headerMeta: {
    minWidth: 0,
    maxWidth: 520,
    flexShrink: 1,
    justifyContent: 'center',
  },
  headerMetaStacked: {
    width: '100%',
    maxWidth: '100%',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: almoxTheme.spacing.sm,
    flexWrap: 'nowrap',
  },
  headerControlsStacked: {
    width: '100%',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  headerChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.xs,
    flexWrap: 'nowrap',
  },
  headerChipRowStacked: {
    flexWrap: 'wrap',
  },
  headerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: almoxTheme.radii.pill,
    backgroundColor: almoxTheme.colors.surface,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    gap: 0,
    minWidth: 96,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerChipEyebrow: {
    color: almoxTheme.colors.brand,
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerChipValue: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  headerDropdownWrap: {
    position: 'relative',
    zIndex: 30,
  },
  headerDropdownWrapOpen: {
    zIndex: 40,
  },
  headerDropdownTrigger: {
    minWidth: 164,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.xs,
    paddingRight: almoxTheme.spacing.xs,
  },
  headerDropdownTriggerOpen: {
    borderColor: '#93c5fd',
    backgroundColor: '#eaf3ff',
  },
  headerDropdownTriggerPressed: {
    opacity: 0.9,
  },
  headerDropdownLabelWrap: {
    gap: 0,
  },
  headerDropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: almoxTheme.spacing.xs,
    minWidth: 220,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.lineStrong,
    backgroundColor: almoxTheme.colors.surface,
    padding: 6,
    shadowColor: almoxTheme.colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  headerDropdownOption: {
    minHeight: 40,
    borderRadius: almoxTheme.radii.sm,
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: almoxTheme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.sm,
  },
  headerDropdownOptionActive: {
    backgroundColor: '#eef5ff',
  },
  headerDropdownOptionPressed: {
    opacity: 0.88,
  },
  headerDropdownOptionText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  headerDropdownOptionTextActive: {
    color: almoxTheme.colors.brandStrong,
  },
  headerLogoutButton: {
    minHeight: 36,
    paddingHorizontal: almoxTheme.spacing.sm,
    borderRadius: almoxTheme.radii.pill,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerLogoutButtonDisabled: {
    opacity: 0.7,
  },
  headerLogoutText: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  workspaceOuter: {
    flex: 1,
    paddingTop: 0,
  },
  workspaceFrame: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: almoxTheme.colors.lineStrong,
    backgroundColor: 'rgba(247, 249, 252, 0.9)',
    padding: almoxTheme.spacing.sm,
    gap: almoxTheme.spacing.sm,
    paddingTop: almoxTheme.spacing.md,
    paddingBottom: almoxTheme.spacing.md,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: almoxTheme.spacing.sm,
    minHeight: 40,
  },
  sidebarHeaderCollapsed: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: 72,
    gap: almoxTheme.spacing.xs,
  },
  sidebarHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sidebarEyebrow: {
    color: almoxTheme.colors.brand,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sidebarTitle: {
    color: almoxTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  sidebarMiniTitle: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
    width: '100%',
  },
  sidebarToggle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarToggleCollapsed: {
    alignSelf: 'center',
  },
  sidebarToggleDisabled: {
    opacity: 0.45,
  },
  sidebarTogglePressed: {
    opacity: 0.84,
  },
  sidebarNav: {
    flex: 1,
    gap: almoxTheme.spacing.xs,
  },
  sidebarItem: {
    minHeight: 56,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: almoxTheme.colors.surfaceMuted,
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: almoxTheme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: almoxTheme.spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  sidebarItemActive: {
    backgroundColor: '#ebf3ff',
    borderColor: '#bfd7ff',
  },
  sidebarItemPressed: {
    opacity: 0.88,
  },
  sidebarIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: almoxTheme.colors.surfaceStrong,
  },
  sidebarIconWrapActive: {
    backgroundColor: almoxTheme.colors.brandStrong,
    shadowColor: almoxTheme.colors.brand,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  sidebarItemText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  sidebarItemLabel: {
    color: almoxTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  sidebarItemLabelActive: {
    color: almoxTheme.colors.brandStrong,
  },
  sidebarItemHint: {
    color: almoxTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  sidebarItemHintActive: {
    color: almoxTheme.colors.textSoft,
  },
  sidebarSelectionBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 999,
    backgroundColor: almoxTheme.colors.brand,
  },
  sidebarFoot: {
    minHeight: 50,
    borderRadius: almoxTheme.radii.md,
    borderWidth: 1,
    borderColor: almoxTheme.colors.line,
    backgroundColor: almoxTheme.colors.surface,
    paddingHorizontal: almoxTheme.spacing.sm,
    paddingVertical: 10,
    gap: 2,
    justifyContent: 'center',
  },
  sidebarFootCollapsed: {
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  sidebarFootLabel: {
    color: almoxTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sidebarFootValue: {
    color: almoxTheme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    paddingTop: almoxTheme.spacing.sm,
  },
  contentInner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
});
