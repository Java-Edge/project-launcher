---
name: cloud-l4-browser
description: SSH 自动登录移动云 L4 服务器，通过远程服务器浏览内网网页/API。触发词：L4 登录、远程浏览、跳板机访问、移动云浏览、内网爬取。用于访问内网 Web 页面、API 接口、内部系统等场景。
---

# 移动云 L4 跳板机网页浏览 Skill

通过 sshpass + SSH 自动登录移动云 L4 服务器，利用远程服务器的 curl 工具进行网页浏览和 API 调用。

## 前置条件

- `sshpass` 已安装（已存在 `/opt/homebrew/bin/sshpass`）
- 远程服务器可达（IPv6 地址）
- curl 已安装在远程服务器上

## 服务器信息

- **主机名**: `2408:860c:5:611:3:c600:0:e77`
- **端口**: `22`
- **用户**: `root`
- **密码**: `N#@2YEl7dJwerpoi`
- **名称**: 移动云-L4平台服务-test-single

## 基本 SSH 登录命令

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22
```

## 远程网页浏览（核心功能）

通过 SSH 在远程服务器上执行 curl 获取网页内容：

### 1. 基本 GET 请求

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sL 'TARGET_URL'"
```

### 2. 带 Header 的请求

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sL -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' 'TARGET_URL'"
```

### 3. POST 请求

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sL -X POST -H 'Content-Type: application/json' -d '{\"key\":\"value\"}' 'TARGET_URL'"
```

### 4. 只获取 Response Header

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sI 'TARGET_URL'"
```

### 5. 保存页面到远程服务器

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sL 'TARGET_URL' -o /tmp/page.html && cat /tmp/page.html"
```

## 常用命令

### 执行任意远程命令

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "YOUR_COMMAND"
```

### 检查远程服务器状态

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "
  echo '=== 系统信息 ===' && uname -a &&
  echo '=== 磁盘 ===' && df -h / &&
  echo '=== 内存 ===' && free -h &&
  echo '=== 网络 ===' && ip addr show | grep inet &&
  echo '=== curl 版本 ===' && curl --version | head -1
"
```

## 使用示例

### 用户指令

```
用 L4 服务器访问 http://internal-service/api/health
```

### 执行

```bash
sshpass -p 'N#@2YEl7dJwerpoi' ssh -6 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@2408:860c:5:611:3:c600:0:e77 -p 22 "curl -sL 'http://internal-service/api/health'"
```

### 输出

```
{"status": "ok", "version": "1.0.0"}
```

## 输出格式

```
# 移动云 L4 远程访问报告

**目标**: [请求的 URL/命令]
**服务器**: 移动云-L4平台服务-test-single
**状态**: ✅ 成功 / ❌ 失败

## 返回内容

```
[返回的页面内容或命令输出]
```

## 备注

[如有错误或截断说明]
```

## 安全提醒

- 密码存储在 skill 配置中（你本地可控）
- 所有操作通过 SSH 加密传输
- 建议使用 `-o StrictHostKeyChecking=no` 避免首次连接交互
- 建议访问完成后关闭 session

## 语言与输出规则

- 输出语言与用户输入语言一致
