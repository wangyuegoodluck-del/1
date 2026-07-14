import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const presetUsers = [
  {
    email: 'admin@fairino.com',
    password: 'FairinoAdmin2024!',
    uid: 'admin_fairino_local_uid',
    displayName: '管理员',
    isAdmin: true,
  },
  {
    email: 'zhouqiang@fairino.com',
    password: '123456!',
    uid: 'zhouqiang_mock_uid',
    displayName: '周强',
  },
  {
    email: 'liwei@fairino.com',
    password: 'Fairino2026!',
    uid: 'liwei_preset_uid',
    displayName: '李伟',
  },
  {
    email: 'zhangmin@fairino.com',
    password: 'Fairino2026!',
    uid: 'zhangmin_preset_uid',
    displayName: '张敏',
  },
  {
    email: 'songhaorui@fairino.com',
    password: 'Fairino2026!',
    uid: 'songhaorui_preset_uid',
    displayName: '宋昊睿',
  },
];

type LocalDoc = Record<string, unknown>;
type LocalDb = Record<string, Record<string, LocalDoc>>;

function nowTimestamp() {
  const millis = Date.now();
  return {
    _seconds: Math.floor(millis / 1000),
    _nanoseconds: (millis % 1000) * 1_000_000,
  };
}

function getLocalDbPath() {
  return path.join(process.cwd(), '.local-data', 'db.json');
}

