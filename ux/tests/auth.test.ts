import { afterEach, describe, expect, it } from 'vitest'
import { authConfig, hasRole, isPublicPath, pkceChallenge, requiredRole, roleFromGroups } from '../server/utils/auth'

afterEach(() => {
  delete process.env.RED_PASS_MODE
  delete process.env.RED_PASS_OIDC_ISSUER
  delete process.env.RED_PASS_AUTH_REQUIRED
})

describe('claim → role mapping', () => {
  it('maps directory groups to UI roles', () => {
    expect(roleFromGroups(['red-pass-viewers'])).toBe('viewer')
    expect(roleFromGroups(['/red-pass-operators'])).toBe('operator')
  })
  it('takes the highest role', () => expect(roleFromGroups(['red-pass-viewers', 'red-pass-admins'])).toBe('admin'))
  it('grants nothing for unknown or malformed claims', () => {
    expect(roleFromGroups(['other'])).toBeNull()
    expect(roleFromGroups('red-pass-admins')).toBeNull()
    expect(roleFromGroups([{ name: 'red-pass-admins' }])).toBeNull()
  })
})

describe('role gate', () => {
  it('lets operators restart but not delete', () => {
    expect(hasRole('operator', requiredRole('restart'))).toBe(true)
    expect(hasRole('operator', requiredRole('delete'))).toBe(false)
  })
  it('viewers can do nothing mutating', () => expect(hasRole('viewer', requiredRole('start'))).toBe(false))
  it('unknown actions need admin', () => expect(requiredRole('purge')).toBe('admin'))
  it('no role means no access', () => expect(hasRole(null, 'viewer')).toBe(false))
})

describe('session guard', () => {
  it('keeps only health and session public', () => {
    expect(isPublicPath('/api/health')).toBe(true)
    expect(isPublicPath('/api/session')).toBe(true)
    expect(isPublicPath('/api/instances')).toBe(false)
  })
  it('requires sign-in in VM mode even without identity (fails closed)', () => {
    process.env.RED_PASS_MODE = 'vm'
    expect(authConfig()).toMatchObject({ enabled: false, required: true })
  })
  it('keeps the loopback host console open when identity is not configured', () => expect(authConfig()).toMatchObject({ enabled: false, required: false }))
})

describe('PKCE', () => {
  it('derives the S256 challenge (fixture computed independently with openssl)', () => {
    expect(pkceChallenge('red-pass-pkce-fixture-verifier-0123456789abcdef')).toBe('YhRhvAAMBalwWgKVAV8ET5OynUWP5uEnFpDpCtG5Rbw')
  })
  it('is unpadded base64url of a 32-byte digest', () => expect(pkceChallenge('x')).toMatch(/^[A-Za-z0-9_-]{43}$/))
})
