export interface AllowedUsersChecker {
  /** Check if user is allowed by id and/or username (at least one may be provided). */
  isAllowed(identifier: { id?: number; username?: string }): boolean;
}
