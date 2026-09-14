import { Timestamp } from 'firebase/firestore';
import { apiGet, apiSet, apiPoll, deepConvertTimestamps } from './apiDataHub';

const CUSTOMER_HISTORY_SCOPE = (import.meta.env.VITE_CUSTOMER_HISTORY_SCOPE || '').trim();
const LOCAL_CUSTOMERS_KEY = 'fairino_customer_memory_backup_v1';

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

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined';
}

function readLocalCustomers(): CustomerWithMemory[] {
  if (!canUseLocalStorage()) return [];
  try {
    const saved = localStorage.getItem(LOCAL_CUSTOMERS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as unknown;
    const customers = Array.isArray(parsed) ? parsed : [];
    return deepConvertTimestamps(customers) as CustomerWithMemory[];
  } catch (error) {
    console.warn('读取本地历史备份失败:', error);
    return [];
  }
}

function writeLocalCustomers(customers: CustomerWithMemory[]) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(LOCAL_CUSTOMERS_KEY, JSON.stringify(customers));
  } catch (error) {
    console.warn('写入本地历史备份失败:', error);
  }
}

function scopedCustomerFilter(base: Record<string, unknown> = {}) {
  return {
    ...base,
    ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
  };
}

function customerMatchesCurrentScope(customer: CustomerWithMemory, user: { uid: string }, isAdmin: boolean) {
  const scopeMatches = !CUSTOMER_HISTORY_SCOPE || !customer.historyScope || customer.historyScope === CUSTOMER_HISTORY_SCOPE;
  const userMatches = isAdmin || !customer.userId || customer.userId === user.uid;
  return scopeMatches && userMatches;
}

function customerIdentityKey(customer: Pick<CustomerWithMemory, 'id' | 'taxId' | 'name'>) {
  if (customer.taxId) return `tax:${normalizeCustomerKey(customer.taxId)}`;
  if (customer.name) return `name:${normalizeCustomerKey(customer.name)}`;
  return `id:${customer.id}`;
}

function mergePurchaseHistory(
  existing: PurchaseRecord[] = [],
  incoming: PurchaseRecord[] = [],
) {
  const byContract = new Map<string, PurchaseRecord>();
  [...existing, ...incoming].forEach((record) => {
    const key = record.contractNumber || record.id;
    byContract.set(key, record);
  });
  return [...byContract.values()].sort((a, b) =>
    (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0)
  );
}

function mergeCustomer(existing: CustomerWithMemory, incoming: CustomerWithMemory): CustomerWithMemory {
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    userId: existing.userId || incoming.userId,
    contacts: mergeContacts(existing.contacts, incoming.contacts),
    deliveryAddresses: mergeDeliveryAddresses(existing.deliveryAddresses, incoming.deliveryAddresses),
    purchaseHistory: mergePurchaseHistory(existing.purchaseHistory, incoming.purchaseHistory),
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt || existing.updatedAt,
  };
}

function mergeCustomerLists(...lists: CustomerWithMemory[][]) {
  const byKey = new Map<string, CustomerWithMemory>();
  lists.flat().forEach((customer) => {
    const key = customerIdentityKey(customer);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCustomer(existing, customer) : customer);
  });
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function upsertLocalCustomer(customer: CustomerWithMemory) {
  const current = readLocalCustomers();
  writeLocalCustomers(mergeCustomerLists(current, [customer]));
}

function updateLocalPurchaseRecord(customerId: string, record: PurchaseRecord) {
  const current = readLocalCustomers();
  const next = current.map((customer) => {
    if (customer.id !== customerId) return customer;
    return {
      ...customer,
      purchaseHistory: mergePurchaseHistory(customer.purchaseHistory, [record]),
      updatedAt: Timestamp.now(),
    };
  });
  writeLocalCustomers(next);
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

  upsertLocalCustomer(customerData);
  try {
    await apiSet('customers', id, customerData);
  } catch (error) {
    console.warn('客户已保存到本地历史备份，服务器保存失败:', error);
  }
  return id;
}

