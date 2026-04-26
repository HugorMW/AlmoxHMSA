import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { readCachedValue, writeCachedValue } from '@/features/almox/cache';
import { AlmoxTheme, DEFAULT_THEME_MODE, ThemeMode, themeTokens } from '@/features/almox/tokens';

const THEME_MODE_CACHE_KEY = 'almox-theme-mode';
const THEME_MODE_CACHE_AGE_MS = Number.MAX_SAFE_INTEGER;

function readInitialThemeMode(initialMode: ThemeMode): ThemeMode {
  const cachedThemeMode = readCachedValue<ThemeMode>(THEME_MODE_CACHE_KEY, THEME_MODE_CACHE_AGE_MS)?.value;
  return cachedThemeMode === 'light' || cachedThemeMode === 'dark' ? cachedThemeMode : initialMode;
}

type ThemeContextValue = {
  mode: ThemeMode;
  tokens: AlmoxTheme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  initialMode = DEFAULT_THEME_MODE,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => readInitialThemeMode(initialMode));

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    writeCachedValue(THEME_MODE_CACHE_KEY, mode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      tokens: themeTokens[mode],
      setMode,
      toggleMode,
    }),
    [mode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme deve ser usado dentro de <ThemeProvider>.');
  }
  return context;
}

export function useThemedStyles<T>(factory: (tokens: AlmoxTheme) => T) {
  const { tokens } = useAppTheme();
  return useMemo(() => factory(tokens), [factory, tokens]);
}
