const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        background: './src/background.js',
        contentScript: './src/js/contentScript.js',
        inlineTranslator: './src/js/inlineTranslator.js',
        options: './src/js/options.js',
        popup: './src/js/popup.js'
    },
    output: {
        filename: 'js/[name].js',
        path: path.resolve(__dirname, 'dist/Kumarajiva'),
        clean: true,
        devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { 
                    from: "src/manifest.json",
                    to: "manifest.json"
                },
                { 
                    from: "src/styles",
                    to: "styles"
                },
                { 
                    from: "src/html",
                    to: "html"
                },
                { 
                    from: "src/icons",
                    to: "icons"
                }
            ],
        }),
    ],
    optimization: {
        minimize: false,
        moduleIds: 'named'
    },
    resolve: {
        extensions: ['.js']
    },
    mode: 'development',
    devtool: 'source-map',
    devServer: {
        devMiddleware: {
            writeToDisk: true
        }
    }
};