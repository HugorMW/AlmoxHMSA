import { Href, Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAlmoxData } from "@/features/almox/almox-provider";
import { AppIcon } from "@/features/almox/components/common";
import { useAppTheme, useThemedStyles } from "@/features/almox/theme-provider";
import { AlmoxTheme } from "@/features/almox/tokens";
import { FiltroCategoriaMaterial, Hospital } from "@/features/almox/types";
import { useAuth } from "@/features/auth/auth-provider";
import { useIsDeveloper } from "@/features/auth/use-is-developer";

type NavigationAccent =
  | "brand"
  | "emerald"
  | "cyan"
  | "amber"
  | "violet"
  | "orange"
  | "teal"
  | "rose"
  | "red"
  | "textMuted";

const navigationItems: {
  href: Href;
  label: string;
  hint: string;
  match: string;
  icon: Parameters<typeof AppIcon>[0]["name"];
  accent: NavigationAccent;
}[] = [
  {
    href: "/" as Href,
    label: "Dashboard",
    hint: "Visão geral",
    match: "/",
    icon: "dashboard",
    accent: "brand",
  },
  {
    href: "/products" as Href,
    label: "Produtos",
    hint: "Carteira",
    match: "/products",
    icon: "products",
    accent: "emerald",
  },
  {
    href: "/loans" as Href,
    label: "Emprést.",
    hint: "Redistribuição",
    match: "/loans",
    icon: "loans",
    accent: "cyan",
  },
  {
    href: "/orders" as Href,
    label: "Pedidos",
    hint: "Reposição",
    match: "/orders",
    icon: "orders",
    accent: "amber",
  },
  {
    href: "/processes" as Href,
    label: "Processos",
    hint: "Prazos",
    match: "/processes",
    icon: "processes",
    accent: "violet",
  },
  {
    href: "/consumo" as Href,
    label: "Consumo",
    hint: "Mês atual",
    match: "/consumo",
    icon: "consumo",
    accent: "orange",
  },
  {
    href: "/invoices" as Href,
    label: "Notas",
    hint: "Fiscais",
    match: "/invoices",
    icon: "receipt",
    accent: "teal",
  },
  {
    href: "/blacklist" as Href,
    label: "Excluir",
    hint: "Bloqueios",
    match: "/blacklist",
    icon: "blacklist",
    accent: "red",
  },
  {
    href: "/settings" as Href,
    label: "Config.",
    hint: "Parâmetros",
    match: "/settings",
    icon: "settings",
    accent: "textMuted",
  },
];

