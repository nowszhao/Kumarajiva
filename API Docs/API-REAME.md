# Kumarajiva-API

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub OAuth](https://img.shields.io/badge/auth-GitHub%20OAuth-black)](https://docs.github.com/en/developers/apps/oauth-apps)

[English](#introduction) | [中文](#介绍)

## 介绍

Kumarajiva-API 是 [Kumarajiva](https://github.com/nowszhao/Kumarajiva) 和 [Kumarajiva-iOS](https://github.com/nowszhao/Kumarajiva-iOS) 的后端云服务，提供智能生词管理、科学的间隔学习功能和多用户认证支持，帮助用户更高效地学习和记忆。

### ✨ 新特性 | New Features

- 🔐 **多用户认证** - GitHub OAuth 登录系统
- 👥 **用户数据隔离** - 每个用户的数据完全独立
- 🔄 **向后兼容** - 现有应用无需修改即可使用
- 📱 **跨平台支持** - 支持 Web、iOS、Android、桌面应用、Chrome 插件
- 🛡️ **安全认证** - JWT Token + Refresh Token + Session 管理
- 🎯 **智能客户端检测** - 自动识别客户端类型并提供最佳认证体验

## Introduction

Kumarajiva-API is the backend cloud service for [Kumarajiva](https://github.com/nowszhao/Kumarajiva) and [Kumarajiva-iOS](https://github.com/nowszhao/Kumarajiva-iOS), providing intelligent vocabulary management, spaced repetition learning features, and multi-user authentication support to help users learn and memorize more effectively.

### ✨ New Features

- 🔐 **Multi-user Authentication** - GitHub OAuth login system
- 👥 **User Data Isolation** - Complete data separation for each user
- 🔄 **Backward Compatibility** - Existing applications work without modification
- 📱 **Cross-platform Support** - Web, iOS, Android, desktop apps, and Chrome extensions
- 🛡️ **Secure Authentication** - JWT Token + Refresh Token + Session management
- 🎯 **Smart Client Detection** - Automatic client type detection for optimal auth experience

## 技术栈 | Tech Stack

### 前端 | Frontend
- ⚛️ React 18 - 用户界面框架
- ⚡️ Vite - 现代前端构建工具
- 🎨 Tailwind CSS - 实用优先的 CSS 框架
- 🎯 DaisyUI - 基于 Tailwind 的组件库
- 🔄 Axios - HTTP 客户端
- 🍞 React Hot Toast - 优雅的通知提示
- ⭐️ Heroicons - 精美的 SVG 图标集

### 后端 | Backend
- ⚡️ Fastify - 高性能 Node.js Web 框架
- 🗄️ SQLite3 - 轻量级关系型数据库
- 📦 Node.js - JavaScript 运行时
- 🔐 GitHub OAuth - 用户认证系统
- 🔑 JWT + Refresh Token - 现代认证机制
- 🤖 LLM API - 大语言模型接口集成

## 快速开始 | Quick Start

### 环境要求 | Prerequisites
- Node.js (v14 或更高版本 | v14 or higher)
- npm 或 yarn
- GitHub 账号用于 OAuth 认证 | GitHub account for OAuth authentication

### 🔧 环境配置 | Environment Setup

1. **配置 GitHub OAuth App:**
   - 访问 [GitHub Developer Settings](https://github.com/settings/applications/new)
   - 创建新的 OAuth App：
     - Application name: `Kumarajiva API`
     - Homepage URL: `http://localhost:3000`
     - Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
   - 复制 Client ID 和 Client Secret

2. **创建环境变量文件:**
   ```bash
   cd api
   cp env.example .env
   ```

3. **编辑 .env 文件:**
   ```env
   # GitHub OAuth 配置（必填）
   GITHUB_CLIENT_ID=your_github_client_id_here
   GITHUB_CLIENT_SECRET=your_github_client_secret_here
   GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

   # 安全配置
   # ⚠️  重要：请使用强密钥！以下是示例密钥，请替换为您自己生成的密钥
   # 生成命令：node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   SESSION_SECRET=your_session_secret_here
   JWT_SECRET=your_jwt_secret_here

   # 兼容模式配置
   LEGACY_MODE=false  # false=严格认证模式, true=兼容模式

   # 跨域配置（可选）
   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   COOKIE_DOMAIN=localhost

   # 移动端URL Scheme配置（可选）
   IOS_URL_SCHEME=kumarajiva-ios
   ANDROID_URL_SCHEME=kumarajiva-android
   ```

### 后端服务 | Backend Service

1. **安装依赖 | Install Dependencies:**
   ```bash
   cd api
   npm install
   ```

2. **数据库迁移（可选）| Database Migration (Optional):**
   如果您有现有数据需要迁移：
   ```bash
   node src/db/migrate.js
   ```

3. **启动服务器 | Start API Server:**
   ```bash
   node src/app.js
   ```
   服务器将在 http://localhost:3000 启动
   Server will start at http://localhost:3000

4. **验证安装 | Verify Installation:**
   ```bash
   curl http://localhost:3000/health
   ```

### 🚀 快速测试 | Quick Test

完成安装后，您可以通过以下步骤快速测试API功能：

1. **测试健康检查:**
   ```bash
   curl http://localhost:3000/health
   # 应该返回: {"status":"ok","timestamp":"..."}
   ```

2. **测试不同客户端类型的GitHub OAuth登录:**
```bash
   # Web应用登录
   open "http://localhost:3000/api/auth/github?client_type=web"
   
   # iOS应用登录
   open "http://localhost:3000/api/auth/github?client_type=ios"
   
   # Android应用登录
   open "http://localhost:3000/api/auth/github?client_type=android"
   
   # Chrome插件登录
   curl "http://localhost:3000/api/auth/github?client_type=extension"
   ```

3. **获取API文档:**
```bash
   # 查看Swagger API文档
   open http://localhost:3000/documentation
   ```

4. **测试兼容模式API（如果启用）:**
   ```bash
   # 在兼容模式下，可以直接调用API
   curl http://localhost:3000/api/vocab
   ```

### 前端服务 | Frontend Service

如果您想使用Web界面，可以启动前端开发服务器：

1. **安装前端依赖 | Install Frontend Dependencies:**
   ```bash
   cd web
   npm install
   ```

2. **配置前端环境变量 | Configure Frontend Environment:**
   ```bash
   cp .env.example .env
   ```
   
   编辑 `.env` 文件：
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:3000/api
   ```

3. **启动前端开发服务器 | Start Frontend Dev Server:**
   ```bash
   npm run dev
   ```
   前端将在 http://localhost:5173 启动
   Frontend will start at http://localhost:5173

4. **访问Web应用 | Access Web Application:**
   ```bash
   open http://localhost:5173
   ```

**注意 | Note:** 前端应用需要后端API服务同时运行。确保后端服务在 http://localhost:3000 正常运行。

## 🔐 跨平台认证系统 | Cross-Platform Authentication System

### 🎯 智能客户端检测 | Smart Client Detection

API 会自动检测客户端类型并提供最佳的认证体验：

- **Web 应用**: 使用 Session + JWT，支持弹窗和重定向模式
- **iOS 应用**: 使用 JWT + Refresh Token，通过 URL Scheme 回调
- **Android 应用**: 使用 JWT + Refresh Token，通过 URL Scheme 回调
- **桌面应用**: 使用 JWT + Refresh Token，支持自定义回调URL
- **Chrome 插件**: 直接返回 JSON 格式的认证信息

### 📱 移动应用认证流程 | Mobile App Authentication

#### iOS 应用集成示例

1. **配置 URL Scheme**
   在 `Info.plist` 中添加：
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLName</key>
       <string>kumarajiva-oauth</string>
       <key>CFBundleURLSchemes</key>
       <array>
         <string>kumarajiva-ios</string>
       </array>
     </dict>
   </array>
   ```

2. **发起OAuth登录**
   ```swift
   // 在应用中打开OAuth登录
   let oauthURL = "http://localhost:3000/api/auth/github?client_type=ios"
   if let url = URL(string: oauthURL) {
       UIApplication.shared.open(url)
   }
   ```

3. **处理OAuth回调**
   ```swift
   // 在 AppDelegate 或 SceneDelegate 中处理回调
   func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
       if url.scheme == "kumarajiva-ios" {
           if url.host == "oauth-callback" {
               // 解析认证信息
               let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
               let accessToken = components?.queryItems?.first(where: { $0.name == "access_token" })?.value
               let refreshToken = components?.queryItems?.first(where: { $0.name == "refresh_token" })?.value
               
               // 保存token到Keychain
               saveTokens(accessToken: accessToken, refreshToken: refreshToken)
               
               // 通知应用认证成功
               NotificationCenter.default.post(name: .authSuccess, object: nil)
               return true
           } else if url.host == "oauth-error" {
               // 处理认证错误
               let error = components?.queryItems?.first(where: { $0.name == "error" })?.value
               NotificationCenter.default.post(name: .authError, object: error)
               return true
           }
       }
       return false
   }
   ```

#### Android 应用集成示例

1. **配置 Intent Filter**
   在 `AndroidManifest.xml` 中添加：
   ```xml
   <activity android:name=".OAuthCallbackActivity">
       <intent-filter>
           <action android:name="android.intent.action.VIEW" />
           <category android:name="android.intent.category.DEFAULT" />
           <category android:name="android.intent.category.BROWSABLE" />
           <data android:scheme="kumarajiva-android" />
       </intent-filter>
   </activity>
   ```

2. **发起OAuth登录**
   ```kotlin
   // 在应用中打开OAuth登录
   val oauthUrl = "http://localhost:3000/api/auth/github?client_type=android"
   val intent = Intent(Intent.ACTION_VIEW, Uri.parse(oauthUrl))
   startActivity(intent)
   ```

3. **处理OAuth回调**
   ```kotlin
   class OAuthCallbackActivity : AppCompatActivity() {
       override fun onCreate(savedInstanceState: Bundle?) {
           super.onCreate(savedInstanceState)
           
           val data = intent.data
           if (data != null && data.scheme == "kumarajiva-android") {
               when (data.host) {
                   "oauth-callback" -> {
                       val accessToken = data.getQueryParameter("access_token")
                       val refreshToken = data.getQueryParameter("refresh_token")
                       
                       // 保存token
                       saveTokens(accessToken, refreshToken)
                       
                       // 通知主应用
                       val intent = Intent(this, MainActivity::class.java)
                       intent.putExtra("auth_success", true)
                       startActivity(intent)
                       finish()
                   }
                   "oauth-error" -> {
                       val error = data.getQueryParameter("error")
                       // 处理错误
                       finish()
                   }
               }
           }
       }
   }
   ```

### 🌐 Web 应用认证流程 | Web Application Authentication

**🔧 最近修复 | Recent Fixes:**
- ✅ 修复了跨域消息传递问题 (postMessage origin mismatch)
- ✅ 优化了弹窗认证的错误处理和用户体验
- ✅ 增强了前端认证状态管理的稳定性

#### 弹窗模式（推荐）
```javascript
// 使用弹窗进行OAuth认证
async function loginWithGithub() {
  return new Promise((resolve, reject) => {
    const popup = window.open(
      'http://localhost:3000/api/auth/github?client_type=web',
      'oauth',
      'width=600,height=700'
    );
    
    // 监听来自弹窗的消息
    window.addEventListener('message', (event) => {
      if (event.data.type === 'OAUTH_SUCCESS') {
        popup.close();
        resolve(event.data.data);
      }
    });
  });
}
```

#### 重定向模式
```javascript
// 使用页面重定向进行OAuth认证
function loginWithRedirect() {
  // 保存当前页面URL
  localStorage.setItem('pre_auth_url', window.location.href);
  
  // 重定向到OAuth登录
  window.location.href = 'http://localhost:3000/api/auth/github?client_type=web&callback_url=' + 
                         encodeURIComponent(window.location.origin + '/auth-callback');
}
```

### 🖥️ 桌面应用认证流程 | Desktop Application Authentication

```javascript
// Electron 应用示例
const { shell } = require('electron');

// 发起OAuth登录
function startOAuth() {
  const callbackUrl = 'http://localhost:8080/oauth-callback';
  const oauthUrl = `http://localhost:3000/api/auth/github?client_type=desktop&callback_url=${encodeURIComponent(callbackUrl)}`;
  
  shell.openExternal(oauthUrl);
}

// 在本地服务器监听回调
const express = require('express');
const app = express();

app.get('/oauth-callback', (req, res) => {
  const { access_token, refresh_token, user_id } = req.query;
  
  // 保存认证信息
  saveTokens(access_token, refresh_token);
  
  // 通知主进程
  mainWindow.webContents.send('auth-success', { access_token, user_id });
  
  res.send('认证成功！您可以关闭此页面。');
});

app.listen(8080);
```

### 🔌 Chrome 插件认证流程 | Chrome Extension Authentication

```javascript
// Chrome 插件 background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate') {
    fetch('http://localhost:3000/api/auth/github?client_type=extension')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // 保存认证信息
          chrome.storage.local.set({
            'access_token': data.data.access_token,
            'refresh_token': data.data.refresh_token,
            'user': data.data.user
          });
          
          sendResponse({ success: true, data: data.data });
        }
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 保持消息通道开放
  }
});
```

### 🔄 Token 刷新机制 | Token Refresh Mechanism

所有移动端和桌面应用都支持 Refresh Token 机制：

```javascript
// 刷新访问令牌
async function refreshAccessToken(refreshToken) {
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Type': 'ios' // 或 android, desktop
    },
    body: JSON.stringify({
      refresh_token: refreshToken
    })
  });
  
  const data = await response.json();
  if (data.success) {
    // 保存新的token
    saveTokens(data.data.access_token, data.data.refresh_token);
    return data.data.access_token;
  }
  
  throw new Error('Token refresh failed');
}

