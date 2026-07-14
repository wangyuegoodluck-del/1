import { db, auth } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './firebase';
import { apiGet, apiSet, apiPoll } from './apiDataHub';

const CUSTOMER_HISTORY_SCOPE = (import.meta.env.VITE_CUSTOMER_HISTORY_SCOPE || '').trim();

// User Profile in Firestore
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  approved: boolean; // 是否已审批
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

// Contact Person
export interface ContactPerson {
  name: string;
  phone: string;
  email?: string;
  position?: string;
  isDefault: boolean;
}

// Delivery Address
export interface DeliveryAddress {
  id: string;
  name: string; // 地址名称，如"总部"、"工厂"
  address: string;
  contactName: string;
  contactPhone: string;
  isDefault: boolean;
}

// Extended Customer with contacts and addresses
export interface CustomerWithMemory {
  id: string;
  userId: string; // 创建该客户的用户ID
  historyScope?: string; // 分发包可使用独立历史空间，避免带出旧合同记录
  name: string;
  shortName?: string;
  taxId: string;
  address: string;
  phone: string;
  bank: string;
  account: string;
  bankCode: string;
  email?: string;
  // 联系人信息
  contacts: ContactPerson[];
  // 收货地址
  deliveryAddresses: DeliveryAddress[];
  // 历史采购
  purchaseHistory: PurchaseRecord[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Purchase Record
export interface PurchaseRecord {
  id: string;
  contractNumber: string;
  date: Timestamp;
  products: PurchasedProduct[];
  totalAmount: number;
}

export interface PurchasedProduct {
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

// Product Catalog (managed by admin)
export interface CatalogProduct {
  id: string;
  name: string;
  model?: string;
  unitPrice: number;
  unit: string;
  category?: string;
  description?: string;
  isActive: boolean;
  hasPrecisionVersion?: boolean; // 是否支持高精度版（比标准版贵2000元）
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function removeUndefinedFields<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}

// Check if current user is admin
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  
  // 检查本地持久化 Session (API Fallback)
  let userId = user?.uid;
  let userEmail = user?.email;
  
  if (!userId) {
    const savedUser = localStorage.getItem('auth_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        userId = u.uid;
        userEmail = u.email;
        if (u.isAdmin) return true;
      } catch {
        // ignore
      }
    }
  }

  if (!userId) return false;
  
  // 引导启动用硬编码管理员（用于首次部署后的初始化）
  if (userEmail === 'admin@fairino.com') return true;

  try {
    // 优先尝试直接获取
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().isAdmin === true;
    }
  } catch {
    // 如果直接获取失败（网络问题），尝试 API
    try {
      const profile = await apiGet('users', userId);
      return profile?.isAdmin === true;
    } catch (apiErr) {
      console.error('Error checking admin status (Firebase & API):', apiErr);
    }
  }
  return false;
}

// Create or update user profile
export async function createUserProfile(uid: string, email: string, displayName: string, isAdmin = false) {
  const now = Timestamp.now();
  const data = {
    uid,
    email,
    displayName,
    isAdmin,
    // approved: isAdmin, // We'll handle approved status more carefully
    lastLoginAt: now,
  };

  try {
    const userRef = doc(db, 'users', uid);
    // Check if user already exists to preserve approved status
    const existingDoc = await getDoc(userRef);
    const isApproved = existingDoc.exists() ? existingDoc.data().approved : (isAdmin); // Admin is auto-approved, others wait

    await setDoc(userRef, {
      ...data,
      approved: isApproved,
      createdAt: existingDoc.exists() ? existingDoc.data().createdAt : now,
    }, { merge: true });
  } catch {
    console.error('Firebase write failed (Profile), trying API...');
    try {
      // In API mode, we might not know if they are approved, so we default to the intended state
      await apiSet('users', uid, { ...data, approved: isAdmin, createdAt: now });
    } catch (apiErr) {
      handleFirestoreError(apiErr, OperationType.WRITE, `users/${uid}`);
    }
  }
}

// Subscribe to all users (admin only)
export function subscribeToAllUsers(callback: (users: UserProfile[]) => void) {
  // 正常路径：Firebase 分发
  const q = query(collection(db, 'users'));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map(doc => doc.data() as UserProfile);
    callback(users);
  }, (error) => {
    console.error('Firebase snapshot failed (AllUsers), trying API polling...', error);
    // 异常路径：API 轮询
    apiPoll<UserProfile>('users').then(users => callback(users));
  });

  return unsubscribe;
}

// Approve/Disapprove user
export async function updateUserApproval(uid: string, approved: boolean) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  
  const updates = {
    approved,
    updatedAt: Timestamp.now(),
  };

  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, updates);
  } catch (error) {
    console.error('Firebase update failed (Approval), trying API...', error);
    try {
      await apiSet('users', uid, updates);
    } catch (apiErr) {
      handleFirestoreError(apiErr, OperationType.UPDATE, `users/${uid}`);
    }
  }
}

