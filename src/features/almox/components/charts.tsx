import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlmoxTheme } from '@/features/almox/tokens';
import { useAppTheme, useThemedStyles } from '@/features/almox/theme-provider';
import { ChartData } from '@/features/almox/types';

const distributionColors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#3b82f6', '#8b5cf6'];

export function DistributionChart({ data }: { data: ChartData[] }) {
  const maxValue = Math.max(...data.map((item) => item.count), 1);
  const { tokens } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.distributionRoot}>
      <View style={styles.distributionBars}>
        {data.map((item, index) => (
          <View key={item.range} style={styles.distributionColumn}>
            <Text style={styles.chartValue}>{item.count}</Text>
            <View style={styles.distributionTrack}>
              <View
                style={[
                  styles.distributionFill,
                  {
                    height: `${Math.max((item.count / maxValue) * 100, item.count > 0 ? 12 : 0)}%`,
                    backgroundColor: distributionColors[index] ?? tokens.colors.brand,
                  },
                ]}
              />
            </View>
            <Text style={styles.chartLabel}>{item.range}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.chartLegend}>Distribuição de itens por faixa de suficiência</Text>
    </View>
  );
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  distributionRoot: {
    gap: tokens.spacing.md,
  },
  distributionBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
    minHeight: 196,
  },
  distributionColumn: {
    flex: 1,
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  distributionTrack: {
    width: '100%',
    height: 120,
    backgroundColor: tokens.colors.surfaceStrong,
    borderRadius: tokens.radii.md,
    justifyContent: 'flex-end',
    padding: 6,
  },
  distributionFill: {
    width: '100%',
    borderRadius: tokens.radii.sm,
  },
  chartValue: {
    color: tokens.colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  chartLabel: {
    color: tokens.colors.textMuted,
    fontSize: 11,
  },
  chartLegend: {
    color: tokens.colors.textMuted,
    fontSize: 12,
  },
});
