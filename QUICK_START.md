# 🚀 快速启动指南

🎯 **3分钟上手您的本地项目启动管理器**

## 🎪 方法一：Web管理界面（最推荐）

### 第一步：启动Web管理界面

```bash
# 进入项目目录
cd /Users/javaedge/soft/VSProjects/project-launcher

# 赋予执行权限
chmod +x web-manager.sh

# 启动Web管理界面
./web-manager.sh
```

### 第二步：访问管理界面

打开浏览器，访问：**http://localhost:8090**

### 第三步：开始管理

🎉 **恭喜！您现在看到的是：**

- 📊 **顶部统计**：显示运行中的服务数量
- 🎛️ **控制按钮**：一键启动/停止所有服务
- 📋 **服务卡片**：每个服务的详细状态
- 🔗 **快速访问**：点击直接跳转到应用页面
- 📝 **日志查看**：点击按钮查看实时日志

## 🎪 方法二：命令行脚本

### 快速启动所有服务

```bash
cd /Users/javaedge/soft/VSProjects/project-launcher
chmod +x scripts/*.sh
./scripts/start-all.sh
```

### 查看服务状态

```bash
./scripts/status.sh
```

### 停止所有服务

```bash
./scripts/stop-all.sh
```

## 🎪 方法三：常用操作速查

### 📱 日常开发工作流

```bash
# 上班 - 启动系统
cd /Users/javaedge/soft/VSProjects/project-launcher
./web-manager.sh

# 开发中 - 实时查看日志
tail -f logs/fund-frontend.log

# 下班 - 停止所有服务
./scripts/stop-all.sh
```

### 🐛 快速故障排查

```bash
# 检查端口占用
lsof -i :8081

# 查看服务日志
tail -f logs/fund-backend.log

# 检查Redis状态
redis-cli ping
```

### ⚡ 一键操作命令

| 操作 | 命令 |
|------|------|
| 启动Web界面 | `./web-manager.sh` |
| 启动所有服务 | `./scripts/start-all.sh` |
| 停止所有服务 | `./scripts/stop-all.sh` |
| 查看状态 | `./scripts/status.sh` |
| 查看日志 | `tail -f logs/*.log` |

## 🎪 Web界面截图预览

虽然没有实际截图，但您的Web界面将包含：

### 🏢 企业级设计
- 🎨 蓝紫色渐变背景
- 📱 响应式布局
- 💎 卡片式设计
- ⚡ 实时数据刷新

### 📊 功能分区
1. **统计面板** - 服务运行概览
2. **控制区域** - 一键操作按钮
3. **服务网格** - 按类型分组的服务卡片
4. **日志模态框** - 实时日志查看

## 🎪 常见问题速答

### Q: 第一次使用需要做什么配置吗？
A: **不需要！** 所有配置都是预设的，直接运行即可

### Q: Web界面是什么技术栈？
A: Python3 + HTTP Server + HTML/CSS/JavaScript，无需额外依赖

### Q: 可以同时启动所有服务吗？
A: **可以！** 我们的脚本会智能安排启动顺序

### Q: 如何修改服务配置？
A: 目前配置文件在 `server.py` 中，后续会提取到独立的配置文件中

## 🎪 下一步建议

### 🏆 立即体验
1. 运行 `./web-manager.sh`
2. 访问 http://localhost:8090
3. 点击"🚀 启动所有服务"
4. 享受一键管理的便利！

### 📚 深入学习
1. 阅读完整的 `README.md`
2. 查看各个脚本的实现
3. 了解服务启动顺序
4. 掌握故障排除技巧

### 🔧 定制扩展
1. 添加新的服务配置
2. 修改端口设置
3. 优化启动参数
4. 扩展Web界面功能

## 🎪 获取帮助

### 📖 文档
- `README.md` - 完整文档
- `QUICK_START.md` - 本文件
- 脚本内的注释 - 详细说明

### 🐛 故障排查
- 查看 `logs/` 目录的日志文件
- 使用 `./scripts/status.sh` 检查服务状态
- 参考 `README.md` 中的故障排除章节

### 💡 寻求帮助
如果遇到问题，您可以：
1. 查看日志文件定位问题
2. 检查端口占用情况
3. 确保依赖服务已正确安装
4. 重新启动相关服务

---

🎉 **恭喜！您现在已经是本地项目启动管理专家了！**

记住最有效的启动方式：
```bash
cd /Users/javaedge/soft/VSProjects/project-launcher && ./web-manager.sh
```

然后在浏览器中打开 **http://localhost:8090**，开始您的便捷开发之旅！ 🚀