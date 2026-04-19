import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Plus, Trash2, Download, Building2, Package, Hash, ChevronRight, CheckCircle2, Sparkles, Upload, Loader2, LogOut, History, Search, Settings2, X, Type, Camera
} from 'lucide-react';
import { generateContract as generateSalesContract, ContractData, PartyInfo } from './services/contractGenerator';
import { generateContract as generateLoanContract } from './services/contractGenerator_loan';
import { identifyPartyA } from './services/aiService';
import { logout } from './services/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { LOGO_BASE64 } from './constants';
import HiddenLogin from './components/HiddenLogin';
import { 
  CustomerWithMemory, 
  subscribeToCustomersMemory, 
  saveCustomerMemory, 
  addPurchaseRecord,
  CatalogProduct,
  subscribeToCatalogProducts,
} from './services/userService';
import { Timestamp } from 'firebase/firestore';

const initialParty: PartyInfo = {
  name: '', taxId: '', bank: '', account: '', bankCode: '', address: '', phone: '', signatory: '', signatoryPhone: '', email: ''
};

const partyBDefaults: PartyInfo = {
  name: '法奥（苏州）机器人技术股份有限公司',
  taxId: '91320505MA1Y65M22T',
  bank: '交通银行苏州高新区狮山支行',
  account: '3013050000184',
  bankCode: '301305000018',
  address: '江苏省苏州市高新区竹园路209号中国苏州创业园2号楼',
  phone: '0512-67313593',
  signatory: '王悦',
  signatoryPhone: '1516938952',
  email: 'wangyue@frtech.fr'
};

// 高精度版价格加价
const PRECISION_PRICE_DELTA = 2000;

