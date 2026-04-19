import { tencentRequest } from './tencentSign';
import { verifyEnterpriseInfo, HunyuanVerifyResult } from './hunyuanVerifyService';

const SECRET_ID = import.meta.env.VITE_TENCENT_SECRET_ID || '';
const SECRET_KEY = import.meta.env.VITE_TENCENT_SECRET_KEY || '';

export interface IdentifiedParty {
  name?: string;
  shortName?: string;
  taxId?: string;
  bank?: string;
  account?: string;
  bankCode?: string;
  address?: string;
  phone?: string;
  signatory?: string;
  signatoryPhone?: string;
  email?: string;
  /** 企业信息校验结果（混元AI） */
  verifyResult?: HunyuanVerifyResult;
}

// ─── 1. 专用营业执照识别（高准确率）────────────────────────────────────

async function ocrBizLicense(base64: string): Promise<IdentifiedParty> {
  const imageBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const resp = await tencentRequest({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    service: 'ocr',
    action: 'BizLicenseOCR',
    version: '2018-11-19',
    region: 'ap-guangzhou',
    payload: {
      ImageBase64: imageBase64,
    },
  }) as {
    RegNum?: string;
    EnterpriseName?: string;
    LegalPerson?: string;
    EnterpriseAddress?: string;
    EnterpriseType?: string;
    BusinessScope?: string;
    EstablishDate?: string;
    ValidPeriod?: string;
  };

  // 推测简称：去掉常见后缀
  let shortName = '';
  if (resp.EnterpriseName) {
    shortName = resp.EnterpriseName
      .replace(/(有限公司|股份公司|责任公司|集团|有限责任公司|股份有限公司)$/g, '')
      .trim();
  }

  return {
    name: resp.EnterpriseName || '',
    shortName: shortName || undefined,
    taxId: resp.RegNum || '',
    address: resp.EnterpriseAddress || '',
    signatory: resp.LegalPerson || '',
  };
}

// ─── 2. 混元 AI 文字解析（从粘贴文字中提取企业信息）──────────────────────

/**
 * 调用混元 AI 从任意文字中智能提取企业信息
 * 支持：名片文字、工商登记信息、邮件签名、营业执照文字复制等
 */
async function parseTextByHunyuan(text: string): Promise<IdentifiedParty> {
  const systemPrompt = `你是一个专业的企业信息提取助手。
用户会粘贴一段包含企业信息的文字（可能来自名片、工商登记、邮件、网页等），你需要从中提取结构化企业信息。

请返回 JSON 格式，字段如下（没有的字段返回空字符串）：
{
  "name": "公司全称，如：武汉福艾利恩电气有限公司",
  "shortName": "公司简称（去掉有限公司等后缀），如：福艾利恩",
  "taxId": "统一社会信用代码（18位），如：91420100XXXXXXXXXX",
  "address": "公司地址",
  "phone": "公司电话（优先座机，其次手机）",
  "signatory": "法人代表或联系人姓名",
  "signatoryPhone": "联系人手机号",
  "bank": "开户银行",
  "account": "银行账号",
  "bankCode": "联行号/行号",
  "email": "电子邮箱"
}

注意：
1. 只提取明确出现的信息，不要猜测或补全
2. 税号严格18位，如果文字中的代码不是18位则不填
3. 简称由全称推断，去掉"有限公司"、"股份有限公司"等后缀
4. 只返回JSON，不要任何解释文字`;

  const userContent = `请从以下文字中提取企业信息：\n\n${text}`;

  try {
    const resp = await tencentRequest({
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      service: 'hunyuan',
      action: 'ChatCompletions',
      version: '2023-09-01',
      region: 'ap-guangzhou',
      payload: {
        Model: 'hunyuan-lite',
        Messages: [
          { Role: 'system', Content: systemPrompt },
          { Role: 'user', Content: userContent },
        ],
        Stream: false,
      },
    }) as { Choices?: { Message?: { Content?: string } }[] };

    const content =
      resp.Choices && resp.Choices[0] && resp.Choices[0].Message
        ? (resp.Choices[0].Message.Content ?? '{}')
        : '{}';

    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        name: parsed.name || '',
        shortName: parsed.shortName || undefined,
        taxId: parsed.taxId || '',
        address: parsed.address || '',
        phone: parsed.phone || '',
        signatory: parsed.signatory || '',
        signatoryPhone: parsed.signatoryPhone || '',
        bank: parsed.bank || '',
        account: parsed.account || '',
        bankCode: parsed.bankCode || '',
        email: parsed.email || '',
      };
    }
  } catch (err) {
    console.error('混元文字解析失败:', err);
    throw new Error('AI 文字解析失败，请检查网络或稍后重试');
  }

  throw new Error('无法从文字中提取企业信息，请检查输入内容');
}

// ─── 3. 混元 AI 智能校验 ──────────────────────────────────────────────────

/**
 * 调用混元 AI 校验识别结果
 */
async function doAiVerify(identified: IdentifiedParty): Promise<HunyuanVerifyResult | undefined> {
  // 没有名称或信用代码则跳过
  if (!identified.name && !identified.taxId) {
    return undefined;
  }

  try {
    return await verifyEnterpriseInfo({
      name: identified.name || '',
      taxId: identified.taxId || '',
      legalPerson: identified.signatory,
      address: identified.address,
    });
  } catch (err) {
    console.warn('混元AI校验失败:', err);
    return undefined;
  }
}

// ─── 4. 对外接口 ─────────────────────────────────────────────────────

/**
 * 识别甲方信息（图片上传 or 文字粘贴）
 * @param input 纯文本字符串 或 { data: base64图片数据, mimeType }
 */
export const identifyPartyA = async (
  input: string | { data: string; mimeType: string }
): Promise<IdentifiedParty> => {
  try {
    if (typeof input === 'string') {
      // 文字模式：调用混元 AI 解析
      if (!input.trim()) {
        throw new Error('请输入企业信息文字');
      }
      const result = await parseTextByHunyuan(input.trim());
      if (!result.name && !result.taxId) {
        throw new Error('未能从文字中提取到企业信息，请确认内容包含公司名称或税号');
      }
      // 自动调用混元AI校验
      const verifyResult = await doAiVerify(result);
      if (verifyResult) {
        result.verifyResult = verifyResult;
      }
      return result;
    }

    // 图片模式：专用营业执照 OCR
    const result = await ocrBizLicense(input.data);
    if (!result.name && !result.taxId) {
      throw new Error('未识别到有效营业执照信息，请确认图片为清晰的营业执照照片');
    }

    // 自动调用混元AI校验
    const verifyResult = await doAiVerify(result);
    if (verifyResult) {
      result.verifyResult = verifyResult;
    }

    return result;
  } catch (error) {
    console.error('识别错误:', error);
    throw error;
  }
};
