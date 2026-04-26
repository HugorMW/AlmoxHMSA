import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { actionColors, AlmoxTheme, levelColors } from '@/features/almox/tokens';
import { useThemedStyles } from '@/features/almox/theme-provider';
import { Action, Level, Priority, RuptureRisk } from '@/features/almox/types';

export function LevelBadge({ level }: { level: Level }) {
  const colors = levelColors[level];
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, { color: colors.foreground }]}>{level}</Text>
    </View>
  );
}

export function ActionBadge({ action }: { action?: Action }) {
  const styles = useThemedStyles(createStyles);

  if (!action) {
    return null;
  }

  const colors = actionColors[action];

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.badgeText, { color: colors.foreground }]}>{action}</Text>
    </View>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const palette = {
    URGENTE: { background: '#ffc6d4', foreground: '#881337' },
    ALTA: { background: '#ffc98c', foreground: '#7c2d12' },
    NORMAL: { background: '#ffe083', foreground: '#6b4f00' },
  }[priority];
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.foreground }]}>{priority}</Text>
    </View>
  );
}

export function ScoreBadge({
  score,
  classification,
}: {
  score?: number;
  classification?: string;
}) {
  const styles = useThemedStyles(createStyles);

  if (score == null) {
    return <Text style={styles.emptyText}>--</Text>;
  }

  const palette =
    score >= 80
      ? { background: '#a8e7c7', foreground: '#065f46' }
      : score >= 50
        ? { background: '#ffe083', foreground: '#6b4f00' }
        : { background: '#d7deea', foreground: '#475569' };

  return (
    <View style={styles.scoreWrapper}>
      <View style={[styles.badge, { backgroundColor: palette.background }]}>
        <Text style={[styles.badgeText, { color: palette.foreground }]}>{score.toFixed(0)}</Text>
      </View>
      {classification ? <Text style={styles.classification}>{classification}</Text> : null}
    </View>
  );
}

export function RuptureBadge({ risk }: { risk?: RuptureRisk }) {
  const styles = useThemedStyles(createStyles);

  if (!risk) {
    return null;
  }

  const palette = {
    'RISCO ALTO': { background: '#ffc6d4', foreground: '#881337' },
    'RISCO MÉDIO': { background: '#ffc98c', foreground: '#7c2d12' },
    ESTÁVEL: { background: '#b6efc8', foreground: '#166534' },
  }[risk];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.badgeText, { color: palette.foreground }]}>{risk}</Text>
    </View>
  );
}

const createStyles = (tokens: AlmoxTheme) => StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    borderRadius: tokens.radii.pill,
    borderWidth: 1,
    borderColor: tokens.colors.line,
  },
  badgeText: {
    color: tokens.colors.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scoreWrapper: {
    gap: 4,
    alignItems: 'flex-start',
  },
  classification: {
    color: tokens.colors.textMuted,
    fontSize: 10,
  },
  emptyText: {
    color: tokens.colors.textMuted,
    fontSize: 12,
  },
});
