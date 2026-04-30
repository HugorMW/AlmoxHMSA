import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppIcon } from '@/features/almox/components/common';
import { ConfirmActionOptions } from '@/features/almox/confirm-action';
import { AlmoxTheme } from '@/features/almox/tokens';
import { useAppTheme, useThemedStyles } from '@/features/almox/theme-provider';

type PendingConfirm = ConfirmActionOptions & {
  id: number;
  resolve: (value: boolean) => void;
};

export function ConfirmActionHost({
  current,
  onResolve,
}: {
  current: PendingConfirm | null;
  onResolve: (value: boolean) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { tokens } = useAppTheme();
  const webBackdropBlurStyle =
    Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as const)
      : null;

  if (!current) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onResolve(false)}>
      <View style={[styles.backdrop, webBackdropBlurStyle]}>
        <Pressable style={styles.dismissArea} onPress={() => onResolve(false)} />
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <View
              style={[
                styles.modalIconBadge,
                current.destructive ? styles.modalIconBadgeDanger : styles.modalIconBadgePrimary,
              ]}>
              <AppIcon
                name={current.destructive ? 'alert' : 'info'}
                size={18}
                color={current.destructive ? tokens.colors.red : tokens.colors.brandStrong}
              />
            </View>
          </View>

          <View style={styles.modalTextWrap}>
            <Text style={styles.modalTitle}>{current.title}</Text>
            <Text style={styles.modalMessage}>{current.message}</Text>
          </View>

          <View style={styles.modalActions}>
            <ActionButton label={current.cancelLabel ?? 'Cancelar'} tone="neutral" onPress={() => onResolve(false)} />
            <ActionButton
              label={current.confirmLabel ?? 'Confirmar'}
              tone={current.destructive ? 'danger' : 'primary'}
              onPress={() => onResolve(true)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (tokens: AlmoxTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.38)',
      padding: tokens.spacing.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dismissArea: {
      ...StyleSheet.absoluteFillObject,
    },
    modalCard: {
      width: '100%',
      maxWidth: 460,
      borderRadius: tokens.radii.lg,
      borderWidth: 1,
      borderColor: tokens.colors.lineStrong,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
      shadowColor: tokens.colors.black,
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 18,
    },
    modalIconWrap: {
      alignItems: 'flex-start',
    },
    modalIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    modalIconBadgePrimary: {
      backgroundColor: tokens.colors.surfaceActiveSoft,
      borderColor: tokens.colors.lineStrong,
    },
    modalIconBadgeDanger: {
      backgroundColor: 'rgba(248, 113, 113, 0.12)',
      borderColor: 'rgba(248, 113, 113, 0.28)',
    },
    modalTextWrap: {
      gap: tokens.spacing.xs,
    },
    modalTitle: {
      color: tokens.colors.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    modalMessage: {
      color: tokens.colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
    },
  });
