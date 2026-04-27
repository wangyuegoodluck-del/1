import { Handler } from '@netlify/functions';
import crypto from 'crypto';

function sha256(message: string, secret: string | Buffer = '', encoding?: 'hex'): any {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  return encoding ? hmac.digest(encoding) : hmac.digest();
}

function getSignature(secretKey: string, date: string, service: string, str2sign: string): string {
  const kDate = sha256(date, `TC3${secretKey}`);
  const kService = sha256(service, kDate);
  const kSigning = sha256('tc3_request', kService);
  return sha256(str2sign, kSigning, 'hex');
}

export const handler: Handler = async (event) => {
  const SECRET_ID = process.env.VITE_TENCENT_SECRET_ID;
  const SECRET_KEY = process.env.VITE_TENCENT_SECRET_KEY;

  if (!SECRET_ID || !SECRET_KEY) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: 'ConfigurationError', 
        message: `Tencent API credentials missing in Netlify environment. Missing: ${!SECRET_ID ? 'SECRET_ID' : ''} ${!SECRET_KEY ? 'SECRET_KEY' : ''}`.trim()
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { service, action, version, region, payload } = JSON.parse(event.body || '{}');

    // 1. 准备参数
    const endpoint = `${service}.tencentcloudapi.com`;
    const contentType = 'application/json; charset=utf-8';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    
    // 2. 构造规范请求串 (Canonical Request)
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:${contentType}\nhost:${endpoint}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedRequestPayload = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    // 3. 构造待签名字符串 (String to Sign)
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // 4. 计算签名
    const signature = getSignature(SECRET_KEY, date, service, stringToSign);

    // 5. 构造授权头
    const authorization = `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': contentType,
        'Host': endpoint,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': region,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.Response || result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ProxyError', message: error instanceof Error ? error.message : String(error) }),
    };
  }
};