// 自动刷新token的HTTP客户端
class AuthenticatedHttpClient {
  constructor(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
  
  async request(url, options = {}) {
    // 添加认证头
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${this.accessToken}`
    };
    
    let response = await fetch(url, options);
    
    // 如果token过期，尝试刷新
    if (response.status === 401) {
      try {
        this.accessToken = await refreshAccessToken(this.refreshToken);
        
        // 重试请求
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(url, options);
      } catch (error) {
        // 刷新失败，需要重新登录
        throw new Error('Authentication required');
      }
    }
    
    return response;
  }
}
```

## 🔑 认证接口详情 | Authentication API Details

### OAuth 登录接口
```
GET /api/auth/github?client_type={type}&callback_url={url}
```

**参数说明:**
- `client_type`: 客户端类型 (web, ios, android, desktop, extension)
- `callback_url`: 自定义回调URL（可选）

**响应格式:**
根据客户端类型返回不同格式的响应：
- Web/Extension: JSON 格式
- iOS/Android: URL Scheme 重定向
- Desktop: 自定义回调URL 重定向

### Token 刷新接口
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token_here"
}
```

### 认证状态检查
```
GET /api/auth/status
Authorization: Bearer {access_token} (可选)
```

### 用户资料获取
```
GET /api/auth/profile
Authorization: Bearer {access_token} (可选，但获取完整信息需要认证)
```

## 📚 API 接口文档 | API Documentation

### 🔐 认证相关 API | Authentication APIs

| 端点 | 方法 | 描述 | 认证要求 | 响应内容 |
|------|------|------|----------|----------|
| `/api/auth/github` | GET | GitHub OAuth 登录入口 | 无 | 根据客户端类型返回不同响应 |
| `/api/auth/github/callback` | GET | GitHub OAuth 回调处理 | 无 | 根据客户端类型返回不同响应 |
| `/api/auth/refresh` | POST | 刷新访问令牌 | Refresh Token | 新的访问令牌和刷新令牌 |
| `/api/auth/status` | GET | 检查当前认证状态 | 可选认证 | 用户认证状态和信息 |
| `/api/auth/token` | GET | 获取JWT Token | Session | JWT Token 和用户信息 |
| `/api/auth/profile` | GET | 获取用户详细资料 | 可选认证 | 用户完整信息和统计数据 |
| `/api/auth/logout` | POST | 用户登出 | Session | 登出成功消息 |
| `/api/auth/cleanup` | POST | 清理过期会话 | 无 | 清理结果消息 |

**认证方式说明：**
- **Session**: 浏览器自动携带的session cookie
- **JWT**: 请求头中的 `Authorization: Bearer <token>`
- **Refresh Token**: 用于刷新访问令牌的长期有效令牌
- **可选认证**: 支持Session或JWT，未认证时返回基本信息

### 📖 词汇管理 API | Vocabulary APIs

| 端点 | 方法 | 描述 | 认证要求 |
|------|------|------|----------|
| `/api/vocab/config` | GET | 获取学习配置信息 | JWT* |
| `/api/vocab` | GET | 获取用户词汇列表 | JWT* |
| `/api/vocab` | POST | 添加新词汇 | JWT* |
| `/api/vocab/:word` | GET | 获取特定词汇详情 | JWT* |
| `/api/vocab/:word` | PUT | 更新词汇信息 | JWT* |
| `/api/vocab/:word` | DELETE | 删除指定词汇 | JWT* |
| `/api/vocab/import` | POST | 批量导入词汇 | JWT* |
| `/api/vocab/export` | GET | 导出用户词汇数据 | JWT* |
| `/api/vocab/stats` | GET | 获取词汇统计信息 | JWT* |

### 📊 学习进度 API | Learning Progress APIs

| 端点 | 方法 | 描述 | 认证要求 |
|------|------|------|----------|
| `/api/review/today` | GET | 获取今日需复习词汇 | JWT* |
| `/api/review/quiz` | POST | 生成词汇练习题 | JWT* |
| `/api/review/record` | POST | 记录学习结果 | JWT* |
| `/api/review/progress` | GET | 获取今日学习进度 | JWT* |
| `/api/review/progress` | POST | 更新学习进度 | JWT* |
| `/api/review/history` | GET | 获取学习历史记录 | JWT* |
| `/api/review/stats` | GET | 获取详细学习统计 | JWT* |
| `/api/review/reset` | POST | 重置今日学习进度 | JWT* |
| `/api/review/word-history/:word` | GET | 获取单词学习记录 | JWT* |
| `/api/review/contribution` | GET | 获取用户贡献图信息 | JWT* |

### 🤖 LLM API | LLM Integration APIs

| 端点 | 方法 | 描述 | 认证要求 |
|------|------|------|----------|
| `/api/llm/conversation/create` | POST | 创建LLM对话会话 | 可选认证 |
| `/api/llm/chat/:conversationId` | POST | 发起LLM聊天对话 | 可选认证 |

### 🔧 系统信息 API | System Information APIs

| 端点 | 方法 | 描述 | 认证要求 |
|------|------|------|----------|
| `/health` | GET | 系统健康检查 | 无 |
| `/api/info` | GET | 获取API系统信息 | 无 |
| `/documentation` | GET | Swagger API文档 | 无 |

**\* 认证要求说明：**
- 当 `LEGACY_MODE=true` 时，认证为可选
- 当 `LEGACY_MODE=false` 时，必须提供有效的JWT Token
- 推荐始终使用JWT Token以确保数据安全和用户隔离

## 📋 API 使用示例 | API Usage Examples

### 🔐 认证相关 API 示例 | Authentication API Examples

#### GitHub OAuth 登录
```bash
# Web应用登录
curl "http://localhost:3000/api/auth/github?client_type=web"

# iOS应用登录
curl "http://localhost:3000/api/auth/github?client_type=ios"

# Android应用登录
curl "http://localhost:3000/api/auth/github?client_type=android"

# 桌面应用登录（带自定义回调）
curl "http://localhost:3000/api/auth/github?client_type=desktop&callback_url=http://localhost:8080/oauth-callback"

# Chrome插件登录
curl "http://localhost:3000/api/auth/github?client_type=extension"
```

#### 检查认证状态
```bash
# 使用JWT Token
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/auth/status"

# 使用Session Cookie
curl -b "session_cookie" \
     "http://localhost:3000/api/auth/status"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "legacyMode": false,
    "client_type": "web",
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "avatar_url": "https://avatars.githubusercontent.com/u/123456"
    }
  }
}
```

#### 获取用户详细资料
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/auth/profile"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "avatar_url": "https://avatars.githubusercontent.com/u/123456",
      "login_method": "github",
      "created_at": 1640995200
    },
    "stats": {
      "totalVocabularies": 150,
      "masteredVocabularies": 45,
      "totalReviews": 320
    },
    "client_type": "web"
  }
}
```

