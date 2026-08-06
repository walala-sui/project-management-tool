const fs = require('fs');
const path = require('path');

// ===== 常量 =====
const QUADRANT_LABELS = {
  q1: '重要且紧急',
  q2: '重要不紧急',
  q3: '紧急不重要',
  q4: '不重要不紧急',
  unset: '未设置'
};
const QUADRANT_KEYS = Object.keys(QUADRANT_LABELS);
const DEFAULT_DASHBOARD_SETTINGS = {
  quadrantTaskLimits: { q1: 10, q2: 8, q3: 8, q4: 5 },
  loadQ1Threshold: 5,
  keyQ1Threshold: 3,
  keyBottleneckThreshold: 1
};

// ===== 工具函数 =====
function normalizeQuadrant(value) {
  return QUADRANT_KEYS.includes(value) ? value : 'unset';
}

function toBool(value) {
  return value === true;
}

function toNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function getQuadrantLabel(value) {
  return QUADRANT_LABELS[normalizeQuadrant(value)];
}

// ===== 数据规范化 =====
function normalizeTask(task = {}) {
  const normalized = { ...task };
  normalized.id = normalized.id || 't' + Date.now() + Math.random().toString(36).slice(2, 8);
  normalized.name = normalized.name || '未命名任务';
  normalized.parentId = normalized.parentId || null;
  normalized.resourceId = normalized.resourceId || '';
  normalized.memberIds = Array.isArray(normalized.memberIds) ? normalized.memberIds : [];
  normalized.startDate = normalized.startDate || '';
  normalized.endDate = normalized.endDate || '';
  normalized.duration = toNumber(normalized.duration, 1, 1, 9999);
  normalized.progress = toNumber(normalized.progress, 0, 0, 100);
  normalized.predecessors = Array.isArray(normalized.predecessors) ? normalized.predecessors : [];
  normalized.level = toNumber(normalized.level, 0, 0, 2);
  normalized.completed = toBool(normalized.completed);
  normalized.onHold = toBool(normalized.onHold);
  normalized.actualCompletionDate = normalized.actualCompletionDate || '';
  normalized.priorityQuadrant = normalizeQuadrant(normalized.priorityQuadrant);
  normalized.isBottleneck = toBool(normalized.isBottleneck);
  normalized.isMilestone = toBool(normalized.isMilestone);
  return normalized;
}

function normalizeTemplateTask(task = {}) {
  const normalized = { ...task };
  normalized.name = normalized.name || '未命名任务';
  normalized.parentId = normalized.parentId || null;
  normalized.level = toNumber(normalized.level, 0, 0, 2);
  normalized.duration = toNumber(normalized.duration, 1, 1, 9999);
  normalized.startDate = normalized.startDate || '';
  normalized.endDate = normalized.endDate || '';
  normalized.priorityQuadrant = normalizeQuadrant(normalized.priorityQuadrant);
  normalized.isBottleneck = toBool(normalized.isBottleneck);
  normalized.isMilestone = toBool(normalized.isMilestone);
  return normalized;
}

function normalizeProject(project = {}) {
  const normalized = { ...project };
  normalized.schemaVersion = 2;
  normalized.id = normalized.id || 'project-' + Date.now();
  normalized.name = normalized.name || '未命名项目';
  normalized.description = normalized.description || '';
  normalized.startDate = normalized.startDate || '';
  normalized.endDate = normalized.endDate || '';
  normalized.status = normalized.status || 'active';
  normalized.priorityQuadrant = normalizeQuadrant(normalized.priorityQuadrant);
  normalized.tasks = Array.isArray(normalized.tasks) ? normalized.tasks.map(normalizeTask) : [];
  return normalized;
}

function normalizeTemplate(template = {}) {
  const normalized = { ...template };
  normalized.id = normalized.id || 'tpl-' + Date.now();
  normalized.name = normalized.name || '未命名模板';
  normalized.tasks = Array.isArray(normalized.tasks) ? normalized.tasks.map(normalizeTemplateTask) : [];
  return normalized;
}