// 默认产品目录（当Firestore中没有数据时使用）
const DEFAULT_PRODUCT_CATALOG = [
  { name: 'FR3WMS协作机器人', unitPrice: 24800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR3WML协作机器人', unitPrice: 25800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR5WML协作机器人', unitPrice: 39800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR3（镜像）协作机器人', unitPrice: 22800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR5协作机器人', unitPrice: 23800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR10协作机器人', unitPrice: 36800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR16协作机器人', unitPrice: 36800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR20协作机器人', unitPrice: 46800, unit: '套', hasPrecisionVersion: true },
  { name: 'FR30协作机器人', unitPrice: 46800, unit: '套', hasPrecisionVersion: true },
];

export default function App() {
  const [data, setData] = useState<ContractData>({
    contractNumber: 'FS26-A0',
    signingDate: new Date().toISOString().split('T')[0],
    partyA: { ...initialParty },
    partyB: { ...partyBDefaults },
    products: [{ name: '', unit: '台', quantity: 1, unitPriceIncTax: 0, taxRate: 0.13, remarks: '标准机，不含示教器' }],
    deliveryDays: 30,
    completionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentDays: 5,
    warrantyMonths: 12,
    customLogo: undefined,
    deliveryLocation: '甲方',
    deliveryAddress: '',
    contractType: 'sales',
    loanStartDate: new Date().toISOString().split('T')[0],
    loanEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    equipmentAmount: 0,
    equipmentDeposit: 0
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState('');
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [step, setStep] = useState(1);
  const [ocrSummary, setOcrSummary] = useState('');
  const [verifySummary, setVerifySummary] = useState<React.ReactNode>('');
  // 识别模式：'image'=图片上传  'text'=文字粘贴
  const [identifyMode, setIdentifyMode] = useState<'image' | 'text'>('image');
  const [pasteText, setPasteText] = useState('');
  
  // Auth & Memory State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [customers, setCustomers] = useState<CustomerWithMemory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // 联系人AI识别
  const [showContactAi, setShowContactAi] = useState(false);
  const [contactAiText, setContactAiText] = useState('');
  const [isParsingContact, setIsParsingContact] = useState(false);
  // 产品目录
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    if (!user) {
      setCustomers([]);
      return;
    }
    let isMounted = true;
    const unsubscribe = subscribeToCustomersMemory((data) => {
      if (isMounted) setCustomers(data);
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user]);

  // 订阅产品目录
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToCatalogProducts((data) => {
      if (isMounted) setCatalogProducts(data);
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 用 useCallback 稳定传给 HiddenLogin 的回调，避免因函数引用变化触发重复 Firebase 订阅
  const handleLogin = useCallback((u: FirebaseUser, admin: boolean) => {
    setUser(u);
    setIsAdmin(admin);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setIsAdmin(false);
    setCustomers([]);
  }, []);

  const updatePartyA = (field: keyof PartyInfo, value: string) => {
    setData(prev => ({ ...prev, partyA: { ...prev.partyA, [field]: value } }));
  };

  const updatePartyB = (field: keyof PartyInfo, value: string) => {
    setData(prev => ({ ...prev, partyB: { ...prev.partyB, [field]: value } }));
  };

  // 客户信息统一存储在partyA中，无论哪种合同类型
  const getEditableParty = () => {
    return data.partyA;
  };

  // 统一更新partyA（客户信息）
  const updateEditableParty = (field: keyof PartyInfo, value: string) => {
    updatePartyA(field, value);
  };

  const selectCustomer = (customer: CustomerWithMemory) => {
    // 找到默认联系人
    const defaultContact = customer.contacts?.find(c => c.isDefault) || customer.contacts?.[0];
    // 找到默认收货地址
    const defaultAddress = customer.deliveryAddresses?.find(a => a.isDefault) || customer.deliveryAddresses?.[0];
    
    setData(prev => ({
      ...prev,
      partyA: {
        ...prev.partyA,
        name: customer.name,
        shortName: customer.shortName,
        taxId: customer.taxId,
        address: customer.address || '',
        phone: customer.phone || '',
        bank: customer.bank || '',
        account: customer.account || '',
        bankCode: customer.bankCode || '',
        signatory: defaultContact?.name || prev.partyA.signatory,
        signatoryPhone: defaultContact?.phone || prev.partyA.signatoryPhone,
        email: defaultContact?.email || prev.partyA.email,
      },
      // 如果有默认收货地址，自动填充交货地址
      deliveryAddress: defaultAddress?.address || prev.deliveryAddress,
    }));
    setShowHistory(false);
  };

  const handleAiIdentify = async (input: string | { data: string, mimeType: string }) => {
    setIsIdentifying(true);
    setOcrSummary('');
    setVerifySummary('');
    setIdentifyError('');
    try {
      const identified = await identifyPartyA(input);
      const newPartyA = {
        ...data.partyA,
        ...identified
      };
      setData(prev => ({
        ...prev,
        partyA: newPartyA
      }));

      // Build OCR summary
      const parts: string[] = [];
      if (identified.name) parts.push('公司：' + identified.name);
      if (identified.taxId) parts.push('信用代码：' + identified.taxId);
      if (identified.signatory) parts.push('法人：' + identified.signatory);
      if (identified.address) parts.push('地址：' + identified.address);
      setOcrSummary(parts.length ? '✅ ' + parts.join('  |  ') : '');

      // Build AI verify summary (混元校验)
      if (identified.verifyResult) {
        const vr = identified.verifyResult;
        const checkItems = [
          { label: '公司名称', valid: vr.checks.nameValid, desc: vr.checks.nameCheck },
          { label: '信用代码', valid: vr.checks.taxIdValid, desc: vr.checks.taxIdCheck },
          { label: '法人姓名', valid: vr.checks.legalPersonValid, desc: vr.checks.legalPersonCheck },
          { label: '企业地址', valid: vr.checks.addressValid, desc: vr.checks.addressCheck },
        ];

        const isPass = vr.verified;
        setVerifySummary(
          <div className={`rounded-xl border p-4 text-sm space-y-2 ${isPass ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="font-semibold flex items-center gap-2">
              {isPass ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-amber-600" />}
              AI 智能校验 — {isPass ? '通过' : '存在问题'}（置信度 {vr.confidence}%）
            </div>
            <div className="space-y-1">
              {checkItems.map(item => (
                <div key={item.label} className="flex items-start gap-2 text-xs">
                  <span className={item.valid ? 'text-emerald-600' : 'text-amber-600'}>
                    {item.valid ? '✅' : '⚠️'}
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium">{item.label}：</span>
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
            {vr.summary && (
              <div className="text-slate-500 text-xs pt-1 border-t border-slate-100 mt-1">
                💡 {vr.summary}
              </div>
            )}
          </div>
        );
      } else {
        setVerifySummary('');
      }
      
      // Auto-save to memory if logged in
      if (user && identified.name && identified.taxId) {
        await saveCustomerMemory({
          name: identified.name,
          shortName: identified.shortName,
          taxId: identified.taxId,
          address: identified.address || '',
          phone: identified.phone || '',
          bank: identified.bank || '',
          account: identified.account || '',
          bankCode: identified.bankCode || '',
          email: identified.email || '',
          contacts: identified.signatory ? [{
            name: identified.signatory,
            phone: identified.signatoryPhone || '',
            email: identified.email || '',
            isDefault: true,
          }] : [],
          deliveryAddresses: [],
          purchaseHistory: [],
        });
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : '识别失败，请稍后重试';
      setIdentifyError(msg);
      console.error('AI识别失败:', err);
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdentifyError('');
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        handleAiIdentify({ data: base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setData(prev => ({ ...prev, customLogo: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProductChange = (index: number, field: string, value: string | number) => {
    setData(prev => {
      const newProducts = [...prev.products];
      newProducts[index] = { ...newProducts[index], [field]: value };
      return { ...prev, products: newProducts };
    });
  };

  const addProduct = () => setData(prev => ({ ...prev, products: [...prev.products, { name: '', unit: '台', quantity: 1, unitPriceIncTax: 0, taxRate: 0.13, remarks: '标准机，不含示教器' }] }));
  const removeProduct = (index: number) => { if (data.products.length > 1) setData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) })); };

  const handleGenerate = async () => {
    setIsGenerating(true);
    console.log('Starting contract generation...', data);
    try {
      // Save customer to memory on generation (仅销售合同保存客户档案)
      if (data.contractType === 'sales' && user && data.partyA.name && data.partyA.taxId) {
        const customerId = await saveCustomerMemory({
          name: data.partyA.name,
          shortName: data.partyA.shortName,
          taxId: data.partyA.taxId,
          address: data.partyA.address,
          phone: data.partyA.phone,
          bank: data.partyA.bank,
          account: data.partyA.account,
          bankCode: data.partyA.bankCode || '',
          email: data.partyA.email || '',
          contacts: data.partyA.signatory ? [{
            name: data.partyA.signatory,
            phone: data.partyA.signatoryPhone || '',
            email: data.partyA.email,
            isDefault: true,
          }] : [],
          deliveryAddresses: data.deliveryAddress ? [{
            id: Date.now().toString(),
            name: '默认地址',
            address: data.deliveryAddress,
            contactName: data.partyA.signatory || '',
            contactPhone: data.partyA.signatoryPhone || '',
            isDefault: true,
          }] : [],
          purchaseHistory: [],
        });
        
        // 保存采购记录
        if (customerId) {
          await addPurchaseRecord(customerId, {
            contractNumber: data.contractNumber,
            date: Timestamp.now(),
            products: data.products.map(p => ({
              name: p.name,
              quantity: p.quantity,
              unitPrice: p.unitPriceIncTax,
              unit: p.unit,
            })),
            totalAmount: totalAmount,
          });
        }
      }
      // 根据合同类型调用不同生成器
      if (data.contractType === 'sales') {
        await generateSalesContract(data);
      } else {
        // 借用合同：自动计算设备金额和押金
        // 注意：借用合同生成器内部会处理 partyA/partyB 的映射（甲方=法奥，乙方=客户）
        const loanData = {
          ...data,
          equipmentAmount: data.products[0]?.unitPriceIncTax || 0,
          equipmentDeposit: totalAmount,
        };
        await generateLoanContract(loanData);
      }
      console.log('Contract generation successful');
    } catch (error) { 
      console.error('Contract generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`生成合同失败：${errorMessage}`);
    } finally { 
      setIsGenerating(false); 
    }
  };

  const totalAmount = data.products.reduce((sum, p) => sum + p.quantity * p.unitPriceIncTax, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {/* 顶部主区域 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            {/* Logo + 标题 */}
            <div className="flex items-center gap-3 min-w-0">
              <img 
                src={data.customLogo || LOGO_BASE64} 
                alt="Logo" 
                className="h-9 w-auto flex-shrink-0 object-contain" 
                referrerPolicy="no-referrer" 
              />
              <div className="h-6 w-px bg-slate-200 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">法奥机器人 · 智能合同系统</span>
            </div>

            {/* 右侧操作区 */}
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <button 
                onClick={() => setShowTemplateSettings(true)}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                title="模板设置"
              >
                <Settings2 className="w-5 h-5" />
              </button>
              <div className="h-6 w-px bg-slate-100" />
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-slate-900 whitespace-nowrap">{user.displayName || user.email}</p>
                    <p className="text-[10px] text-slate-400">{isAdmin ? '管理员' : '已登录'}</p>
                  </div>
                  <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="退出登录">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400">未登录</div>
              )}
            </div>
          </div>

          {/* 合同类型选择 */}
          <div className="px-6 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-600">合同类型：</span>
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200">
                <button
                  onClick={() => setData(prev => ({ ...prev, contractType: 'sales', contractNumber: 'FS26-A0' }))}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    data.contractType === 'sales' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  销售合同
                </button>
                <button
                  onClick={() => setData(prev => ({ ...prev, contractType: 'loan', contractNumber: 'FO26-A0' }))}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    data.contractType === 'loan' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  借用合同
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {data.contractType === 'sales' ? '产品采购合同' : '产品借用合同'}
            </div>
          </div>

          {/* 步骤条 */}
          <div className="px-6 py-3 bg-slate-50/60 flex items-center gap-1">
            {[1, 2, 3].map(s => {
              const labels = ['客户信息', '合同条款', '产品清单'];
              const isActive = step === s;
              const isDone = step > s;
              return (
                <React.Fragment key={s}>
                  <button
                    onClick={() => s < step && setStep(s)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${isActive ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 
                        isDone ? 'text-slate-400 hover:text-blue-500 cursor-pointer' : 
                        'text-slate-300 cursor-default'}`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border-2 flex-shrink-0
                      ${isActive ? 'border-blue-500 bg-blue-500 text-white' : 
                        isDone ? 'border-slate-300 bg-slate-100 text-slate-400' : 
                        'border-slate-200 text-slate-300'}`}>
                      {s}
                    </span>
                    <span>{labels[s-1]}</span>
                  </button>
                  {s < 3 && <ChevronRight className="w-4 h-4 text-slate-200 flex-shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Building2 className="text-blue-600" /> 
                      客户详细资料
                      <span className="text-xs font-normal text-slate-400 ml-2">
                        {data.contractType === 'sales' ? '（销售合同中为甲方）' : '（借用合同中为乙方）'}
                      </span>
                    </h2>
                    <div className="flex items-center gap-3">
                      {user && data.contractType === 'sales' && (
                        <button 
                          onClick={() => setShowHistory(!showHistory)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showHistory ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                        >
                          <History className="w-4 h-4" /> 历史记录
                        </button>
                      )}
                      <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">支持 AI 识别</span>
                    </div>
                  </div>

                  {/* History Selection Panel */}
                  <AnimatePresence>
                    {showHistory && user && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mb-8 overflow-hidden"
                      >
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <Search className="w-4 h-4" /> 搜索历史客户
                            </h3>
                            <input 
                              type="text"
                              value={searchTerm}
                              onChange={e => setSearchTerm(e.target.value)}
                              placeholder="输入公司名称搜索..."
                              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none w-48"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {customers
                              .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                              .map(customer => (
                                <button
                                  key={customer.id}
                                  onClick={() => selectCustomer(customer)}
                                  className="flex flex-col items-start p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left group"
                                >
                                  <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{customer.name}</span>
                                  <span className="text-[10px] text-slate-400 mt-1">税号: {customer.taxId}</span>
                                </button>
                              ))}
                            {customers.length === 0 && (
                              <div className="col-span-2 py-8 text-center text-slate-400 text-sm">
                                暂无历史记录，登录并生成合同后将自动保存。
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* AI Identification Section */}
                  <div className="mb-8 p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h3 className="text-sm font-bold text-blue-900">企业信息智能识别</h3>
                      </div>
                      {/* 模式切换 Tab */}
                      <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-blue-100">
                        <button
                          onClick={() => setIdentifyMode('image')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            identifyMode === 'image'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" /> 图片识别
                        </button>
                        <button
                          onClick={() => setIdentifyMode('text')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            identifyMode === 'text'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Type className="w-3.5 h-3.5" /> 文字识别
                        </button>
                      </div>
                    </div>

                    {identifyMode === 'image' ? (
                      /* 图片上传模式 */
                      <>
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-200 rounded-xl bg-white hover:bg-blue-50 transition-all cursor-pointer relative group p-6">
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleImageUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            disabled={isIdentifying}
                          />
                          {isIdentifying ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                              <span className="text-xs font-medium text-blue-600">正在识别营业执照...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <div className="p-3 bg-blue-50 rounded-full group-hover:scale-110 transition-transform">
                                <Upload className="w-6 h-6 text-blue-600" />
                              </div>
                              <span className="text-xs font-medium text-slate-500">点击上传营业执照照片（自动识别企业信息）</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 上传清晰的营业执照照片，自动提取公司全称、税号、地址等信息
                        </p>
                        {identifyError && (
                          <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-start gap-2">
                            <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{identifyError}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      /* 文字粘贴模式 */
                      <>
                        <textarea
                          value={pasteText}
                          onChange={e => { setPasteText(e.target.value); setIdentifyError(''); }}
                          placeholder={`粘贴企业信息文字，支持多种格式，例如：\n\n公司名称：武汉福艾利恩电气有限公司\n统一社会信用代码：91420100XXXXXXXX\n地址：武汉市洪山区...\n联系电话：027-XXXXXXXX\n\n或直接粘贴名片、工商登记页面的文字内容`}
                          rows={6}
                          disabled={isIdentifying}
                          className="w-full px-4 py-3 rounded-xl border border-blue-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 placeholder-slate-300 resize-none"
                        />
                        {identifyError && (
                          <div className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-start gap-2">
                            <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{identifyError}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-[10px] text-slate-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 支持名片、工商登记页、邮件签名等任意格式文字，AI 自动提取结构化信息
                          </p>
                          <button
                            onClick={() => pasteText.trim() && handleAiIdentify(pasteText.trim())}
                            disabled={isIdentifying || !pasteText.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {isIdentifying ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 解析中...</>
                            ) : (
                              <><Sparkles className="w-3.5 h-3.5" /> AI 解析</>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-sm text-slate-700 mb-1">公司全称 <span className="text-red-500">*</span></label>
                        <input type="text" value={getEditableParty().name} onChange={e => updateEditableParty('name', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" placeholder="如：武汉福艾利恩电气有限公司" />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">客户简称 <span className="text-red-500">*</span></label>
                        <input type="text" value={getEditableParty().shortName || ''} onChange={e => updateEditableParty('shortName', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" placeholder="如：福艾利恩" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">纳税人识别号 <span className="text-red-500">*</span></label>
                      <input type="text" value={getEditableParty().taxId} onChange={e => { updateEditableParty('taxId', e.target.value); }} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm" placeholder="18位统一社会信用代码" />
                    </div>
                    {/* OCR 识别摘要 */}
                    {ocrSummary && (
                      <div className="md:col-span-2 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {ocrSummary}
                      </div>
                    )}
                    {/* 企业信息核验结果 */}
                    {verifySummary && (
                      <div className="md:col-span-2">
                        {verifySummary}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">联系电话 <span className="text-red-500">*</span></label>
                      <input type="text" value={getEditableParty().phone} onChange={e => updateEditableParty('phone', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">开户银行 <span className="text-red-500">*</span></label>
                      <input type="text" value={getEditableParty().bank} onChange={e => updateEditableParty('bank', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">银行账号 <span className="text-red-500">*</span></label>
                      <input type="text" value={getEditableParty().account} onChange={e => updateEditableParty('account', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">联行号 (行号)</label>
                      <input type="text" value={getEditableParty().bankCode || ''} onChange={e => updateEditableParty('bankCode', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="选填" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm text-slate-700 mb-1">公司地址 <span className="text-red-500">*</span></label>
                      <input type="text" value={getEditableParty().address} onChange={e => updateEditableParty('address', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    {/* 联系人信息区域 */}
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          联系人信息
                        </h3>
                        <button
                          onClick={() => setShowContactAi(!showContactAi)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {showContactAi ? '收起' : 'AI 识别'}
                        </button>
                      </div>
                      
                      {/* 联系人 AI 识别区域 */}
                      <AnimatePresence>
                        {showContactAi && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mb-4 overflow-hidden"
                          >
                            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                              <textarea
                                value={contactAiText}
                                onChange={e => setContactAiText(e.target.value)}
                                placeholder={`粘贴联系人信息，例如：
王经理 13812345678
邮箱：wang@company.com
职位：采购经理`}
                                rows={4}
                                className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                              />
                              <div className="flex justify-end mt-2">
                                <button
                                  onClick={async () => {
                                    if (!contactAiText.trim()) return;
                                    setIsParsingContact(true);
                                    try {
                                      // 调用混元解析联系人
                                      const result = await identifyPartyA(contactAiText);
                                      if (result.signatory) {
                                        updateEditableParty('signatory', result.signatory);
                                      }
                                      if (result.signatoryPhone) {
                                        updateEditableParty('signatoryPhone', result.signatoryPhone);
                                      }
                                      if (result.email) {
                                        updateEditableParty('email', result.email);
                                      }
                                      setShowContactAi(false);
                                      setContactAiText('');
                                    } catch (err) {
                                      console.error('联系人解析失败:', err);
                                    } finally {
                                      setIsParsingContact(false);
                                    }
                                  }}
                                  disabled={isParsingContact || !contactAiText.trim()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {isParsingContact ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 解析中...</>
                                  ) : (
                                    <><Sparkles className="w-3.5 h-3.5" /> 解析</>
                                  )}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">签约代表 <span className="text-red-500">*</span></label>
                          <input type="text" value={getEditableParty().signatory} onChange={e => updateEditableParty('signatory', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-700 mb-1">代表电话 <span className="text-red-500">*</span></label>
                          <input type="text" value={getEditableParty().signatoryPhone} onChange={e => updateEditableParty('signatoryPhone', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">电子信箱</label>
                          <input type="text" value={getEditableParty().email} onChange={e => updateEditableParty('email', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 flex justify-end"><button onClick={() => setStep(2)} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2">下一步 <ChevronRight className="w-5 h-5" /></button></div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Hash className="text-blue-600" /> {data.contractType === 'sales' ? '合同基本条款' : '借用条款设置'}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">合同编号 <span className="text-red-500">*</span></label>
                      <input type="text" value={data.contractNumber} onChange={e => setData(prev => ({ ...prev, contractNumber: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-700 mb-1">签订日期 <span className="text-red-500">*</span></label>
                      <input type="date" value={data.signingDate} onChange={e => setData(prev => ({ ...prev, signingDate: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    
                    {data.contractType === 'sales' ? (
                      <>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">交货周期 (天) <span className="text-red-500">*</span></label>
                          <input type="number" value={data.deliveryDays} onChange={e => setData(prev => ({ ...prev, deliveryDays: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">提货截止日期 <span className="text-red-500">*</span></label>
                          <input type="date" value={data.completionDate} onChange={e => setData(prev => ({ ...prev, completionDate: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">付款期限 (天) <span className="text-red-500">*</span></label>
                          <input type="number" value={data.paymentDays} onChange={e => setData(prev => ({ ...prev, paymentDays: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">质保期限 (月) <span className="text-red-500">*</span></label>
                          <input type="number" value={data.warrantyMonths} onChange={e => setData(prev => ({ ...prev, warrantyMonths: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">借用开始日期 <span className="text-red-500">*</span></label>
                          <input type="date" value={data.loanStartDate} onChange={e => setData(prev => ({ ...prev, loanStartDate: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">借用结束日期 <span className="text-red-500">*</span></label>
                          <input type="date" value={data.loanEndDate} onChange={e => setData(prev => ({ ...prev, loanEndDate: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" />
                        </div>
                      </>
                    )}
                    
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">{data.contractType === 'sales' ? '交货地点' : '借用设备提取地点'} <span className="text-red-500">*</span></label>
                        <div className="flex gap-6 mt-2">
                          {['甲方', '乙方'].map((loc) => (
                            <label key={loc} className="flex items-center gap-2 cursor-pointer group">
                              <input 
                                type="radio" 
                                name="deliveryLocation" 
                                value={loc} 
                                checked={data.deliveryLocation === loc}
                                onChange={() => setData(prev => ({ ...prev, deliveryLocation: loc as '甲方' | '乙方' }))}
                                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{loc}所在地</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-slate-700 mb-1">具体交货地址 <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          value={data.deliveryAddress} 
                          onChange={e => setData(prev => ({ ...prev, deliveryAddress: e.target.value }))} 
                          className="w-full px-4 py-2.5 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none" 
                          placeholder="请输入详细交货地址"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 flex justify-between">
                    <button onClick={() => setStep(1)} className="px-8 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all">上一步</button>
                    <button onClick={() => setStep(3)} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2">下一步 <ChevronRight className="w-5 h-5" /></button>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Package className="text-blue-600" /> {data.contractType === 'sales' ? '产品采购清单' : '借用产品清单'}</h2>
                    <button onClick={addProduct} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"><Plus className="w-4 h-4" /> 添加产品</button>
                  </div>
                  <div className="space-y-4">
                    {data.products.map((product, index) => (
                      <div key={index} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 relative group">
                        {data.products.length > 1 && <button onClick={() => removeProduct(index)} className="absolute -top-2 -right-2 p-1.5 bg-white border border-slate-200 text-red-500 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">产品型号 / 名称</label>
                            <div className="flex gap-2">
                              <select 
                                className="w-1/3 px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                                onChange={(e) => {
                                  // 优先从 Firestore 产品目录查找，fallback 到默认目录
                                  const firestoreProduct = catalogProducts.find(p => p.id === e.target.value);
                                  if (firestoreProduct) {
                                    setData(prev => {
                                      const newProducts = [...prev.products];
                                      newProducts[index] = { 
                                        ...newProducts[index], 
                                        name: firestoreProduct.name, 
                                        unitPriceIncTax: firestoreProduct.unitPrice,
                                        unit: firestoreProduct.unit || '套',
                                        basePrice: firestoreProduct.unitPrice,
                                        hasPrecisionVersion: firestoreProduct.hasPrecisionVersion ?? false,
                                        isPrecisionVersion: false,
                                        remarks: '标准机，不含示教器',
                                      };
                                      return { ...prev, products: newProducts };
                                    });
                                    return;
                                  }
                                  // fallback: 默认目录（value 用 name 匹配）
                                  const defaultProduct = DEFAULT_PRODUCT_CATALOG.find(p => p.name === e.target.value);
                                  if (defaultProduct) {
                                    setData(prev => {
                                      const newProducts = [...prev.products];
                                      newProducts[index] = { 
                                        ...newProducts[index], 
                                        name: defaultProduct.name, 
                                        unitPriceIncTax: defaultProduct.unitPrice,
                                        unit: defaultProduct.unit || '套',
                                        basePrice: defaultProduct.unitPrice,
                                        hasPrecisionVersion: defaultProduct.hasPrecisionVersion ?? false,
                                        isPrecisionVersion: false,
                                        remarks: '标准机，不含示教器',
                                      };
                                      return { ...prev, products: newProducts };
                                    });
                                  }
                                }}
                                value={
                                  catalogProducts.find(p => p.name === product.name)?.id 
                                  ?? (DEFAULT_PRODUCT_CATALOG.find(p => p.name === product.name)?.name ?? "")
                                }
                              >
                                <option value="">快速选择型号...</option>
                                {catalogProducts.length > 0
                                  ? catalogProducts.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                                    ))
                                  : DEFAULT_PRODUCT_CATALOG.map(p => (
                                      <option key={p.name} value={p.name}>{p.name}</option>
                                    ))
                                }
                              </select>
                              <input 
                                type="text" 
                                value={product.name} 
                                onChange={e => handleProductChange(index, 'name', e.target.value)} 
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                                placeholder="或手动输入名称..." 
                              />
                            </div>
                            {/* 高精度版切换 */}
                            {product.hasPrecisionVersion && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-slate-500">版本：</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setData(prev => {
                                      const newProducts = [...prev.products];
                                      const p = newProducts[index];
                                      const base = p.basePrice ?? p.unitPriceIncTax;
                                      const toPrecision = !p.isPrecisionVersion;
                                      newProducts[index] = {
                                        ...p,
                                        basePrice: base,
                                        isPrecisionVersion: toPrecision,
                                        unitPriceIncTax: toPrecision ? base + PRECISION_PRICE_DELTA : base,
                                        remarks: toPrecision ? '高精度版，不含示教器' : '标准机，不含示教器',
                                      };
                                      return { ...prev, products: newProducts };
                                    });
                                  }}
                                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                    product.isPrecisionVersion
                                      ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                                      : 'bg-white text-slate-500 border-slate-300 hover:border-amber-400 hover:text-amber-600'
                                  }`}
                                >
                                  {product.isPrecisionVersion ? '⚡ 高精度版 (+¥2000)' : '标准版'}
                                </button>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">单位</label>
                            <input type="text" value={product.unit} onChange={e => handleProductChange(index, 'unit', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">数量</label>
                            <input type="number" value={product.quantity} onChange={e => handleProductChange(index, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                          </div>
                          {data.contractType === 'sales' ? (
                            <>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">含税单价 (元)</label>
                                <input type="number" value={product.unitPriceIncTax} onChange={e => handleProductChange(index, 'unitPriceIncTax', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">税率</label>
                                <select value={product.taxRate} onChange={e => handleProductChange(index, 'taxRate', parseFloat(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                  <option value={0.13}>13% (标准)</option>
                                  <option value={0.09}>9%</option>
                                  <option value={0.06}>6%</option>
                                  <option value={0}>0%</option>
                                </select>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">备注</label>
                                <input type="text" value={product.remarks} onChange={e => handleProductChange(index, 'remarks', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">设备售价 (元)</label>
                                <input type="number" value={product.unitPriceIncTax} onChange={e => handleProductChange(index, 'unitPriceIncTax', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">用途</label>
                                <input type="text" value={product.purpose || ''} onChange={e => handleProductChange(index, 'purpose', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="请输入产品用途" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">备注</label>
                                <input type="text" value={product.remarks} onChange={e => handleProductChange(index, 'remarks', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 flex justify-between">
                    <button onClick={() => setStep(2)} className="px-8 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all">上一步</button>
                    <button onClick={handleGenerate} disabled={isGenerating} className="px-10 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50">
                      {isGenerating ? '正在生成...' : '生成并下载合同'} <Download className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800"><CheckCircle2 className="w-5 h-5 text-blue-600" /> {data.contractType === 'sales' ? '费用预览' : '借用信息'}</h3>
              <div className="space-y-4">
                {data.contractType === 'sales' ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">含税总金额</span>
                    <span className="text-xl text-blue-600">¥ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">设备金额（单价）</span><span className="text-blue-600">¥ {(data.products[0]?.unitPriceIncTax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">设备押金（总价）</span><span className="text-blue-600">¥ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                )}
                <div className="p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">客户</span><span className="text-slate-600 truncate ml-4">{getEditableParty().name || '未填写'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">编号</span><span className="text-slate-600 font-mono">{data.contractNumber}</span></div>
                </div>
              </div>
            </div>
            <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-100">
              <h4 className="font-bold mb-3 flex items-center gap-2"><FileText className="w-5 h-5" /> 模板说明</h4>
              <p className="text-sm text-blue-100 leading-relaxed">
                {data.contractType === 'sales' 
                  ? '当前正在使用《法奥产品采购合同》标准模板。客户作为甲方，法奥作为乙方。'
                  : '当前正在使用《法奥产品借用合同》标准模板。法奥作为甲方，客户作为乙方。'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Template Settings Sidebar */}
      <AnimatePresence>
        {showTemplateSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTemplateSettings(false)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-blue-600" />
                  模板与乙方信息设置
                </h2>
                <button onClick={() => setShowTemplateSettings(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              
              <div className="p-6 space-y-8">
                <section>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">页眉 Logo 设置</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-12 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
                        <img 
                          src={data.customLogo || LOGO_BASE64} 
                          alt="Current Logo" 
                          className="max-w-full max-h-full object-contain" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="relative cursor-pointer bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all inline-block">
                          <span>上传新 Logo</span>
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {data.customLogo && (
                          <button 
                            onClick={() => setData(prev => ({ ...prev, customLogo: undefined }))}
                            className="ml-2 text-xs text-red-500 hover:text-red-600 font-bold"
                          >
                            恢复默认
                          </button>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">建议尺寸: 4.44cm x 0.4cm (约 168x15px), PNG 格式</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">乙方（卖方）默认信息</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">公司全称</label>
                      <input type="text" value={data.partyB.name} onChange={e => updatePartyB('name', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">纳税人识别号</label>
                      <input type="text" value={data.partyB.taxId} onChange={e => updatePartyB('taxId', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">开户银行</label>
                      <input type="text" value={data.partyB.bank} onChange={e => updatePartyB('bank', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">银行账号</label>
                      <input type="text" value={data.partyB.account} onChange={e => updatePartyB('account', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">联行号 (行号)</label>
                      <input type="text" value={data.partyB.bankCode || ''} onChange={e => updatePartyB('bankCode', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">公司地址</label>
                      <input type="text" value={data.partyB.address} onChange={e => updatePartyB('address', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">签约代表</label>
                        <input type="text" value={data.partyB.signatory} onChange={e => updatePartyB('signatory', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">代表电话</label>
                        <input type="text" value={data.partyB.signatoryPhone} onChange={e => updatePartyB('signatoryPhone', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">电子信箱</label>
                      <input type="text" value={data.partyB.email || ''} onChange={e => updatePartyB('email', e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                  </div>
                </section>

                <section className="pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">模板全局设置</h3>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      当前模板为《法奥产品采购合同》标准版。
                      <br /><br />
                      修改乙方信息将即时生效于生成的合同文档底部签署栏及页眉。
                    </p>
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-slate-100 sticky bottom-0 bg-white">
                <button 
                  onClick={() => setShowTemplateSettings(false)}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  保存并关闭
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Hidden Login Component */}
      <HiddenLogin 
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
    </div>
  );
}