#### 获取JWT Token（移动应用专用）
```bash
curl -b "session_cookie" \
     "http://localhost:3000/api/auth/token"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": "7d",
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "avatar_url": "https://avatars.githubusercontent.com/u/123456",
      "login_method": "github"
    },
    "client_type": "ios"
  }
}
```

#### 刷新访问令牌
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "refresh_token": "your_refresh_token_here"
     }' \
     "http://localhost:3000/api/auth/refresh"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "access_token": "new_access_token_here",
    "refresh_token": "new_refresh_token_here",
    "token_type": "Bearer",
    "expires_in": "7d"
  }
}
```

#### 用户登出
```bash
curl -X POST \
     -b "session_cookie" \
     "http://localhost:3000/api/auth/logout"
```

响应示例:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### 清理过期会话（维护接口）
```bash
curl -X POST \
     "http://localhost:3000/api/auth/cleanup"
```

响应示例:
```json
{
  "success": true,
  "message": "Cleaned 5 expired sessions"
}
```

### 🔐 跨平台认证示例 | Cross-Platform Authentication Examples

#### iOS Swift 示例
```swift
import Foundation

class KumarajivaAPI {
    private let baseURL = "http://localhost:3000/api"
    private var accessToken: String?
    private var refreshToken: String?
    
    // 发起OAuth登录
    func startOAuth() {
        let oauthURL = "\(baseURL)/auth/github?client_type=ios"
        if let url = URL(string: oauthURL) {
            UIApplication.shared.open(url)
        }
    }
    
