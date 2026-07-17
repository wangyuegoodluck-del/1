import { tencentRequest } from './tencentSign';
import { verifyEnterpriseInfo, HunyuanVerifyResult } from './hunyuanVerifyService';

function getViteEnv(key: string): string {
  return ((import.meta as unknown as { env?: Record<string, string> }).env?.[key]) || '';
}

const SECRET_ID = getViteEnv('VITE_TENCENT_SECRET_ID');
const SECRET_KEY = getViteEnv('VITE_TENCENT_SECRET_KEY');

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

// ─── 1. 通用文字识别（fallback） ────────────────────────────────────

function stripLabel(value: string): string {
  return value.replace(/^[，,、；;：:\s]+/, '').trim();
}

function escapeRegexChar(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelToFlexiblePattern(label: string): string {
  return Array.from(label).map((char) => {
    if (/\s/.test(char)) return '\\s*';
    if (char === '、' || char === '，' || char === ',') return '[、，,]\\s*';
    return `${escapeRegexChar(char)}\\s*`;
  }).join('');
}

const FIELD_LABELS = [
  '统一社会信用代码',
  '社会信用代码',
  '纳税人识别号',
  '单位名称',
  '公司名称',
  '企业名称',
  '单位税号',
  '税号',
  '单位地址',
  '注册地址',
  '公司地址',
  '地址、电话',
  '地址，电话',
  '地址电话',
  '联系电话',
  '公司电话',
  '电话',
  '开户银行',
  '开户行',
  '开户行、账号',
  '开户银行、账号',
  '开户行账号',
  '开户银行账号',
  '银行账号',
  '开户账号',
  '收款账号',
  '账号',
  '账户',
  '联行号',
  '银行行号',
  '行号',
  '法定代表人',
  '联系人手机号',
  '联系人电话',
  '法人',
  '联系人',
  '负责人',
  '手机号',
  '手机',
  '电子邮箱',
  '邮箱',
  '邮件',
  '甲方',
  '住所',
  '银行',
];

function allLabelPattern(excludeLabels: string[] = []): string {
  const excluded = new Set(excludeLabels);
  return FIELD_LABELS
    .filter(label => !excluded.has(label))
    .sort((a, b) => b.length - a.length)
    .map(labelToFlexiblePattern)
    .join('|');
}

function matchLine(text: string, labels: string[]): string {
  const labelPatterns = labels.map(labelToFlexiblePattern).join('|');
  const nextLabelPattern = allLabelPattern(labels);
  const regex = new RegExp(
    `(?:${labelPatterns})[：:]?\\s*([\\s\\S]*?)(?=\\s*(?:${nextLabelPattern})\\s*[：:]?|[\\n\\r]|$)`,
    'i',
  );
  const match = text.match(regex);
  return match ? stripLabel(match[1]) : '';
}

function inferShortName(name: string): string | undefined {
  if (!name) return undefined;
  return name
    .replace(/(有限责任公司|股份有限公司|有限公司|股份公司|责任公司|集团|公司)$/g, '')
    .trim() || undefined;
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/(?:统一社会信用代码|社会信用代码|纳税人识别号|单位税号|税号|单位地址|注册地址|公司地址|地址|联系电话|公司电话|电话|开户银行|开户行|银行账号|账号|联行号|银行行号|行号)[：:]?[\s\S]*$/g, '')
    .replace(/[，,、；;：:\s]+$/g, '')
    .trim();
}

function normalizeTaxId(value: string, sourceText: string): string {
  const explicit = value.match(/[0-9A-Z]{18}/)?.[0];
  if (explicit) return explicit;
  return sourceText.match(/[0-9A-Z]{18}/)?.[0] || '';
}

function cleanAddress(value: string): string {
  return removePhoneFromAddress(value)
    .replace(/(?:开户银行|开户行|银行账号|开户账号|收款账号|账号|账户|联\s*行\s*号|银行\s*行\s*号|行\s*号)[：:]?[\s\S]*$/g, '')
    .replace(/[，,、；;：:\s]+$/g, '')
    .trim();
}

function extractDigits(value: string): string {
  return (value.match(/\d+/g) || []).join('');
}

