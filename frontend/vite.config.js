import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Any request that starts with /api is forwarded to the Node backend,
// so the frontend never needs to know the backend's address.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