    // 处理OAuth回调
    func handleOAuthCallback(url: URL) -> Bool {
        guard url.scheme == "kumarajiva-ios" else { return false }
        
        if url.host == "oauth-callback" {
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            self.accessToken = components?.queryItems?.first(where: { $0.name == "access_token" })?.value
            self.refreshToken = components?.queryItems?.first(where: { $0.name == "refresh_token" })?.value
            
            // 保存到Keychain
            saveTokensToKeychain()
            
            return true
        }
        
        return false
    }
    
    // API请求
    func request<T: Codable>(_ endpoint: String, method: String = "GET", body: Data? = nil, responseType: T.Type) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        // 检查是否需要刷新token
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 401 {
            try await refreshAccessToken()
            
            // 重试请求
            request.setValue("Bearer \(accessToken!)", forHTTPHeaderField: "Authorization")
            let (retryData, _) = try await URLSession.shared.data(for: request)
            return try JSONDecoder().decode(responseType, from: retryData)
        }
        
        return try JSONDecoder().decode(responseType, from: data)
    }
    
    // 刷新访问令牌
    private func refreshAccessToken() async throws {
        guard let refreshToken = refreshToken else {
            throw APIError.noRefreshToken
        }
        
        let url = URL(string: "\(baseURL)/auth/refresh")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(RefreshResponse.self, from: data)
        
        self.accessToken = response.data.access_token
        self.refreshToken = response.data.refresh_token
        
        saveTokensToKeychain()
    }
}
```

#### Android Kotlin 示例
```kotlin
class KumarajivaAPI(private val context: Context) {
    private val baseURL = "http://localhost:3000/api"
    private var accessToken: String? = null
    private var refreshToken: String? = null
    
