import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Demo mode: run the demo app
  if (mode === 'demo') {
    return {
      plugins: [react()],
      root: './demo',
      resolve: {
        alias: {
          '@': resolve(__dirname, './src')
        }
      },
      build: {
        outDir: '../dist-demo'
      }
    }
  }

  // Library mode: build the package
  return {
    plugins: [
      react(),
      dts({
        include: ['src'],
        exclude: ['demo'],
        rollupTypes: true
      })
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'StackEditor',
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', '@xyflow/react'],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            '@xyflow/react': 'ReactFlow'
          },
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === 'style.css') return 'style.css'
            return assetInfo.name || 'asset'
          }
        }
      },
      cssCodeSplit: false
    }
  }
})
