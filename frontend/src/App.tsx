import { useState, useEffect, useCallback } from 'react';
import { Zap, Radio, LogOut } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import AccountsPanel from './components/AccountsPanel';
import QueueStream from './components/QueueStream';
import {
  getAccounts,
  getSlots,
  getQueue,
  verifyAuth,
  setApiToken,
  type Account,
  type PostingSlot,
  type QueueItem,
} from './services/api';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { token, login, logout } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [slotsByAccount, setSlotsByAccount] = useState<Record<number, PostingSlot[]>>({});
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);

  // ─── Auth Check on Mount ───
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        setApiToken(token);
        const valid = await verifyAuth();
        setIsAuthenticated(valid);
        if (!valid) {
          logout();
          setApiToken(null);
        }
      } else {
        setIsAuthenticated(false);
        setApiToken(null);
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, [token, logout]);

  // ─── Login Handler ───
  const handleLogin = async (password: string): Promise<boolean> => {
    setApiToken(password);
    const valid = await verifyAuth();
    if (valid) {
      login(password);
      setIsAuthenticated(true);
      return true;
    }
    setApiToken(null);
    return false;
  };

  const handleLogout = () => {
    logout();
    setApiToken(null);
    setIsAuthenticated(false);
    setAccounts([]);
    setSlotsByAccount({});
    setQueueItems([]);
    setSelectedAccountId(null);
  };

  // ─── Data Fetchers ───
  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  }, [selectedAccountId]);

  const fetchAllSlots = useCallback(async (accountsList: Account[]) => {
    const newSlots: Record<number, PostingSlot[]> = {};
    for (const acc of accountsList) {
      try {
        const data = await getSlots(acc.id);
        newSlots[acc.id] = data;
      } catch (err) {
        console.error(`Failed to fetch slots for account ${acc.id}:`, err);
      }
    }
    setSlotsByAccount(newSlots);
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!selectedAccountId) {
      setQueueItems([]);
      return;
    }
    setIsQueueLoading(true);
    try {
      const data = await getQueue(selectedAccountId);
      setQueueItems(data);
    } catch (err) {
      console.error('Failed to fetch queue:', err);
    } finally {
      setIsQueueLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAccounts().then(() => {
        // We'll fetch slots inside another effect that watches `accounts`
      });
    }
  }, [isAuthenticated, fetchAccounts]);

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      fetchAllSlots(accounts);
    }
  }, [isAuthenticated, accounts, fetchAllSlots]);

  useEffect(() => {
    if (isAuthenticated && selectedAccountId) {
      fetchQueue();
    }
  }, [selectedAccountId, isAuthenticated, fetchQueue]);

  // ─── Event Handlers ───
  const handleAccountCreated = () => {
    fetchAccounts();
  };

  const handleAccountDeleted = () => {
    fetchAccounts();
  };

  const handleSelectAccount = (id: number) => {
    setSelectedAccountId(id);
  };

  const handleSlotsChanged = () => {
    fetchAllSlots(accounts);
    fetchQueue();
  };

  // ─── Auth Check Loading ───
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg shadow-accent/20 animate-pulse">
          <Zap className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  // ─── Login Screen ───
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ─── Main Dashboard ───
  return (
    <div className="min-h-screen bg-surface">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg shadow-accent/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary tracking-tight">
                Reels Autopilot
              </h1>
              <p className="text-xs text-text-muted">
                Instagram Scheduling Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
              <Radio className="w-3.5 h-3.5 text-success status-pulse" />
              <span className="text-xs font-medium text-success">System Online</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors duration-200 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Grid ─── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column — Accounts + Slots */}
          <div className="lg:col-span-4 space-y-6">
            <AccountsPanel
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={handleSelectAccount}
              onAccountCreated={handleAccountCreated}
              onAccountDeleted={handleAccountDeleted}
              slotsByAccount={slotsByAccount}
              onSlotsChanged={handleSlotsChanged}
            />
          </div>

          {/* Right Column — Queue */}
          <div className="lg:col-span-8">
            <QueueStream
              queueItems={queueItems}
              accounts={accounts}
              isLoading={isQueueLoading}
              onRefresh={fetchQueue}
            />
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Reels Autopilot · All times displayed in PKT (Asia/Karachi)
          </p>
          <p className="text-xs text-text-muted">
            Phase 5 · Dashboard v1.0
          </p>
        </div>
      </footer>
    </div>
  );
}
