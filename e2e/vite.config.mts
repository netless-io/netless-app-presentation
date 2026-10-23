import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import baseConfig from '../vite.config.mts'

export default mergeConfig(baseConfig, defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  build: {
    outDir: 'e2e/dist',
    target: 'es2022',
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
    },
  },
}))
