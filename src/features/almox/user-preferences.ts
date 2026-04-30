type PreferenceResponse<T> = {
  ok: boolean;
  scope: string;
  value: T | null;
  atualizadoEm: string | null;
  atualizadoPor?: string | null;
};

async function parsePreferenceResponse<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as
    | PreferenceResponse<T>
    | { error?: string; details?: string[] };

  if (!response.ok) {
    const error = typeof (data as { error?: string }).error === 'string'
      ? (data as { error: string }).error
      : 'Falha ao processar a preferencia do usuario.';
    const details = Array.isArray((data as { details?: string[] }).details)
      ? (data as { details: string[] }).details
      : [];
    throw new Error([error, ...details].join('\n'));
  }

  return data as PreferenceResponse<T>;
}

export async function lerPreferenciaUsuarioApi<T>(scope: string) {
  const response = await fetch(`/api/preferencias?scope=${encodeURIComponent(scope)}`, {
    method: 'GET',
    credentials: 'include',
  });

  const data = await parsePreferenceResponse<T>(response);
  return data.value;
}

export async function salvarPreferenciaUsuarioApi<T>(scope: string, value: T) {
  const response = await fetch('/api/preferencias', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scope,
      value,
    }),
  });

  const data = await parsePreferenceResponse<T>(response);
  return data.value;
}