    // 发起OAuth登录
    fun startOAuth() {
        val oauthUrl = "$baseURL/auth/github?client_type=android"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(oauthUrl))
        context.startActivity(intent)
    }
    
    // 处理OAuth回调
    fun handleOAuthCallback(data: Uri): Boolean {
        if (data.scheme == "kumarajiva-android" && data.host == "oauth-callback") {
            accessToken = data.getQueryParameter("access_token")
            refreshToken = data.getQueryParameter("refresh_token")
            
            // 保存到SharedPreferences或安全存储
            saveTokens()
            
            return true
        }
        return false
    }
    
    // API请求
    suspend fun <T> request(
        endpoint: String,
        method: String = "GET",
        body: Any? = null,
        responseClass: Class<T>
    ): T = withContext(Dispatchers.IO) {
        val client = OkHttpClient()
        val gson = Gson()
        
        val requestBuilder = Request.Builder()
            .url("$baseURL$endpoint")
            .method(method, body?.let { 
                gson.toJson(it).toRequestBody("application/json".toMediaType()) 
            })
        
        accessToken?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }
        
        var response = client.newCall(requestBuilder.build()).execute()
        
        // 检查是否需要刷新token
        if (response.code == 401) {
            refreshAccessToken()
            
            // 重试请求
            requestBuilder.removeHeader("Authorization")
            requestBuilder.addHeader("Authorization", "Bearer $accessToken")
            response = client.newCall(requestBuilder.build()).execute()
        }
        
        val responseBody = response.body?.string() ?: throw Exception("Empty response")
        gson.fromJson(responseBody, responseClass)
    }
    
    // 刷新访问令牌
    private suspend fun refreshAccessToken() = withContext(Dispatchers.IO) {
        val client = OkHttpClient()
        val gson = Gson()
        
        val body = mapOf("refresh_token" to refreshToken)
        val request = Request.Builder()
            .url("$baseURL/auth/refresh")
            .post(gson.toJson(body).toRequestBody("application/json".toMediaType()))
            .build()
        
        val response = client.newCall(request).execute()
        val responseData = gson.fromJson(response.body?.string(), RefreshResponse::class.java)
        
        accessToken = responseData.data.access_token
        refreshToken = responseData.data.refresh_token
        
        saveTokens()
    }
}
```

#### JavaScript/Web 示例
```javascript
class KumarajivaAPI {
  constructor() {
    this.baseURL = 'http://localhost:3000/api';
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }
  
