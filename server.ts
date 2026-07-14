import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore, Timestamp, Query, OrderByDirection, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// 初始化 Firebase Admin
// 因为运行在 Google Cloud 环境，可以使用默认凭据
const firebaseAdminApp = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(firebaseAdminApp, firebaseConfig.firestoreDatabaseId);

const presetUsers = [
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

  const app = express();
  const PORT = 3000;

  // 解析 JSON 体
  app.use(express.json({ limit: '10mb' }));

  // API 路由：Firebase 认证中转 (解决国内网络问题)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    // 注意：Firebase Admin 并没有直接的 "signInWithPassword" 接口
    // 我们需要通过 API 密钥请求 Auth 服务端，或者在这里做简单的账号匹配逻辑
    // 针对 "预置账号" 特殊处理
    const presetUser = presetUsers.find(user => user.email === email && user.password === password);
    if (presetUser) {
      try {
        const userRef = adminDb.collection('users').where('email', '==', email).limit(1);
        const snapshot = await userRef.get();
        let userDoc;
        if (snapshot.empty) {
          // 自动创建
          const newUser = {
            uid: presetUser.uid,
            email: presetUser.email,
            displayName: presetUser.displayName,
            isAdmin: false,
            approved: true,
            createdAt: Timestamp.now(),
            lastLoginAt: Timestamp.now()
          };
          await adminDb.collection('users').doc(newUser.uid).set(newUser);
          userDoc = newUser;
        } else {
          userDoc = snapshot.docs[0].data();
          await snapshot.docs[0].ref.update({ lastLoginAt: Timestamp.now() });
        }
        return res.json({ success: true, user: userDoc });
      } catch (err) {
        console.error('Preset user login error:', err);
        return res.status(500).json({ success: false, message: 'Auth Proxy Error' });
      }
    }

    // 默认回滚到真正的 Firebase Auth 请求 (在服务器侧发起，不受大陆防火墙影响)
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const data = await response.json();
      if (data.error) {
        return res.status(401).json({ success: false, message: data.error.message });
      }
      
      // 获取用户 Profile
      const userRef = adminDb.collection('users').doc(data.localId);
      const userDoc = await userRef.get();
      
      res.json({ success: true, user: userDoc.exists ? userDoc.data() : { uid: data.localId, email: data.email }, token: data.idToken });
    } catch (err) {
      console.error('Server auth error:', err);
      res.status(500).json({ success: false, message: 'Server Auth Error' });
    }
  });

  // API 路由：数据库代理
  app.get('/api/db/:collection', async (req, res) => {
    try {
      const { collection } = req.params;
      const { _docId, _orderField, _direction, ...filters } = req.query;
      
      if (_docId) {
        const doc = await adminDb.collection(collection).doc(_docId as string).get();
        if (!doc.exists) return res.status(404).json({ error: 'Not found' });
        return res.json(doc.data());
      }

      let query: Query = adminDb.collection(collection);
      
      // 添加过滤条件
      Object.entries(filters).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          // 比较时自动尝试转换数字和布尔值
          let finalVal: string | boolean | number = val as string;
          if (val === 'true') finalVal = true;
          else if (val === 'false') finalVal = false;
          else if (!isNaN(Number(val)) && typeof val === 'string' && val.trim() !== '') finalVal = Number(val);
          
          query = query.where(key, '==', finalVal);
        }
      });

      if (_orderField) {
        query = query.orderBy(_orderField as string, (_direction as OrderByDirection) || 'desc');
      }
      
      const snapshot = await query.get();
      const results = snapshot.docs.map((docSnapshot: QueryDocumentSnapshot) => docSnapshot.data());
      res.json(results);
    } catch (err) {
      console.error('DB Proxy Get Error:', err);
      res.status(500).json({ error: 'DB Proxy Error' });
    }
  });

  app.post('/api/db/:collection', async (req, res) => {
    try {
      const { collection } = req.params;
      const { docId, data } = req.body;
      
      if (docId) {
        await adminDb.collection(collection).doc(docId).set({
          ...data as Record<string, unknown>,
          updatedAt: Timestamp.now()
        }, { merge: true });
      } else {
        await adminDb.collection(collection).add({
          ...data as Record<string, unknown>,
          createdAt: Timestamp.now()
        });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('DB Proxy Write Error:', err);
      res.status(500).json({ error: 'DB Proxy Write Error' });
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
  if (process.env.NODE_ENV !== 'production') {
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

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
  });
}

startServer();
