import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { ConfirmActionHost } from '@/features/almox/confirm-action-host';

export type ConfirmActionOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmActionContextValue = {
  confirmAction: (options: ConfirmActionOptions) => Promise<boolean>;
};

type PendingConfirm = ConfirmActionOptions & {
  id: number;
  resolve: (value: boolean) => void;
};

const ConfirmActionContext = createContext<ConfirmActionContextValue | null>(null);

export function ConfirmActionProvider({ children }: { children: React.ReactNode }) {
  const queueRef = useRef<PendingConfirm[]>([]);
  const nextIdRef = useRef(1);
  const [current, setCurrent] = useState<PendingConfirm | null>(null);

  const showNext = useCallback(() => {
    setCurrent((active) => active ?? queueRef.current.shift() ?? null);
  }, []);

  const resolveCurrent = useCallback(
    (result: boolean) => {
      setCurrent((active) => {
        if (!active) {
          return null;
        }

        active.resolve(result);
        return null;
      });

      requestAnimationFrame(() => {
        showNext();
      });
    },
    [showNext],
  );

  const confirmAction = useCallback(
    (options: ConfirmActionOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({
          id: nextIdRef.current++,
          title: options.title ?? 'Confirmar alteração',
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Confirmar',
          cancelLabel: options.cancelLabel ?? 'Cancelar',
          destructive: options.destructive ?? false,
          resolve,
        });
        showNext();
      }),
    [showNext],
  );

  const value = useMemo<ConfirmActionContextValue>(
    () => ({
      confirmAction,
    }),
    [confirmAction],
  );

  return React.createElement(
    ConfirmActionContext.Provider,
    { value },
    children,
    React.createElement(ConfirmActionHost, {
      current,
      onResolve: resolveCurrent,
    }),
  );
}

export function useConfirmAction() {
  const context = useContext(ConfirmActionContext);

  if (!context) {
    throw new Error('useConfirmAction deve ser usado dentro de <ConfirmActionProvider>.');
  }

  return context.confirmAction;
}
