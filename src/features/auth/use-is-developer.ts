import { useAuth } from '@/features/auth/auth-provider';

export const DEVELOPER_USER = 'hugorwagemacher';

export function normalizarUsuarioDev(usuario: string | null | undefined) {
  return (usuario ?? '').trim().toLowerCase();
}

export function useIsDeveloper() {
  const { session } = useAuth();
  return normalizarUsuarioDev(session?.usuario) === DEVELOPER_USER;
}
