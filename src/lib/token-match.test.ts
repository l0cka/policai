import { describe, expect, it } from 'vitest'
import { tokenMatches } from './token-match'

describe('tokenMatches', () => {
  it('accepts the configured token', () => {
    expect(tokenMatches('signal-secret', 'signal-secret')).toBe(true)
  })

  it('rejects a different token of any length', () => {
    expect(tokenMatches('signal-secreT', 'signal-secret')).toBe(false)
    expect(tokenMatches('signal', 'signal-secret')).toBe(false)
    expect(tokenMatches('', 'signal-secret')).toBe(false)
  })
})
