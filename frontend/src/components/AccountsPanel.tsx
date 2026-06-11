import { useState } from 'react';
import {
  UserPlus,
  Camera,
  KeyRound,
  AtSign,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { Account } from '../services/api';
import { createAccount } from '../services/api';

interface AccountsPanelProps {
  accounts: Account[];
  selectedAccountId: number | null;
  onSelectAccount: (id: number) => void;
  onAccountCreated: () => void;
}


export default function AccountsPanel({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onAccountCreated,
}: AccountsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !businessId || !accessToken) return;

    setIsSubmitting(true);
    try {
      await createAccount({
        username,
        instagram_business_id: businessId,
        access_token: accessToken,
      });
      setUsername('');
      setBusinessId('');
      setAccessToken('');
      setShowForm(false);
      setSuccessMsg('Account added successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      onAccountCreated();
    } catch (err) {
      console.error('Failed to create account:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
            <Camera className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Accounts</h2>
            <p className="text-sm text-text-muted">{accounts.length} connected</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors duration-200 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-success/10 border border-success/20 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span className="text-sm text-success">{successMsg}</span>
        </div>
      )}

      {/* Add Account Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-surface rounded-xl border border-border space-y-3">
          <div className="relative">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
            />
          </div>
          <div className="relative">
            <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Meta Business ID"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
            />
          </div>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="password"
              placeholder="Access Token (will be encrypted)"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            {isSubmitting ? 'Encrypting & Saving...' : 'Encrypt & Save Account'}
          </button>
        </form>
      )}

      {/* Account List */}
      <div className="space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">
            No accounts connected yet. Add your first Instagram account above.
          </p>
        ) : (
          accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left cursor-pointer ${
                selectedAccountId === account.id
                  ? 'bg-accent-muted border border-accent/30'
                  : 'bg-surface hover:bg-surface-hover border border-transparent'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                  selectedAccountId === account.id
                    ? 'bg-accent text-white'
                    : 'bg-surface-hover text-text-secondary'
                }`}
              >
                {account.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">
                  @{account.username}
                </p>
                <p className="text-xs text-text-muted truncate">
                  ID: {account.instagram_business_id}
                </p>
              </div>
              {selectedAccountId === account.id && (
                <div className="w-2 h-2 rounded-full bg-accent status-pulse" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
