import React from 'react';

import { readCachedValue, writeCachedValue } from '@/features/almox/cache';
import { lerPreferenciaUsuarioApi, salvarPreferenciaUsuarioApi } from '@/features/almox/user-preferences';
import { useAuth } from '@/features/auth/auth-provider';

function normalizarUsuarioParaCache(usuario: string | null | undefined) {
  return (usuario ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_') || 'anon';
}

export function buildUserPreferenceCacheKey(cacheKeyPrefix: string, usuario: string | null | undefined) {
  return `${cacheKeyPrefix}:${normalizarUsuarioParaCache(usuario)}`;
}

export function usePersistentUserPreference<T>({
  scope,
  cacheKeyPrefix,
  cacheTtlMs,
  legacyCacheKeys = [],
  normalize,
}: {
  scope: string;
  cacheKeyPrefix: string;
  cacheTtlMs: number;
  legacyCacheKeys?: string[];
  normalize: (value: unknown) => T;
}) {
  const { session } = useAuth();
  const cacheKey = React.useMemo(
    () => buildUserPreferenceCacheKey(cacheKeyPrefix, session?.usuario),
    [cacheKeyPrefix, session?.usuario]
  );
  const [value, setValue] = React.useState<T>(() => {
    const cached =
      readCachedValue<T>(cacheKey, cacheTtlMs) ??
      legacyCacheKeys
        .map((legacyKey) => readCachedValue<T>(legacyKey, cacheTtlMs))
        .find((entry) => Boolean(entry));
    return normalize(cached?.value);
  });
  const [remoteLoaded, setRemoteLoaded] = React.useState(false);
  const lastPersistedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const cached =
      readCachedValue<T>(cacheKey, cacheTtlMs) ??
      legacyCacheKeys
        .map((legacyKey) => readCachedValue<T>(legacyKey, cacheTtlMs))
        .find((entry) => Boolean(entry));
    const normalized = normalize(cached?.value);
    writeCachedValue(cacheKey, normalized);
    setValue(normalized);
    setRemoteLoaded(false);
    lastPersistedRef.current = null;
  }, [cacheKey, cacheTtlMs, legacyCacheKeys, normalize]);

  React.useEffect(() => {
    if (!session?.usuario) {
      return;
    }

    let isActive = true;

    async function carregarPreferencia() {
      try {
        const remoteValue = await lerPreferenciaUsuarioApi<unknown>(scope);
        if (!isActive) {
          return;
        }

        if (remoteValue != null) {
          const normalized = normalize(remoteValue);
          const serialized = JSON.stringify(normalized);
          lastPersistedRef.current = serialized;
          writeCachedValue(cacheKey, normalized);
          setValue((current) => (JSON.stringify(current) === serialized ? current : normalized));
        } else {
          lastPersistedRef.current = null;
        }
      } catch (error) {
        if (isActive) {
          console.warn(
            `[preferencias] Falha ao carregar preferencia remota (${scope}).`,
            error instanceof Error ? error.message : error
          );
        }
      } finally {
        if (isActive) {
          setRemoteLoaded(true);
        }
      }
    }

    void carregarPreferencia();

    return () => {
      isActive = false;
    };
  }, [cacheKey, normalize, scope, session?.usuario]);

  React.useEffect(() => {
    writeCachedValue(cacheKey, value);
  }, [cacheKey, value]);

  React.useEffect(() => {
    if (!session?.usuario || !remoteLoaded) {
      return;
    }

    const serialized = JSON.stringify(value);
    if (serialized === lastPersistedRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void salvarPreferenciaUsuarioApi(scope, value)
        .then(() => {
          lastPersistedRef.current = serialized;
        })
        .catch((error) => {
          console.warn(
            `[preferencias] Falha ao salvar preferencia remota (${scope}).`,
            error instanceof Error ? error.message : error
          );
        });
    }, 350);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [remoteLoaded, scope, session?.usuario, value]);

  return {
    value,
    setValue,
    remoteLoaded,
    cacheKey,
  };
}
