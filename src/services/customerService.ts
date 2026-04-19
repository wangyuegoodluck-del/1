import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

export interface Customer {
  id: string;
  name: string;
  shortName?: string;
  taxId: string;
  address?: string;
  phone?: string;
  bank?: string;
  account?: string;
  lastUsed: string;
  uid: string;
}

const CUSTOMERS_COLLECTION = 'customers';

/**
 * Save or update a customer record.
 */
export const saveCustomer = async (customerData: Omit<Customer, 'uid' | 'lastUsed'>) => {
  if (!auth.currentUser) throw new Error('User not authenticated');

  const uid = auth.currentUser.uid;
  const lastUsed = new Date().toISOString();
  const customer: Customer = {
    ...customerData,
    uid,
    lastUsed,
  };

  try {
    const docRef = doc(db, CUSTOMERS_COLLECTION, customer.id || customer.name);
    await setDoc(docRef, customer, { merge: true });
    return customer;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CUSTOMERS_COLLECTION);
  }
};

/**
 * Fetch all customers for the current user.
 */
export const getCustomers = async () => {
  if (!auth.currentUser) return [];

  const uid = auth.currentUser.uid;
  const q = query(
    collection(db, CUSTOMERS_COLLECTION),
    where('uid', '==', uid),
    orderBy('lastUsed', 'desc'),
    limit(50)
  );

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Customer);
  } catch (error) {
    console.error('getCustomers error:', error);
    const err = error as { message?: string; code?: string };
    // 缺少索引时降级为不带排序的查询
    if (err?.message?.includes('FAILED_PRECONDITION') || err?.code === 'failed-precondition') {
      try {
        const simpleQ = query(collection(db, CUSTOMERS_COLLECTION), where('uid', '==', uid), limit(100));
        const snapshot = await getDocs(simpleQ);
        const customers = snapshot.docs.map(doc => doc.data() as Customer);
        customers.sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));
        return customers;
      } catch (e2) {
        console.error('简化查询也失败:', e2);
        return [];
      }
    }
    return [];
  }
};

/**
 * Subscribe to customers for the current user.
 */
export const subscribeToCustomers = (callback: (customers: Customer[]) => void) => {
  if (!auth.currentUser) return () => {};

  const uid = auth.currentUser.uid;
  const q = query(
    collection(db, CUSTOMERS_COLLECTION),
    where('uid', '==', uid),
    orderBy('lastUsed', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const customers = snapshot.docs.map(doc => doc.data() as Customer);
    callback(customers);
  }, (error) => {
    console.error('subscribeToCustomers error:', error);
    // 如果是缺少索引错误，尝试不带 orderBy 的简单查询
    if (error?.message?.includes('FAILED_PRECONDITION') || error?.code === 'failed-precondition') {
      console.warn('Firestore 缺少复合索引，尝试简化查询...');
      const simpleQ = query(
        collection(db, CUSTOMERS_COLLECTION),
        where('uid', '==', uid),
        limit(100)
      );
      onSnapshot(simpleQ, (snapshot) => {
        const customers = snapshot.docs.map(doc => doc.data() as Customer);
        // 前端排序
        customers.sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));
        callback(customers);
      }, (err2) => {
        console.error('简化查询也失败:', err2);
        callback([]);  // 降级返回空数组而不是 throw
      });
    } else {
      callback([]);  // 其他错误也返回空数组，不 throw
    }
  });
};
