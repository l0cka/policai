/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readFile, writeFile } = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    readFile,
    writeFile,
  },
}))

import { readJsonFile, writeJsonFile } from './file-store'

describe('file-store', () => {
  beforeEach(() => {
    readFile.mockReset()
    writeFile.mockReset()
  })

  describe('readJsonFile', () => {
    it('parses valid JSON content', async () => {
      readFile.mockResolvedValue('{"ok":true}')

      await expect(readJsonFile('/tmp/test.json', { ok: false })).resolves.toEqual({ ok: true })
      expect(readFile).toHaveBeenCalledWith('/tmp/test.json', 'utf-8')
    })

    it('returns the fallback when the file is missing or invalid', async () => {
      const fallback = { ok: false }
      readFile.mockRejectedValueOnce(new Error('missing'))
      await expect(readJsonFile('/tmp/missing.json', fallback)).resolves.toEqual(fallback)

      readFile.mockResolvedValueOnce('not-json')
      await expect(readJsonFile('/tmp/invalid.json', fallback)).resolves.toEqual(fallback)
    })
  })

  describe('writeJsonFile', () => {
    it('writes pretty-printed JSON', async () => {
      await writeJsonFile('/tmp/out.json', { ok: true })

      expect(writeFile).toHaveBeenCalledWith('/tmp/out.json', '{\n  "ok": true\n}', 'utf-8')
    })
  })
})
