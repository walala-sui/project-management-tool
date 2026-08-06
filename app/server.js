const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  readJSON, writeJSON, getDashboardSettings,
  normalizeProject, normalizeTask, normalizeTemplateTask,
  normalizeTemplate, normalizeResource, normalizeSettings,
  getQuadrantLabel, escapeCSV,
  getClientIP, isLocalhost, ipInCIDR,
  getLocalIP
} = require('./utils');

const app = express();
app.use(express.json({ limit: '10mb' }));

// 数据目录
const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const RESOURCES_FILE = path.join(DATA_DIR, 'resources.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'ip-whitelist.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ADMIN_PASSWORD = '14';

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
if (!fs.existsSync(WHITELIST_FILE)) fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ ips: [] }, null, 2));
if (!fs.existsSync(TEMPLATES_FILE)) fs.writeFileSync(TEMPLATES_FILE, JSON.stringify([], null, 2));

// ===== IP 白名单中间件 =====
app.use((req, res, next) => {
  const clientIP = getClientIP(req);
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

// ===== 项目摘要辅助函数 =====
function projectSummary(proj) {
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
    status: proj.status || 'active',
    priorityQuadrant: proj.priorityQuadrant,
    unsetPriorityTaskCount: tasks.filter(t => t.priorityQuadrant === 'unset').length,
    bottleneckTaskCount: tasks.filter(t => t.isBottleneck && !t.completed).length,
    milestoneTaskCount: tasks.filter(t => t.isMilestone).length
  };
}

// ===== 白名单管理 API =====
app.get('/api/whitelist', (req, res) => {
  const data = readJSON(WHITELIST_FILE) || { ips: [] };
  res.json(data);
});

app.put('/api/whitelist', async (req, res) => {
  const { password, ips } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' });
  await writeJSON(WHITELIST_FILE, { ips });
  res.json({ ok: true });
});

// ===== 模板 API =====
app.get('/api/templates', (req, res) => {
  res.json((readJSON(TEMPLATES_FILE) || []).map(normalizeTemplate));
});

app.post('/api/templates', async (req, res) => {
  const tpl = normalizeTemplate(req.body);
  const data = (readJSON(TEMPLATES_FILE) || []).map(normalizeTemplate);
  data.push(tpl);
  await writeJSON(TEMPLATES_FILE, data);
  res.json(tpl);
});

app.put('/api/templates/:id', async (req, res) => {
  const data = (readJSON(TEMPLATES_FILE) || []).map(normalizeTemplate);
  const idx = data.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  data[idx] = normalizeTemplate({ ...req.body, id: req.params.id });
  await writeJSON(TEMPLATES_FILE, data);
  res.json({ ok: true });
});

app.delete('/api/templates/:id', (req, res) => {
  let data = readJSON(TEMPLATES_FILE) || [];
  data = data.filter(t => t.id !== req.params.id);
  writeJSON(TEMPLATES_FILE, data);
  res.json({ ok: true });
});

// ===== 人员 API =====
app.get('/api/resources', (req, res) => {
  res.json((readJSON(RESOURCES_FILE) || []).map(normalizeResource));
});

app.put('/api/resources', async (req, res) => {
  const resources = Array.isArray(req.body) ? req.body.map(normalizeResource) : [];
  await writeJSON(RESOURCES_FILE, resources);
  res.json({ ok: true });
});

// ===== 看板设置 API =====
app.get('/api/settings/dashboard', (req, res) => {
  res.json(getDashboardSettings(SETTINGS_FILE).dashboard);
});

app.put('/api/settings/dashboard', async (req, res) => {
  const { password, ...dashboard } = req.body || {};
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' });
  const settings = normalizeSettings({ dashboard });
  await writeJSON(SETTINGS_FILE, settings);
  res.json(settings.dashboard);
});

// ===== 项目 API =====
app.get('/api/projects', (req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return res.json([]);
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    const raw = readJSON(path.join(PROJECTS_DIR, f));
    return raw ? projectSummary(normalizeProject(raw)) : null;
  }).filter(Boolean);
  res.json(projects);
});

