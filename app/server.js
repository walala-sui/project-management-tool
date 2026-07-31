const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json({ limit: '10mb' }));

// 数据目录
const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const RESOURCES_FILE = path.join(DATA_DIR, 'resources.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'ip-whitelist.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const ADMIN_PASSWORD = '14';

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
if (!fs.existsSync(WHITELIST_FILE)) fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ ips: [] }, null, 2));
if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, JSON.stringify([], null, 2));

// 文件写入锁
const writeLocks = new Map();

function readJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    console.error(`读取失败: ${filepath}`, e.message);
    return null;
  }
}

async function writeJSON(filepath, data) {
  while (writeLocks.get(filepath)) {
    await new Promise(r => setTimeout(r, 10));
  }
  writeLocks.set(filepath, true);
  try {
    const tmp = filepath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filepath);
  } finally {
    writeLocks.delete(filepath);
  }
}

// ===== IP 白名单 =====

function ipToNum(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

function ipInCIDR(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [subnet, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  return (ipToNum(ip) & mask) === (ipToNum(subnet) & mask);
}

function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return (req.socket.remoteAddress || req.ip || '').replace(/^::ffff:/, '');
}

function isLocalhost(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

// IP 白名单中间件
app.use((req, res, next) => {
  const clientIP = getClientIP(req);

  // 本地始终放行
  if (isLocalhost(clientIP) || clientIP === '::1') return next();

  const whitelist = readJSON(WHITELIST_FILE) || { ips: [] };
  const allowed = whitelist.ips.some(rule => ipInCIDR(clientIP, rule));

  if (!allowed) {
    return res.status(403).send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>无权访问</title>
<style>
body { font-family: "Microsoft YaHei","PingFang SC",sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; background:#f0f2f5; }
.card { text-align:center; background:#fff; padding:48px 64px; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); }
h1 { color:#c62828; font-size:48px; margin:0 0 8px; }
h2 { color:#333; margin:0 0 12px; }
p { color:#999; font-size:14px; line-height:1.8; }
.ip { color:#1976d2; font-weight:600; }
</style>
</head>
<body>
<div class="card">
  <h1>403</h1>
  <h2>无权访问</h2>
  <p>您的IP <span class="ip">${clientIP}</span> 不在白名单中</p>
  <p>请联系管理员将您的IP加入白名单</p>
</div>
</body>
</html>`);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ===== 白名单管理 API =====

app.get('/api/whitelist', (req, res) => {
  const data = readJSON(WHITELIST_FILE) || { ips: [] };
  res.json(data);
});

app.put('/api/whitelist', async (req, res) => {
  const { password, ips } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  await writeJSON(WHITELIST_FILE, { ips });
  res.json({ ok: true });
});

// ===== Templates (模板) API =====

app.get('/api/templates', (req, res) => {
  const data = readJSON(TEMPLATES_FILE) || [];
  res.json(data);
});

app.post('/api/templates', async (req, res) => {
  const tpl = req.body;
  tpl.id = tpl.id || 'tpl-' + Date.now();
  if (!tpl.tasks) tpl.tasks = [];
  const data = readJSON(TEMPLATES_FILE) || [];
  data.push(tpl);
  await writeJSON(TEMPLATES_FILE, data);
  res.json(tpl);
});

app.put('/api/templates/:id', async (req, res) => {
  const data = readJSON(TEMPLATES_FILE) || [];
  const idx = data.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  data[idx] = req.body;
  await writeJSON(TEMPLATES_FILE, data);
  res.json({ ok: true });
});

app.delete('/api/templates/:id', (req, res) => {
  let data = readJSON(TEMPLATES_FILE) || [];
  data = data.filter(t => t.id !== req.params.id);
  writeJSON(TEMPLATES_FILE, data);
  res.json({ ok: true });
});

// ===== Resources (人员) API =====

app.get('/api/resources', (req, res) => {
  const data = readJSON(RESOURCES_FILE) || [];
  res.json(data);
});

app.put('/api/resources', async (req, res) => {
  await writeJSON(RESOURCES_FILE, req.body);
  res.json({ ok: true });
});

// ===== Projects API =====

app.get('/api/projects', (req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    const proj = readJSON(path.join(PROJECTS_DIR, f));
    if (!proj) return null;
    const tasks = proj.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed === true).length;
    return {
      id: proj.id,
      name: proj.name,
      description: proj.description || '',
      startDate: proj.startDate || '',
      endDate: proj.endDate || '',
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      status: proj.status || 'active'
    };
  }).filter(Boolean);
  res.json(projects);
});

app.get('/api/projects/:id', (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  const proj = readJSON(filepath);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  if (!proj.status) proj.status = 'active';
  res.json(proj);
});

app.post('/api/projects', async (req, res) => {
  const proj = req.body;
  proj.id = proj.id || 'project-' + Date.now();
  if (!proj.tasks) proj.tasks = [];
  if (!proj.status) proj.status = 'active';
  await writeJSON(path.join(PROJECTS_DIR, `${proj.id}.json`), proj);
  res.json(proj);
});

app.put('/api/projects/:id', async (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  await writeJSON(filepath, req.body);
  res.json({ ok: true });
});

app.delete('/api/projects/:id', (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  res.json({ ok: true });
});

// ===== 导出 API =====

function escapeCSV(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// 单个项目导出 (CSV, Excel可直接打开)
app.get('/api/export/projects/:id', (req, res) => {
  try {
    const proj = readJSON(path.join(PROJECTS_DIR, `${req.params.id}.json`));
    if (!proj) return res.status(404).json({ error: 'Project not found' });

    let csv = '﻿任务名称,负责人,成员,开始日期,结束日期,进度,前置任务,状态\n';
    const resources = readJSON(RESOURCES_FILE) || [];
    const tasks = proj.tasks || [];
    const wbsMap = {};
    const counters = [];
    tasks.forEach((t, i) => {
      const lvl = t.level || 0;
      counters.length = lvl + 1;
      for (let j = lvl; j < counters.length; j++) { if (counters[j] === undefined) counters[j] = 0; }
      counters[lvl] = (counters[lvl] || 0) + 1;
      for (let j = lvl + 1; j < counters.length; j++) counters[j] = 0;
      wbsMap[i] = counters.slice(0, lvl + 1).join('.');
    });

    const today = new Date(); today.setHours(0,0,0,0);
    tasks.forEach((t, i) => {
      const res = resources.find(r => r.id === t.resourceId);
      const memberNames = (t.memberIds || []).map(mid => {
        const r = resources.find(r => r.id === mid); return r ? r.name : mid;
      }).join('、');
      let statusText = '进行中';
      if (t.completed) statusText = '已完成';
      else if (t.endDate && new Date(t.endDate) < today) statusText = '延期';

      const predDisplay = (t.predecessors || []).map(pid => {
        const pidx = tasks.findIndex(tk => tk.id === pid);
        return pidx >= 0 ? (wbsMap[pidx] || pid) : pid;
      }).join(',');

      const prefix = '  '.repeat(t.level || 0);
      csv += [prefix + t.name, res ? res.name + ' (' + res.department + ')' : '', memberNames,
        t.startDate || '', t.endDate || '', (t.progress || 0) + '%', predDisplay, statusText
      ].map(escapeCSV).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(proj.name + '_任务导出.csv')}`);
    res.send(csv);
  } catch (e) {
    console.error('导出项目失败:', e);
    res.status(500).json({ error: '导出失败' });
  }
});

// 项目列表导出 (CSV, Excel可直接打开)
app.get('/api/export/projects', (req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    const statusLabels = { active: '进行中', 'on-hold': '暂时搁置', completed: '已完成' };

    let csv = '﻿项目名称,状态,开始日期,结束日期,总任务数,已完成,进度,描述\n';
    files.forEach(f => {
      const proj = readJSON(path.join(PROJECTS_DIR, f));
      if (!proj) return;
      const tasks = proj.tasks || [];
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed === true).length;
      const row = [
        proj.name, statusLabels[proj.status] || '进行中', proj.startDate || '', proj.endDate || '',
        total, completed, total > 0 ? Math.round(completed / total * 100) + '%' : '0%', proj.description || ''
      ];
      csv += row.map(escapeCSV).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('项目列表导出.csv')}`);
    res.send(csv);
  } catch (e) {
    console.error('导出项目列表失败:', e);
    res.status(500).json({ error: '导出失败' });
  }
});

// 人员视图导出 (CSV, Excel可直接打开)
app.get('/api/export/personnel', (req, res) => {
  try {
    const { department, startDate, endDate } = req.query;
    const resources = readJSON(RESOURCES_FILE) || [];

    let filteredResources = resources;
    if (department) {
      filteredResources = resources.filter(r => r.department === department);
    }

    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    const allProjects = [];
    for (const f of files) {
      const proj = readJSON(path.join(PROJECTS_DIR, f));
      if (proj && (proj.status || 'active') === 'active') {
        allProjects.push(proj);
      }
    }

    let csv = '﻿姓名,部门,项目,任务,开始日期,结束日期,进度,状态\n';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sDate = startDate ? new Date(startDate) : null;
    const eDate = endDate ? new Date(endDate) : null;
    let hasData = false;

    for (const person of filteredResources) {
      for (const proj of allProjects) {
        const tasks = (proj.tasks || []).filter(t => t.resourceId === person.id);
        for (const t of tasks) {
          if (sDate && t.endDate && new Date(t.endDate) < sDate) continue;
          if (eDate && t.startDate && new Date(t.startDate) > eDate) continue;

          let statusText = '进行中';
          if (t.completed) statusText = '已完成';
          else if (t.endDate && new Date(t.endDate) < today) statusText = '延期';

          csv += [
            person.name, person.department, proj.name, t.name,
            t.startDate || '', t.endDate || '', (t.progress || 0) + '%', statusText
          ].map(escapeCSV).join(',') + '\n';
          hasData = true;
        }
      }
    }

    if (!hasData) {
      csv += '无匹配数据,,,,,,\n';
    }

    const filename = department
      ? `${department}_${startDate||''}_${endDate||''}.csv`
      : '人员工作安排.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (e) {
    console.error('导出人员视图失败:', e);
    res.status(500).json({ error: '导出失败' });
  }
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const localIP = getLocalIP();

app.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('  项目管理工具已启动');
  console.log(`  本机访问: http://localhost:${PORT}`);
  console.log(`  内网访问: http://${localIP}:${PORT}`);
  console.log(`  数据目录: ${DATA_DIR}`);
  console.log(`  白名单IP数: ${(readJSON(WHITELIST_FILE)||{ips:[]}).ips.length}`);
  console.log('========================================');
});