// Subscribe to current user profile
export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  const userRef = doc(db, 'users', uid);
  
  const unsubscribe = onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as UserProfile);
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('Firebase snapshot failed (Profile), trying API Get...', error);
    apiGet('users', uid).then(profile => callback(profile as UserProfile));
  });

  return unsubscribe;
}

// ==================== Customer Memory Functions ====================

// Save customer (with user isolation)
export async function saveCustomerMemory(customer: Omit<CustomerWithMemory, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
  const user = auth.currentUser || (localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!) : null);
  if (!user) throw new Error('User not authenticated');
  
  const id = `cust_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const now = Timestamp.now();
  const customerData: CustomerWithMemory = {
    ...customer,
    id,
    userId: user.uid,
    ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const customerRef = doc(db, 'customers', id);
    await setDoc(customerRef, customerData);
    return id;
  } catch (error) {
    console.error('Firebase write failed (SaveCustomer), trying API...', error);
    try {
      await apiSet('customers', id, customerData);
      return id;
    } catch (apiErr) {
      handleFirestoreError(apiErr, OperationType.CREATE, 'customers');
    }
  }
}

// Update customer
export async function updateCustomerMemory(customerId: string, updates: Partial<CustomerWithMemory>) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  try {
    const customerRef = doc(db, 'customers', customerId);
    
    // Check ownership (unless admin)
    const adminStatus = await isCurrentUserAdmin();
    if (!adminStatus) {
      const customerDoc = await getDoc(customerRef);
      if (!customerDoc.exists() || customerDoc.data().userId !== user.uid) {
        throw new Error('Permission denied: not your customer');
      }
    }
    
    await updateDoc(customerRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customers/${customerId}`);
  }
}

// Subscribe to customers (filtered by user unless admin)
export function subscribeToCustomersMemory(callback: (customers: CustomerWithMemory[]) => void) {
  const user = auth.currentUser || (localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!) : null);
  if (!user) {
    callback([]);
    return () => {};
  }

  // cancelled 标志：如果在异步检查完成前就调用了 unsubscribe，则不再建立真实订阅
  let cancelled = false;
  let innerUnsubscribe: (() => void) | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;

  const subscribe = async () => {
    try {
      const isAdmin = await isCurrentUserAdmin();
      if (cancelled) return;

      const setupDirectSubscription = () => {
        let q;
        if (isAdmin) {
          q = CUSTOMER_HISTORY_SCOPE
            ? query(collection(db, 'customers'), where('historyScope', '==', CUSTOMER_HISTORY_SCOPE))
            : query(collection(db, 'customers'));
        } else {
          q = CUSTOMER_HISTORY_SCOPE
            ? query(collection(db, 'customers'), where('userId', '==', user.uid), where('historyScope', '==', CUSTOMER_HISTORY_SCOPE))
            : query(collection(db, 'customers'), where('userId', '==', user.uid));
        }

        innerUnsubscribe = onSnapshot(q, (snapshot) => {
          const customers = snapshot.docs.map(doc => doc.data() as CustomerWithMemory);
          callback(customers);
        }, (error) => {
          console.error('Firebase snapshot failed (Customers), falling back to API Poll...', error);
          startPolling(isAdmin);
        });
      };

      const startPolling = async (admin: boolean) => {
        if (pollingInterval) clearInterval(pollingInterval);
        
        const fetchOnce = async () => {
          try {
            let data: CustomerWithMemory[];
            if (admin) {
              data = await apiPoll<CustomerWithMemory>('customers', CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {});
            } else {
              data = await apiPoll<CustomerWithMemory>('customers', {
                userId: user.uid,
                ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
              });
            }
            if (!cancelled) callback(data);
          } catch (e) {
            console.error('API polling failed:', e);
          }
        };

        fetchOnce();
        pollingInterval = setInterval(() => {
          fetchOnce();
        }, 10000); // 10秒轮询一次
      };

      // 首次尝试直接订阅
      setupDirectSubscription();
      
    } catch {
      callback([]);
    }
  };

  subscribe();

  return () => {
    cancelled = true;
    if (innerUnsubscribe) innerUnsubscribe();
    if (pollingInterval) clearInterval(pollingInterval);
  };
}

// Get single customer
export async function getCustomerMemory(customerId: string): Promise<CustomerWithMemory | null> {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const customerRef = doc(db, 'customers', customerId);
    const customerDoc = await getDoc(customerRef);
    
    if (!customerDoc.exists()) return null;
    
    const data = customerDoc.data() as CustomerWithMemory;
    
    // Check ownership (unless admin)
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin && data.userId !== user.uid) {
      return null;
    }
    
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `customers/${customerId}`);
    return null;
  }
}

