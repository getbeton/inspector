/**
 * New Department User Detector
 * Detects first user from a new department joining
 */

import type { SignalDetectorDefinition, DetectorContext, DetectedSignal } from '../types'
import { signalExists, getAccountUsers, createDetectedSignal, daysAgo } from '../helpers'

export const newDepartmentUserDetector: SignalDetectorDefinition = {
  meta: {
    name: 'new_department_user',
    category: 'expansion',
    description: 'First user from a new department',
    defaultConfig: {
      lookback_days: 7,
    },
  },

  async detect(accountId: string, context: DetectorContext): Promise<DetectedSignal | null> {
    const { supabase, workspaceId, config } = context
    const lookbackDays = config?.lookback_days ?? 7

    if (await signalExists(supabase, accountId, 'new_department_user', lookbackDays)) {
      return null
    }

    const allUsers = await getAccountUsers(supabase, accountId)

    if (allUsers.length < 2) {
      return null
    }

    // Extract departments from titles
    const seenDepartments = new Set<string>()
    const recentCutoff = daysAgo(7)

    for (const user of allUsers) {
      const userCreatedAt = new Date(user.created_at)

      if (userCreatedAt < recentCutoff) {
        // Build set of historical departments
        if (user.title) {
          const dept = user.title.split(' ')[0] // First word as proxy for department
          seenDepartments.add(dept.toLowerCase())
        }
      } else {
        // Check if recent user is from new department
        if (user.title) {
          const dept = user.title.split(' ')[0]
          if (!seenDepartments.has(dept.toLowerCase())) {
            return createDetectedSignal(accountId, workspaceId, 'new_department_user', 1.0, {
              user_name: user.name,
              department: dept,
              total_departments: seenDepartments.size + 1,
            })
          }
        }
      }
    }

    return null
  },
}
