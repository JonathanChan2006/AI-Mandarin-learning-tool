import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@shared': shared } },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'tests/**/*.test.ts']
        }
      },
      {
        plugins: [react()],
        resolve: { alias: { '@renderer': resolve('src/renderer/src'), '@shared': shared } },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup.renderer.ts']
        }
      }
    ]
  }
})
