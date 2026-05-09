import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X, User, LogOut, Settings, Shield, Users, Package, Plus, Edit2, Trash2, Search } from 'lucide-react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { loginWithEmail, logout, registerWithEmail } from '../services/firebase';
import { doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { isCurrentUserAdmin, UserProfile, subscribeToUserProfile, CatalogProduct, addCatalogProduct, updateCatalogProduct, deleteCatalogProduct, subscribeToCatalogProducts, subscribeToAllUsers, updateUserApproval } from '../services/userService';

interface HiddenLoginProps {
  onLogin?: (user: FirebaseUser, isAdmin: boolean) => void;
  onLogout?: () => void;
}

export default function HiddenLogin({ onLogin, onLogout }: HiddenLoginProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Login form state
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  // 使用 ref 持有回调，避免 useEffect 依赖外部函数引用变化导致重复订阅
  const onLoginRef = useRef(onLogin);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLoginRef.current = onLogin; }, [onLogin]);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  // Show trigger button after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Auth state listener — 空依赖数组，只注册一次
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!isMounted) return;
      setUser(u);
      if (u) {
        try {
          const admin = await isCurrentUserAdmin();
          if (!isMounted) return;
          setIsAdmin(admin);
          onLoginRef.current?.(u, admin);
        } catch (err) {
          console.warn('Failed to check admin status:', err);
          if (isMounted) onLoginRef.current?.(u, false);
        }
        // Update last login (best-effort, non-blocking)
        try {
          const userRef = doc(db, 'users', u.uid);
          await setDoc(userRef, {
            lastLoginAt: Timestamp.now(),
          }, { merge: true });
        } catch (err) {
          console.warn('Failed to update last login:', err);
        }
      } else {
        if (!isMounted) return;
        setIsAdmin(false);
        setUserProfile(null);
        onLogoutRef.current?.();
      }
    });
    return () => { isMounted = false; unsubscribe(); };
  }, []);

  // Subscribe to user profile
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = subscribeToUserProfile(user.uid, (profile) => {
      setUserProfile(profile);
    });
    
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // 预置账号特殊逻辑
      if (email === 'zhouqiang@fairino.com' && password === '123456!') {
        try {
          await loginWithEmail(email, password);
        } catch (authErr: unknown) {
          const authError = authErr as { code?: string };
          // 如果账号不存在（常见于首次使用），则尝试自动创建
          if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-login-credentials' || authError.code === 'auth/invalid-credential') {
            const userCredential = await registerWithEmail(email, password, '周强');
            const userRef = doc(db, 'users', userCredential.user.uid);
            const now = Timestamp.now();
            await setDoc(userRef, {
              uid: userCredential.user.uid,
              email,
              displayName: '周强',
              isAdmin: false,
              approved: true, // 预置账号自动审核通过
              createdAt: now,
              lastLoginAt: now,
            });
          } else {
            throw authErr;
          }
        }
      } else if (isRegistering) {
        const userCredential = await registerWithEmail(email, password, displayName);
        // Create user profile in Firestore
        const userRef = doc(db, 'users', userCredential.user.uid);
        const now = Timestamp.now();
        await setDoc(userRef, {
          uid: userCredential.user.uid,
          email,
          displayName: displayName || email.split('@')[0],
          isAdmin: false,
          approved: false,
          createdAt: now,
          lastLoginAt: now,
        });
      } else {
        await loginWithEmail(email, password);
        // Update last login
        if (auth.currentUser) {
          const userRef = doc(db, 'users', auth.currentUser.uid);
          await updateDoc(userRef, {
            lastLoginAt: Timestamp.now(),
          });
        }
      }
      setShowPanel(false);
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err: unknown) {
      console.error('Auth error:', err);
      const authError = err as { message?: string; code?: string };
      if (authError.message?.includes('network-request-failed')) {
        setError('网络连接失败。提示：Firebase服务在中国大陆可能受限，请尝试开启VPN后重试。');
      } else if (authError.code === 'auth/invalid-login-credentials' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found') {
        setError('账号或密码错误');
      } else {
        setError(authError.message || '登录失败');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowPanel(false);
      setShowAdminPanel(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Hidden trigger - small dot in bottom right corner
  const triggerButton = (
    <motion.button
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: isVisible ? 0.3 : 0, scale: 1 }}
      whileHover={{ opacity: 1, scale: 1.2 }}
      onClick={() => setShowPanel(true)}
      className="fixed bottom-4 right-4 z-50 w-3 h-3 rounded-full bg-gray-400 hover:bg-blue-500 transition-colors"
      title="系统登录"
    />
  );

  return (
    <>
      {triggerButton}
      
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPanel(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Lock className="w-5 h-5" />
                  <span className="font-semibold">
                    {user ? '用户中心' : (isRegistering ? '注册账号' : '系统登录')}
                  </span>
                </div>
                <button
                  onClick={() => setShowPanel(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {user ? (
                  // Logged in view
                  <div className="space-y-4">
                    {userProfile && !userProfile.approved && !isAdmin && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-3">
                        <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">等待管理员审核</p>
                          <p className="mt-1 opacity-90">您的账号已注册成功，请联系管理员审核通过后即可使用完整功能。</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {userProfile?.displayName || user.displayName || user.email}
                        </p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            <Shield className="w-3 h-3" />
                            管理员
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Admin Panel Button */}
                    {isAdmin && (
                      <button
                        onClick={() => setShowAdminPanel(true)}
                        className="w-full flex items-center gap-2 p-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
                      >
                        <Settings className="w-5 h-5" />
                        <span>管理后台</span>
                      </button>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span>退出登录</span>
                    </button>
                  </div>
                ) : (
                  // Login form
                  <form onSubmit={handleLogin} className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                        {error}
                      </div>
                    )}
                    
                    {isRegistering && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          显示名称
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="您的姓名"
                        />
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        邮箱地址
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="name@company.com"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        密码
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? '请稍候...' : (isRegistering ? '注册' : '登录')}
                    </button>
                    
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegistering(!isRegistering);
                          setError('');
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        {isRegistering ? '已有账号？去登录' : '没有账号？去注册'}
                      </button>
                    </div>

                    {/* Default admin hint */}
                    <div className="text-xs text-gray-400 text-center pt-2 border-t">
                      管理员账号: admin@fairino.com
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Panel */}
      <AnimatePresence>
        {showAdminPanel && isAdmin && (
          <AdminPanel onClose={() => setShowAdminPanel(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// Admin Panel Component
function AdminPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'products' | 'users'>('products');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5" />
            <span className="font-semibold">管理后台</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
              activeTab === 'products'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Package className="w-4 h-4" />
            产品库管理
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
              activeTab === 'users'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            用户管理
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto h-[calc(80vh-140px)]">
          {activeTab === 'products' ? <ProductManagement /> : <UserManagement />}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Product Management Component
function ProductManagement() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    unitPrice: '',
    unit: '套',
    category: '',
    description: '',
    hasPrecisionVersion: false,
  });

  // Load products
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToCatalogProducts((data) => {
      setProducts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter products
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      model: '',
      unitPrice: '',
      unit: '套',
      category: '',
      description: '',
      hasPrecisionVersion: false,
    });
    setEditingProduct(null);
  };

  // Open add form
  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  // Open edit form
  const handleEdit = (product: CatalogProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      model: product.model || '',
      unitPrice: product.unitPrice.toString(),
      unit: product.unit,
      category: product.category || '',
      description: product.description || '',
      hasPrecisionVersion: product.hasPrecisionVersion ?? false,
    });
    setShowForm(true);
  };

  // Save product
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.unitPrice.trim()) {
      alert('请填写产品名称和单价');
      return;
    }

    try {
      const productData = {
        name: formData.name.trim(),
        model: formData.model.trim() || undefined,
        unitPrice: parseFloat(formData.unitPrice),
        unit: formData.unit.trim() || '套',
        category: formData.category.trim() || undefined,
        description: formData.description.trim() || undefined,
        isActive: true,
        hasPrecisionVersion: formData.hasPrecisionVersion,
      };

      if (editingProduct) {
        await updateCatalogProduct(editingProduct.id, productData);
      } else {
        await addCatalogProduct(productData);
      }

      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error('Save product error:', error);
      alert('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // Delete product
  const handleDelete = async (product: CatalogProduct) => {
    if (!confirm(`确定要删除产品 "${product.name}" 吗？`)) return;

    try {
      await deleteCatalogProduct(product.id);
    } catch (error) {
      console.error('Delete product error:', error);
      alert('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">标准产品库</h3>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加产品
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索产品名称、型号或分类..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Product List */}
      {loading ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p>加载中...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{searchQuery ? '没有找到匹配的产品' : '暂无产品，请点击上方按钮添加'}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">产品名称</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">型号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">分类</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">单价</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">单位</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">高精度版</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{product.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{product.model || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{product.category || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">¥{product.unitPrice.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">{product.unit}</td>
                  <td className="px-4 py-3 text-center">
                    {product.hasPrecisionVersion
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">⚡ 支持</span>
                      : <span className="text-gray-400 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h4 className="text-lg font-semibold">
                  {editingProduct ? '编辑产品' : '添加产品'}
                </h4>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    产品名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="例如：FR5协作机器人"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      型号
                    </label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="例如：FR5-1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      分类
                    </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="例如：协作机器人"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      单价 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="例如：128000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      单位
                    </label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="例如：套"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    产品描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                    placeholder="产品详细描述..."
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="hasPrecisionVersion"
                    checked={formData.hasPrecisionVersion}
                    onChange={(e) => setFormData({ ...formData, hasPrecisionVersion: e.target.checked })}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <label htmlFor="hasPrecisionVersion" className="text-sm font-medium text-amber-800 cursor-pointer">
                    ⚡ 支持高精度版（在合同清单中可切换，高精度版单价 = 标准价 + ¥2,000）
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingProduct ? '保存修改' : '添加产品'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// User Management Component
function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToAllUsers((data) => {
      setUsers(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleApproval = async (uid: string, currentStatus: boolean) => {
    try {
      await updateUserApproval(uid, !currentStatus);
    } catch (err) {
      alert('操作失败: ' + (err as Error).message);
    }
  };

  const handleToggleAdmin = async (uid: string, currentIsAdmin: boolean) => {
    if (!confirm(`确定要${currentIsAdmin ? '级' : '设为'}管理员吗？`)) return;
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { isAdmin: !currentIsAdmin });
    } catch (err) {
      alert('操作失败: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">用户列表</h3>
        <p className="text-sm text-gray-500">共 {users.length} 位用户</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索邮箱或姓名..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">用户信息</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">权限</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">审核状态</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{u.displayName}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {u.isAdmin ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        <Shield className="w-3 h-3" />
                        管理员
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 italic">普通用户</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.approved ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        已通过
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <X className="w-3 h-3" />
                        待审核
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleToggleApproval(u.uid, u.approved || false)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          u.approved
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {u.approved ? '撤回审核' : '通过审核'}
                      </button>
                      {auth.currentUser?.email === 'admin@fairino.com' && u.email !== 'admin@fairino.com' && (
                        <button
                          onClick={() => handleToggleAdmin(u.uid, u.isAdmin || false)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          {u.isAdmin ? '取消管理员' : '设为管理员'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
