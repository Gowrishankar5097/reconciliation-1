import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, BarChart3, Clock, FileText, TrendingUp, TrendingDown,
  Loader2, AlertCircle, RefreshCw, User as UserIcon
} from 'lucide-react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  credits: number;
  total_credits_used: number;
  created_at: string;
  last_login: string | null;
}

interface UsageStats {
  reconciliations: number;
  llm_calls: number;
  total_credits: number;
}

interface DailyUsage {
  date: string;
  credits: number;
}

interface UsageLog {
  id: number;
  action_type: string;
  credits_used: number;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
}

interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

interface UserDashboardProps {
  userId: number;
  username: string;
  onClose: () => void;
}

export default function UserDashboard({ userId, username, onClose }: UserDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'credits'>('overview');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[]>([]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`${API_BASE}/user/dashboard/${userId}`);
      setProfile(data.user);
      setUsageStats(data.usage_30d);
      setDailyUsage(data.daily_usage || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchUsageLogs = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/user/usage/${userId}?days=30&limit=50`);
      setUsageLogs(data);
    } catch (e: any) {
      console.error('Failed to load usage logs:', e);
    }
  }, [userId]);

  const fetchCreditHistory = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/user/credits/${userId}`);
      setCreditHistory(data.transactions || []);
    } catch (e: any) {
      console.error('Failed to load credit history:', e);
    }
  }, [userId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeTab === 'usage') fetchUsageLogs();
    else if (activeTab === 'credits') fetchCreditHistory();
  }, [activeTab, fetchUsageLogs, fetchCreditHistory]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 flex items-center gap-3">
          <Loader2 size={24} className="animate-spin text-slate-500" />
          <span className="text-slate-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md">
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <AlertCircle size={24} />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <UserIcon size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">{username}'s Dashboard</h2>
              <p className="text-slate-300 text-sm">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 px-6">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'usage', label: 'Usage History', icon: Clock },
              { id: 'credits', label: 'Credit History', icon: CreditCard },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && profile && usageStats && (
            <div className="space-y-6">
              {/* Credit Balance Card */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-emerald-100 text-sm">Available Credits</p>
                    <p className="text-4xl font-bold mt-1">{profile.credits}</p>
                    <p className="text-emerald-200 text-sm mt-2">
                      Total used: {profile.total_credits_used} credits
                    </p>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <CreditCard size={32} />
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Reconciliations (30d)"
                  value={usageStats.reconciliations}
                  icon={FileText}
                  color="blue"
                />
                <StatCard
                  title="LLM Extractions (30d)"
                  value={usageStats.llm_calls}
                  icon={BarChart3}
                  color="purple"
                />
                <StatCard
                  title="Credits Used (30d)"
                  value={usageStats.total_credits}
                  icon={TrendingDown}
                  color="orange"
                />
              </div>

              {/* Usage Chart */}
              {dailyUsage.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">Daily Usage (Last 30 Days)</h3>
                  <div className="h-40 flex items-end gap-1">
                    {dailyUsage.slice(-14).map((day, i) => {
                      const maxCredits = Math.max(...dailyUsage.map(d => d.credits), 1);
                      const height = (day.credits / maxCredits) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-emerald-500 rounded-t hover:bg-emerald-600 transition-colors cursor-pointer group relative"
                          style={{ height: `${Math.max(height, 4)}%` }}
                          title={`${day.date}: ${day.credits} credits`}
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {day.credits} credits
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-slate-400">
                    <span>{dailyUsage[dailyUsage.length - 14]?.date || ''}</span>
                    <span>{dailyUsage[dailyUsage.length - 1]?.date || ''}</span>
                  </div>
                </div>
              )}

              {/* Account Info */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-3">Account Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Member Since</p>
                    <p className="font-medium text-slate-700">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Last Login</p>
                    <p className="font-medium text-slate-700">
                      {profile.last_login
                        ? new Date(profile.last_login).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Usage History Tab */}
          {activeTab === 'usage' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">Recent Activity</h3>
                <button
                  onClick={fetchUsageLogs}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {usageLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No usage history found
                </div>
              ) : (
                <div className="space-y-2">
                  {usageLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          log.action_type === 'reconciliation'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-purple-100 text-purple-600'
                        }`}>
                          {log.action_type === 'reconciliation' ? (
                            <FileText size={18} />
                          ) : (
                            <BarChart3 size={18} />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 capitalize">
                            {log.action_type.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-slate-500">
                            {log.file_name || 'No file info'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-500">-{log.credits_used}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Credit History Tab */}
          {activeTab === 'credits' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">Credit Transactions</h3>
                <button
                  onClick={fetchCreditHistory}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {creditHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No credit transactions found
                </div>
              ) : (
                <div className="space-y-2">
                  {creditHistory.map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          tx.amount > 0
                            ? 'bg-green-100 text-green-600'
                            : 'bg-red-100 text-red-600'
                        }`}>
                          {tx.amount > 0 ? (
                            <TrendingUp size={18} />
                          ) : (
                            <TrendingDown size={18} />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 capitalize">
                            {tx.type.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-slate-500">
                            {tx.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(tx.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: {
  title: string;
  value: number;
  icon: any;
  color: 'blue' | 'purple' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}