export function AppShell() {
  const { mode, tokens, toggleMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const pathname = usePathname();
  const router = useRouter();
  const { logout, session } = useAuth();
  const isDeveloper = useIsDeveloper();
  const {
    categoryFilter,
    setCategoryFilter,
    dashboardHospital,
    setDashboardHospital,
    dataset,
  } = useAlmoxData();
  const { width } = useWindowDimensions();
  const [isHospitalMenuOpen, setHospitalMenuOpen] = React.useState(false);
  const [isCategoryMenuOpen, setCategoryMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const isHeaderStacked = width < 820;
  const isUltraCompact = width < 560;
  const autoCompactSidebar = width < 920;
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(
    width < 1240,
  );
  const sidebarCollapsed = autoCompactSidebar || isSidebarCollapsed;
  const sidebarWidth = sidebarCollapsed ? 84 : 248;
  const headerMaxWidth =
    width >= 1680
      ? 1560
      : width >= 1480
        ? 1440
        : width >= 1280
          ? 1320
          : tokens.layout.maxWidth;
  const headerHorizontalPadding =
    width >= 1480 ? tokens.spacing.sm : tokens.spacing.md;
  const contentHorizontalPadding =
    width >= 1480 ? tokens.spacing.xxs : tokens.spacing.xs;
  const currentItem =
    navigationItems.find(
      (item) =>
        pathname === item.match ||
        (item.match !== "/" && pathname.startsWith(item.match)),
    ) ?? navigationItems[0];
  const isProcessRoute =
    pathname === "/processes" || pathname.startsWith("/processes/");
  const isDarkMode = mode === "dark";
  const currentAccent = tokens.colors[currentItem.accent];
  const materialOptions: { label: string; value: FiltroCategoriaMaterial }[] = [
    { label: "Todos", value: "todos" },
    { label: "Hospitalar", value: "material_hospitalar" },
    { label: "Farmacológico", value: "material_farmacologico" },
  ];
  const currentFilterLabel =
    materialOptions.find((option) => option.value === categoryFilter)?.label ??
    "Todos";
  const hospitalOptions =
    dataset.hospitals.length > 0
      ? dataset.hospitals
      : (["HMSA", "HEC", "HDDS", "HABF"] as Hospital[]);
  const currentHospitalLabel = hospitalOptions.includes(dashboardHospital)
    ? dashboardHospital
    : "HMSA";

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
      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "bottom", "left", "right"]}
    >
      <View style={styles.root}>
        <View
          pointerEvents="none"
          style={[
            styles.glow,
            styles.glowTop,
            { backgroundColor: currentAccent },
          ]}
        />
        <View pointerEvents="none" style={[styles.glow, styles.glowBottom]} />
        {isHospitalMenuOpen || isCategoryMenuOpen ? (
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => {
              setHospitalMenuOpen(false);
              setCategoryMenuOpen(false);
            }}
          />
        ) : null}

        <View
          style={[
            styles.headerShell,
            { paddingHorizontal: headerHorizontalPadding },
          ]}
        >
          <View
            style={[
              styles.header,
              isHeaderStacked ? styles.headerStacked : null,
              { maxWidth: headerMaxWidth },
            ]}
          >
            <View style={styles.headerMain}>
              <View
                style={[
                  styles.brandMark,
                  {
                    backgroundColor: currentAccent,
                    shadowColor: currentAccent,
                  },
                ]}
              >
                <AppIcon
                  name={currentItem.icon}
                  size={24}
                  color={isDarkMode ? tokens.colors.black : tokens.colors.white}
                />
              </View>
              <View style={styles.brandText}>
                <Text style={[styles.brandTitle, { color: currentAccent }]}>
                  {currentItem.label}
                </Text>
                {!isUltraCompact && width >= 680 ? (
                  <Text style={styles.brandSubtitle}>{currentItem.hint}</Text>
                ) : null}
              </View>
            </View>
            <View
              style={[
                styles.headerMeta,
                isHeaderStacked ? styles.headerMetaStacked : null,
              ]}
            >
              <View
                style={[
                  styles.headerControls,
                  isHeaderStacked ? styles.headerControlsStacked : null,
                ]}
              >
                <View
                  style={[
                    styles.headerChipRow,
                    isHeaderStacked ? styles.headerChipRowStacked : null,
                  ]}
                >
                  <View
                    style={[
                      styles.headerDropdownWrap,
                      isHospitalMenuOpen ? styles.headerDropdownWrapOpen : null,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setHospitalMenuOpen((current) => !current);
                        setCategoryMenuOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.headerChip,
                        styles.headerDropdownTrigger,
                        isHospitalMenuOpen
                          ? styles.headerDropdownTriggerOpen
                          : null,
                        pressed ? styles.headerDropdownTriggerPressed : null,
                      ]}
                    >
                      <View style={styles.headerDropdownLabelWrap}>
                        <Text
                          style={[
                            styles.headerChipEyebrow,
                            { color: currentAccent },
                          ]}
                        >
                          Base
                        </Text>
                        <Text style={styles.headerChipValue}>
                          {currentHospitalLabel}
                        </Text>
                      </View>
                      <AppIcon
                        name={isHospitalMenuOpen ? "chevronUp" : "chevronDown"}
                        size={18}
                        color={tokens.colors.textMuted}
                      />
                    </Pressable>

                    {isHospitalMenuOpen ? (
                      <View style={styles.headerDropdownMenu}>
                        {hospitalOptions.map((option) => {
                          const isActive = option === currentHospitalLabel;

                          return (
                            <Pressable
                              key={option}
                              onPress={() => {
                                setDashboardHospital(option);
                                setHospitalMenuOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.headerDropdownOption,
                                isActive
                                  ? styles.headerDropdownOptionActive
                                  : null,
                                pressed
                                  ? styles.headerDropdownOptionPressed
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.headerDropdownOptionText,
                                  isActive
                                    ? styles.headerDropdownOptionTextActive
                                    : null,
                                ]}
                              >
                                {option}
                              </Text>
                              {isActive ? (
                                <AppIcon
                                  name="check"
                                  size={16}
                                  color={tokens.colors.brand}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  {session?.usuario ? (
                    <View style={styles.headerChip}>
                      <Text
                        style={[
                          styles.headerChipEyebrow,
                          { color: currentAccent },
                        ]}
                      >
                        Usuário
                      </Text>
                      <Text style={styles.headerChipValue}>
                        {session.usuario}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.headerDropdownWrap,
                      isCategoryMenuOpen ? styles.headerDropdownWrapOpen : null,
                    ]}
                  >
                    <Pressable
                      onPress={() => {
                        setCategoryMenuOpen((current) => !current);
                        setHospitalMenuOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.headerChip,
                        styles.headerDropdownTrigger,
                        isCategoryMenuOpen
                          ? styles.headerDropdownTriggerOpen
                          : null,
                        pressed ? styles.headerDropdownTriggerPressed : null,
                      ]}
                    >
                      <View style={styles.headerDropdownLabelWrap}>
                        <Text
                          style={[
                            styles.headerChipEyebrow,
                            { color: currentAccent },
                          ]}
                        >
                          Classificação
                        </Text>
                        <Text style={styles.headerChipValue}>
                          {currentFilterLabel}
                        </Text>
                      </View>
                      <AppIcon
                        name={isCategoryMenuOpen ? "chevronUp" : "chevronDown"}
                        size={18}
                        color={tokens.colors.textMuted}
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
                                isActive
                                  ? styles.headerDropdownOptionActive
                                  : null,
                                pressed
                                  ? styles.headerDropdownOptionPressed
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.headerDropdownOptionText,
                                  isActive
                                    ? styles.headerDropdownOptionTextActive
                                    : null,
                                ]}
                              >
                                {option.label}
                              </Text>
                              {isActive ? (
                                <AppIcon
                                  name="check"
                                  size={16}
                                  color={tokens.colors.brand}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={toggleMode}
                    style={({ pressed }) => [
                      styles.headerThemeButton,
                      pressed ? styles.headerDropdownTriggerPressed : null,
                    ]}
                    accessibilityLabel={
                      mode === "dark"
                        ? "Alternar para tema claro"
                        : "Alternar para tema escuro"
                    }
                  >
                    <AppIcon
                      name={mode === "dark" ? "themeLight" : "themeDark"}
                      size={16}
                      color={
                        mode === "dark"
                          ? tokens.colors.brandStrong
                          : tokens.colors.brand
                      }
                    />
                  </Pressable>
                  {isDeveloper ? (
                    <Pressable
                      onPress={() => router.navigate("/dev" as Href)}
                      style={({ pressed }) => [
                        styles.headerDeveloperButton,
                        pressed ? styles.headerDropdownTriggerPressed : null,
                      ]}
                      accessibilityLabel="Abrir tela de desenvolvedor"
                    >
                      <AppIcon
                        name="monitor"
                        size={16}
                        color={
                          isDarkMode
                            ? tokens.colors.text
                            : tokens.colors.brandStrong
                        }
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => void handleLogout()}
                    disabled={isLoggingOut}
                    style={({ pressed }) => [
                      styles.headerLogoutButton,
                      pressed ? styles.headerDropdownTriggerPressed : null,
                      isLoggingOut ? styles.headerLogoutButtonDisabled : null,
                    ]}
                  >
                    <AppIcon
                      name="logout"
                      size={16}
                      color={tokens.colors.red}
                    />
                    <Text style={styles.headerLogoutText}>
                      {isLoggingOut ? "Saindo..." : "Sair"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.workspaceOuter}>
          <View style={styles.workspaceFrame}>
            <View style={[styles.sidebar, { width: sidebarWidth }]}>
              <View
                style={[
                  styles.sidebarHeader,
                  sidebarCollapsed ? styles.sidebarHeaderCollapsed : null,
                ]}
              >
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
                    pressed && !autoCompactSidebar
                      ? styles.sidebarTogglePressed
                      : null,
                  ]}
                >
                  <AppIcon
                    name={sidebarCollapsed ? "chevronRight" : "chevronLeft"}
                    size={16}
                    color={tokens.colors.textSoft}
                  />
                </Pressable>
              </View>

              <ScrollView
                style={styles.sidebarNav}
                contentContainerStyle={styles.sidebarNavContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {navigationItems.map((item) => {
                  const isActive =
                    pathname === item.match ||
                    (item.match !== "/" && pathname.startsWith(item.match));
                  const itemAccent = tokens.colors[item.accent];

                  return (
                    <Pressable
                      key={item.match}
                      onPress={() => router.navigate(item.href)}
                      style={({ pressed }) => [
                        styles.sidebarItem,
                        sidebarCollapsed ? styles.sidebarItemCollapsed : null,
                        isActive
                          ? [
                              styles.sidebarItemActive,
                              {
                                borderColor: itemAccent,
                                shadowColor: itemAccent,
                              },
                            ]
                          : null,
                        pressed ? styles.sidebarItemPressed : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.sidebarIconWrap,
                          isActive
                            ? [
                                styles.sidebarIconWrapActive,
                                {
                                  backgroundColor: itemAccent,
                                  shadowColor: itemAccent,
                                },
                              ]
                            : null,
                        ]}
                      >
                        <AppIcon
                          name={item.icon}
                          size={18}
                          color={
                            isActive
                              ? isDarkMode
                                ? tokens.colors.black
                                : tokens.colors.white
                              : itemAccent
                          }
                        />
                      </View>

                      {!sidebarCollapsed ? (
                        <View style={styles.sidebarItemText}>
                          <Text
                            style={[
                              styles.sidebarItemLabel,
                              isActive
                                ? [
                                    styles.sidebarItemLabelActive,
                                    { color: itemAccent },
                                  ]
                                : null,
                            ]}
                          >
                            {item.label}
                          </Text>
                          <Text
                            style={[
                              styles.sidebarItemHint,
                              isActive ? styles.sidebarItemHintActive : null,
                            ]}
                          >
                            {item.hint}
                          </Text>
                        </View>
                      ) : null}

                      {isActive ? (
                        <View
                          style={[
                            styles.sidebarSelectionBar,
                            { backgroundColor: itemAccent },
                          ]}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View
                style={[
                  styles.sidebarFoot,
                  sidebarCollapsed ? styles.sidebarFootCollapsed : null,
                  { borderColor: currentAccent },
                ]}
              >
                {!sidebarCollapsed ? (
                  <>
                    <Text
                      style={[
                        styles.sidebarFootLabel,
                        { color: currentAccent },
                      ]}
                    >
                      Agora
                    </Text>
                    <Text style={styles.sidebarFootValue}>
                      {currentItem.label}
                    </Text>
                  </>
                ) : (
                  <AppIcon
                    name={currentItem.icon}
                    size={16}
                    color={currentAccent}
                  />
                )}
              </View>
            </View>

            <View
              style={[
                styles.mainColumn,
                isProcessRoute ? styles.mainColumnFullBleed : null,
                {
                  paddingHorizontal: isProcessRoute
                    ? 0
                    : contentHorizontalPadding,
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.pageAccentBar,
                  { backgroundColor: currentAccent },
                ]}
              />
              <View
                style={[
                  styles.contentInner,
                  isProcessRoute
                    ? styles.contentInnerFullBleed
                    : styles.contentInnerFullBleed,
                ]}
              >
                <Slot />
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: tokens.colors.canvas,
    },
    root: {
      flex: 1,
      backgroundColor: tokens.colors.canvas,
    },
    dropdownBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 15,
    },
    glow: {
      position: "absolute",
      width: 340,
      height: 340,
      borderRadius: 999,
      opacity: 0.12,
    },
    glowTop: {
      top: -180,
      left: -140,
    },
    glowBottom: {
      backgroundColor: tokens.colors.emerald,
      bottom: -200,
      right: -160,
    },
    headerShell: {
      width: "100%",
      paddingTop: tokens.spacing.xs,
      paddingBottom: tokens.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
      zIndex: 20,
    },
    header: {
      width: "100%",
      alignSelf: "center",
      minHeight: tokens.layout.headerHeight,
      backgroundColor: "transparent",
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    headerStacked: {
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
    },
    headerMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flex: 1,
      minWidth: 220,
    },
    brandMark: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.brandStrong,
      shadowColor: tokens.colors.brand,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    brandLetter: {
      fontSize: 17,
      fontWeight: "900",
    },
    brandText: {
      flex: 1,
      gap: 2,
    },
    brandEyebrow: {
      color: tokens.colors.brand,
      fontSize: 9,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    brandTitle: {
      color: tokens.colors.text,
      fontSize: 24,
      fontWeight: "900",
      fontFamily: tokens.typography.display,
      letterSpacing: -0.6,
      lineHeight: 28,
    },
    brandSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    headerMeta: {
      minWidth: 0,
      maxWidth: 520,
      flexShrink: 1,
      justifyContent: "center",
    },
    headerMetaStacked: {
      width: "100%",
      maxWidth: "100%",
    },
    headerControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: tokens.spacing.sm,
      flexWrap: "nowrap",
    },
    headerControlsStacked: {
      width: "100%",
      justifyContent: "space-between",
      flexWrap: "wrap",
    },
    headerChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flexWrap: "nowrap",
    },
    headerChipRowStacked: {
      flexWrap: "wrap",
    },
    headerChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: tokens.radii.pill,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      gap: 0,
      minWidth: 96,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    headerChipEyebrow: {
      color: tokens.colors.brand,
      fontSize: 8,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    headerChipValue: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    headerDropdownWrap: {
      position: "relative",
      zIndex: 30,
    },
    headerDropdownWrapOpen: {
      zIndex: 40,
    },
    headerDropdownTrigger: {
      minWidth: 164,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.xs,
      paddingRight: tokens.spacing.xs,
    },
    headerDropdownTriggerOpen: {
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.surfaceStrong,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    headerDropdownTriggerPressed: {
      opacity: 0.9,
    },
    headerDropdownLabelWrap: {
      gap: 0,
    },
    headerDropdownMenu: {
      position: "absolute",
      top: "100%",
      right: 0,
      marginTop: tokens.spacing.xs,
      minWidth: 220,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surface,
      padding: 6,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.34,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 12 },
      elevation: 16,
    },
    headerDropdownOption: {
      minHeight: 40,
      borderRadius: tokens.radii.sm,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    headerDropdownOptionActive: {
      backgroundColor: tokens.colors.surfaceActiveSoft,
    },
    headerDropdownOptionPressed: {
      opacity: 0.88,
    },
    headerDropdownOptionText: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    headerDropdownOptionTextActive: {
      color: tokens.colors.brandStrong,
    },
    headerLogoutButton: {
      minHeight: 36,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(248, 113, 113, 0.45)",
      backgroundColor: "rgba(248, 113, 113, 0.12)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    headerDeveloperButton: {
      width: 36,
      height: 36,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    headerThemeButton: {
      width: 36,
      height: 36,
      borderRadius: tokens.radii.pill,
      borderWidth: 1,
      borderColor: tokens.colors.brand,
      backgroundColor: tokens.colors.surfaceActiveSoft,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    headerLogoutButtonDisabled: {
      opacity: 0.7,
    },
    headerLogoutText: {
      color: tokens.colors.red,
      fontSize: 12,
      fontWeight: "700",
    },
    workspaceOuter: {
      flex: 1,
      paddingTop: 0,
    },
    workspaceFrame: {
      flex: 1,
      width: "100%",
      flexDirection: "row",
      alignItems: "stretch",
      gap: 0,
    },
    sidebar: {
      borderRightWidth: 1,
      borderRightColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceMuted,
      padding: tokens.spacing.sm,
      gap: tokens.spacing.sm,
      paddingTop: tokens.spacing.md,
      paddingBottom: tokens.spacing.md,
    },
    sidebarHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      minHeight: 40,
    },
    sidebarHeaderCollapsed: {
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      minHeight: 72,
      gap: tokens.spacing.xs,
    },
    sidebarHeaderText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    sidebarEyebrow: {
      color: tokens.colors.brand,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    sidebarTitle: {
      color: tokens.colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    sidebarMiniTitle: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      textAlign: "center",
      width: "100%",
    },
    sidebarToggle: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      alignItems: "center",
      justifyContent: "center",
    },
    sidebarToggleCollapsed: {
      alignSelf: "center",
    },
    sidebarToggleDisabled: {
      opacity: 0.45,
    },
    sidebarTogglePressed: {
      opacity: 0.84,
    },
    sidebarNav: {
      flex: 1,
      minHeight: 0,
    },
    sidebarNavContent: {
      gap: tokens.spacing.xs,
      paddingBottom: tokens.spacing.xs,
    },
    sidebarItem: {
      minHeight: 56,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.line,
      backgroundColor: tokens.colors.surfaceRaised,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      position: "relative",
      overflow: "hidden",
    },
    sidebarItemCollapsed: {
      justifyContent: "center",
      paddingHorizontal: 0,
    },
    sidebarItemActive: {
      backgroundColor: tokens.colors.surfaceStrong,
      borderColor: tokens.colors.brand,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    sidebarItemPressed: {
      opacity: 0.88,
    },
    sidebarIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceStrong,
    },
    sidebarIconWrapActive: {
      backgroundColor: tokens.colors.brandStrong,
      shadowColor: tokens.colors.brand,
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    sidebarItemText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    sidebarItemLabel: {
      color: tokens.colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    sidebarItemLabelActive: {
      color: tokens.colors.brandStrong,
    },
    sidebarItemHint: {
      color: tokens.colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    sidebarItemHintActive: {
      color: tokens.colors.textSoft,
    },
    sidebarSelectionBar: {
      position: "absolute",
      left: 0,
      top: 10,
      bottom: 10,
      width: 4,
      borderRadius: 999,
      backgroundColor: tokens.colors.brand,
    },
    sidebarFoot: {
      minHeight: 50,
      borderRadius: tokens.radii.md,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surfaceRaised,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: 10,
      gap: 2,
      justifyContent: "center",
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    sidebarFootCollapsed: {
      alignItems: "center",
      paddingHorizontal: 0,
    },
    sidebarFootLabel: {
      color: tokens.colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    sidebarFootValue: {
      color: tokens.colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    mainColumn: {
      flex: 1,
      minWidth: 0,
      paddingTop: tokens.spacing.sm,
    },
    mainColumnFullBleed: {
      paddingTop: 0,
    },
    pageAccentBar: {
      height: 3,
      marginHorizontal: tokens.spacing.sm,
      marginBottom: tokens.spacing.sm,
      borderRadius: 999,
      opacity: 0.85,
    },
    contentInner: {
      flex: 1,
      width: "100%",
      alignSelf: "center",
    },
    contentInnerFullBleed: {
      maxWidth: "100%",
      alignSelf: "stretch",
    },
  });
