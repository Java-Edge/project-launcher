// 配置驱动渲染：卡片/分组/统计全部由 /api/config + /status 生成
let CONFIG = null;
let currentService = null;
let refreshInterval = null;

async function fetchJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function loadConfig() {
    try {
        CONFIG = await fetchJSON('/api/config');
        renderGroups();
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

function renderGroups() {
    const container = document.getElementById('services');
    container.innerHTML = CONFIG.groups.map(group => `
        <div class="service-group">
            <div class="group-title">
                <span>${group.title}</span>
                ${group.chain ? `<div class="chain-badge" id="chain-${group.id}">⏳ 检查中</div>` : ''}
            </div>
            <div class="service-grid">
                ${CONFIG.services.filter(s => s.group === group.id).map(renderCard).join('\n')}
            </div>
        </div>`).join('\n');
}

function renderCard(service) {
    const portInfo = service.port ? `
        <div class="info-item">
            <span class="info-label">端口:</span>
            <span class="info-value" id="port-value-${service.id}">${service.port} (检查中)</span>
        </div>` : '';

    const startBtn = service.can_start
        ? `<button onclick="startService('${service.id}')" class="btn btn-success" id="start-${service.id}">🚀 启动</button>` : '';
    const stopBtn = service.can_stop
        ? `<button onclick="stopService('${service.id}')" class="btn btn-danger" id="stop-${service.id}">🛑 停止</button>` : '';
    const visitBtn = service.url
        ? `<a href="${service.url}" target="_blank" class="btn btn-primary" id="visit-${service.id}" style="display:none">访问应用</a>` : '';

    return `
        <div class="service-card stopped" id="card-${service.id}">
            <div class="service-header">
                <div class="service-name">${service.name}</div>
                <div class="status-badge status-checking" id="badge-${service.id}">⏳ 检查中</div>
            </div>
            <div class="service-info">
                <div class="info-item">
                    <span class="info-label">类型:</span>
                    <span class="info-value">${CONFIG.type_labels[service.type] || service.type}</span>
                </div>${portInfo}
            </div>
            <div class="service-actions">
                ${startBtn}${stopBtn}${visitBtn}<button onclick="showLogs('${service.id}')" class="btn btn-primary">查看日志</button>
            </div>
        </div>`;
}

async function updateDashboard() {
    try {
        const data = await fetchJSON('/status');
        updateStats(data);
        updateServiceCards(data);
        updateChainBadges(data);
        document.getElementById('last-update').textContent = new Date().toLocaleString();
    } catch (error) {
        console.error('更新失败:', error);
    }
}

function updateStats(data) {
    const statuses = Object.values(data);
    document.getElementById('running-count').textContent = statuses.filter(s => s.running).length;
    document.getElementById('total-count').textContent = statuses.length;
    document.getElementById('frontend-count').textContent = statuses.filter(s => s.type === 'frontend' && s.running).length;
    document.getElementById('backend-count').textContent = statuses.filter(s => s.type === 'backend' && s.running).length;
}

function updateServiceCards(data) {
    for (const [serviceId, status] of Object.entries(data)) {
        const card = document.getElementById(`card-${serviceId}`);
        const badge = document.getElementById(`badge-${serviceId}`);
        if (!card || !badge) continue;

        card.classList.toggle('running', status.running);
        card.classList.toggle('stopped', !status.running);
        badge.classList.toggle('status-running', status.running);
        badge.classList.toggle('status-stopped', !status.running);
        badge.classList.remove('status-checking');
        badge.textContent = status.running ? '运行中' : '未运行';

        const visitBtn = document.getElementById(`visit-${serviceId}`);
        if (visitBtn) visitBtn.style.display = status.running ? 'inline-block' : 'none';

        const portValue = document.getElementById(`port-value-${serviceId}`);
        if (portValue && status.port) {
            portValue.textContent = `${status.port} (${status.port_listening ? '监听中' : '未监听'})`;
        }
    }
}

function updateChainBadges(data) {
    for (const group of CONFIG.groups) {
        if (!group.chain) continue;
        const chainEl = document.getElementById(`chain-${group.id}`);
        if (!chainEl) continue;

        const serviceIds = CONFIG.services.filter(s => s.group === group.id).map(s => s.id);
        const runningCount = serviceIds.filter(id => data[id] && data[id].running).length;
        chainEl.classList.remove('chain-ok', 'chain-warn', 'chain-down');

        if (runningCount === serviceIds.length) {
            chainEl.textContent = '🟢 全链路正常';
            chainEl.classList.add('chain-ok');
        } else if (runningCount === 0) {
            chainEl.textContent = '🔴 全部离线';
            chainEl.classList.add('chain-down');
        } else {
            chainEl.textContent = '🟡 部分异常';
            chainEl.classList.add('chain-warn');
        }
    }
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

async function refreshLogs() {
    if (!currentService) return;
    try {
        const data = await fetchJSON(`/logs?service=${currentService}`);
        const logContainer = document.getElementById('logContent');
        document.getElementById('serviceTitle').textContent = data.service_name;
        logContainer.textContent = data.log_content;
        logContainer.scrollTop = logContainer.scrollHeight;
    } catch (error) {
        console.error('获取日志失败:', error);
    }
}

function setButtonState(serviceId, text, disabled) {
    const btn = document.getElementById(`start-${serviceId}`);
    if (btn) {
        btn.textContent = text;
        btn.disabled = disabled;
    }
}

async function startService(serviceId) {
    const service = CONFIG.services.find(s => s.id === serviceId);
    if (!service) return;
    setButtonState(serviceId, '⏳ 启动中...', true);

    try {
        const body = service.terminal_script
            ? { script: service.terminal_script }
            : { service: serviceId };
        const data = await fetchJSON(service.terminal_script ? '/execute' : '/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!data.success) {
            alert('启动失败: ' + data.message);
        }
        setButtonState(serviceId, '⏳ 等待就绪...', true);
        // 服务端口就绪需要时间，轮询几次再恢复按钮
        for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 2500));
            await updateDashboard();
        }
    } catch (error) {
        alert('启动失败: ' + error);
    } finally {
        setButtonState(serviceId, '🚀 启动', false);
    }
}

async function stopService(serviceId) {
    const btn = document.getElementById(`stop-${serviceId}`);
    if (btn) { btn.textContent = '⏳ 停止中...'; btn.disabled = true; }
    try {
        const data = await fetchJSON('/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service: serviceId })
        });
        if (!data.success) alert('停止失败: ' + data.message);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await updateDashboard();
    } catch (error) {
        alert('停止失败: ' + error);
    } finally {
        if (btn) { btn.textContent = '🛑 停止'; btn.disabled = false; }
    }
}

async function executeScript(scriptName) {
    if (!confirm(`确定要执行 ${scriptName} 吗？`)) return;
    try {
        const data = await fetchJSON('/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: scriptName })
        });
        alert(data.message);
        if (data.success) await updateDashboard();
    } catch (error) {
        alert('执行失败: ' + error);
    }
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    document.getElementById('themeToggle').textContent = next === 'light' ? '🌙' : '☀️';
}

(function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = saved === 'light' ? '🌙' : '☀️';
})();

document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig();
    await updateDashboard();
    setInterval(updateDashboard, 15000);

    window.onclick = function (event) {
        const modal = document.getElementById('logModal');
        if (event.target === modal) closeModal();
    }
});
