import { Timestamp } from 'firebase/firestore';

// 这是一个简易的数据同步中心，当浏览器无法直连 Firebase 时 (如在中国大陆且无 VPN)，
// 它会降级到通过我们自己的服务器 API 进行中转。

export interface ApiUser {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  approved: boolean;
}

/**
 * 包装从 API 返回的 Timestamp 数据 (JSON 序列化后的对象) 
 * 还原为 Firebase 式的 Timestamp 接口，以便前端组件透明使用
 */
export function wrapTimestamp(ts: unknown): Timestamp {
  if (!ts) return Timestamp.now();
  if (ts instanceof Timestamp) return ts;
  
  const anyTs = ts as { seconds?: number; _seconds?: number; nanoseconds?: number; _nanoseconds?: number };
  const seconds = anyTs.seconds ?? anyTs._seconds;
  const nanoseconds = anyTs.nanoseconds ?? anyTs._nanoseconds;

  if (typeof seconds === 'number') {
    return new Timestamp(seconds, nanoseconds || 0);
  }
  // 如果是字符串日期
  if (typeof ts === 'string') {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      return Timestamp.fromDate(date);
    }
  }
  return Timestamp.now();
}

/**
 * 深度转换对象中的所有 Timestamp-like 对象
 */
export function deepConvertTimestamps(obj: unknown): unknown {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => deepConvertTimestamps(item));
  }
  if (typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    for (const key in record) {
      const val = record[key] as { _seconds?: number; _nanoseconds?: number; seconds?: number; nanoseconds?: number };
      if (val && typeof val === 'object' && val._seconds !== undefined) {
        // Admin SDK 返回的格式可能是 { _seconds, _nanoseconds }
        newObj[key] = new Timestamp(val._seconds, val._nanoseconds || 0);
      } else if (val && typeof val === 'object' && (val.seconds !== undefined || val.nanoseconds !== undefined)) {
        newObj[key] = wrapTimestamp(val);
      } else if (val && typeof val === 'object') {
        newObj[key] = deepConvertTimestamps(val);
      } else {
        newObj[key] = val;
      }
    }
    return newObj;
  }
  return obj;
}

export async function apiGet(collection: string, docOrParams?: string | Record<string, unknown>) {
  let query = '';
  if (typeof docOrParams === 'string') {
    query = `_docId=${encodeURIComponent(docOrParams)}`;
  } else if (docOrParams) {
    query = new URLSearchParams(docOrParams as Record<string, string>).toString();
  }
  
  const response = await fetch(`/api/db/${collection}?${query}`);
  if (!response.ok) throw new Error('API DB Get Error');
  const data = (await response.json()) as unknown;
  return deepConvertTimestamps(data);
}

export async function apiSet(collection: string, docId: string | null, data: unknown) {
  const response = await fetch(`/api/db/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, data })
  });
  if (!response.ok) throw new Error('API DB Set Error');
  return response.json();
}

/**
 * 简单的轮询机制，作为 onSnapshot 的替代方案，用于网络不通时
 */
export async function apiPoll<T>(collection: string, params: Record<string, unknown> = {}): Promise<T[]> {
  try {
    const data = await apiGet(collection, params);
    return Array.isArray(data) ? (data as T[]) : [data as T];
  } catch (err) {
    console.error('apiPoll failed:', err);
    return [];
  }
}
