// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

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
        commonjs(),
        {
            name: 'copy-files',
            writeBundle() {
                // Copy manifest.json
                copyFileSync('manifest.json', 'dist/manifest.json');
                // Copy index.html
                copyFileSync('index.html', 'dist/index.html');
                // Copy styles.css
                copyFileSync('styles.css', 'dist/styles.css');
                
                // Copy icons directory
                const iconsSourceDir = 'icons';
                const iconsDestDir = 'dist/icons';
                
                if (existsSync(iconsSourceDir)) {
                    if (!existsSync(iconsDestDir)) {
                        mkdirSync(iconsDestDir, { recursive: true });
                    }
                    
                    const files = readdirSync(iconsSourceDir);
                    files.forEach(file => {
                        const sourcePath = join(iconsSourceDir, file);
                        const destPath = join(iconsDestDir, file);
                        
                        if (statSync(sourcePath).isFile()) {
                            copyFileSync(sourcePath, destPath);
                        }
                    });
                }
            }
        }
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
