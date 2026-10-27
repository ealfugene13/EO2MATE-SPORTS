import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  // The live site is served from the custom domain sports.eo2mate.com.
  base: '/',
  plugins: [react()],
}));
