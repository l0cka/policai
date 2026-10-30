/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalSubject, type EditorApproval, type EditorPasskey } from '@/lib/editor-approval'
import { softwarePasskey } from '@/test/software-passkey'

const { registry } = vi.hoisted(() => ({ registry: [] as EditorPasskey[] }))

vi.mock('@/lib/editor-approval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/editor-approval')>()),
  readEditorPasskeys: async () => registry,
}))

const API = 'https://api.github.com/repos/l0cka/policai'
const SUBJECT = approvalSubject({ kind: 'source-review', id: 'source-review-1', proposalHash: 'a'.repeat(64) })

function mailboxGitHub() {
  let branch = false
  let file: { sha: string; content: EditorApproval[] } | null = null
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).slice(API.length)
    const method = init?.method ?? 'GET'
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
    if (method === 'GET' && path.startsWith('/contents/data/editor-approvals.json?ref=editor-approvals')) {
      return file
        ? json({ sha: file.sha, content: Buffer.from(JSON.stringify(file.content)).toString('base64') })
        : json({ message: 'Not Found' }, 404)
    }
    if (method === 'GET' && path === '/git/ref/heads/editor-approvals') {
      return branch ? json({ object: { sha: 'branch' } }) : json({ message: 'Not Found' }, 404)
    }
    if (method === 'GET' && path === '/git/ref/heads/main') return json({ object: { sha: 'main' } })
    if (method === 'POST' && path === '/git/refs') {
      branch = true
      return json({}, 201)
    }
    if (method === 'PUT' && path === '/contents/data/editor-approvals.json') {
      const body = JSON.parse(String(init?.body))
      expect(body.branch).toBe('editor-approvals')
      file = { sha: `sha-${Math.random()}`, content: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) }
      return json({ commit: { sha: 'commit-1' } }, 201)
    }
    return json({ message: `unexpected ${method} ${path}` }, 500)
  })
  return { fetchImpl, stored: () => file?.content ?? [] }
}

async function post(body: unknown, ip = '203.0.113.9') {
  const { POST } = await import('./route')
  return POST(new Request('https://policai.org/api/approvals', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('POST /api/approvals', () => {
  let github: ReturnType<typeof mailboxGitHub>

  beforeEach(() => {
    vi.resetModules()
    registry.length = 0
    github = mailboxGitHub()
    vi.stubGlobal('fetch', github.fetchImpl)
    vi.stubEnv('POLICAI_SIGNAL_GITHUB_TOKEN', 'token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('stores a registered editor signature on the mailbox branch and names the editor', async () => {
    const editor = softwarePasskey('Daniel Alkurdi')
    registry.push(editor.passkey)
    const { subject, response } = editor.approve(SUBJECT)

    const result = await post({ subject, response })

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({ success: true, subject: SUBJECT, reviewer: 'Daniel Alkurdi' })
    expect(github.stored()).toEqual([expect.objectContaining({ subject: SUBJECT, response: expect.objectContaining({ signature: response.signature }) })])
  })

  it('stores nothing for a key outside the registry', async () => {
    registry.push(softwarePasskey().passkey)
    const { subject, response } = softwarePasskey().approve(SUBJECT)

    const result = await post({ subject, response })

    expect(result.status).toBe(403)
    expect(github.fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a subject that names nothing approvable', async () => {
    const editor = softwarePasskey()
    registry.push(editor.passkey)
    const { response } = editor.approve('publish:anything')

    expect((await post({ subject: 'publish:anything', response })).status).toBe(400)
  })

  it('stores a repeated signature once', async () => {
    const editor = softwarePasskey()
    registry.push(editor.passkey)
    const { subject, response } = editor.approve(SUBJECT)

    await post({ subject, response })
    await post({ subject, response })

    expect(github.stored()).toHaveLength(1)
  })
})
