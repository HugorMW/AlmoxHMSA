type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readCachedValue<T>(key: string, maxAgeMs: number) {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const rawValue = storage.getItem(key);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (typeof parsed?.savedAt !== 'number') {
      return null;
    }

    return {
      value: parsed.value,
      isFresh: Date.now() - parsed.savedAt <= maxAgeMs,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeCachedValue<T>(key: string, value: T) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    const payload: CacheEnvelope<T> = {
      savedAt: Date.now(),
      value,
    };

    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore quota and serialization failures.
  }
}

export function removeCachedValue(key: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function readSessionFlag(key: string) {
  const storage = getSessionStorage();
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string) {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, '1');
  } catch {
    // Ignore storage failures.
  }
}
