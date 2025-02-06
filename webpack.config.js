const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development', // 设置为开发模式
    entry: {
        contentScript: './src/js/contentScript.js',
        options: './src/js/options.js',
        inlineTranslator: './src/js/inlineTranslator.js',
        background: './src/background.js',
        subtitleAnalyzer: './src/js/subtitleAnalyzer.js',
        analysisPanel: './src/js/components/analysisPanel.js'
    },
    output: {
        filename: 'js/[name].js',
        path: path.resolve(__dirname, 'dist'),
        clean: true // 在每次构建前清理 dist 目录
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
                    to: "manifest.json",
                    transform(content) {
                        // 自动更新 manifest 中的路径
                        const manifest = JSON.parse(content);
                        // 更新文件路径
                        manifest.content_scripts[0].js = [
                            'js/contentScript.js',
                            'js/subtitleAnalyzer.js',
                            'js/analysisPanel.js'
                        ];
                        manifest.content_scripts[0].css = [
                            'styles/styles.css',
                            'styles/analysisPanel.css'
                        ];
                        manifest.content_scripts[1].js = ['js/inlineTranslator.js'];
                        manifest.content_scripts[1].css = ['styles/inlineTranslator.css'];
                        manifest.options_page = 'html/options.html';
                        manifest.background.service_worker = 'js/background.js';
                        return JSON.stringify(manifest, null, 2);
                    }
                },
                { 
                    from: "src/styles",
                    to: "styles"
                },
                { 
                    from: "src/html",
                    to: "html"
                }
            ],
        }),
    ],
    optimization: {
        minimize: false // 禁用压缩
    },
    resolve: {
        extensions: ['.js']
    }
};