function extractAccountCandidate(value: string): string {
  const digitGroups = value.match(/\d{12,30}/g) || [];
  return digitGroups[0] || '';
}

function extractBankCodeCandidate(value: string): string {
  const bankCodeMatch = value.match(/(?:联\s*行\s*号|银行\s*行\s*号|行\s*号)\s*[：:]?\s*([0-9]{8,14})/);
  if (bankCodeMatch) return bankCodeMatch[1];
  return '';
}

function cleanBankName(value: string): string {
  return value
    .replace(/^\s*(?:开户银行|开户行|银行名称|银行)\s*[：:]?\s*/, '')
    .replace(/[，,、；;]?\s*(?:银行账号|开户账号|收款账号|账号|账户|联\s*行\s*号|银行\s*行\s*号|行\s*号)\s*[：:]?[\s\S]*$/g, '')
    .replace(/\d{6,}/g, '')
    .replace(/^[，,、；;：:\s]+|[，,、；;：:\s]+$/g, '')
    .trim();
}

function normalizeBankFields(result: IdentifiedParty, sourceText: string): IdentifiedParty {
  const combinedBankAccount = matchLine(sourceText, [
    '开户行、账号',
    '开户银行、账号',
    '开户行账号',
    '开户银行账号',
  ]);
  const bankSource = [result.bank, result.account, combinedBankAccount, sourceText].filter(Boolean).join('\n');
  const explicitAccount = sourceText.match(/(?:银行账号|开户账号|收款账号|账号|账户)\s*[：:]?\s*([^\n\r]+)/)?.[1] || '';
  const explicitBankCode = extractBankCodeCandidate(bankSource);
  const account =
    extractAccountCandidate(result.account || '') ||
    extractAccountCandidate(combinedBankAccount) ||
    extractAccountCandidate(explicitAccount) ||
    extractAccountCandidate(bankSource);

  const bank =
    cleanBankName(result.bank || '') ||
    cleanBankName(combinedBankAccount) ||
    cleanBankName(sourceText.match(/(?:开户银行|开户行)\s*[：:]?\s*([^\n\r]+)/)?.[1] || '') ||
    cleanBankName(result.account || '');
  const addressPhoneLine = matchLine(sourceText, ['地址、电话', '地址，电话', '地址电话']);
  const sourcePhone = normalizePhone(addressPhoneLine) || normalizePhone(matchLine(sourceText, ['电话', '联系电话', '公司电话']));
  const sourceAddress = cleanAddress(addressPhoneLine || matchLine(sourceText, ['注册地址', '住所', '公司地址', '单位地址', '地址']));

  return {
    ...result,
    name: cleanCompanyName(result.name || ''),
    shortName: inferShortName(cleanCompanyName(result.name || '')) || result.shortName,
    taxId: normalizeTaxId(result.taxId || '', sourceText),
    address: cleanAddress(result.address || sourceAddress),
    phone: sourcePhone || normalizePhone(result.phone || ''),
    bank,
    account,
    bankCode: explicitBankCode || extractDigits(result.bankCode || ''),
  };
}

function normalizePhone(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const mobile = text.match(/(?:^|[^\d])((?:\+?86[-\s]?)?1[3-9]\d{9})(?!\d)/)?.[1];
  if (mobile) return mobile;
  const landline = text.match(/(?:^|[^\d])(0\d{2,3}[-\s]\d{7,8})(?!\d)/)?.[1];
  return landline || '';
}

