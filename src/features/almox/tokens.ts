import { Platform } from 'react-native';

export const almoxTheme = {
  colors: {
    canvas: '#f4f7fb',
    surface: '#ffffff',
    surfaceMuted: '#f7f9fc',
    surfaceRaised: '#eef3f9',
    surfaceStrong: '#e6edf6',
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
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radii: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
  layout: {
    maxWidth: 1080,
    headerHeight: 56,
    bottomNavHeight: 72,
    pageBottomPadding: 48,
  },
  typography: {
    display: Platform.select({ web: 'var(--font-display)', default: undefined }),
    mono: Platform.select({ web: 'var(--font-mono)', default: 'monospace' }),
    rounded: Platform.select({ web: 'var(--font-rounded)', default: undefined }),
  },
} as const;

export const levelColors = {
  URGENTE: { background: '#111827', foreground: '#ffffff' },
  'CRÍTICO': { background: '#dc2626', foreground: '#ffffff' },
  ALTO: { background: '#ea580c', foreground: '#ffffff' },
  'MÉDIO': { background: '#eab308', foreground: '#1f2937' },
  BAIXO: { background: '#16a34a', foreground: '#ffffff' },
  'ESTÁVEL': { background: '#2563eb', foreground: '#ffffff' },
} as const;

export const actionColors = {
  COMPRAR: { background: '#ffe3e9', foreground: '#ba3358' },
  'PEGAR EMPRESTADO': { background: '#dff2ff', foreground: '#176ab5' },
  AVALIAR: { background: '#ebe6ff', foreground: '#5f49d7' },
  'PODE EMPRESTAR': { background: '#dcfaf0', foreground: '#0f7d5b' },
  OK: { background: '#e5f7eb', foreground: '#1f7a4e' },
  'EXECUTAR AGORA': { background: '#d8f7ee', foreground: '#0b7a64' },
  'BAIXA PRIORIDADE': { background: '#edf2f7', foreground: '#55657c' },
} as const;
