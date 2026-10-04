#!/bin/bash

# 🎪 项目启动管理器演示

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# ANSI颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

clear

echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║${NC} ${GREEN}🚀 本地项目启动管理器 - 演示${NC}${PURPLE}                                    ║${NC}"
echo -e "${PURPLE}║${NC} 统一管理和监控您的所有本地开发服务${NC}${PURPLE}                          ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╚${NC}"
echo ""

sleep 1

echo -e "${BLUE}📊 您的开发环境包含以下9个项目:${NC}"
echo ""

sleep 0.5
echo -e "${YELLOW}🏗️  基础设施服务:${NC}"
echo -e "   1. 🔴 ${GREEN}Redis 缓存服务${NC} (端口6379)"
echo -e "   2. 🌐 ${GREEN}FRP 内网穿透${NC} (多个代理服务)"
echo ""

sleep 0.5
echo -e "${YELLOW}⚙️  后端服务:${NC}"
echo -e "   3. ☕ ${GREEN}Education Platform${NC} (Spring Boot)"
echo -e "   4. 🐍 ${GREEN}基金后端服务${NC} (Flask, 端口8311)"
echo -e "   5. 📊 ${GREEN}投资决策后端${NC} (Spring Boot)"
echo ""

sleep 0.5
echo -e "${YELLOW}🎨 前端应用:${NC}"
echo -e "   6. 📚 ${GREEN}Java 面试教程${NC} (VuePress, 端口8081)"
echo -e "   7. 🖥️ ${GREEN}Code Select${NC} (Vue CLI, 端口8082)"
echo -e "   8. 💰 ${GREEN}基金项目前端${NC} (Nuxt.js, 端口3000)"
echo -e "   9. 📈 ${GREEN}投资决策前端${NC} (Vite, 端口5173)"
echo ""

sleep 1
echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║${NC} ${GREEN}💡 三种使用方式${NC}${PURPLE}                                              ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╚${NC}"
echo ""

sleep 1
echo -e "${BLUE}方法一: ${GREEN}Web管理界面 (最推荐)${NC}"
echo "─────────────────────────────────────────────────"
echo -e "${YELLOW}启动命令:${NC}"
echo "   cd /Users/javaedge/soft/VSProjects/project-launcher"
echo "   ./web-manager.sh"
echo ""
echo -e "${YELLOW}访问地址:${NC} ${GREEN}http://localhost:8090${NC}"
echo -e "${YELLOW}界面功能:${NC}"
echo "   🔍 实时服务状态监控"
echo "   📝 服务日志查看"
echo "   🚀 一键启动/停止服务"
echo "   🎯 快速跳转到应用页面"
echo ""

sleep 2
echo -e "${BLUE}方法二: ${GREEN}命令行脚本${NC}"
echo "─────────────────────────────────────────────────"
echo -e "${YELLOW}启动所有服务:${NC}"
echo "   ./scripts/start-all.sh"
echo ""
echo -e "${YELLOW}查看服务状态:${NC}"
echo "   ./scripts/status.sh"
echo ""
echo -e "${YELLOW}停止所有服务:${NC