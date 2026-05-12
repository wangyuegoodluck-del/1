import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore, Timestamp, Query, OrderByDirection, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// 初始化 Firebase Admin
// 因为运行在 Google Cloud 环境，可以使用默认凭据
const firebaseAdminApp = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const adminDb = getFirestore(firebaseAdminApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 解析 JSON 体
  app.use(express.json({ limit: '10mb' }));

  // API 路由：Firebase 认证中转 (解决国内网络问题)
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    // 注意：Firebase Admin 并没有直接的 "signInWithPassword" 接口
    // 我们需要通过 API 密钥请求 Auth 服务端，或者在这里做简单的账号匹配逻辑
    // 针对用户提到的 "预置账号" 特殊处理
    if (email === 'zhouqiang@fairino.com' && password === '123456!') {
      try {
        const userRef = adminDb.collection('users').where('email', '==', email).limit(1);
        const snapshot = await userRef.get();
        let userDoc;
        if (snapshot.empty) {
          // 自动创建
          const newUser = {
            uid: 'zhouqiang_mock_uid',
            email,
            displayName: '周强',
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
        console.error('Zhouqiang login error:', err);
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
    const { endpoint, host, authorization, action, version, timestamp, region, payload } = req.body;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Host': host,
          'Authorization': authorization,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Region': region,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      res.json(json);
    } catch (error) {
      console.error('Tencent API Proxy Error:', error);
      res.status(500).json({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite 中间件处理
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
