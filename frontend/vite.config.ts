import path from "path";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// NOTE (2026-09-13, MB.2): the "@/*" -> "./src/*" alias was already set
// up in tsconfig.app.json, which is enough for TypeScript's own
// type-checker to understand imports like "@/api/client" -- but Vite's
// actual bundler/dev-server has no idea about tsconfig path mappings on
// its own. It needs the exact same alias configured here too, or it
// throws "Failed to resolve import" at runtime even though TypeScript
// sees no error. Both configs have to agree; this was the missing half.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
