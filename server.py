#!/usr/bin/env python3

import os
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import signal
import sys

# 项目根目录
PROJECT_ROOT = Path(__file__).parent
LOGS_DIR = PROJECT_ROOT / "logs"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

# 服务配置
SERVICES = {
    "redis": {
        "name": "🔴 Redis 缓存服务",
        "type": "infrastructure",
        "port": 6379,
        "status_cmd": "brew services list | grep redis | grep started",
        "log_file": "redis.log",
        "url": None
    },
    "frp": {
        "name": "🌐 FRP 内网穿透服务",
        "type": "infrastructure", 
        "port": None,
        "status_cmd": "ps aux | grep frpc | grep -v grep",
        "log_file": "frp.log",
        "url": None
    },
    "local-control": {
        "name": "📡 Local Control 服务器管理台",
        "type": "management",
        "port": 3457,
        "status_cmd": "ps aux | grep local-control.*npm | grep -v grep",
        "log_file": "local-control.log",
        "url": "http://localhost:3457"
    },
    "education-backend": {
        "name": "☕ Education Platform 后端",
        "type": "backend",
        "port": None,
        "status_cmd": "ps aux | grep back-0.0.1-SNAPSHOT.jar | grep -v grep",
        "log_file": "education-backend.log",
        "url": None
    },
    "fund-backend": {
        "name": "🐍 基金后端服务 (Flask)",
        "type": "backend",
        "port": 8311,
        "status_cmd": "ps aux | grep flask.*fund_server | grep -v grep",
        "log_file": "fund-backend.log",
        "url": "http://localhost:8311"
    },
    "invest-decision-backend": {
        "name": "📊 投资决策后端",
        "type": "backend", 
        "port": None,
        "status_cmd": "ps aux | grep invest-decision-0.0.1-SNAPSHOT.jar | grep -v grep",
        "log_file": "invest-decision-backend.log",
        "url": None
    },
    "java-interview": {
        "name": "📚 Java 面试教程",
        "type": "frontend",
        "port": 8081,
        "status_cmd": "ps aux | grep Java-Interview-Tutorial.*npm | grep -v grep",
        "log_file": "java-interview.log",
        "url": "http://localhost:8081"
    },
    "code-select": {
        "name": "🖥️ Code Select 前端",
        "type": "frontend",
        "port": 8082,
        "status_cmd": "ps aux | grep code-select-front.*npm | grep -v grep",
        "log_file": "code-select.log",
        "url": "http://localhost:8082"
    },
    "fund-frontend": {
        "name": "💰 基金项目前端 (Nuxt)",
        "type": "frontend",
        "port": 3000,
        "status_cmd": "ps aux | grep jijin.*npm | grep -v grep",
        "log_file": "fund-frontend.log",
        "url": "http://localhost:3000"
    },
    "invest-decision-frontend": {
        "name": "📈 投资决策前端 (Vite)",
        "type": "frontend",
        "port": 5173,
        "status_cmd": "ps aux | grep invest-decision-frontend.*npm | grep -v grep",
        "log_file": "invest-decision-frontend.log",
        "url": "http://localhost:5173"
    }
}

