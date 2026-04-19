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

// User Profile in Firestore
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
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

// Check if current user is admin
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      return userDoc.data().isAdmin === true;
    }
    return false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Create or update user profile
export async function createUserProfile(uid: string, email: string, displayName: string, isAdmin = false) {
  try {
    const userRef = doc(db, 'users', uid);
    const now = Timestamp.now();
    
    await setDoc(userRef, {
      uid,
      email,
      displayName,
      isAdmin,
      createdAt: now,
      lastLoginAt: now,
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

// Update last login
export async function updateLastLogin(uid: string) {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      lastLoginAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('Error updating last login:', error);
  }
}

// Subscribe to current user profile
export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  const userRef = doc(db, 'users', uid);
  
  return onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as UserProfile);
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('Error subscribing to user profile:', error);
    callback(null);
  });
}

// ==================== Customer Memory Functions ====================

// Save customer (with user isolation)
export async function saveCustomerMemory(customer: Omit<CustomerWithMemory, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  try {
    const customerRef = doc(collection(db, 'customers'));
    const now = Timestamp.now();
    
    const customerData: CustomerWithMemory = {
      ...customer,
      id: customerRef.id,
      userId: user.uid, // 绑定到创建用户
      createdAt: now,
      updatedAt: now,
    };
    
    await setDoc(customerRef, customerData);
    return customerRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'customers');
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
  const user = auth.currentUser;
  if (!user) {
    callback([]);
    return () => {};
  }

  // cancelled 标志：如果在异步检查完成前就调用了 unsubscribe，则不再建立真实订阅
  let cancelled = false;
  let innerUnsubscribe: (() => void) | null = null;

  const checkAdminAndSubscribe = async () => {
    try {
      const isAdmin = await isCurrentUserAdmin();
      if (cancelled) return;

      let q;
      if (isAdmin) {
        q = query(collection(db, 'customers'));
      } else {
        q = query(collection(db, 'customers'), where('userId', '==', user.uid));
      }

      innerUnsubscribe = onSnapshot(q, (snapshot) => {
        const customers = snapshot.docs.map(doc => doc.data() as CustomerWithMemory);
        callback(customers);
      }, (error) => {
        console.error('Error subscribing to customers:', error);
        callback([]);
      });
    } catch (err) {
      console.error('checkAdminAndSubscribe error:', err);
      callback([]);
    }
  };

  checkAdminAndSubscribe();

  return () => {
    cancelled = true;
    if (innerUnsubscribe) innerUnsubscribe();
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
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  try {
    const customerRef = doc(db, 'customers', customerId);
    const customerDoc = await getDoc(customerRef);
    
    if (!customerDoc.exists()) throw new Error('Customer not found');
    
    const data = customerDoc.data() as CustomerWithMemory;
    
    // Check ownership
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin && data.userId !== user.uid) {
      throw new Error('Permission denied');
    }
    
    const newRecord: PurchaseRecord = {
      ...record,
      id: Date.now().toString(),
    };
    
    const updatedHistory = [...(data.purchaseHistory || []), newRecord];
    
    await updateDoc(customerRef, {
      purchaseHistory: updatedHistory,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customers/${customerId}`);
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
  
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => doc.data() as CatalogProduct);
    callback(products);
  }, (error) => {
    console.error('Error subscribing to products:', error);
    callback([]);
  });
}

// Add product (admin only)
export async function addCatalogProduct(product: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>) {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) throw new Error('Admin only');
  
  try {
    const productRef = doc(collection(db, 'products'));
    const now = Timestamp.now();
    
    await setDoc(productRef, {
      ...product,
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
      ...updates,
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
