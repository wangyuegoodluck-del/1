/**
 * 腾讯云 API 3.0 TC3-HMAC-SHA256 签名工具
 * https://cloud.tencent.com/document/api/866/33518
 */

async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer | Uint8Array | string, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  let keyBuffer: ArrayBuffer;
  if (typeof key === 'string') {
    keyBuffer = encoder.encode(key).buffer as ArrayBuffer;
  } else if (key instanceof Uint8Array) {
    keyBuffer = key.buffer as ArrayBuffer;
  } else {
    keyBuffer = key;
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface TencentRequestOptions {
  secretId: string;
  secretKey: string;
  service: string;       // e.g. "ocr"
  action: string;        // e.g. "GeneralBasicOCR"
  version: string;       // e.g. "2018-11-19"
  region?: string;       // e.g. "ap-guangzhou"
  payload: Record<string, unknown>;
}

export async function tencentRequest(opts: TencentRequestOptions): Promise<unknown> {
  const { secretId, secretKey, service, action, version, region = 'ap-guangzhou', payload } = opts;

  const host = `${service}.tencentcloudapi.com`;
  const endpoint = `https://${host}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const payloadStr = JSON.stringify(payload);

  // 1. 拼接规范请求串
  const hashedRequestPayload = await sha256Hex(payloadStr);
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    'content-type;host',
    hashedRequestPayload,
  ].join('\n');

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // 3. 计算签名
  const encoder = new TextEncoder();
  const secretDate = await hmacSha256(encoder.encode(`TC3${secretKey}`), date);
  const secretService = await hmacSha256(secretDate, service);
  const secretSigning = await hmacSha256(secretService, 'tc3_request');
  const signature = toHex(await hmacSha256(secretSigning, stringToSign));

  // 4. 拼接 Authorization
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  const response = await fetch('/api/tencent-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint,
      host,
      authorization,
      action,
      version,
      timestamp,
      region,
      payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`网络请求失败 (${response.status}): ${errorText || '请检查后端连接'}`);
  }

  const json = await response.json();
  if (json.Response?.Error) {
    throw new Error(`腾讯云 API 错误 [${json.Response.Error.Code}]: ${json.Response.Error.Message}`);
  }
  return json.Response;
}
