import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Use the repository path when publishing on GitHub Pages.
export default defineConfig({
  base: '/NithyaSeva/',
  plugins: [react()],
})
