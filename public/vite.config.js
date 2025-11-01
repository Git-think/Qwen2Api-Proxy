import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/': {
        target: 'http://localhost:4000', // 实际后端地址
        changeOrigin: true,
      }
    }
  }
})
