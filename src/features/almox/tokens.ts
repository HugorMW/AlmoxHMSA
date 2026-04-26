import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark';

const sharedSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

const sharedRadii = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
} as const;

const sharedLayout = {
  maxWidth: 1080,
  headerHeight: 56,
  bottomNavHeight: 72,
  pageBottomPadding: 48,
} as const;

const sharedTypography = {
  display: Platform.select({ web: 'var(--font-display)', default: undefined }),
  mono: Platform.select({ web: 'var(--font-mono)', default: 'monospace' }),
  rounded: Platform.select({ web: 'var(--font-rounded)', default: undefined }),
} as const;

const lightColors = {
  canvas: '#f4f7fb',
  surface: '#ffffff',
  surfaceMuted: '#f7f9fc',
  surfaceRaised: '#eef3f9',
  surfaceStrong: '#e6edf6',
  surfaceActiveSoft: '#f4f8ff',
  surfaceActiveWarm: '#fff5e7',
  line: 'rgba(148, 163, 184, 0.22)',
  lineStrong: 'rgba(148, 163, 184, 0.34)',
  text: '#132235',
  textMuted: '#64748b',
  textSoft: '#35506c',
  brand: '#3b82f6',
  brandStrong: '#2563eb',
  emerald: '#0f9f8f',
  amber: '#d99131',
  orange: '#ea7b4d',
  rose: '#d95c7b',
  red: '#e25571',
  teal: '#1497a8',
  cyan: '#1da1f2',
  violet: '#7c6cff',
  yellow: '#d8a637',
  green: '#1f9d68',
  blue: '#3b82f6',
  white: '#ffffff',
  black: '#0b1120',
} as const;

const darkColors = {
  canvas: '#060606',
  surface: '#101011',
  surfaceMuted: '#0b0b0c',
  surfaceRaised: '#151517',
  surfaceStrong: '#1f2023',
  surfaceActiveSoft: 'rgba(140, 168, 217, 0.12)',
  surfaceActiveWarm: 'rgba(112, 146, 214, 0.16)',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#f4efe6',
  textMuted: '#a59d90',
  textSoft: '#ddd3c5',
  brand: '#8ea8d9',
  brandStrong: '#dce6ff',
  emerald: '#3bcf9d',
  amber: '#f0b44f',
  orange: '#ef8b3a',
  rose: '#f08ba2',
  red: '#ff6b6b',
  teal: '#32c2b0',
  cyan: '#58c4d8',
  violet: '#b39aff',
  yellow: '#e9c35a',
  green: '#43c982',
  blue: '#8ea8ff',
  white: '#ffffff',
  black: '#050505',
} as const;

export type AlmoxColors = { [K in keyof typeof lightColors]: string };

export type AlmoxTheme = {
  colors: AlmoxColors;
  spacing: typeof sharedSpacing;
  radii: typeof sharedRadii;
  layout: typeof sharedLayout;
  typography: typeof sharedTypography;
};

export const lightTokens: AlmoxTheme = {
  colors: lightColors,
  spacing: sharedSpacing,
  radii: sharedRadii,
  layout: sharedLayout,
  typography: sharedTypography,
};

export const darkTokens: AlmoxTheme = {
  colors: darkColors,
  spacing: sharedSpacing,
  radii: sharedRadii,
  layout: sharedLayout,
  typography: sharedTypography,
};

export const themeTokens: Record<ThemeMode, AlmoxTheme> = {
  light: lightTokens,
  dark: darkTokens,
};

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export const almoxTheme: AlmoxTheme = themeTokens[DEFAULT_THEME_MODE];

export const levelColors = {
  URGENTE: { background: '#0f172a', foreground: '#ffffff' },
  'CRÍTICO': { background: '#d61f1f', foreground: '#ffffff' },
  ALTO: { background: '#dd6b12', foreground: '#ffffff' },
  'MÉDIO': { background: '#d4a514', foreground: '#1f2937' },
  BAIXO: { background: '#15803d', foreground: '#ffffff' },
  'ESTÁVEL': { background: '#1d4ed8', foreground: '#ffffff' },
} as const;

export const actionColors = {
  COMPRAR: { background: '#ffc6d4', foreground: '#881337' },
  'ACOMPANHAR PROCESSO': { background: '#ffe083', foreground: '#6b4f00' },
  'COBRAR ENTREGA': { background: '#ffc98c', foreground: '#7c2d12' },
  'PEGAR EMPRESTADO': { background: '#b9dcff', foreground: '#0f4c81' },
  AVALIAR: { background: '#d3c5ff', foreground: '#4c1d95' },
  'PODE EMPRESTAR': { background: '#a8e7c7', foreground: '#065f46' },
  OK: { background: '#b6efc8', foreground: '#166534' },
  'EXECUTAR AGORA': { background: '#93e2d0', foreground: '#115e59' },
  'BAIXA PRIORIDADE': { background: '#d7deea', foreground: '#475569' },
} as const;
