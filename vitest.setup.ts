import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

delete process.env.CLASSIFIER_BASE_URL
delete process.env.CLASSIFIER_API_KEY
delete process.env.CLASSIFIER_MODEL

afterEach(() => {
  cleanup()
})
