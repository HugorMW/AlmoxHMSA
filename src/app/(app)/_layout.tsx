import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { AlmoxDataProvider } from '@/features/almox/almox-provider';
import { AppShell } from '@/features/almox/components/app-shell';
import { AlmoxTheme } from '@/features/almox/tokens';
import { useAppTheme, useThemedStyles } from '@/features/almox/theme-provider';

export default function AlmoxLayout() {
  const { status } = useAuth();
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  if (status === 'checking') {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={tokens.colors.brand} />
        <Text style={styles.loadingText}>Validando acesso SISCORE...</Text>
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <AlmoxDataProvider>
      <AppShell />
    </AlmoxDataProvider>
  );
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.canvas,
  },
  loadingText: {
    color: tokens.colors.textMuted,
    fontSize: 13,
  },
});