function normalizeResource(resource = {}) {
  const normalized = { ...resource };
  normalized.id = normalized.id || 'r' + Date.now() + Math.random().toString(36).slice(2, 8);
  normalized.name = normalized.name || '未命名';
  normalized.department = normalized.department || '未分组';
  normalized.isLoadPerson = toBool(normalized.isLoadPerson);
  normalized.isKeyPerson = toBool(normalized.isKeyPerson);
  return normalized;
}

function normalizeSettings(settings = {}) {
  const dashboard = settings.dashboard || {};
  const limits = dashboard.quadrantTaskLimits || {};
  return {
    schemaVersion: 1,
    dashboard: {
      quadrantTaskLimits: {
        q1: toNumber(limits.q1, DEFAULT_DASHBOARD_SETTINGS.quadrantTaskLimits.q1, 1, 50),
        q2: toNumber(limits.q2, DEFAULT_DASHBOARD_SETTINGS.quadrantTaskLimits.q2, 1, 50),
        q3: toNumber(limits.q3, DEFAULT_DASHBOARD_SETTINGS.quadrantTaskLimits.q3, 1, 50),
        q4: toNumber(limits.q4, DEFAULT_DASHBOARD_SETTINGS.quadrantTaskLimits.q4, 1, 50)
      },
      loadQ1Threshold: toNumber(dashboard.loadQ1Threshold, DEFAULT_DASHBOARD_SETTINGS.loadQ1Threshold, 1, 50),
      keyQ1Threshold: toNumber(dashboard.keyQ1Threshold, DEFAULT_DASHBOARD_SETTINGS.keyQ1Threshold, 1, 50),
      keyBottleneckThreshold: toNumber(dashboard.keyBottleneckThreshold, DEFAULT_DASHBOARD_SETTINGS.keyBottleneckThreshold, 1, 50)
    }
  };
}

// ===== 文件读写（带锁） =====
const writeQueue = new Map();

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
  // Promise队列锁：确保同一文件的写入操作串行执行
  if (!writeQueue.has(filepath)) {
    writeQueue.set(filepath, Promise.resolve());
  }
  const prev = writeQueue.get(filepath);
  let resolve;
  const next = new Promise(r => { resolve = r; });
  writeQueue.set(filepath, next);

  await prev;
  try {
    const tmp = filepath + '.tmp';
    const backup = filepath + '.bak';
    // 先写临时文件
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    // 备份旧文件（如果存在）
    if (fs.existsSync(filepath)) {
      try { fs.copyFileSync(filepath, backup); } catch (e) { /* 忽略备份失败 */ }
    }
    // 原子重命名
    fs.renameSync(tmp, filepath);
  } catch (e) {
    console.error(`写入失败: ${filepath}`, e.message);
    throw e;
  } finally {
    resolve();
    // 清理过期引用
    if (writeQueue.get(filepath) === next) {
      writeQueue.delete(filepath);
    }
  }
}

function getDashboardSettings(settingsFile) {
  return normalizeSettings(readJSON(settingsFile) || {});
}

// ===== CSV工具 =====
function escapeCSV(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ===== IP白名单 =====
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

function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

module.exports = {
  QUADRANT_LABELS,
  QUADRANT_KEYS,
  DEFAULT_DASHBOARD_SETTINGS,
  normalizeQuadrant,
  toBool,
  toNumber,
  getQuadrantLabel,
  normalizeTask,
  normalizeTemplateTask,
  normalizeProject,
  normalizeTemplate,
  normalizeResource,
  normalizeSettings,
  readJSON,
  writeJSON,
  getDashboardSettings,
  escapeCSV,
  ipToNum,
  ipInCIDR,
  getClientIP,
  isLocalhost,
  getLocalIP
};
