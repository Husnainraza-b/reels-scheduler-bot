import { useState, useEffect, useCallback } from 'react';
import { LogOut } from 'lucide-react';
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
      fetchAccounts().then(() => {});
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
        <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
      </div>
    );
  }

  // ─── Login Screen ───
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // ─── Main Dashboard ───
  return (
    <div className="min-h-screen bg-surface text-text-primary antialiased overflow-x-hidden selection:bg-accent selection:text-surface">

      {/* ─── TopNavBar ─── */}
      <nav className="sticky top-0 z-50 w-full bg-surface border-b border-outline/30">
        <div className="max-w-7xl mx-auto px-8 sm:px-12 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-primary">
              REELS AUTOPILOT
            </span>
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-low border border-outline/30">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-text-secondary">System Online</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile: just the dot */}
            <div className="flex md:hidden items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Main Canvas ─── */}
      <main className="py-12 min-h-screen">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 px-8 sm:px-12 max-w-7xl mx-auto">

          {/* Left Column — Accounts */}
          <div className="col-span-1 md:col-span-4 flex flex-col gap-4">
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
          <div className="col-span-1 md:col-span-8 md:pl-8">
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
      <footer className="border-t border-outline/20 mt-16">
        <div className="max-w-7xl mx-auto px-8 sm:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase text-text-muted/50 tracking-[0.1em]">
            © 2024 REELS AUTOPILOT. ALL RIGHTS RESERVED.
          </p>
          <div className="flex gap-6">
            <span className="text-xs text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Privacy</span>
            <span className="text-xs text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Terms</span>
            <span className="text-xs text-text-secondary/50 hover:text-text-primary transition-colors cursor-pointer">Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
