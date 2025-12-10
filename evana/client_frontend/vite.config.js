import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // This will load .env, .env.local, .env.[mode], .env.[mode].local
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Proxy all requests starting with /api to your backend server
        '/api': {
          target: env.VITE_API_URL, // Use the URL from your .env.local file
          changeOrigin: true, // Recommended for virtual-hosted sites
          secure: false, // IMPORTANT: Allow proxying to a server with a self-signed certificate
          rewrite: (path) => path.replace(/^\/api/, ''), // Remove /api prefix before sending to server
        },
      },
    },
  };
});