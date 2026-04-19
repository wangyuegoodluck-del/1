/**
 * 腾讯混元 AI — 企业信息智能校验
 * 利用混元大模型对 OCR 识别的营业执照信息进行格式校验和逻辑校验
 * 完全免费（混元 hunyuan-lite，100万token免费额度）
 */

import { tencentRequest } from './tencentSign';

const SECRET_ID = import.meta.env.VITE_TENCENT_SECRET_ID || '';
const SECRET_KEY = import.meta.env.VITE_TENCENT_SECRET_KEY || '';

export interface HunyuanVerifyResult {
  /** 总体校验是否通过 */
  verified: boolean;
  /** 校验置信度（0-100） */
  confidence: number;
  /** 校验详情 */
  checks: {
    /** 公司名称格式是否正确 */
    nameValid: boolean;
    /** 公司名称校验说明 */
    nameCheck: string;
    /** 信用代码格式是否正确（18位） */
    taxIdValid: boolean;
    /** 信用代码校验说明 */
    taxIdCheck: string;
    /** 法人姓名格式是否合理 */
    legalPersonValid: boolean;
    /** 法人校验说明 */
    legalPersonCheck: string;
    /** 地址格式是否合理 */
    addressValid: boolean;
    /** 地址校验说明 */
    addressCheck: string;
  };
  /** AI 综合评价 */
  summary: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 混元信用代码格式校验（本地快速校验，不调API）
 * 统一社会信用代码：18位，第1位为登记管理部门代码，第2位为机构类别
 */
function localTaxIdCheck(taxId: string): { valid: boolean; message: string } {
  if (!taxId || taxId.length !== 18) {
    return { valid: false, message: taxId ? `长度${taxId.length}位，应为18位` : '信用代码为空' };
  }
  // 第1位：登记管理部门 1-工商 5-民政 8-其他
  const firstChar = taxId[0];
  if (!/^[1-9A-Y]$/.test(firstChar)) {
    return { valid: false, message: `首位"${firstChar}"不合法，应为1-9或A-Y` };
  }
  // 第2位：机构类型
  if (!/^[1-9A-Z]$/.test(taxId[1])) {
    return { valid: false, message: `第2位"${taxId[1]}"不合法` };
  }
  // 后16位应为数字或大写字母（最后1位可以是校验码）
  const body = taxId.substring(2);
  if (!/^[0-9A-Z]{16}$/.test(body)) {
    return { valid: false, message: '包含非法字符，应为数字或大写字母' };
  }
  return { valid: true, message: '18位格式正确' };
}

/**
 * 混元法人姓名校验（本地）
 */
function localLegalPersonCheck(name: string): { valid: boolean; message: string } {
  if (!name) return { valid: false, message: '法人为空' };
  if (name.length < 2) return { valid: false, message: `姓名"${name}"过短，可能识别不完整` };
  if (name.length > 10) return { valid: false, message: `姓名"${name}"过长（${name.length}字），可能有误` };
  // 包含常见非人名字符
  if (/[0-9a-zA-Z@#$%^&*()_+=[\]{}|\\:;"'<>,.?/~`]/.test(name)) {
    return { valid: false, message: `姓名"${name}"包含非中文字符，可能有误` };
  }
  return { valid: true, message: '格式合理' };
}

/**
 * 混元公司名称校验（本地）
 */
function localNameCheck(name: string): { valid: boolean; message: string } {
  if (!name) return { valid: false, message: '公司名称为空' };
  if (name.length < 4) return { valid: false, message: `名称"${name}"过短，可能识别不完整` };
  // 有效的公司后缀
  const validSuffixes = ['有限公司', '有限责任公司', '股份公司', '股份有限公司', '合伙企业', '个人独资企业', '集团', '公司'];
  const hasSuffix = validSuffixes.some(s => name.includes(s));
  if (!hasSuffix) return { valid: false, message: `缺少常见公司后缀（如"有限公司"），请确认` };
  return { valid: true, message: '格式合理' };
}

/**
 * 混元地址校验（本地）
 */
function localAddressCheck(address: string): { valid: boolean; message: string } {
  if (!address) return { valid: false, message: '地址为空' };
  if (address.length < 5) return { valid: false, message: `地址"${address}"过短，可能识别不完整` };
  return { valid: true, message: '格式合理' };
}

/**
 * 调用混元大模型进行深度校验（联网+逻辑推理）
 * 检测 OCR 常见错误：形近字、漏字、多字等
 */
async function hunyuanDeepVerify(ocrData: {
  name: string;
  taxId: string;
  legalPerson?: string;
  address?: string;
}): Promise<{
  nameCheck: string;
  taxIdCheck: string;
  legalPersonCheck: string;
  addressCheck: string;
  overallConfidence: number;
  summary: string;
}> {
  const systemPrompt = `你是一个专业的企业营业执照信息校验专家。
用户会提供 OCR 识别的营业执照信息，你需要检查这些信息是否存在常见的 OCR 识别错误。

常见 OCR 错误类型：
1. 形近字错误：如"有限"→"右限"、"股份"→"胶份"、"有限公司"→"有艰公司"
2. 漏字/多字：如"技术"→"技木"、"机器人"→"器人"
3. 数字混淆：如"0"→"O"、"1"→"I"、"8"→"B"
4. 地址截断：地址过长时尾部被截断

请返回 JSON 格式的校验结果，字段如下：
{
  "nameCheck": "公司名称校验说明，如'名称格式正确，包含有效后缀'或'名称中的XX可能是误识别，建议检查'",
  "taxIdCheck": "信用代码校验说明",
  "legalPersonCheck": "法人姓名校验说明，如'姓名格式合理'或'姓名XX unusual，可能是误识别'",
  "addressCheck": "地址校验说明，如'地址完整合理'或'地址可能被截断'",
  "overallConfidence": 0-100 的整数，表示整体置信度",
  "summary": "一句话总结，如'识别结果整体可信'或'建议人工核对公司名称和信用代码'"
}

注意：如果没有明显错误，就说没问题，不要过度质疑。`;

  const userContent = `请校验以下 OCR 识别的营业执照信息：
- 公司名称：${ocrData.name || '（空）'}
- 统一社会信用代码：${ocrData.taxId || '（空）'}
- 法定代表人：${ocrData.legalPerson || '（空）'}
- 企业地址：${ocrData.address || '（空）'}`;

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
        nameCheck: parsed.nameCheck || '校验通过',
        taxIdCheck: parsed.taxIdCheck || '校验通过',
        legalPersonCheck: parsed.legalPersonCheck || '校验通过',
        addressCheck: parsed.addressCheck || '校验通过',
        overallConfidence: typeof parsed.overallConfidence === 'number' ? parsed.overallConfidence : 80,
        summary: parsed.summary || '识别结果整体可信',
      };
    }
  } catch (err) {
    console.warn('混元深度校验失败，使用本地校验结果:', err);
  }

  // fallback：返回默认值
  return {
    nameCheck: ocrData.name ? '格式基本合理' : '为空',
    taxIdCheck: ocrData.taxId ? '格式基本合理' : '为空',
    legalPersonCheck: ocrData.legalPerson || '未识别',
    addressCheck: ocrData.address || '未识别',
    overallConfidence: 70,
    summary: 'AI 深度校验不可用，已通过基础格式校验',
  };
}

