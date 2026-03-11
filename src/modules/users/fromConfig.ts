import type { AppConfig } from '../config/types';
import type { AllowedUsersChecker } from './types';

export function createAllowedUsersChecker(config: AppConfig): AllowedUsersChecker {
  const list = config.telegram.allowedUsers ?? [];
  return {
    isAllowed(identifier: { id?: number; username?: string }): boolean {
      if (list.length === 0) return false;
      if (identifier.id != null && list.includes(String(identifier.id))) return true;
      const uname = identifier.username?.replace(/^@/, '').toLowerCase();
      if (
        uname != null &&
        uname !== '' &&
        list.some((s) => s.toLowerCase() === uname)
      )
        return true;
      return false;
    },
  };
}