class ServiceManager:
    def __init__(self):
        self.services = SERVICES
        
    def check_service_status(self, service_id):
        """检查服务状态"""
        service = self.services[service_id]
        try:
            result = subprocess.run(
                service["status_cmd"], 
                shell=True, 
                capture_output=True, 
                text=True
            )
            is_running = result.returncode == 0
            
            port_listening = None
            if service.get("port"):
                result = subprocess.run(
                    f"lsof -i :{service['port']}",
                    shell=True,
                    capture_output=True
                )
                port_listening = result.returncode == 0
                # ps grep patterns are brittle (e.g. dev servers spawned without "npm"
                # in their command line), so trust an actual listening port as well
                is_running = is_running or port_listening
                
            return {
                "running": is_running,
                "port_listening": port_listening,
                "port": service.get("port"),
                "type": service.get("type")
            }
        except Exception as e:
            return {
                "running": False,
                "port_listening": False,
                "port": service.get("port"),
                "type": service.get("type"),
                "error": str(e)
            }
            
    def get_log_content(self, service_id, lines=50):
        """获取日志内容"""
        service = self.services[service_id]
        log_file = LOGS_DIR / service["log_file"]
        
        if not log_file.exists():
            return "📄 日志文件不存在"
            
        try:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines_list = content.strip().split('\n')[-lines:]
                return '\n'.join(lines_list) if lines_list else "📄 暂无日志内容"
        except Exception as e:
            return f"❌ 读取日志失败: {str(e)}"
            
    def get_all_status(self):
        """获取所有服务状态"""
        status = {}
        for service_id in self.services:
            status[service_id] = self.check_service_status(service_id)
        return status
        
    def execute_script(self, script_name):
        """执行管理脚本"""
        script_path = SCRIPTS_DIR / script_name
        if not script_path.exists():
            return False, f"脚本不存在: {script_name}"
            
        try:
            result = subprocess.run(
                ["bash", str(script_path)],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True
            )
            return result.returncode == 0, result.stdout + result.stderr
        except Exception as e:
            return False, str(e)

class WebHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.service_manager = ServiceManager()
        super().__init__(*args, **kwargs)
        
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == "/":
            self.send_main_page()
        elif parsed_path.path == "/status":
            self.send_status_json()
        elif parsed_path.path == "/logs":
            self.send_logs_json()
        elif parsed_path.path.startswith("/static/"):
            self.send_static_file(parsed_path.path[8:])
        else:
            self.send_404()
            
    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == "/execute":
            self.execute_script()
        else:
            self.send_404()
            
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
        
    def send_html(self, html, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
        
    def send_static_file(self, filename):
        """发送静态文件"""
        static_files = {
            'style.css': self.get_css(),
            'script.js': self.get_js()
        }
        
        if filename in static_files:
            content_type = 'text/css' if filename.endswith('.css') else 'application/javascript'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()
            self.wfile.write(static_files[filename].encode('utf-8'))
        else:
            self.send_404()
            
    def send_status_json(self):
        status = self.service_manager.get_all_status()
        self.send_json(status)
        
    def send_logs_json(self):
        params = parse_qs(urlparse(self.path).query)
        service_id = params.get('service', [''])[0]
        
        if service_id in self.service_manager.services:
            log_content = self.service_manager.get_log_content(service_id)
            self.send_json({
                'log_content': log_content,
                'service_name': self.service_manager.services[service_id]['name']
            })
        else:
            self.send_json({'error': '服务不存在'})
            
    def execute_script(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        script_name = data.get('script', '')
        
        if script_name:
            success, message = self.service_manager.execute_script(script_name)
            self.send_json({
                'success': success,
                'message': message
            })
        else:
            self.send_json({'success': False, 'message': '未指定脚本'})
            
    def send_404(self):
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'404 Not Found')
        
    def get_css(self):
        return '''
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        
        .header p { opacity: 0.9; font-size: 1.1em; }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        
        .controls {
            padding: 30px;
            background: white;
            border-bottom: 1px solid #eee;
        }
        
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            margin-right: 10px;
            margin-bottom: 10px;
            transition: all 0.3s ease;
        }
        
        .btn-primary { background: #667eea; color: white; }
        .btn-danger { background: #ff6b6b; color: white; }
        .btn-success { background: #51cf66; color: white; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        
        .services { padding: 30px; }
        
        .service-group { margin-bottom: 30px; }
        
        .group-title {
            font-size: 1.3em;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        .service-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        
        .service-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            border-left: 4px solid #ccc;
        }
        
        .service-card.running { border-left-color: #51cf66; }
        .service-card.stopped { border-left-color: #ff6b6b; }
        
        .service-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .service-name {
            font-size: 1.1em;
            font-weight: bold;
            color: #333;
        }
        
        .status-badge {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
        }
        
        .status-running { background: #d4edda; color: #155724; }
        .status-stopped { background: #f8d7da; color: #721c24; }
        
        .service-info { margin-bottom: 15px; }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 0.9em;
        }
        
        .info-label { color: #666; }
        .info-value { font-weight: 500; }
        
        .service-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .service-actions .btn {
            padding: 8px 16px;
            font-size: 0.8em;
            margin: 0;
        }
        
        .log-container {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 5px;
            padding: 15px;
            height: 400px;
            overflow-y: auto;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8em;
            line-height: 1.4;
            margin-top: 15px;
            white-space: pre-wrap;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
        }
        
        .modal-content {
            background: white;
            margin: 50px auto;
            padding: 30px;
            border-radius: 10px;
            max-width: 900px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }
        
        .close-btn {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
        }
        
        .refresh-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            color: #667eea;
        }
        
        .timestamp {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
        '''
        
    def get_js(self):
        return '''
        let currentService = null;
        let refreshInterval = null;
        
        function updateDashboard() {
            fetch('/status')
                .then(response => response.json())
                .then(data => {
                    updateStats(data);
                })
                .catch(error => console.error('更新失败:', error));
        }
        
        function updateStats(data) {
            const running = Object.values(data).filter(s => s.running).length;
            const total = Object.keys(data).length;
            const frontend = Object.values(data).filter(s => s.type === 'frontend' && s.running).length;
            const backend = Object.values(data).filter(s => s.type === 'backend' && s.running).length;
            
            document.getElementById('running-count').textContent = running;
            document.getElementById('total-count').textContent = total;
            document.getElementById('frontend-count').textContent = frontend;
            document.getElementById('backend-count').textContent = backend;
            
            document.getElementById('last-update').textContent = new Date().toLocaleString();
        }
        
        function showLogs(serviceId) {
            currentService = serviceId;
            refreshLogs();
            document.getElementById('logModal').style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('logModal').style.display = 'none';
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }
        
        function refreshLogs() {
            if (!currentService) return;
            
            fetch(`/logs?service=${currentService}`)
                .then(response => response.json())
                .then(data => {
                    document.getElementById('logContent').textContent = data.log_content;
                    document.getElementById('serviceTitle').textContent = data.service_name;
                    
                    const logContainer = document.getElementById('logContent');
                    logContainer.scrollTop = logContainer.scrollHeight;
                })
                .catch(error => console.error('获取日志失败:', error));
        }
        
        function executeScript(scriptName) {
            if (!confirm(`确定要执行 ${scriptName} 吗？`)) return;
            
            fetch('/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: scriptName })
            })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                if (data.success) {
                    updateDashboard();
                }
            })
            .catch(error => alert('执行失败: ' + error));
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            updateDashboard();
            setInterval(updateDashboard, 30000);
            
            window.onclick = function(event) {
                const modal = document.getElementById('logModal');
                if (event.target === modal) {
                    closeModal();
                }
            }
        });
        '''
        
    def send_main_page(self):
        html = '''
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🚀 本地项目启动管理器</title>
            <link rel="stylesheet" href="/static/style.css">
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 本地项目启动管理器</h1>
                    <p>统一管理您的所有本地开发服务</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number" id="running-count">0</div>
                        <div class="stat-label">运行中</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="total-count">9</div>
                        <div class="stat-label">总服务数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="frontend-count">0</div>
                        <div class="stat-label">前端应用</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="backend-count">0</div>
                        <div class="stat-label">后端服务</div>
                    </div>
                </div>
                
                <div class="controls">
                    <button onclick="executeScript('start-all.sh')" class="btn btn-success">🚀 启动所有服务</button>
                    <button onclick="executeScript('stop-all.sh')" class="btn btn-danger">🛑 停止所有服务</button>
                    <button onclick="updateDashboard()" class="btn btn-primary">🔄 刷新状态</button>
                </div>
                
                <div class="services">
                    <div class="service-group">
                        <div class="group-title">🏗️ 基础设施服务</div>
                        <div class="service-grid">
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">🔴 Redis 缓存服务</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">基础设施</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">6379 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <button onclick="showLogs('redis')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">🌐 FRP 内网穿透服务</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">基础设施</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <button onclick="showLogs('frp')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="service-group">
                        <div class="group-title">⚙️ 后端服务</div>
                        <div class="service-grid">
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">☕ Education Platform 后端</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">后端服务</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <button onclick="showLogs('education-backend')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">🐍 基金后端服务 (Flask)</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">后端服务</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">8311 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <a href="http://localhost:8311" target="_blank" class="btn btn-success">访问应用</a>
                                    <button onclick="showLogs('fund-backend')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">📊 投资决策后端</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">后端服务</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <button onclick="showLogs('invest-decision-backend')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="service-group">
                        <div class="group-title">🎨 前端应用</div>
                        <div class="service-grid">
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">📚 Java 面试教程</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">前端应用</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">8081 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <a href="http://localhost:8081" target="_blank" class="btn btn-success">访问应用</a>
                                    <button onclick="showLogs('java-interview')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">🖥️ Code Select 前端</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">前端应用</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">8082 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <a href="http://localhost:8082" target="_blank" class="btn btn-success">访问应用</a>
                                    <button onclick="showLogs('code-select')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">💰 基金项目前端 (Nuxt)</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">前端应用</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">3000 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <a href="http://localhost:3000" target="_blank" class="btn btn-success">访问应用</a>
                                    <button onclick="showLogs('fund-frontend')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                            
                            <div class="service-card">
                                <div class="service-header">
                                    <div class="service-name">📈 投资决策前端 (Vite)</div>
                                    <div class="status-badge status-running">运行中</div>
                                </div>
                                <div class="service-info">
                                    <div class="info-item">
                                        <span class="info-label">类型:</span>
                                        <span class="info-value">前端应用</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">端口:</span>
                                        <span class="info-value">5173 (监听中)</span>
                                    </div>
                                </div>
                                <div class="service-actions">
                                    <a href="http://localhost:5173" target="_blank" class="btn btn-success">访问应用</a>
                                    <button onclick="showLogs('invest-decision-frontend')" class="btn btn-primary">查看日志</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="timestamp">
                    最后更新: <span id="last-update">加载中...</span>
                </div>
            </div>
            
            <!-- 日志模态框 -->
            <div id="logModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="serviceTitle">服务日志</h2>
                        <div>
                            <button onclick="refreshLogs()" class="refresh-btn">🔄</button>
                            <button onclick="closeModal()" class="close-btn">&times;</button>
                        </div>
                    </div>
                    <div class="log-container">
                        <pre id="logContent">选择一个服务来查看日志...</pre>
                    </div>
                </div>
            </div>
            
            <script src="/static/script.js"></script>
        </body>
        </html>
        '''
        
        self.send_html(html)

def run_server(port=8090):
    """启动Web服务器"""
    try:
        server = HTTPServer(('localhost', port), WebHandler)
        print(f"🚀 Web管理界面启动在 http://localhost:{port}")
        print(f"📊 管理界面包含以下功能:")
        print(f"   🔍 实时查看服务状态")
        print(f"   📝 查看服务日志")
        print(f"   🌐 快速跳转到应用页面")
        print(f"   🚀 一键启动/停止服务")
        print(f"")
        print(f"💡 提示: 按 Ctrl+C 停止服务器")
        
        def signal_handler(sig, frame):
            print("\n🛑 服务器正在停止...")
            server.shutdown()
            sys.exit(0)
            
        signal.signal(signal.SIGINT, signal_handler)
        server.serve_forever()
        
    except Exception as e:
        print(f"❌ 服务器启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    run_server(port)