import { Handler } from '@netlify/functions';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

type LocalDoc = Record<string, unknown>;
type LocalDb = Record<string, Record<string, LocalDoc>>;

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

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function nowTimestamp() {
  const millis = Date.now();
  return {
    _seconds: Math.floor(millis / 1000),
    _nanoseconds: (millis % 1000) * 1_000_000,
  };
}

function getDbPath() {
  return path.join('/tmp', 'fairino-contract-db.json');
}

function readDb(): LocalDb {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8')) as LocalDb;
  } catch {
    return {};
  }
}

function writeDb(db: LocalDb) {
  fs.writeFileSync(getDbPath(), JSON.stringify(db, null, 2), 'utf8');
}

function ensureDb() {
  const db = readDb();
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
  if (changed) writeDb(db);
  return db;
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
  return Object.entries(filters).every(([key, value]) => doc[key] === normalizeFilterValue(value));
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

async function handleTencentProxy(body: Record<string, unknown>) {
  const secretId = process.env.VITE_TENCENT_SECRET_ID || process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.VITE_TENCENT_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    return json(400, {
      error: 'ConfigurationError',
      message: '腾讯云 AI 密钥未配置。',
    });
  }

  const { service, action, version, region = 'ap-guangzhou', payload } = body;
  if (!service || !action || !version || !payload) {
    return json(400, { error: 'BadRequest', message: '腾讯云代理请求缺少必要参数。' });
  }

  const host = `${service}.tencentcloudapi.com`;
  const contentType = 'application/json; charset=utf-8';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const requestPayload = JSON.stringify(payload);

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${String(action).toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedRequestPayload = crypto.createHash('sha256').update(requestPayload).digest('hex');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedRequestPayload].join('\n');

  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  const signature = getTencentSignature(secretKey, date, String(service), stringToSign);
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Host: host,
      Authorization: authorization,
      'Content-Type': contentType,
      'X-TC-Action': String(action),
      'X-TC-Version': String(version),
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': String(region),
    },
    body: requestPayload,
  });
  const result = await response.json();
  return json(response.ok ? 200 : response.status, result.Response || result);
}

export const handler: Handler = async (event) => {
  const route = String(event.queryStringParameters?.path || '').replace(/^\/+/, '');
  const body = event.body ? JSON.parse(event.body) as Record<string, unknown> : {};

  if (route === 'health') {
    return json(200, {
      ok: true,
      mode: 'netlify-function-local-json',
      time: new Date().toISOString(),
    });
  }

  if (route === 'auth/login' && event.httpMethod === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const preset = presetUsers.find(user => user.email === email && user.password === password);
    if (!preset) return json(401, { success: false, message: '账号或密码错误' });

    const db = ensureDb();
    const existing = Object.values(db.users).find(user => user.email === email);
    db.users[preset.uid] = {
      ...existing,
      uid: preset.uid,
      email: preset.email,
      displayName: preset.displayName,
      isAdmin: preset.isAdmin === true,
      approved: true,
      createdAt: existing?.createdAt || nowTimestamp(),
      lastLoginAt: nowTimestamp(),
    };
    writeDb(db);
    return json(200, { success: true, user: db.users[preset.uid], token: `local_${preset.uid}` });
  }

  if (route === 'auth/register' && event.httpMethod === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json(400, { success: false, message: '邮箱和密码不能为空' });

    const db = ensureDb();
    const existing = Object.values(db.users).find(user => user.email === email);
    if (existing) return json(409, { success: false, message: '该邮箱已注册，请直接登录' });

    const uid = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    db.users[uid] = {
      uid,
      email,
      displayName: body.displayName || email.split('@')[0],
      isAdmin: false,
      approved: false,
      createdAt: nowTimestamp(),
      lastLoginAt: nowTimestamp(),
    };
    writeDb(db);
    return json(200, { success: true, user: db.users[uid], token: `local_${uid}` });
  }

  if (route.startsWith('db/')) {
    const collection = route.split('/')[1];
    const db = ensureDb();
    db[collection] ||= {};

    if (event.httpMethod === 'GET') {
      const { path: _path, _docId, ...filters } = event.queryStringParameters || {};
      if (_docId) {
        const doc = db[collection][_docId];
        return doc ? json(200, doc) : json(404, { error: 'Not found' });
      }
      return json(200, Object.values(db[collection]).filter(doc => matchesFilters(doc, filters)));
    }

    if (event.httpMethod === 'POST') {
      const id = String(body.docId || `${collection}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
      const incoming = (body.data || {}) as LocalDoc;
      const existing = db[collection][id] || {};
      const now = nowTimestamp();
      db[collection][id] = {
        ...existing,
        ...incoming,
        id: incoming.id || existing.id || id,
        createdAt: existing.createdAt || incoming.createdAt || now,
        updatedAt: now,
      };
      writeDb(db);
      return json(200, { success: true, id, data: db[collection][id] });
    }
  }

  if (route === 'tencent-proxy' && event.httpMethod === 'POST') {
    return handleTencentProxy(body);
  }

  return json(404, { error: 'Not found', route });
};