function removePhoneFromAddress(value: string): string {
  return value
    .replace(/(^|[^\d])(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g, '$1')
    .replace(/(^|[^\d])0\d{2,3}[-\s]?\d{7,8}(?!\d)/g, '$1')
    .replace(/[，,、；;：:\s]+$/g, '')
    .trim();
}

function parseTextLocally(text: string): IdentifiedParty {
  const compactText = text.replace(/\r/g, '\n');
  const taxId = compactText.match(/[0-9A-Z]{18}/)?.[0] || '';
  const email = compactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const mobile = normalizePhone(compactText).startsWith('1') ? normalizePhone(compactText) : '';
  const addressPhoneLine = matchLine(compactText, ['地址、电话', '地址，电话', '地址电话']);
  const labeledPhone = matchLine(compactText, ['电话', '联系电话', '公司电话']);
  const account = matchLine(compactText, ['银行账号', '账号', '账户', '开户账号', '收款账号'])
    || compactText.match(/\b\d{12,30}\b/)?.[0]
    || '';

  let name = cleanCompanyName(matchLine(compactText, ['公司名称', '企业名称', '名称', '单位名称', '甲方']));
  if (!name) {
    name = compactText.match(/[\u4e00-\u9fa5（）()A-Za-z0-9]{4,}(?:有限责任公司|股份有限公司|有限公司|股份公司|集团有限公司|公司)/)?.[0] || '';
  }

  return normalizeBankFields({
    name,
    shortName: inferShortName(name),
    taxId: normalizeTaxId(matchLine(compactText, ['统一社会信用代码', '社会信用代码', '纳税人识别号', '单位税号', '税号']) || taxId, compactText),
    address: cleanAddress(addressPhoneLine || matchLine(compactText, ['注册地址', '住所', '公司地址', '单位地址', '地址'])),
    phone: normalizePhone(addressPhoneLine) || normalizePhone(labeledPhone) || mobile,
    signatory: matchLine(compactText, ['法定代表人', '法人', '联系人', '负责人']),
    signatoryPhone: matchLine(compactText, ['联系人手机号', '联系人电话', '手机号', '手机']) || mobile,
    bank: matchLine(compactText, ['开户银行', '开户行', '银行']),
    account,
    bankCode: matchLine(compactText, ['联行号', '行号', '银行行号']),
    email: matchLine(compactText, ['邮箱', '电子邮箱', '邮件']) || email,
  }, compactText);
}

function hasIdentifiedInfo(result: IdentifiedParty): boolean {
  return Boolean(result.name || result.taxId || result.address || result.phone || result.bank || result.account || result.email);
}

export function __testParseTextLocally(text: string): IdentifiedParty {
  return parseTextLocally(text);
}

async function ocrGeneral(base64: string): Promise<string> {
  const imageBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const resp = await tencentRequest({
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    service: 'ocr',
    action: 'GeneralBasicOCR',
    version: '2018-11-19',
    region: 'ap-guangzhou',
    payload: {
      ImageBase64: imageBase64,
    },
  }) as {
    TextDetections?: { DetectedText?: string }[];
  };

  return (resp.TextDetections || []).map(d => d.DetectedText).join('\n');
}

// ─── 2. 专用营业执照识别（高准确率）────────────────────────────────────

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
      return normalizeBankFields({
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
      }, text);
    }
  } catch (err) {
    console.error('混元文字解析失败:', err);
    const localResult = parseTextLocally(text);
    if (hasIdentifiedInfo(localResult)) {
      console.warn('已切换到本地规则解析企业信息。');
      return localResult;
    }
    if (err instanceof Error) {
      // 这里的 err 可能是 tencentRequest 抛出的详细错误
      throw new Error(`AI 解析失败: ${err.message}`);
    }
    throw new Error('AI 文字解析失败，请检查网络或稍后重试');
  }

  const localResult = parseTextLocally(text);
  if (hasIdentifiedInfo(localResult)) {
    return localResult;
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

    // 图片模式：先尝试专用营业执照 OCR
    let result: IdentifiedParty;
    try {
      console.log('尝试专用营业执照 OCR...');
      result = await ocrBizLicense(input.data);
    } catch (error: unknown) {
      // 记录原始错误
      console.warn('专用 OCR 识别失败或非标准证照，正在启动通用解析 + 混元智能提取...', error);
      
      try {
        const fullText = await ocrGeneral(input.data);
        if (!fullText.trim()) {
          throw new Error('未能识别图中文字，请确保图片清晰');
        }
        console.log('通用 OCR 提取成功，正在应用混元 AI 语义分析...');
        result = await parseTextByHunyuan(fullText);
      } catch (fallbackError: unknown) {
        // 如果二次识别也失败，抛出最初的 OCR 错误
        console.error('OCR智能补救识别失败:', fallbackError);
        throw error;
      }
    }

    if (!result.name && !result.taxId) {
      throw new Error('未识别到有效企业信息，请确认图片包含公司全称或社会信用代码');
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
