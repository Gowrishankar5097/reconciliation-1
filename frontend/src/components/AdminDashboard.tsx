import { useState, useEffect, useCallback } from 'react';
import {
  Users, Settings, CreditCard, BarChart3, Shield, Key, MessageSquare,
  Plus, Trash2, Edit2, RefreshCw, Save, X, Eye, EyeOff, Loader2,
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, LogOut
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  credits: number;
  total_credits_used: number;
  created_at: string;
  last_login: string | null;
}

interface Setting {
  id: number;
  key: string;
  value: string;
  type: string;
  description: string;
  updated_at: string;
}

interface UsageLog {
  id: number;
  user_id: number;
  username: string;
  action_type: string;
  credits_used: number;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
}

interface DashboardStats {
  users: { total: number; active: number; admins: number };
  credits: { available: number; used_total: number; used_30d: number };
  usage_30d: { reconciliations: number; llm_calls: number; total_credits: number };
  logins_30d: number;
}

interface AdminDashboardProps {
  adminUser: { id: number; username: string };
  onLogout: () => void;
}

export default function AdminDashboard({ adminUser, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'settings' | 'usage'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dashboard stats
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordDirty, setEditPasswordDirty] = useState(false);
  const [realPasswordLoaded, setRealPasswordLoaded] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', is_admin: false, credits: 10 });

  // Settings
  const [settings, setSettings] = useState<Setting[]>([]);
  const [editingSetting, setEditingSetting] = useState<string | null>(null);
  const [settingValues, setSettingValues] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState(false);

  // Usage logs
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);

  // Credit adjustment
  const [creditAdjust, setCreditAdjust] = useState<{ userId: number; amount: string; description: string } | null>(null);

  const showMessage = useCallback((type: 'error' | 'success', msg: string) => {
    if (type === 'error') setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  }, []);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/admin/dashboard`);
      setStats(data);
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to load dashboard');
    }
  }, [showMessage]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/users`);
      setUsers(data);
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/settings`);
      setSettings(data);
      const values: Record<string, string> = {};
      data.forEach((s: Setting) => { values[s.key] = s.value || ''; });
      setSettingValues(values);
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  // Fetch usage logs
  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/usage?days=30&limit=100`);
      setUsageLogs(data);
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to load usage logs');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'dashboard') fetchStats();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'settings') fetchSettings();
    else if (activeTab === 'usage') fetchUsage();
  }, [activeTab, fetchStats, fetchUsers, fetchSettings, fetchUsage]);

  // Create user
  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      showMessage('error', 'All fields are required');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/admin/users`, newUser);
      showMessage('success', 'User created successfully');
      setShowCreateUser(false);
      setNewUser({ username: '', email: '', password: '', is_admin: false, credits: 10 });
      fetchUsers();
      fetchStats();
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  // Update user
  const handleUpdateUser = async (user: User) => {
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/admin/users/${user.id}`, {
        email: user.email,
        is_admin: user.is_admin,
        is_active: user.is_active,
        credits: user.credits,
      });
      // If password was actually changed, reset it
      if (editPasswordDirty && editPassword.trim()) {
        await axios.post(`${API_BASE}/admin/users/${user.id}/reset-password`, {
          new_password: editPassword.trim(),
        });
      }
      showMessage('success', 'User updated successfully');
      setEditingUser(null);
      setEditPassword('');
      setEditPasswordDirty(false);
      setRealPasswordLoaded(false);
      fetchUsers();
      fetchStats();
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/admin/users/${userId}`);
      showMessage('success', 'User deleted');
      fetchUsers();
      fetchStats();
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  // Reset password
  const handleResetPassword = async (userId: number) => {
    const newPassword = prompt('Enter new password:');
    if (!newPassword) return;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/admin/users/${userId}/reset-password`, { new_password: newPassword });
      showMessage('success', 'Password reset successfully');
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  // Adjust credits
  const handleAdjustCredits = async () => {
    if (!creditAdjust) return;
    const amount = parseInt(creditAdjust.amount) || 0;
    if (amount === 0) {
      showMessage('error', 'Amount cannot be 0');
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        `${API_BASE}/admin/users/${creditAdjust.userId}/credits?admin_id=${adminUser.id}`,
        { amount, description: creditAdjust.description }
      );
      showMessage('success', `Credits adjusted by ${amount}`);
      setCreditAdjust(null);
      fetchUsers();
      fetchStats();
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to adjust credits');
    } finally {
      setLoading(false);
    }
  };

  // Update setting
  const handleUpdateSetting = async (key: string) => {
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/admin/settings/${key}?admin_id=${adminUser.id}`, {
        value: settingValues[key],
      });
      showMessage('success', `Setting "${key}" updated`);
      setEditingSetting(null);
      fetchSettings();
    } catch (e: any) {
      showMessage('error', e?.response?.data?.detail || 'Failed to update setting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-emerald-400" />
          <div>
            <h1 className="text-lg font-bold">Admin Dashboard</h1>
            <p className="text-xs text-slate-400">Ledger Reconciliation System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-300"> <strong>{adminUser.username}</strong></span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Messages */}
      {(error || success) && (
        <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 ${error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span className="text-sm">{error || success}</span>
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-slate-700 min-h-[calc(100vh-64px)] p-4">
          <nav className="space-y-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'usage', label: 'Usage Logs', icon: CreditCard },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-600'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={32} className="animate-spin text-slate-500" />
            </div>
          )}

          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && stats && !loading && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-slate-800">Overview</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Users" value={stats.users.total} subtitle={`${stats.users.active} active`} icon={Users} color="blue" />
                <StatCard title="Admin Users" value={stats.users.admins} icon={Shield} color="purple" />
                <StatCard title="Credits Available" value={stats.credits.available} subtitle="across all users" icon={CreditCard} color="green" />
                <StatCard title="Credits Used (30d)" value={stats.credits.used_30d} icon={BarChart3} color="orange" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-slate-700 mb-4">Usage (Last 30 Days)</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Reconciliations</span>
                      <span className="font-bold text-slate-800">{stats.usage_30d.reconciliations}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">LLM Extractions</span>
                      <span className="font-bold text-slate-800">{stats.usage_30d.llm_calls}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Credits Used</span>
                      <span className="font-bold text-emerald-600">{stats.usage_30d.total_credits}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-slate-700 mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveTab('users')}
                      className="w-full text-left px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-colors"
                    >
                      Manage Users →
                    </button>
                    <button
                      onClick={() => setActiveTab('settings')}
                      className="w-full text-left px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm transition-colors"
                    >
                      Update OpenAI Key →
                    </button>
                    <button
                      onClick={() => { setActiveTab('users'); setShowCreateUser(true); }}
                      className="w-full text-left px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-sm transition-colors"
                    >
                      + Create New User
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">User Management</h2>
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-blue-500 hover:to-indigo-500 transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Plus size={16} /> Create User
                </button>
              </div>

              {/* Create User Modal */}
              {showCreateUser && (
                <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                  <h3 className="font-semibold text-slate-700 mb-4">Create New User</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Username"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Initial Credits"
                      value={newUser.credits}
                      onChange={(e) => setNewUser({ ...newUser, credits: parseInt(e.target.value) || 0 })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={newUser.is_admin}
                        onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                      />
                      Admin User
                    </label>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleCreateUser}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateUser(false)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Users Table */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Credits</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Used</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{user.username}</span>
                            {user.is_admin && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">Admin</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{user.email}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-emerald-600">{user.credits}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">{user.total_credits_used}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setCreditAdjust({ userId: user.id, amount: '', description: '' })}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded"
                              title="Adjust Credits"
                            >
                              <CreditCard size={16} />
                            </button>
                            <button
                              onClick={async () => {
                                setEditingUser(user);
                                setEditPassword('');
                                setEditPasswordDirty(false);
                                setRealPasswordLoaded(false);
                                try {
                                  const { data } = await axios.get(`${API_BASE}/admin/users/${user.id}/password`);
                                  if (data.password) {
                                    setEditPassword(data.password);
                                    setRealPasswordLoaded(true);
                                  } else {
                                    setEditPassword('');
                                  }
                                } catch {
                                  setEditPassword('');
                                }
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user.id)}
                              className="p-1.5 text-orange-600 hover:bg-orange-100 rounded"
                              title="Reset Password"
                            >
                              <Key size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Credit Adjustment Modal */}
              {creditAdjust && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                    <h3 className="font-semibold text-slate-800 mb-4">Adjust Credits</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-slate-600">Amount (positive to add, negative to deduct)</label>
                        <input
                          type="number"
                          value={creditAdjust.amount}
                          onChange={(e) => setCreditAdjust({ ...creditAdjust, amount: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Description</label>
                        <input
                          type="text"
                          value={creditAdjust.description}
                          onChange={(e) => setCreditAdjust({ ...creditAdjust, description: e.target.value })}
                          placeholder="Reason for adjustment"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleAdjustCredits}
                        className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => setCreditAdjust(null)}
                        className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit User Modal */}
              {editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
                    <h3 className="font-semibold text-slate-800 mb-4">Edit User: {editingUser.username}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-slate-600">Email</label>
                        <input
                          type="email"
                          value={editingUser.email}
                          onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Password</label>
                        <input
                          type="text"
                          value={editPassword}
                          onChange={(e) => { setEditPassword(e.target.value); setEditPasswordDirty(true); }}
                          placeholder="Enter new password"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"
                        />
                        <p className="text-xs text-slate-400 mt-1">{editPasswordDirty ? 'New password will be saved' : 'Leave unchanged to keep current password'}</p>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600">Credits</label>
                        <input
                          type="number"
                          value={editingUser.credits}
                          onChange={(e) => setEditingUser({ ...editingUser, credits: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={editingUser.is_admin}
                          onChange={(e) => setEditingUser({ ...editingUser, is_admin: e.target.checked })}
                        />
                        Admin User
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={editingUser.is_active}
                          onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                        />
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleUpdateUser(editingUser)}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => { setEditingUser(null); setEditPassword(''); setEditPasswordDirty(false); setRealPasswordLoaded(false); }}
                        className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">System Settings</h2>
                <button
                  onClick={fetchSettings}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              <div className="space-y-4">
                {settings.map((setting) => (
                  <div key={setting.key} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {setting.key === 'openai_api_key' && <Key size={18} className="text-amber-500" />}
                          {setting.key === 'extraction_prompt' && <MessageSquare size={18} className="text-blue-500" />}
                          {setting.key.includes('credits') && <CreditCard size={18} className="text-emerald-500" />}
                          <h3 className="font-semibold text-slate-800">{setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{setting.description}</p>
                      </div>
                      {editingSetting !== setting.key ? (
                        <button
                          onClick={() => setEditingSetting(setting.key)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded"
                        >
                          <Edit2 size={16} />
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleUpdateSetting(setting.key)}
                            className="p-2 text-emerald-600 hover:bg-emerald-100 rounded"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            onClick={() => setEditingSetting(null)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      {editingSetting === setting.key ? (
                        setting.key === 'extraction_prompt' ? (
                          <textarea
                            value={settingValues[setting.key] || ''}
                            onChange={(e) => setSettingValues({ ...settingValues, [setting.key]: e.target.value })}
                            rows={10}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                          />
                        ) : setting.key === 'openai_api_key' ? (
                          <div className="relative">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={settingValues[setting.key] || ''}
                              onChange={(e) => setSettingValues({ ...settingValues, [setting.key]: e.target.value })}
                              className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm font-mono"
                              placeholder="sk-..."
                            />
                            <button
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                            >
                              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        ) : (
                          <input
                            type={setting.type === 'number' ? 'number' : 'text'}
                            value={settingValues[setting.key] || ''}
                            onChange={(e) => setSettingValues({ ...settingValues, [setting.key]: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        )
                      ) : (
                        <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 font-mono">
                          {setting.key === 'extraction_prompt' ? (
                            <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto">{setting.value}</pre>
                          ) : (
                            setting.value || <span className="text-slate-400 italic">Not set</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage Tab */}
          {activeTab === 'usage' && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800">Usage Logs (Last 30 Days)</h2>
                <button
                  onClick={fetchUsage}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">User</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Credits</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{log.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            log.action_type === 'reconciliation' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {log.action_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-600">-{log.credits_used}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                          {log.file_name || '-'}
                        </td>
                      </tr>
                    ))}
                    {usageLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No usage logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: number;
  subtitle?: string;
  icon: any;
  color: 'blue' | 'purple' | 'green' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    green: 'bg-emerald-100 text-emerald-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
