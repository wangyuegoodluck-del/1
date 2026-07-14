import { Timestamp } from 'firebase/firestore';
import { apiGet, apiSet, apiPoll } from './apiDataHub';

const CUSTOMER_HISTORY_SCOPE = (import.meta.env.VITE_CUSTOMER_HISTORY_SCOPE || '').trim();

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  approved: boolean;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface ContactPerson {
  name: string;
  phone: string;
  email?: string;
  position?: string;
  isDefault: boolean;
}

export interface DeliveryAddress {
  id: string;
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
  isDefault: boolean;
}

export interface CustomerWithMemory {
  id: string;
  userId: string;
  historyScope?: string;
  name: string;
  shortName?: string;
  taxId: string;
  address: string;
  phone: string;
  bank: string;
  account: string;
  bankCode: string;
  email?: string;
  contacts: ContactPerson[];
  deliveryAddresses: DeliveryAddress[];
  purchaseHistory: PurchaseRecord[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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

export interface CatalogProduct {
  id: string;
  name: string;
  model?: string;
  unitPrice: number;
  unit: string;
  category?: string;
  description?: string;
  isActive: boolean;
  hasPrecisionVersion?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function removeUndefinedFields<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}

function getStoredUser(): (UserProfile & { uid: string; email: string }) | null {
  const savedUser = localStorage.getItem('auth_user');
  if (!savedUser) return null;
  try {
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
}

function requireStoredUser() {
  const user = getStoredUser();
  if (!user?.uid) throw new Error('User not authenticated');
  return user;
}

function scopedCustomerFilter(base: Record<string, unknown> = {}) {
  return {
    ...base,
    ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
  };
}

function subscribeByPolling<T>(
  fetcher: () => Promise<T>,
  callback: (value: T) => void,
  intervalMs = 10000,
) {
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const fetchOnce = async () => {
    try {
      const value = await fetcher();
      if (!cancelled) callback(value);
    } catch (error) {
      console.error('API polling failed:', error);
    }
  };

  fetchOnce();
  timer = setInterval(fetchOnce, intervalMs);

  return () => {
    cancelled = true;
    if (timer) clearInterval(timer);
  };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = getStoredUser();
  if (!user) return false;
  if (user.isAdmin || user.email === 'admin@fairino.com') return true;

  try {
    const profile = await apiGet('users', user.uid) as UserProfile | null;
    return profile?.isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

export async function createUserProfile(uid: string, email: string, displayName: string, isAdmin = false) {
  const now = Timestamp.now();
  await apiSet('users', uid, {
    uid,
    email,
    displayName,
    isAdmin,
    approved: isAdmin,
    createdAt: now,
    lastLoginAt: now,
  });
}

export function subscribeToAllUsers(callback: (users: UserProfile[]) => void) {
  return subscribeByPolling(async () => apiPoll<UserProfile>('users'), callback);
}

export async function updateUserApproval(uid: string, approved: boolean) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  await apiSet('users', uid, {
    approved,
    updatedAt: Timestamp.now(),
  });
}

export async function updateUserAdmin(uid: string, isAdminValue: boolean) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  await apiSet('users', uid, {
    isAdmin: isAdminValue,
    updatedAt: Timestamp.now(),
  });
}

export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  return subscribeByPolling(async () => {
    try {
      return await apiGet('users', uid) as UserProfile;
    } catch {
      return null;
    }
  }, callback);
}

export async function saveCustomerMemory(customer: Omit<CustomerWithMemory, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
  const user = requireStoredUser();
  const id = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Timestamp.now();
  const customerData: CustomerWithMemory = {
    ...customer,
    id,
    userId: user.uid,
    ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await apiSet('customers', id, customerData);
  return id;
}

export async function updateCustomerMemory(customerId: string, updates: Partial<CustomerWithMemory>) {
  requireStoredUser();
  await apiSet('customers', customerId, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

export function subscribeToCustomersMemory(callback: (customers: CustomerWithMemory[]) => void) {
  const user = getStoredUser();
  if (!user) {
    callback([]);
    return () => {};
  }

  return subscribeByPolling(async () => {
    const isAdmin = await isCurrentUserAdmin();
    const filters = isAdmin
      ? scopedCustomerFilter()
      : scopedCustomerFilter({ userId: user.uid });
    return apiPoll<CustomerWithMemory>('customers', filters);
  }, callback);
}

export async function getCustomerMemory(customerId: string): Promise<CustomerWithMemory | null> {
  const user = requireStoredUser();
  try {
    const customer = await apiGet('customers', customerId) as CustomerWithMemory;
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin && customer.userId !== user.uid) return null;
    return customer;
  } catch {
    return null;
  }
}

export async function addPurchaseRecord(customerId: string, record: Omit<PurchaseRecord, 'id'>) {
  requireStoredUser();
  const customer = await apiGet('customers', customerId) as CustomerWithMemory;
  if (!customer) throw new Error('Customer not found');

  const newRecord: PurchaseRecord = {
    ...record,
    id: Date.now().toString(),
  };

  await apiSet('customers', customerId, {
    purchaseHistory: [...(customer.purchaseHistory || []), newRecord],
    updatedAt: Timestamp.now(),
  });
}

export async function exportContractDataCSV() {
  const user = requireStoredUser();
  const adminStatus = await isCurrentUserAdmin();
  if (!adminStatus) throw new Error('仅限管理员操作');

  const allCustomers = await apiPoll<CustomerWithMemory>('customers', scopedCustomerFilter());
  const rows: string[] = [];
  rows.push(['合同编号', '签订日期', '客户名称', '税号', '总金额', '产品明细', '经办人ID'].join(','));

  allCustomers.forEach(customer => {
    if (customer.purchaseHistory && customer.purchaseHistory.length > 0) {
      customer.purchaseHistory.forEach(record => {
        const productSummary = record.products.map(p => `${p.name}*${p.quantity}`).join(' | ');
        rows.push([
          `"${record.contractNumber}"`,
          `"${record.date.toDate().toISOString().split('T')[0]}"`,
          `"${customer.name}"`,
          `"${customer.taxId}"`,
          record.totalAmount,
          `"${productSummary}"`,
          `"${customer.userId || user.uid}"`,
        ].join(','));
      });
    }
  });

  if (rows.length <= 1) throw new Error('暂无可导出的合同数据');

  const csvContent = '\uFEFF' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `contract_data_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  return apiPoll<CatalogProduct>('products', { isActive: true });
}

export function subscribeToCatalogProducts(callback: (products: CatalogProduct[]) => void) {
  return subscribeByPolling(async () => apiPoll<CatalogProduct>('products', { isActive: true }), callback);
}

export async function addCatalogProduct(product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');

  const productRefId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Timestamp.now();
  await apiSet('products', productRefId, {
    ...removeUndefinedFields(product),
    id: productRefId,
    createdAt: now,
    updatedAt: now,
  });
  return productRefId;
}

export async function updateCatalogProduct(productId: string, updates: Partial<CatalogProduct>) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');

  await apiSet('products', productId, {
    ...removeUndefinedFields(updates),
    updatedAt: Timestamp.now(),
  });
}

export async function deleteCatalogProduct(productId: string) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  await apiSet('products', productId, {
    isActive: false,
    updatedAt: Timestamp.now(),
  });
}

export interface ContactInfo {
  name: string;
  phone: string;
  email?: string;
  position?: string;
  company?: string;
}

export async function parseContactFromText(text: string): Promise<ContactInfo> {
  console.log('Attempting to parse contact from text:', text);
  throw new Error('Contact parsing not implemented yet');
}
