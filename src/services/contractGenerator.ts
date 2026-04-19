import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber, VerticalAlign, HeadingLevel, Tab, TabStopType, ImageRun, IImageOptions } from 'docx';
import { saveAs } from 'file-saver';
import { LOGO_BASE64 } from '../constants';

function getLogoUint8(): Uint8Array {
  try {
    const raw = LOGO_BASE64.split(',')[1] || LOGO_BASE64;
    const clean = raw.replace(/[\r\n\s]/g, '');
    console.log('Logo base64 length:', clean.length);
    console.log('Logo base64 start:', clean.substring(0, 50));
    console.log('Logo base64 end:', clean.substring(clean.length - 50));
    const binaryString = atob(clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.error('Error decoding logo:', error);
    throw new Error(`Logo解码失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface PartyInfo {
  name: string;
  shortName?: string; // 客户简称
  taxId: string;
  bank: string;
  account: string;
  bankCode?: string; // 行号
  address: string;
  phone: string;
  signatory: string;
  signatoryPhone: string;
  email?: string;
}

export interface Product {
  name: string;
  unit: string;
  quantity: number;
  unitPriceIncTax: number;
  taxRate: number;
  remarks: string;
  /** 借用合同专用：产品用途 */
  purpose?: string;
  /** 标准版基础单价（用于高精度版切换时恢复） */
  basePrice?: number;
  /** 是否支持高精度版 */
  hasPrecisionVersion?: boolean;
  /** 当前是否选择了高精度版 */
  isPrecisionVersion?: boolean;
}

export type ContractType = 'sales' | 'loan';

export interface ContractData {
  contractNumber: string;
  signingDate: string;
  partyA: PartyInfo;
  partyB: PartyInfo;
  products: Product[];
  deliveryDays: number;
  completionDate: string;
  paymentDays: number;
  warrantyMonths: number;
  customLogo?: string; // Base64 string
  deliveryLocation: '甲方' | '乙方';
  deliveryAddress: string;
  /** 合同类型：销售合同 / 借用合同 */
  contractType: ContractType;
  /** 借用合同专用：借用开始日期 */
  loanStartDate?: string;
  /** 借用合同专用：借用结束日期 */
  loanEndDate?: string;
  /** 借用合同专用：设备金额（用于押金计算） */
  equipmentAmount?: number;
  /** 借用合同专用：设备押金 */
  equipmentDeposit?: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function numberToChinese(n: number): string {
  const fraction = ['角', '分'];
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']];
  let s = '';
  const nStr = Math.abs(n).toFixed(2);
  const [integerStr, fractionStr] = nStr.split('.');
  
  for (let i = 0; i < fraction.length; i++) {
    const d = parseInt(fractionStr[i]);
    if (d > 0) {
      s += digit[d] + fraction[i];
    }
  }
  s = s || '整';

  let integerPart = parseInt(integerStr);
  if (integerPart === 0) {
    s = '零元' + s;
  } else {
    let integerS = '';
    for (let i = 0; i < unit[0].length && integerPart > 0; i++) {
      let p = '';
      for (let j = 0; j < unit[1].length && integerPart > 0; j++) {
        p = digit[integerPart % 10] + unit[1][j] + p;
        integerPart = Math.floor(integerPart / 10);
      }
      integerS = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + integerS;
    }
    s = integerS.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零') + s;
  }
  
  return s.replace(/^元/, '零元');
}

export const generateContract = async (data: ContractData) => {
  const logoUint8 = data.customLogo ? base64ToUint8Array(data.customLogo) : getLogoUint8();
  const totalIncTax = data.products.reduce((sum, p) => sum + Math.round(p.quantity * p.unitPriceIncTax), 0);
  const totalTaxAmount = data.products.reduce((sum, p) => {
    const incTax = Math.round(p.quantity * p.unitPriceIncTax);
    return sum + (incTax - incTax / (1 + p.taxRate));
  }, 0);
  const totalExTax = totalIncTax - totalTaxAmount;

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "SimSun",
            size: 24, // 小四
          },
          paragraph: {
            spacing: {
              line: 360, // 1.5x
              lineRule: "auto",
            },
            alignment: AlignmentType.JUSTIFIED,
          },
        },
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: {
            font: "SimSun",
            size: 24,
          },
          paragraph: {
            spacing: {
              line: 360,
              lineRule: "auto",
            },
            alignment: AlignmentType.JUSTIFIED,
          },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: "SimHei",
            size: 28, // 四号
            bold: true,
          },
          paragraph: {
            spacing: { before: 120, after: 120, line: 360, lineRule: "auto" },
          },
        },
      ],
    },
    sections: [
      // Page 1: Cover Page
      {
        properties: {
          page: {
            margin: { top: 720, right: 1440, bottom: 720, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: logoUint8,
                    transformation: {
                      width: 168,
                      height: 15,
                    },
                    type: "png",
                  } as unknown as IImageOptions),
                  new TextRun({ children: [new Tab()] }),
                  new TextRun({ text: data.partyB.name, size: 18, font: "SimSun" }),
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: 9027,
                  },
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({ 
                children: [
                  new TextRun({ text: "中国 · 江苏省苏州市高新区竹园路中国苏州创业园", size: 16 }),
                ], 
                alignment: AlignmentType.CENTER 
              }),
              new Paragraph({ 
                children: [
                  new TextRun({ text: "电话：+86 0512-68562005    www.frtech.fr", size: 16 }),
                  new TextRun({ text: "    ", size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16 })
                ], 
                alignment: AlignmentType.CENTER 
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: "", spacing: { before: 1200, line: 360, lineRule: "auto" } }),
          ...Array.from("产品采购合同").map(char => 
            new Paragraph({ 
              children: [new TextRun({ text: char, bold: true, size: 52, font: "SimHei" })], 
              alignment: AlignmentType.CENTER
            })
          ),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          
          new Paragraph({ 
            children: [
              new TextRun({ text: "甲方：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.partyA.name, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
          // 1 blank line after Party A
          new Paragraph({ text: "" }),

          new Paragraph({ 
            children: [
              new TextRun({ text: "乙方：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.partyB.name, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
          // 2 blank lines after Party B
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),

          new Paragraph({ 
            children: [
              new TextRun({ text: "合同编号：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.contractNumber, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),

          new Paragraph({ 
            children: [
              new TextRun({ text: "签订时间：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.signingDate, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
        ],
      },
      // Page 2-4: Main Content
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: logoUint8,
                    transformation: {
                      width: 168,
                      height: 15,
                    },
                    type: "png",
                  } as unknown as IImageOptions),
                  new TextRun({ children: [new Tab()] }),
                  new TextRun({ text: data.partyB.name, size: 18, font: "SimSun" }),
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: 9027,
                  },
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({ 
                children: [
                  new TextRun({ text: "中国 · 江苏省苏州市高新区竹园路中国苏州创业园", size: 16 }),
                ], 
                alignment: AlignmentType.CENTER 
              }),
              new Paragraph({ 
                children: [
                  new TextRun({ text: "电话：+86 0512-68562005    www.frtech.fr", size: 16 }),
                  new TextRun({ text: "    ", size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16 })
                ], 
                alignment: AlignmentType.CENTER 
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ 
            children: [new TextRun({ text: "第一条 商品名称、数量和金额" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ["序号", "名称", "数量", "单位", "单价", "不含税金额", "含税金额", "备注"].map(text => new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text, size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })],
                  verticalAlign: VerticalAlign.CENTER,
                })),
              }),
              ...data.products.map((p, index) => {
                const incTax = Number((p.quantity * p.unitPriceIncTax).toFixed(2));
                const exTax = Number((incTax / (1 + p.taxRate)).toFixed(2));
                return new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (index + 1).toString(), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.name, size: 18, font: "Microsoft YaHei" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.quantity.toString(), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.unit, size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.unitPriceIncTax.toFixed(2), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: exTax.toFixed(2), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: incTax.toFixed(2), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.remarks, size: 18, font: "Microsoft YaHei" })] })] }),
                  ],
                });
              }),
              new TableRow({
                children: [
                  new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "合计", size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.products.reduce((s, p) => s + p.quantity, 0).toString(), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "\\", size: 18, font: "Microsoft YaHei" })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "\\", size: 18, font: "Microsoft YaHei" })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: totalExTax.toFixed(2), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: totalIncTax.toFixed(2), size: 18, font: "Microsoft YaHei" })], alignment: AlignmentType.CENTER })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "\\", size: 18, font: "Microsoft YaHei" })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 8,
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "不含税总金额 RMB: ", size: 18, font: "Microsoft YaHei" }),
                          new TextRun({ text: totalExTax.toFixed(2), size: 18, font: "Microsoft YaHei", underline: {} }),
                          new TextRun({ text: " 元, ", size: 18, font: "Microsoft YaHei" }),
                          new TextRun({ text: "合计总金额 RMB: ", size: 18, font: "Microsoft YaHei" }),
                          new TextRun({ text: totalIncTax.toFixed(2), size: 18, font: "Microsoft YaHei", underline: {} }),
                          new TextRun({ text: " 元, 大写: 人民币: ", size: 18, font: "Microsoft YaHei" }),
                          new TextRun({ text: numberToChinese(totalIncTax), size: 18, font: "Microsoft YaHei", underline: {} }),
                          new TextRun({ text: " (含税)", size: 18, font: "Microsoft YaHei" })
                        ],
                        spacing: { before: 100, after: 100, line: 360, lineRule: "auto" }
                      })
                    ]
                  })
                ]
              }),
            ],
          }),

          new Paragraph({ 
            children: [new TextRun({ text: "第二条 设备款及支付方式" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 设备款总额（含税）：", size: 24 }),
              new TextRun({ text: numberToChinese(totalIncTax), size: 24, underline: {} }),
              new TextRun({ text: `（￥${totalIncTax.toFixed(2)}）。`, size: 24, underline: {} })
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ children: [new TextRun({ text: "2. 具体支付方式和时间如下：", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: `（1）采购合同签约日起，甲方于【${data.paymentDays}】个工作日内向乙方支付全额货款。`, size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "（2）乙方须在甲方支付全款及收到签收单后开具全额增值税发票。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ 
            children: [
              new TextRun({ text: `（3）乙方发货前，甲方需 100%付清货款，交货地点为【${data.deliveryLocation === '甲方' ? '☑甲方 ☐乙方' : '☐甲方 ☑乙方'}】所在地。即：【`, size: 24 }),
              new TextRun({ text: data.deliveryAddress || "________________________________", size: 24, underline: {} }),
              new TextRun({ text: "】。", size: 24 })
            ], 
            indent: { firstLine: 480 } 
          }),
          new Paragraph({ 
            children: [new TextRun({ text: "    甲方支付货款时，需备注相应批次产品的合同号或订单单号。", size: 24 })], 
            indent: { firstLine: 480 } 
          }),
          new Paragraph({ children: [new TextRun({ text: "（4）乙方为甲方提供技术文件以及设备使用保养手册。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "（5）本合同项下的销售产品所有权自货款全额付清之日起转移，甲方未按合同履行支付款项义务的，所有权仍属乙方，乙方有权拒绝一切售后服务并向甲方追讨货款及利息或者依法采取其他处置。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ 
            children: [
              new TextRun({ text: `3. 甲方需在 `, size: 24 }),
              new TextRun({ text: data.completionDate, size: 24, bold: true, underline: {} }),
              new TextRun({ text: ` 日之前完成提货。`, size: 24 })
            ],
            indent: { firstLine: 480 }
          }),

          new Paragraph({ 
            children: [new TextRun({ text: "第三条 双方权利及义务与适用范围" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "1. 甲方：履行合同内容，按时付款，及时提供乙方实验所需参数。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "2. 乙方：履行合同内容，按照甲方技术要求研发产品。向甲方提供乙方产品操作手册、线上培训、答疑服务。乙方只针对甲方自身提供售前售后服务，乙方不承担甲方自行销售行为的任何售前售后服务。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "3. 适用范围：乙方提供甲方的优惠政策以及质保期内、外的一切服务，仅限中国大陆范围内。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第四条 产品交货时间、地点及质保期" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 产品交货时间：甲方支付全款到后 ", size: 24 }),
              new TextRun({ text: data.deliveryDays.toString(), size: 24, bold: true, underline: {} }),
              new TextRun({ text: " 天。", size: 24 })
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ children: [new TextRun({ text: "2. 运送费用：设备运输至甲方指定地点，产生的运费由乙方承但（仅限中国大陆地区），卸货及卸货时人员费用甲方承担。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: `3. 本合同项下的设备质保期【${data.warrantyMonths}】个月（自货物激活之日起算），保修期内，经查证若为（1）用户原因于装卸运输过程、存放时间过长造成机械外观或内部损坏；（2）操作使用不当、自行拆解改装所造成之人为损坏，不在以上免费保修范围之内，用户必须支付所有整修、维修费用以及设备往返运费。若甲方不按期支付货款，虽在保修范围内，乙方有权不予维修。`, size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "4. 甲方需自收到乙方交付的货物后 3 日内进行验收，若逾期未提出异议的，视为甲方对于乙方货物数量、包装等外观质量验收合格。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第五条 延迟交付及违约责任" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "1. 乙方应及时履行合同约定的交货义务，如有逾期，乙方需书面向甲方做出说明，经甲方的书面同意延迟交付。在收到甲方的书面通知后，乙方推迟交货，推迟交货可免除乙方承担延迟交货的违约责任。否则，未经甲方书面同意乙方擅自延期交付的，乙方将承担相关违约责任，但任何情况下，乙方所承担的违约责任不超过货款的 5%。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "2. 因不可抗力导致乙方延期交货的，交货期按不可抗力因素的影响时间顺延，但乙方有义务于不可抗力因素发生日起 14 日内书面通知甲方，并协助甲方调送货物。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "3. 若甲方不按时付款，每逾期一日，按应付款额的日千分之一向乙方支付违约金，若逾期超过三十日的，乙方有权立即解除本合同且不视为乙方违约。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "4. 在任何情形下，本合同项下一方均不应向另一方承担因本合同产生或与本合同有关的任何偶发性的、间接的、惩罚性的、附带的或特殊的损害或损失，该等损坏或损失包括但不限于：营业收入损失、利润损失或业务损失。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "5.如甲方发生二次销售的价格低于乙方市场指导价的现象，甲方需向乙方支付本合同项下所涉及的订单金额的 30%作为违约金，若前述违约金不足以弥补由此给乙方造成的损失的，甲方需予以补足，且乙方有权解除本合同或相应的采购订单而不视为乙方违约。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "甲方违反价格管理约定后，如有采购需求，需与乙方重新签订采购合同。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第六条 包装与贮存" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "货物包装，适合于长途运输。货物到达合同约定地点后应尽快开箱安装，如需贮存，则贮存义务由甲方承担，且贮存时间最长不超过货物到达后的 1 个月。货物应存放于干燥通风的室内，如需露天放置，必须采取有效的防雨、防浸、防潮等措施。由于甲方采取的防雨、防浸、防潮等措施不当或贮存时间超过货物到达之日起的 1 个月所造成货物受损，乙方不承担任何责任。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第七条 变更和终止" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "1. 除非本合同另有约定，任何一方以书面的方式提前一周通知另一方并经过双方共同协商同意变更或终止本合同，变更或终止合同提出方须担负变更或终止合同给另一方造成的损失。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "2. 在合同执行过程中，如果出现水灾、火灾、地震、暴风雪、旱灾、雹暴、飓风、战争、瘟疫、政府禁令或其他不可预料的事件且当事方不能控制、无法避免、无法克服，则任何一方不对合同部分或全部未履行而负责。然而，受事件影响的一方应在 14 天内尽快通知另一方该不可抗力事件的发生。如果不可抗力持续 10 周以上，双方将协商本合同的履行或终止。如果不可抗力事件发生后 6 个月内双方仍未达成一致，任何一方有权终止合同。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第八条 争议解决和联系方式" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "1. 本合同的制定、执行和解释均适用中华人民共和国现行有效法律。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "2. 双方将通过合理的努力解决任何因本合同的履行及解释所发生的任何争议。如果协商解决不成，任何一方均可采取进一步的法律行动。本条款将不影响任何一方寻求禁令、财产保全、诉前保全及其他临时救济措施的权利。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "3. 凡因执行本合同引起的及与合同相关的一切争议，包括对其存在、有效性或终止等的任何疑问，双方应友好协商解决，不能解决的，任何一方均有权向乙方所在人民法院提起诉讼。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "4．为方便双方沟通和业务交流，双方各指定邮箱和联系电话，如有变更，变更方以书面方式通知对方，否则视为本合同中载明的联系方式、邮箱均有效未变更，具体联系方式（该联系方式均适用于双方签订的技术协议）如下：", size: 24 })], indent: { firstLine: 480 } }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: ["联系人", "公司", "电话", "电子信箱"].map(t => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER })) }),
          new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyA.signatory, size: 24, font: "SimSun" })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyA.name, size: 24, font: "SimSun" })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyA.signatoryPhone, size: 24, font: "SimSun" })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyA.email || "", size: 24, font: "SimSun" })], alignment: AlignmentType.CENTER })] }),
              ] }),
              new TableRow({ children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyB.signatory, size: 24 })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyB.name, size: 24 })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyB.signatoryPhone, size: 24 })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.partyB.email || "", size: 24 })], alignment: AlignmentType.CENTER })] }),
              ] }),
            ],
          }),
          new Paragraph({ text: "", spacing: { before: 100, line: 360, lineRule: "auto" } }),
          new Paragraph({ children: [new TextRun({ text: "双方确认本条指定的联系人、联系方式（包括法代表人或授权代表的移动电话、微信、电子邮箱等）、地址的适用范围包括双方非诉时各类通知、协议等文件以及就合同发生纠纷时相关文件和法律文书的送达，同时包括在争议进入仲裁、民事诉讼程序后的一审、二审、再审和执行程序，文书经签收、拒签或退回的均视为有效签收。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ 
            children: [new TextRun({ text: "第九条 签署与效力" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ children: [new TextRun({ text: "1. 本合同一式两份，经双方盖章后生效，双方各执一份为凭，均有同等法律效力。", size: 24 })], indent: { firstLine: 480 } }),
          new Paragraph({ children: [new TextRun({ text: "2. 除非甲、乙双方另行书面约定，本合同效力优先于甲乙双方签署或确认的其他文件或材料，包括但不限于采购订单、报价单等。若出现与本合同条款有所冲突的，均以本合同为准。", size: 24 })], indent: { firstLine: 480 } }),

          new Paragraph({ text: "", spacing: { before: 400, line: 360, lineRule: "auto" } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ 
                        children: [new TextRun({ text: "甲 方：", size: 24 }), new TextRun({ text: data.partyA.name, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "纳税人识别号：", size: 24 }), new TextRun({ text: data.partyA.taxId, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "单位名称：", size: 24 }), new TextRun({ text: data.partyA.name, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "开户银行：", size: 24 }), new TextRun({ text: data.partyA.bank, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "账 号：", size: 24 }), new TextRun({ text: data.partyA.account, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "地 址：", size: 24 }), new TextRun({ text: data.partyA.address, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "电 话：", size: 24 }), new TextRun({ text: data.partyA.phone, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "合同签约人：", size: 24 }), new TextRun({ text: data.partyA.signatory, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "签约人电话：", size: 24 }), new TextRun({ text: data.partyA.signatoryPhone, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                    ] 
                  }),
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ 
                        children: [new TextRun({ text: "乙 方：", size: 24 }), new TextRun({ text: data.partyB.name, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "纳税人识别号：", size: 24 }), new TextRun({ text: data.partyB.taxId, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "收款账户名：", size: 24 }), new TextRun({ text: data.partyB.name, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "收款帐号：", size: 24 }), new TextRun({ text: data.partyB.account, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "开户银行：", size: 24 }), new TextRun({ text: data.partyB.bank, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "行 号：", size: 24 }), new TextRun({ text: data.partyB.bankCode || "", size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "地 址：", size: 24 }), new TextRun({ text: data.partyB.address, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "电 话：", size: 24 }), new TextRun({ text: data.partyB.phone, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "合同签约人：", size: 24 }), new TextRun({ text: data.partyB.signatory, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                      new Paragraph({ 
                        children: [new TextRun({ text: "签约人电话：", size: 24 }), new TextRun({ text: data.partyB.signatoryPhone, size: 24, underline: {} }), new TextRun({ children: [new Tab()], underline: {} })],
                        tabStops: [{ type: TabStopType.RIGHT, position: 4500 }]
                      }),
                    ] 
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  console.log('Generating document with docx...');
  
  // 使用 toBlob() 代替 toBuffer()，避免 NodeBuffer 在浏览器中报错
  const blob = await Packer.toBlob(doc);
  console.log('Document blob created, size:', blob.size);
  
  // 注意：Packer.toBlob() 生成的文档不包含保护设置
  // 如需文档保护，需要在服务器端处理或使用其他方案
  console.log('Protected document blob created, triggering download...', blob);
  const inferShortName = (name: string) => {
    if (!name) return '';
    return name.replace(/(有限公司|股份公司|责任公司|集团|公司|有限责任公司)$/, '');
  };

  const customerName = data.partyA.shortName || inferShortName(data.partyA.name);
  const productSummary = data.products.length > 1 
    ? `${data.products[0].name}等` 
    : (data.products[0]?.name || '');
  
  const fileName = `${data.contractNumber} ${customerName} ${productSummary}.docx`;
  saveAs(blob, fileName);
  console.log('Download triggered');
};
