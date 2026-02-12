import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const apiProxyTarget =
        env.VITE_DEV_API_PROXY_TARGET?.trim() || 'http://localhost:3000';

    return {
        plugins: [react(), tailwindcss()],
        base: mode === 'production' ? '/admin/' : undefined,
        server: {
            port: 5173,
            allowedHosts: true,
            proxy: {
                '/v1': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    secure: false,
                },
                '/uploads': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    };
});
