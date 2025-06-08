// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                app: resolve(__dirname, 'src/app.ts'),
                background: resolve(__dirname, 'src/background.ts'),
                content: resolve(__dirname, 'src/content.ts'),
                injected: resolve(__dirname, 'src/injected.ts'),
                index: resolve(__dirname, 'src/index.ts')
            },
            output: {
                entryFileNames: '[name].bundle.js',
                chunkFileNames: '[name].bundle.js',
                assetFileNames: '[name].[ext]'
            }
        },
        outDir: 'dist',
        emptyOutDir: true
    },
    plugins: [
        nodeResolve({
            browser: true
        }),
        commonjs()
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    watch: {
        include: [
            'src/**/*.ts',
            '*.html',
            '*.css'
        ],
        exclude: [
            'node_modules/**',
            'dist/**'
        ]
    }
});