  // 弹窗OAuth登录
  async loginWithPopup() {
    return new Promise((resolve, reject) => {
      const popup = window.open(
        `${this.baseURL}/auth/github?client_type=web`,
        'oauth',
        'width=600,height=700'
      );
      
      const handleMessage = (event) => {
        if (event.data.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', handleMessage);
          popup.close();
          
          this.accessToken = event.data.data.token || event.data.data.access_token;
          this.refreshToken = event.data.data.refresh_token;
          
          this.saveTokens();
          resolve(event.data.data);
        } else if (event.data.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', handleMessage);
          popup.close();
          reject(new Error(event.data.message));
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // 检查弹窗是否被关闭
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          reject(new Error('Login cancelled'));
        }
      }, 1000);
    });
  }
  
  // API请求
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    if (this.accessToken) {
      config.headers.Authorization = `Bearer ${this.accessToken}`;
    }
    
    let response = await fetch(url, config);
    
    // 检查是否需要刷新token
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        
        // 重试请求
        config.headers.Authorization = `Bearer ${this.accessToken}`;
        response = await fetch(url, config);
      } catch (error) {
        // 刷新失败，需要重新登录
        this.clearTokens();
        throw new Error('Authentication required');
      }
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  // 刷新访问令牌
  async refreshAccessToken() {
    const response = await fetch(`${this.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: this.refreshToken
      })
    });
    
    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
    
    const data = await response.json();
    this.accessToken = data.data.access_token;
    this.refreshToken = data.data.refresh_token;
    
    this.saveTokens();
  }
  
  // 保存token
  saveTokens() {
    if (this.accessToken) {
      localStorage.setItem('access_token', this.accessToken);
    }
    if (this.refreshToken) {
      localStorage.setItem('refresh_token', this.refreshToken);
    }
  }
  
  // 清除token
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

// 使用示例
const api = new KumarajivaAPI();

// 登录
try {
  await api.loginWithPopup();
  console.log('Login successful');
} catch (error) {
  console.error('Login failed:', error);
}

// 获取词汇列表
try {
  const vocab = await api.request('/vocab');
  console.log('Vocabulary:', vocab);
} catch (error) {
  console.error('API request failed:', error);
}
```

### 📚 词汇管理示例 | Vocabulary Management Examples

#### 获取学习配置
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab/config"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "dailyNewWords": 20,
    "reviewIntervals": [1, 3, 7, 14, 30],
    "remainingNewWords": 15
  }
}
```

#### 获取词汇列表
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab"
```

响应示例:
```json
{
  "success": true,
  "data": [
    {
      "word": "serendipity",
      "definitions": "意外发现珍奇事物的能力",
      "pronunciation": "/ˌserənˈdɪpəti/",
      "memory_method": "seren(安静) + dip(蘸) + ity → 安静地蘸取知识的能力",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 添加新词汇
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "word": "ephemeral",
       "definitions": "短暂的，转瞬即逝的",
       "pronunciation": "/ɪˈfeməɹəl/",
       "memory_method": "e(出) + phemer(显现) + al → 显现出来就消失的"
     }' \
     "http://localhost:3000/api/vocab"
```

#### 获取特定词汇
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab/serendipity"
```

#### 更新词汇
```bash
curl -X PUT \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "definitions": "意外发现珍奇事物的能力（更新版）",
       "memory_method": "新的记忆方法"
     }' \
     "http://localhost:3000/api/vocab/serendipity"
```

#### 删除词汇
```bash
curl -X DELETE \
     -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab/serendipity"
```

#### 批量导入词汇
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "vocabularies": {
         "ubiquitous": {
           "word": "ubiquitous",
           "definitions": "无处不在的，普遍存在的",
           "pronunciation": "/juːˈbɪkwɪtəs/",
           "memory_method": "记忆方法（可选）",
           "mastered": false,
           "timestamp": 1640995200000
         },
         "paradigm": {
           "word": "paradigm",
           "definitions": "范式，模式", 
           "pronunciation": "/ˈpærədaɪm/",
           "memory_method": "记忆方法（可选）",
           "mastered": false,
           "timestamp": 1640995200000
         }
       }
     }' \
     "http://localhost:3000/api/vocab/import"
```

#### 导出词汇数据
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab/export"
```

#### 获取词汇统计
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/vocab/stats"
```

### 📊 学习进度示例 | Learning Progress Examples

#### 获取今日复习词汇
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/today"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "words": [
      {
        "word": "serendipity",
        "definitions": "意外发现珍奇事物的能力",
        "review_count": 2,
        "last_reviewed": "2024-01-14T10:30:00Z",
        "next_review": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

#### 生成练习题
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"word": "serendipity"}' \
     "http://localhost:3000/api/review/quiz"
```

#### 记录学习结果
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "word": "serendipity",
       "result": true
     }' \
     "http://localhost:3000/api/review/record"
```

