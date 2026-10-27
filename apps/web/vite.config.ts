import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // The repo is hosted at https://ealfugene13.github.io/EO2MATE-SPORTS/.
  // Vite dev server still uses the normal root path.
  base: command === 'build' ? '/EO2MATE-SPORTS/' : '/',
  plugins: [react()],
}));