// 批量获取项目详情（解决N+1问题）
app.get('/api/projects/batch', (req, res) => {
  try {
    const idsParam = req.query.ids;
    if (!idsParam) return res.json([]);
    const ids = idsParam.split(',');
    const details = ids.map(id => {
      const filepath = path.join(PROJECTS_DIR, `${id}.json`);
      const proj = readJSON(filepath);
      return proj ? normalizeProject(proj) : null;
    }).filter(Boolean);
    res.json(details);
  } catch (e) {
    console.error('批量获取项目失败:', e);
    res.status(500).json({ error: '批量获取失败' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  const proj = readJSON(filepath);
  if (!proj) return res.status(404).json({ error: 'Project not found' });
  res.json(normalizeProject(proj));
});

app.post('/api/projects', async (req, res) => {
  const proj = normalizeProject(req.body || {});
  await writeJSON(path.join(PROJECTS_DIR, `${proj.id}.json`), proj);
  res.json(proj);
});

app.put('/api/projects/:id', async (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  const proj = normalizeProject({ ...(req.body || {}), id: req.params.id });
  await writeJSON(filepath, proj);
  res.json({ ok: true });
});

app.delete('/api/projects/:id', (req, res) => {
  const filepath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  res.json({ ok: true });
});

// ===== 导出 API =====

// 单个项目导出
app.get('/api/export/projects/:id', (req, res) => {
  try {
    const raw = readJSON(path.join(PROJECTS_DIR, `${req.params.id}.json`));
    if (!raw) return res.status(404).json({ error: 'Project not found' });
    const proj = normalizeProject(raw);

    let csv = '﻿任务名称,负责人,成员,开始日期,结束日期,实际完成时间,进度,前置任务,四象限优先级,任务类型,状态\n';
    const resources = (readJSON(RESOURCES_FILE) || []).map(normalizeResource);
    const tasks = proj.tasks || [];
    const wbsMap = buildWBS(tasks);

    const today = new Date(); today.setHours(0,0,0,0);
    tasks.forEach((t, i) => {
      const res = resources.find(r => r.id === t.resourceId);
      const memberNames = (t.memberIds || []).map(mid => {
        const r = resources.find(r => r.id === mid); return r ? r.name : mid;
      }).join('、');
      let statusText = '进行中';
      if (t.completed) statusText = '已完成';
      else if (t.onHold) statusText = '搁置';
      else if (t.progress === 0) statusText = '待开始';

      const predDisplay = (t.predecessors || []).map(pid => {
        const pidx = tasks.findIndex(tk => tk.id === pid);
        return pidx >= 0 ? (wbsMap[pidx] || pid) : pid;
      }).join(',');

      const prefix = '  '.repeat(t.level || 0);
      const taskTypes = [t.isBottleneck ? '卡点' : '', t.isMilestone ? '里程碑' : ''].filter(Boolean).join('、') || '-';
      csv += [prefix + t.name, res ? res.name + ' (' + res.department + ')' : '', memberNames,
        t.startDate || '', t.endDate || '', t.actualCompletionDate || '', (t.progress || 0) + '%', predDisplay,
        getQuadrantLabel(t.priorityQuadrant), taskTypes, statusText
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

// 项目列表导出
app.get('/api/export/projects', (req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    const statusLabels = { active: '进行中', 'on-hold': '暂时搁置', completed: '已完成' };

    let csv = '﻿项目名称,状态,四象限优先级,开始日期,结束日期,总任务数,已完成,进度,未设置任务,卡点任务,里程碑任务,描述\n';
    files.forEach(f => {
      const raw = readJSON(path.join(PROJECTS_DIR, f));
      if (!raw) return;
      const proj = normalizeProject(raw);
      const tasks = proj.tasks || [];
      const total = tasks.length;
      const completed = tasks.filter(t => t.completed === true).length;
      csv += [
        proj.name, statusLabels[proj.status] || '进行中', getQuadrantLabel(proj.priorityQuadrant),
        proj.startDate || '', proj.endDate || '', total, completed,
        total > 0 ? Math.round(completed / total * 100) + '%' : '0%',
        tasks.filter(t => t.priorityQuadrant === 'unset').length,
        tasks.filter(t => t.isBottleneck && !t.completed).length,
        tasks.filter(t => t.isMilestone).length,
        proj.description || ''
      ].map(escapeCSV).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('项目列表导出.csv')}`);
    res.send(csv);
  } catch (e) {
    console.error('导出项目列表失败:', e);
    res.status(500).json({ error: '导出失败' });
  }
});

// 人员视图导出
app.get('/api/export/personnel', (req, res) => {
  try {
    const { department, startDate, endDate } = req.query;
    const resources = (readJSON(RESOURCES_FILE) || []).map(normalizeResource);
    let filteredResources = resources;
    if (department) filteredResources = resources.filter(r => r.department === department);

    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    const allProjects = [];
    for (const f of files) {
      const raw = readJSON(path.join(PROJECTS_DIR, f));
      const proj = raw ? normalizeProject(raw) : null;
      if (proj && (proj.status || 'active') === 'active') allProjects.push(proj);
    }

    let csv = '﻿姓名,部门,项目,任务,开始日期,结束日期,实际完成时间,进度,四象限优先级,任务类型,状态,角色\n';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sDate = startDate ? new Date(startDate) : null;
    const eDate = endDate ? new Date(endDate) : null;
    let hasData = false;

    for (const person of filteredResources) {
      for (const proj of allProjects) {
        const tasks = (proj.tasks || []).filter(t => t.resourceId === person.id || (t.memberIds || []).includes(person.id));
        for (const t of tasks) {
          if (sDate && t.endDate && new Date(t.endDate) < sDate) continue;
          if (eDate && t.startDate && new Date(t.startDate) > eDate) continue;

          let statusText = '进行中';
          if (t.completed) statusText = '已完成';
          else if (t.onHold) statusText = '搁置';
          else if (t.progress === 0) statusText = '待开始';

          const role = t.resourceId === person.id ? '负责人' : '成员';
          const taskTypes = [t.isBottleneck ? '卡点' : '', t.isMilestone ? '里程碑' : ''].filter(Boolean).join('、') || '-';
          csv += [
            person.name, person.department, proj.name, t.name,
            t.startDate || '', t.endDate || '', t.actualCompletionDate || '', (t.progress || 0) + '%',
            getQuadrantLabel(t.priorityQuadrant), taskTypes, statusText, role
          ].map(escapeCSV).join(',') + '\n';
          hasData = true;
        }
      }
    }

    if (!hasData) csv += '无匹配数据,,,,,,,,,,,\n';

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

// WBS序号生成
function buildWBS(tasks) {
  const wbs = new Array(tasks.length).fill('');
  const counters = [];
  tasks.forEach((t, i) => {
    const lvl = t.level || 0;
    counters.length = lvl + 1;
    for (let j = lvl; j < counters.length; j++) { if (counters[j] === undefined) counters[j] = 0; }
    counters[lvl] = (counters[lvl] || 0) + 1;
    for (let j = lvl + 1; j < counters.length; j++) counters[j] = 0;
    wbs[i] = counters.slice(0, lvl + 1).join('.');
  });
  return wbs;
}

// ===== 启动 =====
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