#### 获取今日学习进度
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/progress"
```

#### 更新学习进度
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "newWords": 5,
       "reviewWords": 10,
       "correctAnswers": 8
     }' \
     "http://localhost:3000/api/review/progress"
```

#### 获取学习历史记录
```bash
# 基本查询
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/history"

# 带过滤条件的查询
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/history?startDate=2024-01-01&endDate=2024-01-31&word=serendipity&result=true&limit=50&offset=0"
```

#### 获取学习统计
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/stats"
```

#### 重置今日学习进度
```bash
curl -X POST \
     -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/reset"
```

#### 获取单词学习记录
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/word-history/serendipity"
```

响应示例:
```json
{
  "success": true,
  "data": [
    {
      "review_date": "2024-01-15 14:30:25",
      "review_result": 1
    },
    {
      "review_date": "2024-01-14 10:15:42",
      "review_result": 0
    },
    {
      "review_date": "2024-01-13 09:20:13",
      "review_result": 1
    }
  ]
}
```

#### 获取用户贡献图信息
```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
     "http://localhost:3000/api/review/contribution"
```

响应示例:
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-08-25",
      "total_words": 0,
      "completed": 0,
      "correct": 0
    },
    {
      "date": "2024-08-26",
      "total_words": 20,
      "completed": 20,
      "correct": 18
    },
    {
      "date": "2025-01-15",
      "total_words": 15,
      "completed": 15,
      "correct": 12
    }
  ]
}
```

### 🤖 LLM API 示例 | LLM API Examples

#### 创建LLM对话会话
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "agentId": "your_agent_id",
       "cookie": "your_session_cookie"
     }' \
     "http://localhost:3000/api/llm/conversation/create"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_123456789",
    "agentId": "your_agent_id",
    "created": "2024-01-15T10:30:00Z"
  }
}
```

#### 发起LLM聊天对话
```bash
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "请帮我解释单词 serendipity 的含义",
       "agentId": "your_agent_id",
       "model": "gpt-4",
       "cookie": "your_session_cookie"
     }' \
     "http://localhost:3000/api/llm/chat/conv_123456789"
```

### 🔧 系统信息 API 示例 | System Information API Examples

#### 系统健康检查
```bash
curl "http://localhost:3000/health"
```

响应示例:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "legacyMode": false,
  "supportedClients": ["web", "ios", "android", "desktop", "extension"],
  "features": [
    "Multi-user authentication via GitHub OAuth",
    "Cross-platform support (Web, iOS, Android, Desktop, Chrome Extension)",
    "Vocabulary management",
    "Spaced repetition learning system",
    "Learning progress tracking",
    "Individual word learning history tracking",
    "User contribution graph (GitHub-style learning heatmap)",
    "LLM integration for enhanced learning",
    "JWT + Refresh Token authentication",
    "Legacy mode for backward compatibility"
  ]
}
```

#### 获取API系统信息
```bash
curl "http://localhost:3000/api/info"
```

响应示例:
```json
{
  "success": true,
  "data": {
    "name": "Kumarajiva Vocabulary Learning API",
    "version": "1.0.0",
    "description": "A backend cloud service for vocabulary management and spaced repetition learning",
    "features": [
      "Multi-user authentication via GitHub OAuth",
      "Cross-platform support (Web, iOS, Android, Desktop, Chrome Extension)",
      "Vocabulary management",
      "Spaced repetition learning system",
      "Learning progress tracking",
      "Individual word learning history tracking",
      "User contribution graph (GitHub-style learning heatmap)",
      "LLM integration for enhanced learning",
      "JWT + Refresh Token authentication",
      "Legacy mode for backward compatibility"
    ],
    "authentication": {
      "methods": ["GitHub OAuth"],
      "legacyMode": false,
      "supportedClients": ["web", "ios", "android", "desktop", "extension"],
      "endpoints": {
        "githubLogin": "/api/auth/github",
        "githubCallback": "/api/auth/github/callback",
        "refreshToken": "/api/auth/refresh",
        "profile": "/api/auth/profile",
        "status": "/api/auth/status",
        "logout": "/api/auth/logout"
      }
    },
    "documentation": "/documentation"
  }
}
```



#### 获取今日复习词汇
```
curl -H "Authorization: Bearer xxxx" \
     "http://47.121.117.100:3000/api/review/today"

