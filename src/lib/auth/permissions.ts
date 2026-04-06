/**
 * Role-Based Access Control (RBAC) for Beton Inspector
 *
 * Roles:
 *   owner  — full control (one per workspace, set during creation)
 *   admin  — manage members, settings, integrations
 *   member — read/write data, cannot manage workspace
 *
 * This module is entirely static — no DB queries required.
 */

export type WorkspaceRole = 'owner' | 'admin' | 'member'

export type Permission =
  | 'manage_integrations'
  | 'manage_members'
  | 'remove_members'
  | 'change_roles'
  | 'manage_billing'
  | 'manage_domains'
  | 'view_data'
  | 'create_data'
  | 'delete_data'
  | 'generate_invites'

/**
 * Static permission matrix.
 *
 *                          owner   admin   member
 * manage_integrations        Y       Y       N
 * manage_members             Y       Y*      N     (* admin can invite, cannot change roles)
 * remove_members             Y       Y       N     (cannot remove owner — enforced in route)
 * change_roles               Y       N       N
 * manage_billing             Y       N       N
 * manage_domains             Y       N       N
 * view_data                  Y       Y       Y
 * create_data                Y       Y       Y
 * delete_data                Y       Y       N
 * generate_invites           Y       Y       N
 */
const PERMISSION_MAP: Record<Permission, readonly WorkspaceRole[]> = {
  manage_integrations: ['owner', 'admin'],
  manage_members: ['owner', 'admin'],
  remove_members: ['owner', 'admin'],
  change_roles: ['owner'],
  manage_billing: ['owner'],
  manage_domains: ['owner'],
  view_data: ['owner', 'admin', 'member'],
  create_data: ['owner', 'admin', 'member'],
  delete_data: ['owner', 'admin'],
  generate_invites: ['owner', 'admin'],
}

/**
 * Check whether a role has a specific permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const allowed = PERMISSION_MAP[permission]
  if (!allowed) return false
  return allowed.includes(role as WorkspaceRole)
}

/**
 * Throw a `ForbiddenError` if the caller's role is not in `requiredRoles`.
 *
 * Usage in API routes:
 * ```ts
 * const { user, workspaceId, role } = await requireWorkspace()
 * requireRole(role, ['owner', 'admin'])
 * ```
 */
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function requireRole(role: string, requiredRoles: WorkspaceRole[]): void {
  if (!requiredRoles.includes(role as WorkspaceRole)) {
    throw new ForbiddenError(
      `Role "${role}" is not authorized. Required: ${requiredRoles.join(', ')}`
    )
  }
}
