import { ContractData, PartyInfo } from '../services/contractGenerator';
import { generateContract as generateSalesContract } from '../services/contractGenerator';
import { generateContract as generateLoanContract } from '../services/contractGenerator_loan';

// 虚拟客户数据
const testCustomer: PartyInfo = {
  name: '武汉福艾利恩电气有限公司',
  shortName: '福艾利恩',
  taxId: '91420100MA4K3X7G8N',
  bank: '中国工商银行武汉光谷支行',
  account: '3202006109200123456',
  bankCode: '102521000123',
  address: '湖北省武汉市东湖新技术开发区光谷大道3号未来之光科技园7栋1201室',
  phone: '027-67891234',
  signatory: '王建国',
  signatoryPhone: '13812345678',
  email: 'wang.jianguo@fairy-electric.com'
};

// 法奥默认信息
const partyBDefaults: PartyInfo = {
  name: '法奥（苏州）机器人技术股份有限公司',
  taxId: '91320505MA1Y65M22T',
  bank: '交通银行苏州高新区狮山支行',
  account: '325060430018800021537',
  bankCode: '325060430018',
  address: '江苏省苏州市高新区竹园路209号中国苏州创业园2号楼',
  phone: '0512-67313593',
  signatory: '王悦',
  signatoryPhone: '1516938952',
  email: 'wangyue@frtech.fr'
};

// 销售合同测试数据
export const testSalesContractData: ContractData = {
  contractNumber: 'FS26-A042',
  signingDate: '2026-04-14',
  partyA: testCustomer,
  partyB: partyBDefaults,
  products: [
    {
      name: 'FR5协作机器人',
      unit: '台',
      quantity: 2,
      unitPriceIncTax: 23800,
      taxRate: 0.13,
      remarks: '标准机，不含示教器'
    },
    {
      name: 'FR10协作机器人',
      unit: '台',
      quantity: 1,
      unitPriceIncTax: 36800,
      taxRate: 0.13,
      remarks: '标准机，不含示教器'
    }
  ],
  deliveryDays: 30,
  completionDate: '2026-05-14',
  paymentDays: 5,
  warrantyMonths: 12,
  customLogo: undefined,
  deliveryLocation: '甲方',
  deliveryAddress: '湖北省武汉市东湖新技术开发区光谷大道3号未来之光科技园7栋1201室',
  contractType: 'sales',
  loanStartDate: '',
  loanEndDate: '',
  equipmentAmount: 0,
  equipmentDeposit: 0
};

// 借用合同测试数据
export const testLoanContractData: ContractData = {
  contractNumber: 'FL26-A015',
  signingDate: '2026-04-14',
  partyA: testCustomer,
  partyB: partyBDefaults,
  products: [
    {
      name: 'FR3WMS协作机器人',
      unit: '台',
      quantity: 1,
      unitPriceIncTax: 0,
      taxRate: 0,
      remarks: '借用设备',
      purpose: '产品测试与评估'
    }
  ],
  deliveryDays: 7,
  completionDate: '',
  paymentDays: 0,
  warrantyMonths: 0,
  customLogo: undefined,
  deliveryLocation: '甲方',
  deliveryAddress: '湖北省武汉市东湖新技术开发区光谷大道3号未来之光科技园7栋1201室',
  contractType: 'loan',
  loanStartDate: '2026-04-14',
  loanEndDate: '2026-05-14',
  equipmentAmount: 24800,
  equipmentDeposit: 5000
};

// 生成测试合同
export async function generateTestSalesContract() {
  console.log('生成销售合同测试数据...');
  await generateSalesContract(testSalesContractData);
  console.log('销售合同生成完成！');
}

export async function generateTestLoanContract() {
  console.log('生成借用合同测试数据...');
  await generateLoanContract(testLoanContractData);
  console.log('借用合同生成完成！');
}

