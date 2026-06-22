#!/bin/bash

# 🔧 服务控制工具函数
# 可被其他脚本引用

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 等待服务启动
wait_for_service() {
    local name=$1
    local max_attempts=$2
    local check_command=$3
    
    log_info "等待 $name 启动..."
    
    for i in $(seq 1 $max_attempts); do
        if eval "$check_command" > /dev/null 2>&1; then
            log_success "$name 启动成功"
            return 0
        fi
        sleep 2
    done
    
    log_error "$name 启动超时"
    return 1
}

# 检查端口是否可用
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 获取进程 PID
get_pid() {
    local pattern=$1
    ps aux | grep "$pattern" | grep -v grep | awk '{print $2}'
}

# 安全停止进程
safe_stop() {
    local pid=$1
    local process_name=$2
    
    if [ -z "$pid" ]; then
        return 0
    fi
    
    log_info "停止 $process_name (PID: $pid)"
    
    # 先尝试正常停止
    if kill $pid 2>/dev/null; then
        # 等待几秒
        sleep 3
        
        # 检查是否还在运行
        if kill -0 $pid 2>/dev/null; then
            log_warn "进程 $pid 仍在运行，强制终止"
            kill -9 $pid 2>/dev/null || true
        fi
        
        log_success "$process_name 已停止"
    else
        log_error "无法停止 $process_name"
    fi
}

# 检查服务健康状态
check_service_health() {
    local name=$1
    local health_check_cmd=$2
    
    if eval "$health_check_cmd" > /dev/null 2>&1; then
        echo -e "   ❤️  健康检查: ${GREEN}✅ 正常${NC}"
    else
        echo -e "   ❤️  健康检查: ${RED}❌ 异常${NC}"
    fi
}