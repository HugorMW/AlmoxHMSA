import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { AlmoxTheme, DEFAULT_THEME_MODE, ThemeMode, themeTokens } from '@/features/almox/tokens';

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
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

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