// Add purchase record to customer
export async function addPurchaseRecord(customerId: string, record: Omit<PurchaseRecord, 'id'>) {
  const user = auth.currentUser || (localStorage.getItem('auth_user') ? JSON.parse(localStorage.getItem('auth_user')!) : null);
  if (!user) throw new Error('User not authenticated');
  
  const newRecordId = Date.now().toString();
  const newRecord: PurchaseRecord = {
    ...record,
    id: newRecordId,
  };

  try {
    const customerRef = doc(db, 'customers', customerId);
    const customerDoc = await getDoc(customerRef);
    if (!customerDoc.exists()) throw new Error('Customer not found');
    
    const data = customerDoc.data() as CustomerWithMemory;
    const updatedHistory = [...(data.purchaseHistory || []), newRecord];
    
    await updateDoc(customerRef, {
      purchaseHistory: updatedHistory,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Firebase update failed (PurchaseRecord), trying API...', error);
    try {
      // API 需要获取当前客户以合并历史记录，或者后端支持局部更新（目前 apiSet 是全量更新或合并）
      const customer = await apiGet('customers', customerId);
      if (!customer) throw new Error('Customer not found via API');
      const updatedHistory = [...(customer.purchaseHistory || []), newRecord];
      await apiSet('customers', customerId, {
        purchaseHistory: updatedHistory,
        updatedAt: Timestamp.now(),
      });
    } catch (apiErr) {
      handleFirestoreError(apiErr, OperationType.UPDATE, `customers/${customerId}`);
    }
  }
}

// ==================== Export Logic ====================

/**
 * 导出全量合同关键数据为 CSV (管理员专用)
 */
export async function exportContractDataCSV() {
  const user = auth.currentUser;
  if (!user) throw new Error('未认证');
  
  const adminStatus = await isCurrentUserAdmin();
  if (!adminStatus) throw new Error('仅限管理员操作');

  try {
    // 获取所有客户记录（包含购买记录）
    const q = CUSTOMER_HISTORY_SCOPE
      ? query(collection(db, 'customers'), where('historyScope', '==', CUSTOMER_HISTORY_SCOPE))
      : query(collection(db, 'customers'));
    const snapshot = await getDocs(q);
    const allCustomers = snapshot.docs.map(doc => doc.data() as CustomerWithMemory);

    // 展平数据：每条合同记录一行
    const rows: string[] = [];
    // CSV Header
    rows.push(['合同编号', '签订日期', '客户名称', '税号', '总金额', '产品明细', '经办人ID'].join(','));

    allCustomers.forEach(customer => {
      if (customer.purchaseHistory && customer.purchaseHistory.length > 0) {
        customer.purchaseHistory.forEach(record => {
          const productSummary = record.products
            .map(p => `${p.name}*${p.quantity}`)
            .join(' | ');
          
          const row = [
            `"${record.contractNumber}"`,
            `"${record.date.toDate().toISOString().split('T')[0]}"`,
            `"${customer.name}"`,
            `"${customer.taxId}"`,
            record.totalAmount,
            `"${productSummary}"`,
            `"${customer.userId}"`
          ].join(',');
          rows.push(row);
        });
      }
    });

    if (rows.length <= 1) {
      throw new Error('暂无可导出的合同数据');
    }

    // 创建 Blob 并下载
    const csvContent = '\uFEFF' + rows.join('\n'); // 添加 BOM 支持 Excel 中文
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `contract_data_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}

// ==================== Product Catalog Functions (Admin Only) ====================

// Get all catalog products
export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  try {
    const q = query(collection(db, 'products'), where('isActive', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as CatalogProduct);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'products');
    return [];
  }
}

// Subscribe to catalog products
export function subscribeToCatalogProducts(callback: (products: CatalogProduct[]) => void) {
  const q = query(collection(db, 'products'), where('isActive', '==', true));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => doc.data() as CatalogProduct);
    callback(products);
  }, (error) => {
    console.error('Firebase snapshot failed (Catalog), trying API polling...', error);
    apiPoll<CatalogProduct>('products', { isActive: true }).then(products => callback(products));
  });

  return unsubscribe;
}

// Add product (admin only)
export async function addCatalogProduct(product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  
  try {
    const productRef = doc(collection(db, 'products'));
    const now = Timestamp.now();
    
    await setDoc(productRef, {
      ...removeUndefinedFields(product),
      id: productRef.id,
      createdAt: now,
      updatedAt: now,
    });
    
    return productRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }
}

// Update product (admin only)
export async function updateCatalogProduct(productId: string, updates: Partial<CatalogProduct>) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      ...removeUndefinedFields(updates),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
  }
}

// Delete product (soft delete, admin only)
export async function deleteCatalogProduct(productId: string) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, {
      isActive: false,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

// ==================== AI Contact Recognition ====================

export interface ContactInfo {
  name: string;
  phone: string;
  email?: string;
  position?: string;
  company?: string;
}

// Parse contact info from text using AI
export async function parseContactFromText(text: string): Promise<ContactInfo> {
  // This will be implemented in aiService.ts
  console.log('Attempting to parse contact from text:', text);
  throw new Error('Contact parsing not implemented yet');
}