function normalizeCustomerKey(value?: string) {
  return (value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function mergeContacts(
  existing: ContactPerson[] = [],
  incoming: ContactPerson[] = [],
) {
  const merged = [...existing];
  for (const contact of incoming) {
    const key = `${normalizeCustomerKey(contact.name)}|${normalizeCustomerKey(contact.phone)}`;
    const exists = merged.some(item =>
      `${normalizeCustomerKey(item.name)}|${normalizeCustomerKey(item.phone)}` === key
    );
    if (!exists && (contact.name || contact.phone)) merged.push(contact);
  }
  return merged;
}

function mergeDeliveryAddresses(
  existing: DeliveryAddress[] = [],
  incoming: DeliveryAddress[] = [],
) {
  const merged = [...existing];
  for (const address of incoming) {
    const key = `${normalizeCustomerKey(address.address)}|${normalizeCustomerKey(address.contactPhone)}`;
    const exists = merged.some(item =>
      `${normalizeCustomerKey(item.address)}|${normalizeCustomerKey(item.contactPhone)}` === key
    );
    if (!exists && address.address) merged.push(address);
  }
  return merged;
}

export async function saveOrUpdateCustomerMemory(customer: Omit<CustomerWithMemory, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
  const user = requireStoredUser();
  const allCustomers = await getCustomersMemory();
  const customerTaxId = normalizeCustomerKey(customer.taxId);
  const customerName = normalizeCustomerKey(customer.name);
  const existing = allCustomers.find(item => {
    const sameTaxId = customerTaxId && normalizeCustomerKey(item.taxId) === customerTaxId;
    const sameName = customerName && normalizeCustomerKey(item.name) === customerName;
    return sameTaxId || sameName;
  });

  if (!existing) return saveCustomerMemory(customer);

  const updatedCustomer = {
    ...customer,
    id: existing.id,
    userId: existing.userId || user.uid,
    contacts: mergeContacts(existing.contacts, customer.contacts),
    deliveryAddresses: mergeDeliveryAddresses(existing.deliveryAddresses, customer.deliveryAddresses),
    purchaseHistory: existing.purchaseHistory || [],
    ...(CUSTOMER_HISTORY_SCOPE ? { historyScope: CUSTOMER_HISTORY_SCOPE } : {}),
    updatedAt: Timestamp.now(),
    createdAt: existing.createdAt || Timestamp.now(),
  } as CustomerWithMemory;

  upsertLocalCustomer(updatedCustomer);
  try {
    await apiSet('customers', existing.id, updatedCustomer);
  } catch (error) {
    console.warn('客户已更新到本地历史备份，服务器更新失败:', error);
  }
  return existing.id;
}

export async function updateCustomerMemory(customerId: string, updates: Partial<CustomerWithMemory>) {
  requireStoredUser();
  const localCustomers = readLocalCustomers();
  const localCustomer = localCustomers.find(customer => customer.id === customerId);
  if (localCustomer) {
    upsertLocalCustomer({
      ...localCustomer,
      ...updates,
      updatedAt: Timestamp.now(),
    });
  }
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

  return subscribeByPolling(() => getCustomersMemory(), callback);
}

export async function getCustomersMemory(): Promise<CustomerWithMemory[]> {
  const user = requireStoredUser();
  const isAdmin = await isCurrentUserAdmin();
  const filters = isAdmin
    ? scopedCustomerFilter()
    : scopedCustomerFilter({ userId: user.uid });
  const serverCustomers = await apiPoll<CustomerWithMemory>('customers', filters);
  const localCustomers = readLocalCustomers()
    .filter(customer => customerMatchesCurrentScope(customer, user, isAdmin));
  const mergedCustomers = mergeCustomerLists(serverCustomers, localCustomers);
  if (mergedCustomers.length > 0) writeLocalCustomers(mergedCustomers);
  return mergedCustomers;
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
  const localCustomer = readLocalCustomers().find(customer => customer.id === customerId);
  let customer = localCustomer;
  try {
    customer = await apiGet('customers', customerId) as CustomerWithMemory;
  } catch (error) {
    console.warn('服务器客户读取失败，将使用本地历史备份:', error);
  }
  if (!customer) throw new Error('Customer not found');

  const newRecord: PurchaseRecord = {
    ...record,
    id: Date.now().toString(),
  };
  const existingHistory = customer.purchaseHistory || [];
  const withoutSameContract = record.contractNumber
    ? existingHistory.filter(item => item.contractNumber !== record.contractNumber)
    : existingHistory;

  updateLocalPurchaseRecord(customerId, newRecord);
  try {
    await apiSet('customers', customerId, {
      purchaseHistory: [...withoutSameContract, newRecord],
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.warn('合同记录已保存到本地历史备份，服务器保存失败:', error);
  }
}

export async function exportContractDataCSV() {
  const user = requireStoredUser();
  const adminStatus = await isCurrentUserAdmin();
  if (!adminStatus) throw new Error('仅限管理员操作');

  const allCustomers = await getCustomersMemory();
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
