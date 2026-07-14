import { useState, useEffect } from 'react';
import { 
  X, Shield, UserCheck, UserX, Clock, Search, Mail, Calendar, User, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserProfile, 
  subscribeToAllUsers, 
  updateUserApproval 
} from '../services/userService';

interface UserManagerContentProps {
  onClose: () => void;
}

export default function UserManagerContent({ onClose }: UserManagerContentProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToAllUsers((data) => {
      console.log('Fetched users for management:', data.length);
      // Sort users: pending first, then by creation date desc
      const sorted = [...data].sort((a, b) => {
        if (a.approved !== b.approved) {
          return a.approved ? 1 : -1;
        }
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
      setUsers(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleApproval = async (uid: string, approved: boolean) => {
    setIsUpdating(uid);
    try {
      await updateUserApproval(uid, approved);
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setIsUpdating(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filter === 'pending') return matchesSearch && !user.approved && !user.isAdmin;
    if (filter === 'approved') return matchesSearch && user.approved;
    return matchesSearch;
  });

  const pendingCount = users.filter(u => !u.approved && !u.isAdmin).length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-20">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            用户注册审批管理
          </h2>
          <p className="text-xs text-slate-400 mt-1">管理员可在此审核新注册用户的访问权限</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Controls */}
      <div className="p-6 bg-slate-50/50 border-b border-slate-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索用户姓名或邮箱..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>
          <div className="flex bg-white rounded-lg p-1 border border-slate-200">
            {(['all', 'pending', 'approved'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === f 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'all' ? '全部' : f === 'pending' ? `待审核 (${pendingCount})` : '已通过'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
            <p className="text-sm text-slate-400 font-medium">正在拉取用户列表...</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
              <motion.div
                key={user.uid}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-5 rounded-2xl border transition-all ${
                  user.approved 
                    ? 'bg-white border-slate-100 shadow-sm' 
                    : 'bg-emerald-50/30 border-emerald-100'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      user.isAdmin ? 'bg-indigo-100 text-indigo-600' : 
                      user.approved ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {user.isAdmin ? <Shield className="w-6 h-6" /> : <User className="w-6 h-6" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 truncate">
                          {user.displayName || '未设置姓名'}
                        </h3>
                        {user.isAdmin && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase">
                            Admin
                          </span>
                        )}
                        {!user.approved && !user.isAdmin && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-600 text-[10px] font-black flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> 待审核
                          </span>
                        )}
                        {user.approved && !user.isAdmin && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-600 text-[10px] font-black flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> 已通过
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mt-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Mail className="w-3.5 h-3.5" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          注册于: {user.createdAt.toDate().toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {user.isAdmin ? (
                      <button disabled className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold cursor-not-allowed">
                        不可更改
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApproval(user.uid, !user.approved)}
                        disabled={isUpdating === user.uid}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          user.approved
                            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100'
                        }`}
                      >
                        {isUpdating === user.uid ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : user.approved ? (
                          <><UserX className="w-4 h-4" /> 撤销通过</>
                        ) : (
                          <><UserCheck className="w-4 h-4" /> 批准入驻</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">没有匹配的用户记录</p>
            </div>
          )}
        </AnimatePresence>
      )}
    </div>

      {/* Footer info */}
      <div className="p-6 bg-slate-50 border-t border-slate-100">
        <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-emerald-900">权限说明</h4>
            <p className="text-[11px] text-emerald-700/70 mt-1 leading-relaxed">
              审批通过后，用户可以访问系统的全部功能（如生成合同、AI识别、查询历史记录等）。
              在此之前，用户登录后将被引导至“待审核”页面。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
