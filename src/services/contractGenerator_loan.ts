import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer, PageNumber, VerticalAlign, HeadingLevel, ImageRun, IImageOptions, Tab, TabStopType } from 'docx';
import { LOGO_BASE64 } from '../constants';
import { ContractData } from './contractGenerator';
import { downloadBlob } from './downloadFile';

function getLogoUint8(): Uint8Array {
  try {
    const raw = LOGO_BASE64.split(',')[1] || LOGO_BASE64;
    const clean = raw.replace(/[\r\n\s]/g, '');
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



function base64ToUint8Array(base64: string): Uint8Array {
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const generateContract = async (data: ContractData) => {
  const logoUint8 = data.customLogo ? base64ToUint8Array(data.customLogo) : getLogoUint8();
  
  // 借用合同：甲方为法奥（data.partyB），乙方为客户（data.partyA）
  const partyA = { ...data.partyB }; // 法奥信息
  const partyB = { ...data.partyA }; // 客户信息
  
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "SimSun",
            size: 24,
            color: "000000",
          },
          paragraph: {
            spacing: {
              line: 360,
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
            color: "000000",
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
            size: 28,
            bold: false,
          },
          paragraph: {
            spacing: { before: 156, after: 156, line: 360, lineRule: "auto" },
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
                  new TextRun({ text: "法奥（苏州）机器人技术股份有限公司", size: 18, font: "SimSun" }),
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
          ...Array.from("产品借用合同").map(char => 
            new Paragraph({ 
              children: [new TextRun({ text: char, bold: true, size: 52, font: "SimHei" })], 
              alignment: AlignmentType.CENTER
            })
          ),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          
          // 甲方
          new Paragraph({ 
            children: [
              new TextRun({ text: "甲方：", size: 32, font: "SimSun" }), 
              new TextRun({ text: "法奥（苏州）机器人技术股份有限公司", size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
          new Paragraph({ text: "" }),

          // 乙方
          new Paragraph({ 
            children: [
              new TextRun({ text: "乙方：", size: 32, font: "SimSun" }), 
              new TextRun({ text: partyB.name, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),

          // 合同编号
          new Paragraph({ 
            children: [
              new TextRun({ text: "合同编号：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.contractNumber, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),

          // 签订时间
          new Paragraph({ 
            children: [
              new TextRun({ text: "签订时间：", size: 32, font: "SimSun" }), 
              new TextRun({ text: data.signingDate, size: 32, font: "SimSun" })
            ],
            indent: { left: 1440 }
          }),
          
        ],
      },
      // Page 2+: Main Content
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
                  new TextRun({ text: "法奥（苏州）机器人技术股份有限公司", size: 18, font: "SimSun" }),
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
          // ========== 第一条 商品名称、数量 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第一条 商品名称、数量", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          
          // 产品表格（6列：序号、产品名称、数量、单位、用途、备注）
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                height: { value: 567, rule: "atLeast" },
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "序号", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "产品名称", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "数量", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "单位", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "用途", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "备注", size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                ],
              }),
              ...data.products.map((p, index) => {
                return new TableRow({
                  height: { value: 567, rule: "atLeast" },
                  children: [
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: (index + 1).toString(), size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: p.name, size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: p.quantity.toString(), size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: p.unit, size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: p.purpose || '', size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                    new TableCell({ 
                      children: [new Paragraph({ children: [new TextRun({ text: p.remarks || '', size: 20, font: "SimSun", color: "000000" })], alignment: AlignmentType.CENTER })],
                      verticalAlign: VerticalAlign.CENTER,
                    }),
                  ],
                });
              }),
            ],
          }),
          
          // 空行
          new Paragraph({ text: "", spacing: { line: 360, lineRule: "auto" } }),
          
          // 借用时间（使用Web端传入的实际日期，年/月/日带下划线）
          new Paragraph({ 
            children: [
              new TextRun({ text: "借用时间：", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanStartDate ? new Date(data.loanStartDate).getFullYear().toString() : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "年", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanStartDate ? String(new Date(data.loanStartDate).getMonth() + 1).padStart(2, ' ') : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "月", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanStartDate ? String(new Date(data.loanStartDate).getDate()).padStart(2, ' ') : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "日", size: 24, font: "SimSun" }),
              new TextRun({ text: "   至   ", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanEndDate ? new Date(data.loanEndDate).getFullYear().toString() : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "年", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanEndDate ? String(new Date(data.loanEndDate).getMonth() + 1).padStart(2, ' ') : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "月", size: 24, font: "SimSun" }),
              new TextRun({ text: data.loanEndDate ? String(new Date(data.loanEndDate).getDate()).padStart(2, ' ') : "     ", size: 24, font: "SimSun", underline: { type: "single" } }),
              new TextRun({ text: "日", size: 24, font: "SimSun" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // 设备金额和押金（显示实际数值并带下划线）
          new Paragraph({ 
            children: [
              new TextRun({ text: "设备金额：", size: 24, font: "SimSun", color: "000000" }),
              new TextRun({ text: data.equipmentAmount ? data.equipmentAmount.toString() : "               ", size: 24, font: "SimSun", color: "000000", underline: { type: "single" } }),
              new TextRun({ text: "元/套，设备押金：", size: 24, font: "SimSun", color: "000000" }),
              new TextRun({ text: data.equipmentDeposit ? data.equipmentDeposit.toString() : "               ", size: 24, font: "SimSun", color: "000000", underline: { type: "single" } }),
              new TextRun({ text: "元(不含运输费用)，发货前全额支付设备押金。借用期满后，若乙方购买甲方设备，押金折抵设备款；若乙方归还甲方设备，则押金在收到设备且经甲方确认设备状态完好无损后一周内退还给乙方。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // 借用期满说明
          new Paragraph({ 
            children: [
              new TextRun({ text: "借用期满，乙方不及时处理的，默认借用转销售，押金折抵设备款。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第二条 双方权利及义务 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第二条 双方权利及义务", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 甲方：履行合同内容，收到乙方需求后及时向其提供所需物料。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "2. 乙方：履行合同内容，及时向甲方提供所需要求，且在借用产品归还前或签订相应销售/订货合同前，借用产品的所有权仍然归属甲方。未经甲方书面认可，乙方不得将所借产品销售或转借给第三方或用于本合同目的之外的其他任何用途。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第三条 借用及归还 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第三条 借用及归还", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 乙方负责借用设备在借用和归还过程中的运输事宜，并且承担一切费用、风险及责任。若乙方委托甲方代为安排运输的，需乙方支付运输费用，同时相关运输风险仍由乙方承担。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "2. 借用期满后，产品性能满足乙方要求，乙方按照新机价格进行采购，新机价格双方另行协商。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "3. 甲方会对乙方进行必要的技术培训，乙方不能执行与甲方所授技术培训内容相违背的操作；在借用期内，乙方人员由于使用甲方产品造成的任何人身或财产伤害，甲方不承担任何责任。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "4. 乙方负责设备在乙方现场的安装和借用期结束以后的拆装；乙方未经甲方允许，不能擅自拆装设备或者将已安装好的设备移位。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "5. 若在借用期间内因乙方原因造成设备软件或硬件损坏的，甲方向乙方收取维修费用和由此造成的损失，包括但不限于材料费、人工费、差旅费等。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "6. 乙方承诺在归还甲方设备时，控制柜内配置与借用时一致，设备功能完好，设备外观颜色与借用时一致（包括机器外观颜色，LOGO的颜色），设备外观清洁。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "7. 乙方搬运设备时，需确保设备有完整的原外部包装，正确搬运（符合甲方的吊装规范），确保设备不受损坏。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "8. 借用期满后一周内，乙方将设备归还甲方；若乙方到期不归还，乙方应以押金总额1%/天的数额向甲方支付租金。若乙方逾期超过十日的，甲方有权立即解除本合同且要求乙方返还设备并承担由此给甲方造成的全部损失。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第四条 违约赔偿责任 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第四条 违约赔偿责任", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 若乙方借用时因违反合同第三项借用及归还中3),4),5),6)，7）条款的内容而导致设备部件损坏，外表受损、设备变更或不清洁,乙方须向甲方进行全额损失赔偿。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "2. 乙方收到借用的设备后应立即对设备的数量、外观及外包装进行清点，确认无误后签署《提货单》。若发生任何外包装破损的迹象，乙方应在《提货单》上标明该破损情况，并在货物抵达签收当日第一时间书面通知甲方并附上相应的取证材料（照片、摄像等），否则，将视同该借用设备交付无误并处于良好的状态，若乙方在签署《提货单》后发现有任何外包装破损的情况，则甲方将不承担任何索赔责任。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "3. 借用期结束以后,甲方将对该机器人的设备状态进行确认,若出现设备状态与借出状态不符的情况,乙方须向甲方提供解释并向甲方进行相应赔偿。如果甲方认定设备状态严重不符或机器严重损坏，乙方需要进行全额赔偿。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "4. 借用期间产生的相关费用首先由押金冲抵，冲抵部分甲方应向乙方开具增值税发票；若押金不足以冲抵的费用，乙方应于收到发票之日起30日内将剩余应付款项支付给甲方。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第五条 变更和终止 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第五条 变更和终止", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "除本合同另有约定外，任何一方以书面的方式提前一周通知另一方并经过双方共同协商同意变更或终止本合同的，变更或终止合同提出方须担负变更或终止合同给另一方造成的损失。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "若乙方针对合同第三条借用及归还各条款有违约行为，但乙方在接到甲方书面通知后一天内仍未能做出纠正时，甲方有权终止本合同且不视为甲方违约，同时甲方有权没收押金，若乙方的违约行为给甲方造成的损失高于押金的，乙方需予以补足。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第六条 争议解决 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第六条 争议解决", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 本合同的制定、执行和解释均适用中华人民共和国现行有效法律。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "2. 双方将通过合理的努力解决任何因本合同的履行和解释所发生的任何争议。如果协商解决不成，任何一方均可采取进一步的法律行动。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "3. 凡因执行本合同引起的及与合同相关的一切争议，包括对其存在、有效性或终止等的任何疑问，双方应友好协商解决，不能解决的，任何一方均有权向甲方所在地当地人民法院提起诉讼。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 第七条 签署与其他 ==========
          new Paragraph({ 
            children: [new TextRun({ text: "第七条 签署与其他", font: "SimHei", size: 28, color: "000000" })], 
            heading: HeadingLevel.HEADING_1 
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "1. 本合同一式两份，经双方盖章之日起生效，双方各执一份为凭，均有同等法律效力。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          new Paragraph({ 
            children: [
              new TextRun({ text: "2. 双方确认本合同落款的经办人、联系方式、地址的适用范围包括双方非诉时各类通知、协议等文件以及就合同发生纠纷时相关文件和法律文书的送达，同时包括在争议进入仲裁、民事诉讼程序后的一审、二审、再审和执行程序，文书经签收、拒签或退回的均视为有效签收。", size: 24, font: "SimSun", color: "000000" }),
            ],
            indent: { firstLine: 480 }
          }),
          
          // ========== 签署栏 ==========
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
              // 第一行：甲方完整信息 + 乙方信息（隐藏银行信息）
              new TableRow({
                children: [
                  // 甲方
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      // 甲方：名称
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "甲   方：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "法奥（苏州）机器人技术股份有限公司", size: 21, font: "SimSun", color: "000000", underline: {} }),
                          new TextRun({ text: "                                   ", size: 21 }),
                        ],
                      }),
                      // 纳税人识别号
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "纳税人识别号：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "91320505MA1Y65M22T                                ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 单位名称
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "单位名称：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "法奥（苏州）机器人技术股份有限公司", size: 21, font: "SimSun", color: "000000", underline: {} }),
                          new TextRun({ text: "                                     ", size: 21 }),
                        ],
                      }),
                      // 开户银行
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "开户银行：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "交通银行苏州新区狮山支行", size: 21, font: "SimSun", underline: {} }),
                          new TextRun({ text: "                                    ", size: 21 }),
                        ],
                      }),
                      // 账号
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "账    号：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "325060430018800021537                                     ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 地址
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "地    址：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "江苏省苏州市高新区竹园路209号中国苏州创业园2号楼 ", size: 21, font: "SimSun", underline: {} }),
                          new TextRun({ text: "              ", size: 21 }),
                        ],
                      }),
                      // 电话
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "电    话：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: "0512-68562005", size: 21, font: "SimSun", color: "000000", underline: {} }),
                          new TextRun({ text: "                                       ", size: 21 }),
                        ],
                      }),
                    ] 
                  }),
                  // 乙方（显示完整客户信息）
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      // 乙方：名称
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "乙   方：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.name || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 纳税人识别号
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "纳税人识别号：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.taxId || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 单位名称
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "单位名称：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.name || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 开户银行
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "开户银行：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.bank || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 账号
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "账    号：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.account || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 地址
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "地    址：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.address || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                      // 电话
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "电    话：", size: 21, font: "SimSun" }),
                          new TextRun({ text: partyB.phone || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                    ] 
                  }),
                ],
              }),
              // 第二行：合同签约人
              new TableRow({
                children: [
                  // 甲方合同签约人
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "合同签约人：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: partyA.signatory || "                         ", size: 21, font: "SimSun", underline: {} }),
                          new TextRun({ text: "          ", size: 21 }),
                        ],
                      }),
                    ] 
                  }),
                  // 乙方合同签约人
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "合同签约人：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: partyB.signatory || "                                   ", size: 21, font: "SimSun", underline: {} }),
                        ],
                      }),
                    ] 
                  }),
                ],
              }),
              // 第三行：签约人电话
              new TableRow({
                children: [
                  // 甲方签约人电话
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "签约人电话：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: partyA.signatoryPhone || "  ", size: 21, font: "SimSun", underline: {} }),
                          new TextRun({ text: "       ", size: 21 }),
                        ],
                      }),
                    ] 
                  }),
                  // 乙方签约人电话
                  new TableCell({ 
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({ 
                        children: [
                          new TextRun({ text: "签约人电话：", size: 21, font: "SimSun", color: "000000" }),
                          new TextRun({ text: partyB.signatoryPhone || "      ", size: 21, font: "SimSun", underline: {} }),
                          new TextRun({ text: "              ", size: 21 }),
                        ],
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

  console.log('Generating loan contract document...');
  
  // 使用 toBlob() 代替 toBuffer()，避免 NodeBuffer 在浏览器中报错
  const blob = await Packer.toBlob(doc);
  console.log('Document blob created, size:', blob.size);
  
  const inferShortName = (name: string) => {
    if (!name) return '';
    return name.replace(/(有限公司|股份公司|责任公司|集团|公司|有限责任公司)$/, '');
  };

  const customerName = partyB.shortName || inferShortName(partyB.name);
  const productSummary = data.products.length > 1 
    ? `${data.products[0].name}等` 
    : (data.products[0]?.name || '');
  
  const fileName = `${data.contractNumber || ''} ${customerName} ${productSummary}借用合同.docx`.trim();
  downloadBlob(blob, fileName);
  console.log('Download triggered');
};
