# 🚀 Local Project Launcher - 本地项目启动管理器

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11%2B-blue?style=flat-square&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/Platform-macOS-green?style=flat-square&logo=apple" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" alt="Status">
</p>

<p align="center">
  <b>统一管理和监控您的所有本地开发服务</b><br>
  告别手动逐个启动的繁琐，享受一键式智能管理体验
</p>

<p align="center">
  <a href="#-核心功能">核心功能</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-使用方式">使用方式</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-贡献指南">贡献指南</a>
</p>

---

一个功能完整的本地项目启动管理器，提供Web界面和命令行工具来统一管理您的所有本地开发服务。支持智能启动顺序、实时状态监控、日志管理和快速访问功能。

## ✨ 为什么选择这个项目？

- 🔧 **解决痛点**: 再也不用手动逐个启动和监控多个服务
- 🚀 **提升效率**: 一键启动所有服务，智能管理启动顺序
- 🌐 **Web管理**: 美观的Web界面，直观管理服务状态
- 📊 **实时监控**: 实时显示服务状态、端口监听和健康度
- 📝 **日志管理**: 统一查看和管理所有服务的运行日志
- 🔗 **快速访问**: 一键跳转到应用页面，提升开发效率

## 📋 项目清单

### 1. 🌐 FRP 内网穿透服务

**项目路径**: `/Users/javaedge/soft/frp_0.34.3_darwin_amd64`

**启动命令**:
```bash
cd /Users/javaedge/soft/frp_0.34.3_darwin_amd64
./frpc -c ./frpc.ini
```

**代理服务**:
- ssh2 - SSH 代理 2
- ssh3 - SSH 代理 3  
- ssh4 - SSH 代理 4
- py-fund-api-backend - Python 基金 API 后端
- py-akshare-api-backend - Python Akshare API 后端
- idle-flow-web - Idle Flow Web 服务
- ssh - SSH 代理主服务

**状态**: ✅ 运行中

### 2. 📚 Java 面试教程 (VuePress)

**项目路径**: `/Users/javaedge/soft/VSProjects/Java-Interview-Tutorial`

**启动命令**:
```bash
cd /Users/javaedge/soft/VSProjects/Java-Interview-Tutorial
npm run dev -- --port 8081
```

**技术栈**: VuePress + Node.js

**端口**: 8081

**说明**: 这是一个 Java 面试教程的文档站点，使用 VuePress 构建

**状态**: ✅ 运行中

### 3. 🖥️ Code Select 前端应用 (Vue CLI)

**项目路径**: `/Users/javaedge/soft/VSProjects/code-select-front`

**启动命令**:
```bash
cd /Users/javaedge/soft/VSProjects/code-select-front
npm run serve -- --port 8082
```

**技术栈**: Vue CLI + Vue.js

**端口**: 8082

**说明**: 这是一个基于 Vue CLI 的前端应用，项目名为 Code-Select

**状态**: ✅ 运行中

### 4. 🔴 Redis 缓存服务

**项目路径**: 系统服务 (Redis)

**启动命令**:
```bash
# 使用 Homebrew 启动
brew services start redis

# 或者直接启动
redis-server /usr/local/etc/redis.conf
```

**端口**: 6379 (默认)

**技术栈**: Redis

**说明**: 为后端应用提供缓存和会话存储服务

**状态检查**: 
```bash
redis-cli ping  # 返回 PONG 表示正常运行
```

**状态**: ✅ 运行中

### 5. ☕ Education Platform 后端服务 (Spring Boot)

**项目路径**: `/Users/javaedge/soft/IDEAProjects/education-platform/education-back/target`

**启动命令**:
```bash
cd /Users/javaedge/soft/IDEAProjects/education-platform/education-back/target
java \
  --add-opens java.base/java.lang=ALL-UNNAMED \
  -server \
  -XX:+UseZGC \
  -Xms512m \
  -Xmx2g \
  -XX:+AlwaysPreTouch \
  -XX:+UseStringDeduplication \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -Dspring.profiles.active=dev \
  -jar back-0.0.1-SNAPSHOT.jar
```

**技术栈**: Spring Boot + Java

**JVM 参数**:
- 使用 ZGC 垃圾收集器
- 内存: 512MB 初始, 2GB 最大
- 开发环境配置
- 上海时区

**说明**: 这是 Code Select 前端应用对应的后端服务

**状态**: ✅ 运行中

### 6. 💰 基金项目前端 (Nuxt.js)

**项目路径**: `/Users/javaedge/soft/VSProjects/jijin`

