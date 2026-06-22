# 🎪 本地项目启动管理器 - 演示指南

## 📊 您的开发环境概览

恭喜！您的本地环境已经配置完成，包含9个丰富的项目，涵盖全栈开发：

### 🏗️ **基础设施服务**
1. **🔴 Redis 缓存服务** (端口6379)
   - 为后端应用提供高性能缓存和会话存储
   
2. **🌐 FRP 内网穿透服务** (多个代理)
   - SSH代理服务: ssh2, ssh3, ssh4, ssh
   - API服务: py-fund-api-backend, py-akshare-api-backend
   - Web服务: idle-flow-web

### ⚙️ **后端服务**
3. **☕ Education Platform** (Spring Boot)
   - 教育平台后端API服务
   - 使用ZGC垃圾收集器，高性能配置
   
4. **🐍 基金后端服务** (Flask, 端口8311)
   - 基于Python的基金数据管理API
   - 连接MySQL和Redis进行数据持久化
   
5. **📊 投资决策后端** (Spring Boot)
   - Spring Boot 3.4.3构建的投资分析服务
   - 快速启动配置优化

### 🎨 **前端应用**
6. **📚 Java 面试教程** (VuePress, 端口8081)
   - 专业的Java面试准备文档站点
   - 精美的文档展示和知识体系

7. **🖥️ Code Select 前端** (Vue CLI, 端口8082)
   - 现代化的Vue.js前端应用
   - 教育平台用户界面

8. **💰 基金项目前端** (Nuxt.js, 端口3000)
   - 基于Nuxt 3的基金投资组合跟踪
   - SSR服务端渲染，优秀的用户体验

9. **📈 投资决策前端** (Vite, 端口5173)
   - Vite构建的现代化前端应用
   - 实时投资数据展示和分析

## 🚀 三种使用方式

### 🌟 **方式一: Web管理界面 (强烈推荐)**

**🎯 特点:** 图形化界面，直观易用功能全面

**📝 启动步骤:**
```bash
# 进入项目目录
cd /Users/javaedge/soft/VSProjects/project-launcher

# 启动Web管理界面
chmod +x web-manager.sh
./web-manager.sh
```

**🌐 访问地址:** http://localhost:8090

**🎮 界面功能:**
- 📊 **统计数据**: 实时显示运行中的服务数量
- 🎛️ **控制面板**: 一键启动/停止所有服务
- 🃏 **服务卡片**: 每个服务的详细状态和端口信息
- 🔗 **快速访问**: 点击直接跳转到前端应用
- 📝 **日志查看**: 实时查看服务运行日志
- 🌈 **美观界面**: 现代化响应式设计

### ⚡ **方式二: 命令行脚本**

**🎯 特点:** 快速高效，适合脚本自动化

**📝 常用命令:**
```bash
# 启动所有服务
cd /Users/javaedge/soft/VSProjects/project-launcher
./scripts/start-all.sh

# 查看服务状态
./scripts/status.sh

# 停止所有服务
./scripts/stop-all.sh
```

**🔧 命令功能:**
- **智能启动顺序**: 先基础设施，再后端，最后前端
- **状态监控**: 检查端口占用和进程状态
- **日志管理**: 每个服务独立日志文件
- **错误处理**: 详细的启动失败诊断

### 🛠️ **方式三: 手动启动**

**🎯 特点:** 灵活控制，按需启动

**📝 手动启动示例:**
```bash
# 启动Redis
brew services start redis

# 启动FRP内网穿透
cd /Users/javaedge/soft/frp_0.34.3_darwin_amd64
./frpc -c ./frpc.ini

# 启动基金项目前端
cd /Users/javaedge/soft/VSProjects/jijin
npm run dev

# 启动Java面试教程
cd /Users/javaedge/soft/VSProjects/Java-Interview-Tutorial
npm run dev -- --port 8081
```

## 💡 推荐工作流程

### 🌅 **上班启动流程**
```bash
# 1. 启动Web管理界面
cd /Users/javaedge/soft/VSProjects/project-launcher
./web-manager.sh

# 2. 打开浏览器访问 http://localhost:8090
# 3. 点击"🚀 启动所有服务"
# 4. 开始您的开发工作
```

### 🛠️ **开发中监控**
```bash
# 实时查看日志
tail -f logs/fund-frontend.log

# 检查服务状态
./scripts/status.sh

# 通过Web界面快速跳转到应用
```

### 🏠 **下班停止流程**
```bash
# 通过Web界面点击"🛑 停止所有服务"
# 或者运行命令
./scripts/stop-all.sh
```

## 🎖️ 系统特色优势

### 🚀 **一键式管理**
- 告别手动逐个启动的繁琐
- 智能启动顺序避免依赖问题
- 批量操作提升工作效率

### 📊 **可视化监控**
- Web界面直观显示所有服务状态
- 实时日志查看，快速定位问题
- 统计数据一览无余

### 🛡️ **稳定可靠**
- 完善的错误处理和诊断
- 日志记录便于问题排查
- 进程监控确保服务健康

### 🎯 **灵活扩展**
- 支持添加新的服务配置
- 自定义启动参数和环境变量
- 可配置的端口和路径

## 🎪 立即体验

### 🏃 **3分钟上手**
1. 运行 `./web-manager.sh`
2. 访问 http://localhost:8090
3. 点击"🚀 启动所有服务"
4. 享受便捷的开发体验！

### 📚 **深入学习**
- 阅读 `README.md` 完整文档
- 查看 `QUICK_START.md` 快速入门
- 探索 `scripts/` 目录下的脚本实现

### 🔧 **定制配置**
- 修改 `server.py` 中的服务配置
- 调整 `scripts/` 中的启动参数
- 扩展Web界面功能

---

🎉 **恭喜！您现在已经掌握了完整的项目启动管理技能！**

记住最有效的启动方式：
```bash
cd /Users/javaedge/soft/VSProjects/project-launcher && ./web-manager.sh
```

打开浏览器访问 **http://localhost:8090**，开始您的便捷开发之旅！🚀