// 虚拟客户档案数据（用于 Firestore）
export const testCustomerMemory = {
  name: '武汉福艾利恩电气有限公司',
  shortName: '福艾利恩',
  taxId: '91420100MA4K3X7G8N',
  address: '湖北省武汉市东湖新技术开发区光谷大道3号未来之光科技园7栋1201室',
  phone: '027-67891234',
  bank: '中国工商银行武汉光谷支行',
  account: '3202006109200123456',
  bankCode: '102521000123',
  email: 'contact@fairy-electric.com',
  contacts: [
    {
      name: '王建国',
      phone: '13812345678',
      email: 'wang.jianguo@fairy-electric.com',
      position: '采购经理',
      isDefault: true
    },
    {
      name: '李芳',
      phone: '13987654321',
      email: 'li.fang@fairy-electric.com',
      position: '财务总监',
      isDefault: false
    }
  ],
  deliveryAddresses: [
    {
      id: 'addr_001',
      name: '总部',
      address: '湖北省武汉市东湖新技术开发区光谷大道3号未来之光科技园7栋1201室',
      contactName: '王建国',
      contactPhone: '13812345678',
      isDefault: true
    },
    {
      id: 'addr_002',
      name: '工厂',
      address: '湖北省武汉市江夏区光谷智能制造产业园B区8号厂房',
      contactName: '张工',
      contactPhone: '13666668888',
      isDefault: false
    }
  ],
  purchaseHistory: [
    {
      id: 'ph_001',
      contractNumber: 'FS25-A108',
      date: new Date('2025-12-15'),
      products: [
        { name: 'FR3WMS协作机器人', quantity: 1, unitPrice: 24800, unit: '台' }
      ],
      totalAmount: 24800
    },
    {
      id: 'ph_002',
      contractNumber: 'FS26-A042',
      date: new Date('2026-04-14'),
      products: [
        { name: 'FR5协作机器人', quantity: 2, unitPrice: 23800, unit: '台' },
        { name: 'FR10协作机器人', quantity: 1, unitPrice: 36800, unit: '台' }
      ],
      totalAmount: 84400
    }
  ]
};

// 虚拟产品库数据
export const testProductCatalog = [
  { id: 'p001', name: 'FR3WMS协作机器人', model: 'FR3WMS', unitPrice: 24800, unit: '台', category: '标准型', description: '3kg负载，工作半径600mm', isActive: true },
  { id: 'p002', name: 'FR3WML协作机器人', model: 'FR3WML', unitPrice: 25800, unit: '台', category: '长臂型', description: '3kg负载，工作半径800mm', isActive: true },
  { id: 'p003', name: 'FR5WML协作机器人', model: 'FR5WML', unitPrice: 39800, unit: '台', category: '长臂型', description: '5kg负载，工作半径950mm', isActive: true },
  { id: 'p004', name: 'FR3（镜像）协作机器人', model: 'FR3-M', unitPrice: 22800, unit: '台', category: '标准型', description: '3kg负载，镜像安装版本', isActive: true },
  { id: 'p005', name: 'FR5协作机器人', model: 'FR5', unitPrice: 23800, unit: '台', category: '标准型', description: '5kg负载，工作半径800mm', isActive: true },
  { id: 'p006', name: 'FR10协作机器人', model: 'FR10', unitPrice: 36800, unit: '台', category: '大负载', description: '10kg负载，工作半径1200mm', isActive: true },
  { id: 'p007', name: 'FR16协作机器人', model: 'FR16', unitPrice: 36800, unit: '台', category: '大负载', description: '16kg负载，工作半径1000mm', isActive: true },
  { id: 'p008', name: 'FR20协作机器人', model: 'FR20', unitPrice: 46800, unit: '台', category: '大负载', description: '20kg负载，工作半径1500mm', isActive: true },
  { id: 'p009', name: 'FR30协作机器人', model: 'FR30', unitPrice: 46800, unit: '台', category: '大负载', description: '30kg负载，工作半径1800mm', isActive: true },
];
