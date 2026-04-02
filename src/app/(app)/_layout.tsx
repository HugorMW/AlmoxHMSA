import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { AlmoxDataProvider } from '@/features/almox/almox-provider';
import { AppShell } from '@/features/almox/components/app-shell';
import { almoxTheme } from '@/features/almox/tokens';

export default function AlmoxLayout() {
  const { status } = useAuth();

  if (status === 'checking') {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={almoxTheme.colors.brand} />
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

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: almoxTheme.spacing.sm,
    backgroundColor: almoxTheme.colors.canvas,
  },
  loadingText: {
    color: almoxTheme.colors.textMuted,
    fontSize: 13,
  },
});
