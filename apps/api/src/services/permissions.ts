/**
 * Permission Service
 *
 * Resolves communication permissions between users based on hierarchy
 */

import { prisma } from '@neon/database';
import type { ResolvedPermission, PermissionContext } from '@neon/database';
import { getCache, setCache } from './redis';

const CACHE_TTL = 300; // 5 minutes

/**
 * Check if a user has super_admin permission
 */
async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { permissions: true, name: true } },
      settings: true,
    },
  });

  if (!user) return false;

  // Check role permissions
  if (user.role?.permissions?.includes('super_admin')) {
    return true;
  }

  // Check role name
  if (user.role?.name?.toLowerCase() === 'super admin' ||
      user.role?.name?.toLowerCase() === 'superadmin') {
    return true;
  }

  // Check user-specific permissions stored in settings
  const settings = user.settings as Record<string, unknown> | null;
  const userPermissions = (settings?.permissions as string[]) || [];
  if (userPermissions.includes('super_admin')) {
    return true;
  }

  return false;
}

/**
 * Resolve permission between two users
 *
 * Resolution order (first match wins):
 * 0. Super admin bypass - super admins can communicate with anyone
 * 0a. Target is super admin - anyone can message a super admin
 * 1. User ↔ User explicit
 * 2. User ↔ Role explicit
 * 3. Role ↔ Role explicit
 * 4. Department ↔ Department
 * 5. Default: no cross-department access
 */
export async function resolvePermission(
  context: PermissionContext
): Promise<ResolvedPermission> {
  const { sourceUserId, targetUserId, orgId } = context;

  // 0. Super admin bypass - super admins can communicate with anyone
  const sourceIsSuperAdmin = await isSuperAdmin(sourceUserId);
  if (sourceIsSuperAdmin) {
    return {
      canChat: true,
      canCall: true,
      canViewPresence: true,
      requiresApproval: false,
      source: 'super_admin',
    };
  }

  // 0a. Target is super admin - anyone can message a super admin
  // This allows regular users (like demo users) to reach out to admins
  const targetIsSuperAdmin = await isSuperAdmin(targetUserId);
  if (targetIsSuperAdmin) {
    return {
      canChat: true,
      canCall: true,
      canViewPresence: true,
      requiresApproval: false,
      source: 'super_admin',
    };
  }

  // Check cache
  const cacheKey = `perm:${sourceUserId}:${targetUserId}`;
  const cached = await getCache<ResolvedPermission>(cacheKey);
  if (cached) {
    return cached;
  }

  // Get organization messaging settings
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const orgSettings = org?.settings as Record<string, any> | null;
  const messagingSettings = orgSettings?.messaging || {
    crossDepartmentMessaging: true,
    crossDepartmentDirection: 'both',
    requireApprovalForCrossDept: false,
  };

  // Get source and target user info
  const [sourceUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sourceUserId },
      select: {
        id: true,
        departmentId: true,
        roleId: true,
        department: { select: { id: true, rank: true } },
        role: { select: { id: true, rank: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        departmentId: true,
        roleId: true,
        department: { select: { id: true, rank: true } },
        role: { select: { id: true, rank: true } },
      },
    }),
  ]);

  if (!sourceUser || !targetUser) {
    return createDefaultPermission('default');
  }

  // 1. Check User ↔ User explicit permission
  const userPermission = await prisma.userPermission.findFirst({
    where: {
      OR: [
        { sourceUserId, targetUserId },
        { sourceUserId: targetUserId, targetUserId: sourceUserId },
      ],
    },
  });

  if (userPermission) {
    const permission = resolveDirection(
      userPermission,
      userPermission.sourceUserId === sourceUserId
    );
    await setCache(cacheKey, permission, CACHE_TTL);
    return permission;
  }

  // 2. Check User ↔ Role explicit permission
  if (sourceUser.roleId && targetUser.roleId) {
    const userRolePermission = await prisma.userRolePermission.findFirst({
      where: {
        OR: [
          { userId: sourceUserId, roleId: targetUser.roleId },
          { userId: targetUserId, roleId: sourceUser.roleId },
        ],
      },
    });

    if (userRolePermission) {
      const isSourceUser = userRolePermission.userId === sourceUserId;
      const permission = resolveUserRoleDirection(
        userRolePermission,
        isSourceUser,
        userRolePermission.userIsSource
      );
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }
  }

  // 3. Check Role ↔ Role explicit permission
  if (sourceUser.roleId && targetUser.roleId) {
    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        OR: [
          { sourceRoleId: sourceUser.roleId, targetRoleId: targetUser.roleId },
          { sourceRoleId: targetUser.roleId, targetRoleId: sourceUser.roleId },
        ],
      },
    });

    if (rolePermission) {
      const isSourceRole = rolePermission.sourceRoleId === sourceUser.roleId;
      const sourceRank = sourceUser.role?.rank ?? 0;
      const targetRank = targetUser.role?.rank ?? 0;
      const permission = resolveRoleDirection(
        rolePermission,
        isSourceRole,
        sourceRank,
        targetRank
      );
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }
  }

  // 4. Check Department ↔ Department permission
  if (sourceUser.departmentId && targetUser.departmentId) {
    // Same department - always allowed
    if (sourceUser.departmentId === targetUser.departmentId) {
      const permission: ResolvedPermission = {
        canChat: true,
        canCall: true,
        canViewPresence: true,
        requiresApproval: false,
        source: 'department',
        sourceId: sourceUser.departmentId,
      };
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }

    // Check organization-wide cross-department messaging settings
    if (!messagingSettings.crossDepartmentMessaging || messagingSettings.crossDepartmentDirection === 'none') {
      const permission: ResolvedPermission = {
        canChat: false,
        canCall: false,
        canViewPresence: true, // Can still see presence
        requiresApproval: false,
        source: 'org_policy',
      };
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }

    // Check directionality based on department ranks
    const sourceRank = sourceUser.department?.rank ?? 0;
    const targetRank = targetUser.department?.rank ?? 0;

    if (messagingSettings.crossDepartmentDirection === 'higher_to_lower' && sourceRank < targetRank) {
      // Source has lower rank but direction is higher-to-lower only
      const permission: ResolvedPermission = {
        canChat: false,
        canCall: false,
        canViewPresence: true,
        requiresApproval: false,
        source: 'org_policy',
      };
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }

    if (messagingSettings.crossDepartmentDirection === 'lower_to_higher' && sourceRank > targetRank) {
      // Source has higher rank but direction is lower-to-higher only
      const permission: ResolvedPermission = {
        canChat: false,
        canCall: false,
        canViewPresence: true,
        requiresApproval: false,
        source: 'org_policy',
      };
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }

    // Check for explicit department-level permissions
    const deptPermission = await prisma.departmentPermission.findFirst({
      where: {
        OR: [
          { sourceDeptId: sourceUser.departmentId, targetDeptId: targetUser.departmentId },
          { sourceDeptId: targetUser.departmentId, targetDeptId: sourceUser.departmentId },
        ],
      },
    });

    if (deptPermission) {
      const isSourceDept = deptPermission.sourceDeptId === sourceUser.departmentId;
      const permission = resolveDeptDirection(
        deptPermission,
        isSourceDept,
        sourceRank,
        targetRank
      );
      // Apply org-level approval requirement if set
      if (messagingSettings.requireApprovalForCrossDept) {
        permission.requiresApproval = true;
      }
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }

    // Default cross-department behavior (allowed if org settings permit)
    if (messagingSettings.crossDepartmentMessaging && messagingSettings.crossDepartmentDirection === 'both') {
      const permission: ResolvedPermission = {
        canChat: true,
        canCall: true,
        canViewPresence: true,
        requiresApproval: messagingSettings.requireApprovalForCrossDept || false,
        source: 'org_policy',
      };
      await setCache(cacheKey, permission, CACHE_TTL);
      return permission;
    }
  }

  // 5. Default: no cross-department access
  const defaultPermission = createDefaultPermission('default');
  await setCache(cacheKey, defaultPermission, CACHE_TTL);
  return defaultPermission;
}

