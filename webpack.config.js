// webpack.config.js
const path = require('path');

module.exports = {
    mode: 'production',            // or 'development'
    entry: {
        background: './background.js',
        content: './src/contentScript.ts'  // TypeScriptファイルをエントリーポイントとして追加
    },
    output: {
        filename: '[name].js',       // → dist/background.js, dist/content.js
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.(js|ts)$/,  // .js と .ts の両方を処理
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', { targets: { chrome: '100' } }],
                            '@babel/preset-typescript'  // TypeScript用のプリセットを追加
                        ]
                    }
                }
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.ts']  // .ts も解決対象に追加
    }
};
