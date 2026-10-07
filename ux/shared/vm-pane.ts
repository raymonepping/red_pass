import type { InstanceSummary, PostureCategory } from './types'

type ToneValue = PostureCategory['tone']

/**
 * Returns true when any non-deleted instance has a critical or warning posture
 * tone, or when a lab instance is unreachable in VM mode.
 */
export function paneNeedsAttention(instances: InstanceSummary[], observeOnly: boolean): boolean {
  return instances.some(i => {
    if (i.deleted) return false
    const tones: ToneValue[] = Object.values(i.posture).map(p => p.tone)
    if (tones.includes('critical') || tones.includes('warning')) return true
    if (observeOnly && i.labRole && i.state?.toLowerCase() !== 'running') return true
    return false
  })
}

/**
 * Builds the compact summary line shown in the pane header.
 * Format: "<n> red_pass VMs · <n> running|reachable · <status> · <n> not red_pass"
 */
export function paneSummaryLine(
  instances: InstanceSummary[],
  observeOnly: boolean,
  needsAttention: boolean,
): string {
  const nonDeleted = instances.filter(i => !i.deleted)
  const labCount = nonDeleted.filter(i => i.labRole).length
  const foreignCount = nonDeleted.filter(i => !i.labRole).length
  const total = labCount + foreignCount

  const activeLabel = observeOnly ? 'reachable' : 'running'
  const active = nonDeleted.filter(i => i.state?.toLowerCase() === 'running').length

  const parts: string[] = [
    `${total} red_pass VMs`,
    `${active} ${activeLabel}`,
  ]

  if (needsAttention) {
    const hasFail = nonDeleted.some(i => Object.values(i.posture).some(p => p.tone === 'critical'))
    parts.push(hasFail ? 'needs attention' : 'check indicators')
  } else {
    parts.push('all secured')
  }

  if (foreignCount > 0) parts.push(`${foreignCount} not red_pass`)
  return parts.join(' · ')
}
