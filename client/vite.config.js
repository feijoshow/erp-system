import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/react-router-dom/') || id.includes('/react-router/')) {
            return 'vendor-router';
          }

          if (id.includes('/cookie/') || id.includes('/set-cookie-parser/')) {
            return 'vendor-router';
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }

          if (id.includes('/@supabase/')) {
            return 'vendor-supabase';
          }

          if (id.includes('/ws/') || id.includes('/iceberg-js/') || id.includes('/tslib/')) {
            return 'vendor-supabase';
          }

          if (id.includes('/lodash/')) {
            return 'vendor-lodash';
          }

          if (
            id.includes('/recharts/') ||
            id.includes('/recharts-scale/') ||
            id.includes('/victory-vendor/') ||
            id.includes('/react-smooth/') ||
            id.includes('/react-transition-group/') ||
            id.includes('/prop-types/') ||
            id.includes('/react-is/') ||
            id.includes('/clsx/') ||
            id.includes('/eventemitter3/') ||
            id.includes('/fast-equals/') ||
            id.includes('/decimal.js-light/') ||
            id.includes('/tiny-invariant/') ||
            id.includes('/d3-')
          ) {
            return 'charts';
          }

          if (id.includes('/pdf-lib/') || id.includes('/@pdf-lib/') || id.includes('/pako/')) {
            return 'pdf';
          }

          return 'vendor';
        },
      },
    },
  },
})