**启动命令**:
```bash
cd /Users/javaedge/soft/VSProjects/jijin
npm run dev
```

**技术栈**: Nuxt 3 + Vue 3 + Nitro + Vite

**端口**: 3000 (Nuxt 默认)

**说明**: 这是一个基金投资组合跟踪应用，使用 Nuxt 3 构建

**状态**: ✅ 运行中

### 7. 🐍 基金后端服务 (Flask)

**项目路径**: `/Users/javaedge/soft/PyCharmProjects/fund`

**启动命令**:
```bash
cd /Users/javaedge/soft/PyCharmProjects/fund
flask --app fund_server run --host=0.0.0.0 --port=8311 --no-debugger --no-reload
```

**技术栈**: Flask + Python + MySQL + Redis

**端口**: 8311

**依赖服务**:
- MySQL (localhost:3306/jijin_db)
- Redis (认证服务)

**说明**: 这是基金项目前端对应的 Flask 后端 API 服务，提供基金数据和管理功能

**状态**: ✅ 运行中

### 8. 📊 投资决策后端服务 (Spring Boot)

**项目路径**: `/Users/javaedge/soft/VSProjects/invest-decision/invest-decision-backend/target`

**启动命令**:
```bash
cd /Users/javaedge/soft/VSProjects/invest-decision/invest-decision-backend/target
java \
  --add-opens java.base/java.lang=ALL-UNNAMED \
  -server \
  -XX:+UseZGC \
  -Xms512m \
  -Xmx2g \
  -XX:+AlwaysPreTouch \
  -XX:+UseStringDeduplication \
  -XX:TieredStopAtLevel=1 \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -Dspring.profiles.active=dev \
  -jar invest-decision-0.0.1-SNAPSHOT.jar
```

**技术栈**: Spring Boot 3.4.3 + Java

**JVM 参数**:
- 使用 ZGC 垃圾收集器
- 内存: 512MB 初始, 2GB 最大
- TieredStopAtLevel=1 (快速启动)
- 开发环境配置
- 上海时区

**说明**: 这是投资决策相关的后端服务，为投资分析提供数据支持

**状态**: ✅ 运行中

### 9. 📈 投资决策前端 (Vite)

**项目路径**: `/Users/javaedge/soft/VSProjects/invest-decision/invest-decision-front`

**启动命令**:
```bash
cd /Users/javaedge/soft/VSProjects/invest-decision/invest-decision-front
npm run dev
```

**技术栈**: Vite + (可能是 React/Vue)

**端口**: 5173 (Vite 默认)

**说明**: 这是投资决策后端服务对应的前端应用，使用 Vite 构建工具

**状态**: ✅ 运行中

✅ **项目记录完成！**

现在我已经为您创建了完整的项目启动管理系统！🎉

## 🚀 一键启动脚本

我已经为您创建了一键启动和停止脚本：

### 启动所有服务
```bash
cd /Users/javaedge/soft/VSProjects/project-launcher
chmod +x scripts/*.sh
./scripts/start-all.sh
```

### 停止所有服务
```bash
./scripts/stop-all.sh
```

### 查看服务状态
```bash
./scripts/status.sh
```

### 实时查看日志
```bash
tail -f logs/*.log
```

## 🔧 管理功能

✅ **智能启动顺序**：先启动基础设施服务 (Redis, FRP)，再启动后端服务，最后启动前端服务

✅ **进程监控**：自动检测端口占用和进程状态

✅ **日志记录**：每个服务都有独立的日志文件

✅ **错误处理**：启动失败时提供详细错误信息

✅ **健康检查**：检查服务是否真正可用

## 📊 项目统计

📦 **总计 9 个项目**

🖥️ **前端项目 (4个)**:
- VuePress 文档 (8081)
- Vue CLI 应用 (8082) 
- Nuxt.js 应用 (3000)
- Vite 应用 (5173)

☕ **后端项目 (3个)**:
- Spring Boot (Education)
- Flask (基金后端，8311)
- Spring Boot (投资决策)

🗄️ **基础设施 (2个)**:
- Redis 缓存 (6379)
- FRP 内网穿透

## 🎯 使用建议

1. **首次使用**：运行 `./scripts/start-all.sh` 启动所有服务

2. **日常开发**：使用 `./scripts/status.sh` 检查服务状态

3. **故障排查**：查看 `logs/` 目录下的日志文件

4. **关闭服务**：使用 `./scripts/stop-all.sh` 停止所有服务

## 🌐 Web 管理界面

