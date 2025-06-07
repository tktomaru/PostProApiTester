// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                app: resolve(__dirname, 'app.js'),
                background: resolve(__dirname, 'background.js'),
                content: resolve(__dirname, 'content.js'),
                injected: resolve(__dirname, 'injected.js'),
                index: resolve(__dirname, 'index.js')
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
    watch: {
        include: [
            '*.js',
            '*.html',
            '*.css'
        ],
        exclude: [
            'node_modules/**',
            'dist/**'
        ]
    }
});
