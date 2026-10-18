/* @vitest-environment node */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { THEMES } from '@/lib/themes'

const { clientEnds } = vi.hoisted(() => ({
  clientEnds: [] as InMemoryTransport[],
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', async () => {
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
  return {
    StdioServerTransport: class {
      constructor() {
        const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair()
        clientEnds.push(clientEnd)
        return serverEnd
      }
    },
  }
})

vi.mock('@/lib/themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/themes')>()),
  MIN_THEMES_PER_RECORD: 2,
  MAX_THEMES_PER_RECORD: 7,
  MIN_RECORDS_PER_THEME: 11,
  MIN_PUBLIC_RECORDS_PER_THEME: 11,
}))

async function connect(load: () => Promise<unknown>): Promise<Client> {
  await load()
  const client = new Client({ name: 'server-tools-test', version: '0.0.0' })
  await client.connect(clientEnds[clientEnds.length - 1])
  return client
}

let editorial: Client
let publicServer: Client

beforeAll(async () => {
  editorial = await connect(() => import('./server'))
  publicServer = await connect(() => import('./public-server'))
})

afterAll(async () => {
  await editorial.close()
  await publicServer.close()
})

async function describedTool(client: Client, name: string) {
  const { tools } = await client.listTools()
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`${name} is not registered`)
  return tool
}

describe('list_themes registration', () => {
  it('is on the editorial server only', async () => {
    const editorialNames = (await editorial.listTools()).tools.map(({ name }) => name)
    const publicNames = (await publicServer.listTools()).tools.map(({ name }) => name)

    expect(editorialNames).toContain('list_themes')
    expect(publicNames).not.toContain('list_themes')
  })

  it('builds the theme rules in its description from the constants', async () => {
    const { description } = await describedTool(editorial, 'list_themes')

    expect(description).toContain('2 to 7 unique keys')
    expect(description).toContain('at least 11 register records')
    expect(description).toContain('fewer than 11 public records')
    expect(description).not.toMatch(/1 to 5|at least 2|fewer than 2|at least 3|fewer than 3/)
  })

  it('takes no admin token and answers a call with no arguments', async () => {
    const tool = await describedTool(editorial, 'list_themes')
    expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual([])
    expect(tool.inputSchema.required ?? []).toEqual([])

    const result = await editorial.callTool({ name: 'list_themes', arguments: {} })
    expect(result.isError).toBeFalsy()
    const [content] = result.content as { type: string; text: string }[]
    expect(JSON.parse(content.text)).toEqual({
      themes: THEMES.map(({ key, label }) => ({ key, label })),
      minThemesPerRecord: 2,
      maxThemesPerRecord: 7,
      minRecordsPerTheme: 11,
    })
  })
})

describe('policy theme guidance in editorial tool descriptions', () => {
  it.each(['approve_staged_source', 'stage_source_capture'])(
    '%s names the theme range from the constants and points to list_themes',
    async (name) => {
      const { description } = await describedTool(editorial, name)

      expect(description).toContain('2 to 7 themes')
      expect(description).toContain('list_themes')
      expect(description).not.toContain('1 to 5')
    },
  )
})
