/**
 * 腾讯云 API 3.0 TC3-HMAC-SHA256 签名工具
 * https://cloud.tencent.com/document/api/866/33518
 */

export interface TencentRequestOptions {
  secretId?: string;
  secretKey?: string;
  service: string;       // e.g. "ocr"
  action: string;        // e.g. "GeneralBasicOCR"
  version: string;       // e.g. "2018-11-19"
  region?: string;       // e.g. "ap-guangzhou"
  payload: Record<string, unknown>;
}

export async function tencentRequest(opts: TencentRequestOptions): Promise<unknown> {
  const { service, action, version, region = 'ap-guangzhou', payload } = opts;

  // 现在前端不再计算签名，而是直接将请求意图发送给 Netlify 后端函数
  // 后端函数会从环境变量中安全地读取密钥并进行签名
  const response = await fetch('/api/tencent-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service,
      action,
      version,
      region,
      payload,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: '网络错误' }));
    const errorMsg = errorBody.message || errorBody.error || '请求失败';
    throw new Error(`腾讯云代理错误 (${response.status}): ${errorMsg}`);
  }

  const json = await response.json();
  
  // 处理腾讯云返回的错误格式
  if (json.Error) {
    throw new Error(`腾讯云 API 错误 [${json.Error.Code}]: ${json.Error.Message}`);
  }
  
  return json;
}
