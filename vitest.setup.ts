import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// WHY: a unit test must never be able to spawn the real `claude` binary — a
// missed mock or DI seam previously let claude-cli.test.ts invoke the real
// CLI nine times in parallel, making paid API calls and crashing the host.
// Pointing CLAUDE_BIN at /bin/false means any test that fails to stub the
// exec call fails instantly (command not found / non-zero exit) and costs
// nothing, instead of silently hitting the real binary.
process.env.CLAUDE_BIN = '/bin/false'

afterEach(() => {
  cleanup()
})