function readLocalDb(): LocalDb {
  const dbPath = getLocalDbPath();
  if (!fs.existsSync(dbPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8')) as LocalDb;
  } catch (error) {
    console.error('Local DB read failed:', error);
    return {};
  }
}

function writeLocalDb(db: LocalDb) {
  const dbPath = getLocalDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

function ensureLocalDb() {
  const db = readLocalDb();
  db.users ||= {};
  db.customers ||= {};
  db.products ||= {};

  let changed = false;
  for (const preset of presetUsers) {
    if (!db.users[preset.uid]) {
      db.users[preset.uid] = {
        uid: preset.uid,
        email: preset.email,
        displayName: preset.displayName,
        isAdmin: preset.isAdmin === true,
        approved: true,
        createdAt: nowTimestamp(),
        lastLoginAt: nowTimestamp(),
      };
      changed = true;
    }
  }

  if (changed) writeLocalDb(db);
  return db;
}

function generateDocId(collection: string) {
  return `${collection}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeFilterValue(value: unknown) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

function matchesFilters(doc: LocalDoc, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, value]) => {
    const expected = normalizeFilterValue(value);
    return doc[key] === expected;
  });
}

function sortDocs(docs: LocalDoc[], field?: unknown, direction?: unknown) {
  if (!field || typeof field !== 'string') return docs;
  const factor = direction === 'asc' ? 1 : -1;
  return [...docs].sort((a, b) => {
    const av = a[field] as string | number | undefined;
    const bv = b[field] as string | number | undefined;
    if (av === bv) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return av > bv ? factor : -factor;
  });
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sha256(message: string, secret: string | Buffer = '', encoding?: 'hex'): string | Buffer {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return encoding ? hmac.digest(encoding) : hmac.digest();
}

function getTencentSignature(secretKey: string, date: string, service: string, str2sign: string): string {
  const kDate = sha256(date, `TC3${secretKey}`);
  const kService = sha256(service, kDate);
  const kSigning = sha256('tc3_request', kService);
  return sha256(str2sign, kSigning, 'hex') as string;
}

async function startServer() {
  loadLocalEnv();
  ensureLocalDb();

  const app = express();
  const PORT = 3000;

  // 解析 JSON 体
  app.use(express.json({ limit: '10mb' }));

  // API 路由：本地认证。默认不依赖 Firebase/Google，适合大陆无 VPN 环境。
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const presetUser = presetUsers.find(user => user.email === normalizedEmail && user.password === password);
    if (!presetUser) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    try {
      const db = ensureLocalDb();
      const existingUser = Object.values(db.users).find(user => user.email === normalizedEmail);
      const userDoc = {
        uid: presetUser.uid,
        email: presetUser.email,
        displayName: presetUser.displayName,
        isAdmin: presetUser.isAdmin === true,
        approved: true,
        createdAt: existingUser?.createdAt || nowTimestamp(),
        lastLoginAt: nowTimestamp(),
      };
      db.users[presetUser.uid] = {
        ...existingUser,
        ...userDoc,
      };
      writeLocalDb(db);
      return res.json({ success: true, user: db.users[presetUser.uid], token: `local_${presetUser.uid}` });
    } catch (err) {
      console.error('Local login error:', err);
      return res.status(500).json({ success: false, message: '本地登录服务异常' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, displayName } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: '邮箱和密码不能为空' });
    }

    const db = ensureLocalDb();
    const existingUser = Object.values(db.users).find(user => user.email === normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ success: false, message: '该邮箱已注册，请直接登录' });
    }

    const uid = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    db.users[uid] = {
      uid,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail.split('@')[0],
      isAdmin: false,
      approved: false,
      password,
      createdAt: nowTimestamp(),
      lastLoginAt: nowTimestamp(),
    };
    writeLocalDb(db);
    return res.json({ success: true, user: db.users[uid], token: `local_${uid}` });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true });
  });

  app.post('/api/auth/profile', async (req, res) => {
    const { uid, email, displayName, isAdmin = false } = req.body;
    if (!uid || !email) {
      return res.status(400).json({ success: false, message: 'uid 和 email 不能为空' });
    }

    const db = ensureLocalDb();
    const existing = db.users[uid] || {};
    db.users[uid] = {
      ...existing,
      uid,
      email,
      displayName: displayName || String(email).split('@')[0],
      isAdmin: existing.isAdmin === true || isAdmin === true,
      approved: existing.approved ?? isAdmin === true,
      createdAt: existing.createdAt || nowTimestamp(),
      lastLoginAt: nowTimestamp(),
    };
    writeLocalDb(db);
    res.json({ success: true, user: db.users[uid] });
  });

  // API 路由：本地数据库。默认写入 .local-data/db.json。
  app.get('/api/db/:collection', async (req, res) => {
    try {
      const { collection } = req.params;
      const { _docId, _orderField, _direction, ...filters } = req.query;
      const db = ensureLocalDb();
      db[collection] ||= {};

      if (_docId) {
        const doc = db[collection][_docId as string];
        if (!doc) return res.status(404).json({ error: 'Not found' });
        return res.json(doc);
      }

      const results = sortDocs(
        Object.values(db[collection]).filter(doc => matchesFilters(doc, filters)),
        _orderField,
        _direction,
      );
      res.json(results);
    } catch (err) {
      console.error('DB Get Error:', err);
      res.status(500).json({ error: 'DB Get Error' });
    }
  });

  app.post('/api/db/:collection', async (req, res) => {
    try {
      const { collection } = req.params;
      const { docId, data } = req.body;
      const db = ensureLocalDb();
      db[collection] ||= {};

      const id = docId || generateDocId(collection);
      const existing = db[collection][id] || {};
      const now = nowTimestamp();
      const incoming = (data || {}) as LocalDoc;

      db[collection][id] = {
        ...existing,
        ...incoming,
        id: incoming.id || existing.id || id,
        createdAt: existing.createdAt || incoming.createdAt || now,
        updatedAt: now,
      };
      writeLocalDb(db);
      res.json({ success: true, id, data: db[collection][id] });
    } catch (err) {
      console.error('DB Write Error:', err);
      res.status(500).json({ error: 'DB Write Error' });
    }
  });

  // API 路由：腾讯云 API 代理
  app.post('/api/tencent-proxy', async (req, res) => {
    const { service, action, version, region = 'ap-guangzhou', payload } = req.body;
    const secretId = process.env.VITE_TENCENT_SECRET_ID || process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.VITE_TENCENT_SECRET_KEY || process.env.TENCENT_SECRET_KEY;

    if (!secretId || !secretKey) {
      return res.status(400).json({
        error: 'ConfigurationError',
        message: '腾讯云 AI 密钥未配置。请在 .env.local 中设置 VITE_TENCENT_SECRET_ID 和 VITE_TENCENT_SECRET_KEY，然后重启本地服务。',
      });
    }

    if (!service || !action || !version || !payload) {
      return res.status(400).json({
        error: 'BadRequest',
        message: '腾讯云代理请求缺少 service、action、version 或 payload。',
      });
    }

    try {
      const host = `${service}.tencentcloudapi.com`;
      const contentType = 'application/json; charset=utf-8';
      const timestamp = Math.floor(Date.now() / 1000);
      const date = new Date(timestamp * 1000).toISOString().split('T')[0];
      const requestPayload = JSON.stringify(payload);

      const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${String(action).toLowerCase()}\n`;
      const signedHeaders = 'content-type;host;x-tc-action';
      const hashedRequestPayload = crypto.createHash('sha256').update(requestPayload).digest('hex');
      const canonicalRequest = [
        'POST',
        '/',
        '',
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload,
      ].join('\n');

      const algorithm = 'TC3-HMAC-SHA256';
      const credentialScope = `${date}/${service}/tc3_request`;
      const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
      const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
      const signature = getTencentSignature(secretKey, date, service, stringToSign);
      const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(`https://${host}`, {
        method: 'POST',
        headers: {
          'Host': host,
          'Authorization': authorization,
          'Content-Type': contentType,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Region': region,
        },
        body: requestPayload,
      });

      const json = await response.json();
      res.status(response.ok ? 200 : response.status).json(json.Response || json);
    } catch (error) {
      console.error('Tencent API Proxy Error:', error);
      res.status(500).json({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite 中间件处理
  if (process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
  });
  server.on('error', (error) => {
    console.error('Server listen error:', error);
  });
  globalThis.__fairinoContractServer = server;
}

startServer();