{
	"success": true,
	"data": [{
		"word": "drift off",
		"definitions": [{
			"meaning": "渐渐入睡；（思想）开小差；漂走",
			"pos": "phrase"
		}],
		"memory_method": "听着轻柔的音乐，她慢慢地drifted off进入梦乡。（Listening to the gentle music, she slowly drifted off to sleep.）",
		"pronunciation": {
			"American": "/ˈdrɪft ɔːf/",
			"British": ""
		},
		"mastered": 0,
		"timestamp": 1743328441643,
		"user_id": 2,
		"is_new": true,
		"review_count": 0
	},
	...
	]
} 
```


#### 生成练习题
```
curl -X POST \
     -H "Authorization: Bearer xxxx" \
     -H "Content-Type: application/json" \
     -d '{"word": "gem"}' \
     "http://47.121.117.100:3000/api/review/quiz"
{
	"success": true,
	"data": {
		"word": "gem",
		"phonetic": "/dʒem/",
		"audio": null,
		"definitions": [{
			"meaning": "宝石；珍品",
			"pos": "n."
		}],
		"examples": [],
		"memory_method": "这本书是文学领域的一颗gem。(This book is a gem in the field of literature.)",
		"correct_answer": "宝石；珍品",
		"options": [{
			"definition": "宝石；珍品",
			"pos": "n."
		}, {
			"definition": "给（某人）盖好被子；把……塞进去",
			"pos": "phrase"
		}, {
			"definition": "小摆设；小玩意儿",
			"pos": "n."
		}, {
			"definition": "名人；明星；名望",
			"pos": "n."
		}]
	}
}
```



#### 获取历史复习词汇
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsInR5cGUiOiJhY2Nlc3MiLCJjbGllbnRUeXBlIjoiZXh0ZW5zaW9uIiwiaWF0IjoxNzQ4OTE3MDczLCJleHAiOjE3NDk1MjE4NzN9.Azn4eZ1EjOYSKjxnLhyXw_elqfQz0D6w4YyRBCp-58s" \
     "http://47.121.117.100:3000/api/review/history?startDate=1749225600000&endDate=1749311999000&limit=100&offset=0"
{
	"success": true,
	"data": {
		"total": 30,
		"data": [{
			"word": "root causes",
			"definitions": [{
				"meaning": "根本原因",
				"pos": "n."
			}],
			"memory_method": "我们需要分析冲突的root causes。（We need to analyze the root causes of the conflict.）",
			"pronunciation": {
				"American": "/ruːt ˈkɔːzɪz/",
				"British": ""
			},
			"mastered": 0,
			"timestamp": 1742698130038,
			"user_id": 2,
			"last_review_date": 1749253519384,
			"review_count": 3,
			"correct_count": 3,
			"examples": []
		}, ...],
		"limit": 100,
		"offset": 0
	}
}
 
 
#### 访问Swagger API文档
```bash
# 在浏览器中打开
open "http://localhost:3000/documentation"

# 或使用curl获取文档页面
curl "http://localhost:3000/documentation"
```

## 🔄 兼容模式 | Legacy Mode

### 配置说明 | Configuration

- **`LEGACY_MODE=true`** (兼容模式)
  - 现有应用无需修改
  - API 支持可选认证
  - 渐进式迁移到多用户系统

- **`LEGACY_MODE=false`** (严格模式)
  - 所有 API 需要认证
  - 完整的多用户数据隔离
  - 新应用推荐设置

### 迁移指南 | Migration Guide

1. **保持兼容性运行:**
   ```env
   LEGACY_MODE=true
   ```

2. **测试新认证系统:**
   - 配置 GitHub OAuth
   - 测试用户登录流程
   - 验证 API 访问

3. **切换到严格模式:**
   ```env
   LEGACY_MODE=false
   ```

## 🚀 部署指南 | Deployment Guide

### 生产环境配置 | Production Configuration

```env
NODE_ENV=production
PORT=3000

# GitHub OAuth (生产环境)
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret
GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback

# 安全配置 (使用强密码)
SESSION_SECRET=your_very_secure_session_secret_here
JWT_SECRET=your_very_secure_jwt_secret_here

# 严格认证模式
LEGACY_MODE=false

# 跨域配置
CORS_ORIGINS=https://your-web-app.com,https://your-admin-panel.com
COOKIE_DOMAIN=your-domain.com

# 移动端URL Scheme
IOS_URL_SCHEME=your-app-ios
ANDROID_URL_SCHEME=your-app-android
```

### Docker 部署 | Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/app.js"]
```

## 🔧 故障排除 | Troubleshooting

### 常见问题 | Common Issues

1. **跨域问题 (CORS)**
   - 检查 `CORS_ORIGINS` 环境变量配置
   - 确保客户端域名在允许列表中

2. **移动端回调失败**
   - 检查 URL Scheme 配置是否正确
   - 确认环境变量 `IOS_URL_SCHEME` 和 `ANDROID_URL_SCHEME`

3. **Token 刷新失败**
   - 检查 Refresh Token 是否过期
   - 确认客户端类型检测是否正确

4. **Chrome 插件认证问题**
   - 确保插件有足够的权限访问API
   - 检查 manifest.json 中的 permissions 配置

5. **Web 前端认证问题**
   - **弹窗认证失败**: 检查浏览器弹窗设置，确保允许来自localhost的弹窗
   - **跨域消息传递错误**: 如果控制台显示 `postMessage origin mismatch` 错误，这是正常的安全机制，系统已自动处理
   - **登录状态卡住**: 如果前端显示"正在验证登录状态..."，检查网络连接和API服务器状态
   - **Token 存储问题**: 确保浏览器允许localStorage，检查隐私设置

### 调试模式 | Debug Mode

启用详细日志：
```env
NODE_ENV=development
DEBUG=kumarajiva:*
```

## 📖 更多信息 | More Information

- **API 文档**: http://localhost:3000/documentation
- **健康检查**: http://localhost:3000/health  
- **系统信息**: http://localhost:3000/api/info
- **GitHub 仓库**: [Kumarajiva-API](https://github.com/nowszhao/Kumarajiva-API)

## 📄 许可证 | License

MIT License - 详见 [LICENSE](LICENSE) 文件