/**
 * Check if a user can communicate with another user
 */
export async function canCommunicate(
  sourceUserId: string,
  targetUserId: string,
  orgId: string,
  action: 'chat' | 'call' | 'viewPresence' = 'chat'
): Promise<{ allowed: boolean; requiresApproval: boolean; reason?: string }> {
  const permission = await resolvePermission({ sourceUserId, targetUserId, orgId });

  const allowed =
    action === 'chat' ? permission.canChat :
    action === 'call' ? permission.canCall :
    permission.canViewPresence;

  if (!allowed) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: 'Permission denied based on hierarchy',
    };
  }

  if (permission.requiresApproval) {
    // Check if there's an approved request
    const request = await prisma.conversationRequest.findFirst({
      where: {
        requesterId: sourceUserId,
        recipientId: targetUserId,
        approved: true,
      },
    });

    if (!request) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Conversation request required',
      };
    }
  }

  return { allowed: true, requiresApproval: false };
}

/**
 * Invalidate permission cache for users
 */
export async function invalidatePermissionCache(userIds: string[]): Promise<void> {
  // Need to invalidate all combinations
  // This is expensive - in production, use a smarter approach
  for (const userId of userIds) {
    // Pattern-based deletion isn't great here
    // Better: publish invalidation event and handle in subscribers
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function createDefaultPermission(
  source: ResolvedPermission['source']
): ResolvedPermission {
  return {
    canChat: false,
    canCall: false,
    canViewPresence: false,
    requiresApproval: false,
    source,
  };
}

function resolveDirection(
  permission: {
    direction: string;
    canChat: boolean;
    canCall: boolean;
    canViewPresence: boolean;
    requiresApproval: boolean;
  },
  isSource: boolean
): ResolvedPermission {
  const { direction, canChat, canCall, canViewPresence, requiresApproval } = permission;

  // For bidirectional, always allow
  if (direction === 'BIDIRECTIONAL') {
    return {
      canChat,
      canCall,
      canViewPresence,
      requiresApproval,
      source: 'user',
    };
  }

  // For directional, check if we're the allowed direction
  // HIGHER_TO_LOWER: source can reach target
  // LOWER_TO_HIGHER: target can reach source
  const allowed =
    (direction === 'HIGHER_TO_LOWER' && isSource) ||
    (direction === 'LOWER_TO_HIGHER' && !isSource);

  if (!allowed) {
    return createDefaultPermission('user');
  }

  return {
    canChat,
    canCall,
    canViewPresence,
    requiresApproval,
    source: 'user',
  };
}

function resolveUserRoleDirection(
  permission: {
    userIsSource: boolean;
    direction: string;
    canChat: boolean;
    canCall: boolean;
    canViewPresence: boolean;
    requiresApproval: boolean;
  },
  isSourceUser: boolean,
  userIsSource: boolean
): ResolvedPermission {
  const { direction, canChat, canCall, canViewPresence, requiresApproval } = permission;

  // Complex logic for user-role permissions
  // Depends on userIsSource flag and direction
  let allowed = false;

  if (direction === 'BIDIRECTIONAL') {
    allowed = true;
  } else if (isSourceUser && userIsSource) {
    // We are the user side of the permission
    allowed = direction === 'HIGHER_TO_LOWER';
  } else if (!isSourceUser && !userIsSource) {
    // We are the role side of the permission
    allowed = direction === 'LOWER_TO_HIGHER';
  }

  if (!allowed) {
    return createDefaultPermission('user_role');
  }

  return {
    canChat,
    canCall,
    canViewPresence,
    requiresApproval,
    source: 'user_role',
  };
}

function resolveRoleDirection(
  permission: {
    direction: string;
    canChat: boolean;
    canCall: boolean;
    canViewPresence: boolean;
    requiresApproval: boolean;
  },
  isSourceRole: boolean,
  sourceRank: number,
  targetRank: number
): ResolvedPermission {
  const { direction, canChat, canCall, canViewPresence, requiresApproval } = permission;

  if (direction === 'BIDIRECTIONAL') {
    return {
      canChat,
      canCall,
      canViewPresence,
      requiresApproval,
      source: 'role',
    };
  }

  // Determine if source has higher rank
  const sourceIsHigher = isSourceRole
    ? sourceRank > targetRank
    : targetRank > sourceRank;

  const allowed =
    (direction === 'HIGHER_TO_LOWER' && sourceIsHigher) ||
    (direction === 'LOWER_TO_HIGHER' && !sourceIsHigher);

  if (!allowed) {
    return createDefaultPermission('role');
  }

  return {
    canChat,
    canCall,
    canViewPresence,
    requiresApproval,
    source: 'role',
  };
}

function resolveDeptDirection(
  permission: {
    direction: string;
    canChat: boolean;
    canCall: boolean;
    canViewPresence: boolean;
    requiresApproval: boolean;
  },
  isSourceDept: boolean,
  sourceRank: number,
  targetRank: number
): ResolvedPermission {
  const { direction, canChat, canCall, canViewPresence, requiresApproval } = permission;

  if (direction === 'BIDIRECTIONAL') {
    return {
      canChat,
      canCall,
      canViewPresence,
      requiresApproval,
      source: 'department',
    };
  }

  const sourceIsHigher = isSourceDept
    ? sourceRank > targetRank
    : targetRank > sourceRank;

  const allowed =
    (direction === 'HIGHER_TO_LOWER' && sourceIsHigher) ||
    (direction === 'LOWER_TO_HIGHER' && !sourceIsHigher);

  if (!allowed) {
    return createDefaultPermission('department');
  }

  return {
    canChat,
    canCall,
    canViewPresence,
    requiresApproval,
    source: 'department',
  };
}

/**
 * Check if user can freeze another user's conversation
 */
export async function canFreeze(
  freezerId: string,
  targetUserId: string,
  orgId: string
): Promise<boolean> {
  const [freezer, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: freezerId },
      select: {
        department: { select: { rank: true } },
        role: { select: { rank: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        department: { select: { rank: true } },
        role: { select: { rank: true } },
      },
    }),
  ]);

  if (!freezer || !target) return false;

  // Compare ranks - freezer must have higher rank
  const freezerDeptRank = freezer.department?.rank ?? 0;
  const targetDeptRank = target.department?.rank ?? 0;

  if (freezerDeptRank > targetDeptRank) return true;

  if (freezerDeptRank === targetDeptRank) {
    const freezerRoleRank = freezer.role?.rank ?? 0;
    const targetRoleRank = target.role?.rank ?? 0;
    return freezerRoleRank > targetRoleRank;
  }

  return false;
}