/**
 * 企业信息智能校验（对外接口）
 * 先做本地快速格式校验，再调混元做深度校验
 */
export async function verifyEnterpriseInfo(ocrData: {
  name: string;
  taxId: string;
  legalPerson?: string;
  address?: string;
}): Promise<HunyuanVerifyResult> {
  // 1. 本地快速格式校验
  const nameResult = localNameCheck(ocrData.name);
  const taxIdResult = localTaxIdCheck(ocrData.taxId);
  const personResult = localLegalPersonCheck(ocrData.legalPerson || '');
  const addressResult = localAddressCheck(ocrData.address || '');

  // 2. 调混元深度校验
  const aiResult = await hunyuanDeepVerify(ocrData);

  // 3. 综合结果（本地校验 + AI 校验）
  const allValid =
    nameResult.valid && taxIdResult.valid && personResult.valid && addressResult.valid;

  return {
    verified: allValid && aiResult.overallConfidence >= 60,
    confidence: aiResult.overallConfidence,
    checks: {
      nameValid: nameResult.valid,
      nameCheck: aiResult.nameCheck || nameResult.message,
      taxIdValid: taxIdResult.valid,
      taxIdCheck: aiResult.taxIdCheck || taxIdResult.message,
      legalPersonValid: personResult.valid,
      legalPersonCheck: aiResult.legalPersonCheck || personResult.message,
      addressValid: addressResult.valid,
      addressCheck: aiResult.addressCheck || addressResult.message,
    },
    summary: aiResult.summary,
  };
}
