# 📋 变更日志

所有项目的显著变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
并且这个项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

### ✨ 新增：projects/md-publish（MD 多平台同步台）
- 零依赖纯前端控制台（端口 8095）+ 本地执行桥 `bridge.mjs`（只监听 127.0.0.1:8096）+ 确定性发文脚本 `playbooks/<平台>.js`
- 页面点「一键同步为草稿 / 一键直接发布」即真执行：桥把 playbook 喂给 ego-browser，全程不经过任何 AI/智能体平台，不限次数
- 已实测：博客园（草稿 + **直发成功**，回传对外链接）、掘金、CSDN、头条号（草稿）；51CTO 脚本就绪，待 Ego Lite 登录该站后验证
- 管控台新增服务 `md-publish`（bash start.sh 会连执行桥一起拉起）与 `md-publish-bridge`

## [2.0.0] - 2026-10-05

### 🏗️ 架构重构：单一事实源

#### ✨ 新增
- **config/services.json**: 服务的单一事实源（24 个服务、8 个分组），管控台与全部脚本共用；改动后面板自动重载
- **单服务管理**: `./scripts/start-service.sh <id>` / `stop-service.sh <id>`，面板卡片新增"停止"按钮
- **管控台自管理**: 面板注册为服务（id: panel），start-all 会确保其运行；stop-all 默认不停面板（`--panel` 连面板一起停）
- **性能**: /status 并行检查 + 5 秒缓存，2.6s → 首次 0.64s / 缓存命中 ~0.001s；HTTP 服务改多线程
- **前端落盘**: CSS/JS/HTML 移入 static/ 与 templates/，改样式刷新即生效
- **服务覆盖补齐**: mongodb、openclaw、px0、muse-proxy 等原本只存在于脚本中的服务全部纳入清单

#### 🔧 变更
- start-all/stop-all/status.sh 改为读取 services.json 的薄壳（222/180/245 行 → 32/23/44 行）
- server.py 从 1095 行瘦身至 385 行
- scripts/utils/service-control.sh 重写为真正的共享函数库（JSON→TSV 查询、按端口/进程名/命令三种停止模式）
- stop-all 不再按 "grok" 关键字误杀交互式会话

#### 🗑️ 移除
- 7 个被 JSON 配置取代的单服务脚本（start-mongodb、start-px0、start-openclaw、start-test-service、start-python-agent、stop-mongodb、stop-muse）
- 根目录历史文件归档至 archive/（demo、db_inventory 报告、verify.sh 等）

## [1.0.0] - 2026-06-22

### 🎉 首次发布

#### ✨ 新增功能
- **Web管理界面**: 美观的响应式Web界面，支持实时服务状态监控
- **命令行工具**: 完整的Shell脚本集合，支持一键启动/停止所有服务
- **服务管理**: 支持9个不同类型的项目管理（前端、后端、基础设施）
- **智能启动**: 自动按依赖顺序启动服务，避免启动冲突
- **日志管理**: 统一日志收集和实时查看功能
- **状态监控**: 实时检测服务运行状态和端口监听情况
- **快速访问**: 一键跳转到应用页面的便捷功能

#### 🔧 项目结构
- 初始化项目目录结构和组织架构
- 创建核心文件：`server.py`（Web服务器）
- 创建管理脚本：`start-all.sh`, `stop-all.sh`, `status.sh`
- 创建Web管理界面启动器：`web-manager.sh`
- 创建工具函数库：`scripts/utils/service-control.sh`

#### 📁 支持的服务类型
- 🔴 Redis 缓存服务 (基础设施)
- 🌐 FRP 内网穿透服务 (基础设施)
- ☕ Education Platform 后端服务 (Spring Boot)
- 🐍 基金后端服务 (Flask)
- 📊 投资决策后端服务 (Spring Boot)
- 📚 Java 面试教程 (VuePress)
- 🖥️ Code Select 前端应用 (Vue CLI)
- 💰 基金项目前端 (Nuxt.js)
- 📈 投资决策前端 (Vite)

#### 🎨 界面特性
- 现代化蓝紫色渐变设计
- 响应式布局（支持手机、平板、桌面）
- 实时统计数据展示
- 交互式服务卡片
- 模态框日志查看器
- 一键操作按钮群

#### 📚 文档
- 创建完整的项目说明文档：`README.md`
- 编写快速入门指南：`QUICK_START.md`
- 制作演示文档：`demo.md`
- 添加变更日志：`CHANGELOG.md`
- 配置Git忽略文件：`.gitignore`
- 添加MIT许可证：`LICENSE`

#### 🛠️ 开发特性
- 支持智能错误处理和诊断
- 内置服务健康度检查
- 自动端口冲突检测
- 详细的启动失败日志
- 批处理脚本自动化
- 模块化可扩展架构

#### 🔍 监控功能
- 服务进程状态监控
- 端口监听状态检测
- 日志实时流查看
- 统计数据可视化
- 一键服务重启

### 🗑️ 移除功能

（初次发布，无移除功能）

### 🔄 变更功能

（初次发布，无变更功能）

### 🐛 修复问题

（初次发布，无修复问题）

### ⚠️ 已知问题

- Web界面中的某些前端跳转链接可能需要根据实际端口调整
- 部分服务的健康检查功能需要进一步完善
- 跨平台兼容性主要针对macOS，其他系统可能需要适配

### 🔮 后续计划

- [ ] 支持Windows和Linux系统
- [ ] 添加服务配置文件(JSON/YAML格式)
- [ ] 实现服务自动修复功能
- [ ] 添加更多的监控图表和指标
- [ ] 支持服务依赖关系可视化
- [ ] 实现在线配置管理界面
- [ ] 添加通知和告警功能
- [ ] 支持Docker容器服务管理
- [ ] 实现多用户权限管理
- [ ] 添加API接口文档和测试用例

---

## 🔢 版本号说明

- **主版本号**: 重大功能更新或不兼容的API更改
- **次版本号**: 向后兼容的功能新增
- **修订号**: 向后兼容的问题修正

## 🏷️ 版本标签

- `v1.0.0` - 稳定版本，适合生产环境使用
- `v0.x.x` - 开发版本，功能可能频繁变更