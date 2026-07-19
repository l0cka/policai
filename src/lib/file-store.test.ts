/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mkdir, readFile, rename, rm, writeFile } = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    mkdir,
    readFile,
    rename,
    rm,
    writeFile,
  },
}))

import { readJsonFile, writeJsonFile } from './file-store'

describe('file-store', () => {
  beforeEach(() => {
    readFile.mockReset()
    mkdir.mockReset()
    rename.mockReset()
    rm.mockReset()
    writeFile.mockReset()
    rm.mockResolvedValue(undefined)
  })

  describe('readJsonFile', () => {
    it('parses valid JSON content', async () => {
      readFile.mockResolvedValue('{"ok":true}')

      await expect(readJsonFile('/tmp/test.json', { ok: false })).resolves.toEqual({ ok: true })
      expect(readFile).toHaveBeenCalledWith('/tmp/test.json', 'utf-8')
    })

    it('returns the fallback only when the file is missing', async () => {
      const fallback = { ok: false }
      readFile.mockRejectedValueOnce(
        Object.assign(new Error('missing'), { code: 'ENOENT' }),
      )
      await expect(readJsonFile('/tmp/missing.json', fallback)).resolves.toEqual(fallback)
    })

    it('throws when JSON is malformed or the file cannot be read', async () => {
      const fallback = { ok: false }
      readFile.mockResolvedValueOnce('not-json')
      await expect(readJsonFile('/tmp/invalid.json', fallback)).rejects.toThrow(
        'Invalid JSON in /tmp/invalid.json',
      )

      readFile.mockRejectedValueOnce(
        Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      )
      await expect(readJsonFile('/tmp/blocked.json', fallback)).rejects.toThrow(
        'permission denied',
      )
    })
  })

  describe('writeJsonFile', () => {
    it('writes pretty-printed JSON to a temporary file and renames it', async () => {
      await writeJsonFile('/tmp/out.json', { ok: true })

      expect(mkdir).toHaveBeenCalledWith('/tmp', { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/^\/tmp\/\.out\.json\.\d+\..+\.tmp$/),
        '{\n  "ok": true\n}',
        'utf-8',
      )
      expect(rename).toHaveBeenCalledWith(
        expect.stringMatching(/^\/tmp\/\.out\.json\.\d+\..+\.tmp$/),
        '/tmp/out.json',
      )
    })

    it('removes the temporary file when the write fails', async () => {
      writeFile.mockRejectedValueOnce(new Error('disk full'))

      await expect(writeJsonFile('/tmp/out.json', { ok: true })).rejects.toThrow(
        'disk full',
      )

      expect(rm).toHaveBeenCalledWith(
        expect.stringMatching(/^\/tmp\/\.out\.json\.\d+\..+\.tmp$/),
        { force: true },
      )
      expect(rename).not.toHaveBeenCalled()
    })
  })
})
