// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.js'),
                app: resolve(__dirname, 'app.js'),
                background: resolve(__dirname, 'background.js'),
                content: resolve(__dirname, 'content.js'),
                injected: resolve(__dirname, 'injected.js')
            },
            output: {
                entryFileNames: '[name].bundle.js',
                dir: 'dist'
            }
        }
    },
    plugins: [
        nodeResolve({
            browser: true
        }),
        commonjs()
    ]
});
