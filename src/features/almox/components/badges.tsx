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
    URGENTE: { background: '#ffe3e8', foreground: '#b4234a' },
    ALTA: { background: '#ffeddc', foreground: '#b5671b' },
    NORMAL: { background: '#fff6db', foreground: '#9f7514' },
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
      ? { background: '#dcfaf0', foreground: '#0f7d5b' }
      : score >= 50
        ? { background: '#fff4d6', foreground: '#9f7514' }
        : { background: '#edf2f7', foreground: '#55657c' };

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
    'RISCO ALTO': { background: '#ffe3e8', foreground: '#b4234a' },
    'RISCO MÉDIO': { background: '#ffeddc', foreground: '#b5671b' },
    ESTÁVEL: { background: '#e5f7eb', foreground: '#1f7a4e' },
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