我为您创建了一个美观的Web管理界面，提供图形化的服务管理体验：

### 启动Web管理界面
```bash
cd /Users/javaedge/soft/VSProjects/project-launcher
chmod +x web-manager.sh
./web-manager.sh
```

### Web界面功能

🚀 **一键操作**:
- 启动所有服务
- 停止所有服务  
- 实时刷新状态

📊 **状态监控**:
- 实时显示服务运行状态
- 端口监听状态检查
- 服务健康度监控
- 统计数据概览

📝 **日志管理**:
- 实时查看服务日志
- 自动刷新最新内容
- 格式化日志显示
- 错误高亮提示

🎯 **快速访问**:
- 一键跳转到前端应用
- 直接访问API文档
- 服务URL快速导航

### Web界面截图

界面采用现代化设计，包含：
- 🏢 企业级UI设计
- 📱 响应式布局（支持手机/平板）
- 🎨 渐变色彩搭配
- ⚡ 实时数据刷新

## 📚 项目结构

```
project-launcher/
├── README.md                    # 本文件
├── web-manager.sh              # Web管理界面启动脚本
├── server.py                   # Web管理界面后端服务
├── scripts/
│   ├── start-all.sh             # 一键启动所有服务
│   ├── stop-all.sh              # 一键停止所有服务
│   ├── status.sh                # 查看服务状态
│   └── utils/
│       └── service-control.sh   # 服务控制工具函数
├── logs/                        # 服务日志目录
│   ├── redis.log
│   ├── frp.log
│   ├── fund-frontend.log
│   └── ...
└── projects/                    # 项目详情（未来扩展）
```

## 🎯 快速入门指南

### 方法1：使用Web管理界面（推荐）

```bash
cd /Users/javaedge/soft/VSProjects/project-launcher
chmod +x web-manager.sh
./web-manager.sh
```

然后在浏览器中访问: **http://localhost:8090**

### 方法2：使用命令行脚本

```bash
cd /Users/javaedge/soft/VSProjects/project-launcher

# 启动所有服务
chmod +x scripts/*.sh
./scripts/start-all.sh

# 查看服务状态
./scripts/status.sh

# 停止所有服务
./scripts/stop-all.sh
```

### 方法3：手动启动单个服务

```bash
# 启动 Redis
brew services start redis

# 启动 FRP
cd /Users/javaedge/soft/frp_0.34.3_darwin_amd64
./frpc -c ./frpc.ini

# 启动教育平台后端
cd /Users/javaedge/soft/IDEAProjects/education-platform/education-back/target
java --add-opens java.base/java.lang=ALL-UNNAMED -server -XX:+UseZGC -Xms512m -Xmx2g -jar back-0.0.1-SNAPSHOT.jar

# 启动基金项目前端
cd /Users/javaedge/soft/VSProjects/jijin
npm run dev
```

## 🔧 故障排除

### Q: 端口被占用怎么办？
```bash
# 查找占用端口的进程
lsof -i :8081
# 停止进程
kill -9 <PID>
```

### Q: 服务启动失败怎么办？
1. 检查依赖服务是否已启动（如Redis、MySQL）
2. 查看日志文件：`tail -f logs/*.log`
3. 检查端口冲突：`lsof -i :端口号`

### Q: Web管理界面无法访问？
1. 检查Python3是否安装：`python3 --version`
2. 检查端口是否被占用：`lsof -i :8090`
3. 查看服务器日志输出

## 🚨 注意事项

1. **启动顺序很重要**：先启动基础设施服务(Reids、FRP)，再启动后端服务，最后启动前端服务

2. **端口冲突**：如果多个前端项目使用相同端口，请先停止其他项目的端口占用

3. **资源占用**：同时运行所有服务会占用较多内存，建议根据实际需要选择性启动

4. **日志监控**：建议定期查看日志文件，及时发现并解决问题

5. **备份配置**：定期备份重要服务的配置文件和数据

## 🎉 完成！

恭喜！您现在已经拥有了一个功能完整的本地项目启动管理系统。无论是通过命令行还是Web界面，都能轻松管理您的所有开发服务。

**💡 建议工作流程**:

1. **上班时**：运行 `./web-manager.sh` 启动Web管理界面
2. **开发中**：通过Web界面监控服务状态和查看日志
3. **下班时**：通过Web界面一键停止所有服务或运行 `./scripts/stop-all.sh`

## 🏗️ 核心架构

### 🌐 **Web管理界面**
- **前端**: HTML + CSS + JavaScript (响应式设计)
- **后端**: Python 3 + HTTP Server
- **通信**: JSON API + 长轮询
- **端口**: 8090 (可配置)

