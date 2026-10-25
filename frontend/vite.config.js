import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // React va router alohida faylda — brauzer keshida qoladi, har deployda qayta yuklanmaydi
          manualChunks: (id) => (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'vendor' : undefined),
        },
      },
      // xlsx (~500 KB) faqat import sahifasida dinamik yuklanadi — asosiy yuklashga kirmaydi
      chunkSizeWarningLimit: 520,
    },
    server: {
      port: 5173,
      proxy: {
        // Dev rejimida backendga proxy. VITE_API_URL=http://localhost:8000 bo'lsa
        // frontenddagi /api/* so'rovlar shu yerga yo'naltiriladi (CORS muammosiz).
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
