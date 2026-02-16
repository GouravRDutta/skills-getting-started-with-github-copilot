import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow ngrok host used for tunneling the dev server
    allowedHosts: ['superbelievably-overfastidious-collin.ngrok-free.dev','big-geese-cover.loca.lt','192.168.0.108','cool-geese-nail.loca.lt']
  }
})