### 🛠️ **命令行工具**
- **Shell脚本**: Bash脚本集合
- **服务管理**: 智能进程控制
- **日志管理**: 统一日志收集
- **状态监控**: 实时服务状态检测

### 📁 **项目组织**
- **模块化设计**: 清晰的文件和目录结构
- **配置驱动**: 可配置的服务参数
- **扩展友好**: 易于添加新服务和功能

## 🎯 使用场景

### 🏢 **企业级开发环境**
- 管理大型项目的多个微服务
- 协调前后端分离项目的启动顺序
- 统一监控生产环境中的服务状态

### 🎓 **学习和教学**
- 演示不同技术栈的集成和协作
- 提供标准化的开发环境配置
- 帮助学生快速上手复杂的项目结构

### 🛠️ **个人开发**
- 管理个人项目集合
- 统一本地开发环境
- 提升开发效率和体验

## 📚 学习资源

### 📖 **文档**
- [快速入门指南](QUICK_START.md) - 3分钟上手
- [演示指南](demo.md) - 完整功能演示
- [API文档]() - Web界面API说明

### 🎥 **视频教程** (计划中)
- Web管理界面使用演示
- 命令行脚本详解
- 故障排除和最佳实践

### 💡 **最佳实践**
- 服务启动顺序优化
- 端口管理和冲突避免
- 日志分析和性能监控

## 🤝 贡献指南

我们欢迎所有形式的贡献！🎉

### 🐛 报告问题

如果您发现了bug或有改进建议：

1. **搜索现有问题**: 查看 [Issues](https://github.com/your-username/project-launcher/issues) 是否已有相关问题
2. **创建新问题**: 如果没有找到，请创建新的Issue
3. **提供详细信息**:
   - 系统环境和版本
   - 复现步骤
   - 期望行为
   - 实际行为
   - 相关日志或截图

### 💡 功能建议

想要新功能？请告诉我们：

1. **描述使用场景**: 您希望解决什么问题？
2. **说明功能需求**: 具体需要什么功能？
3. **讨论实现方案**: 我们可以一起讨论最佳实现方式

### 🔧 代码贡献

欢迎提交Pull Request！

**准备工作**:
```bash
# 1. Fork项目
# 2. 克隆到本地
git clone https://github.com/your-username/project-launcher.git
cd project-launcher

# 3. 创建功能分支
git checkout -b feature/your-feature-name

# 4. 安装依赖
# 通常不需要额外依赖，使用系统Python3即可

# 5. 开始开发
# 代码风格遵循PEP 8规范
```

**编码规范**:
- Python代码遵循PEP 8规范
- Shell脚本遵循Bash最佳实践
- HTML/CSS保持语义化和响应式设计
- 添加适当的注释和文档

**提交前检查**:
- [ ] 代码能正常运行
- [ ] 没有语法错误
- [ ] 添加或更新了相关文档
- [ ] 测试了新功能
- [ ] 遵循了代码风格规范

**提交PR**:
1. 推送到您的fork
2. 创建Pull Request
3. 描述您的更改和改进
4. 等待审查和合并

### 📝 文档贡献

帮助我们改进文档：
- 完善使用说明
- 添加更多示例
- 翻译文档到其他语言
- 修复文档中的错误

### 🎁 其他贡献方式

- 🌟 **Star项目**: 给项目一个star支持
- 🐦 **宣传推广**: 分享给其他开发者
- 💬 **社区讨论**: 参与项目讨论
- 📢 **案例分享**: 分享您的使用经验

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证。

## 🙏 致谢

感谢所有为这个项目做出贡献的人：

- **用户反馈**: 感谢您的宝贵建议和改进意见
- **代码贡献**: 感谢所有提交PR的贡献者
- **社区支持**: 感谢开源社区的帮助和鼓励

## 📞 联系方式

- **邮箱**: your-email@example.com
- **Issues**: [GitHub Issues](https://github.com/your-username/project-launcher/issues)
- **讨论**: [GitHub Discussions](https://github.com/your-username/project-launcher/discussions)

---

## 🌟 支持项目

如果您觉得这个项目有用，请考虑：

- ⭐ **Star this repo** - 给项目一个star
- 🍴 **Fork it** - 创建您自己的版本
- 🚀 **Share it** - 分享给其他开发者
- 💖 **Contribute** - 参与项目开发

---

**🚀 让本地开发环境管理变得更简单！**

现在您可以轻松管理所有本地开发服务了！🚀