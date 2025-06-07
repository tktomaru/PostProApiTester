// webpack.config.js
const path = require('path');

module.exports = {
    mode: 'production',            // or 'development'
    entry: {
        background: './background.js'
        // content: './src/contentScript.js',  // もし使うなら
    },
    output: {
        filename: '[name].js',       // → dist/background.js, dist/content.js
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', { targets: { chrome: '100' } }]
                        ]
                    }
                }
            }
        ]
    },
    resolve: {
        extensions: ['.js']
    }
};
