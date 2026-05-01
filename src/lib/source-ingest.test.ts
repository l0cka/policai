/* @vitest-environment node */

import { describe, expect, it } from 'vitest'
import { validateSourceUrl } from './source-ingest'

describe('source-ingest validation', () => {
  it('accepts official .gov.au sources', () => {
    expect(validateSourceUrl('https://www.apra.gov.au/example')).toEqual(
      expect.objectContaining({ isGovAu: true }),
    )
  })

  it('rejects non-government sources unless they are explicitly stage-only', () => {
    expect(() => validateSourceUrl('https://www.abc.net.au/news/example')).toThrow(
      'Only .gov.au URLs can be analysed or published directly',
    )

    expect(validateSourceUrl('https://www.abc.net.au/news/example', { stageOnly: true })).toEqual(
      expect.objectContaining({ isGovAu: false }),
    )
  })
})
