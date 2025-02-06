# Kumarajiva

## 概述

Kumarajiva 是一款面YouTube视频和英文网页的实时字幕翻译和解析工具。该插件能够自动抓取视频中的英文字幕，并借助多种翻译服务（如 Kimi、Doubao、Qwen、DeepSeek）将字幕翻译为准确且地道的中文。同时，插件还提供字幕的深度分析面板，帮助用户更好地理解视频内容。

## 主要特性

- **实时字幕翻译**  
  在 YouTube 视频播放过程中自动翻译英文字幕，将翻译结果以直观的方式显示在视频页面上。


- **AI字幕分析**  
  为用户提供字幕的深度解析功能，包括总结、词汇、短语解析等，帮助用户从多角度理解视频内容。

- **英语网页段落翻译**  
  自动选中网页中的英语段落，按 Ctrl键自动翻译为中文，并就近显示翻译结果。

- **多翻译服务支持**  
  内置支持多种翻译服务接口，可在插件配置中选择使用 Kimi、Doubao、Qwen 或 DeepSeek 等服务，并灵活配置 API Token 与相关参数。


## 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/yourusername/BigManEnglishGuy-Chrome-Plugin.git
   cd BigManEnglishGuy-Chrome-Plugin
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建项目**
   ```bash
   npm run build
   ```

4. **加载扩展**
   - 打开 Chrome 浏览器，进入 `chrome://extensions/` 页面。
   - 开启右上角的开发者模式。
   - 点击"加载已解压的扩展程序"，选择项目根目录下生成的 `dist` 文件夹。

