import { useState } from 'react';
import {
  UserPlus,
  Camera,
  KeyRound,
  AtSign,
  Loader2,
  CheckCircle2,
  Trash2,
  X,
  Pencil
} from 'lucide-react';
import type { Account, PostingSlot } from '../services/api';
import { createAccount, deleteAccount, updateAccount } from '../services/api';
import SlotsConfigurator from './SlotsConfigurator';

interface AccountsPanelProps {
  accounts: Account[];
  selectedAccountId: number | null;
  onSelectAccount: (id: number) => void;
  onAccountCreated: () => void;
  onAccountDeleted: () => void;
  slotsByAccount: Record<number, PostingSlot[]>;
  onSlotsChanged: () => void;
}


export default function AccountsPanel({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onAccountCreated,
  onAccountDeleted,
  slotsByAccount,
  onSlotsChanged
}: AccountsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editBusinessId, setEditBusinessId] = useState('');
  const [editAccessToken, setEditAccessToken] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleEditAccountClick = (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    setEditingAccountId(account.id);
    setEditUsername(account.username);
    setEditBusinessId(account.instagram_business_id);
    setEditAccessToken('');
  };

  const handleSaveAccountEdit = async (id: number) => {
    if (!editUsername || !editBusinessId) return;
    setIsSavingEdit(true);
    try {
      const payload: any = { username: editUsername, instagram_business_id: editBusinessId };
      if (editAccessToken) payload.access_token = editAccessToken;
      await updateAccount(id, payload);
      setEditingAccountId(null);
      setSuccessMsg('Account updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      onAccountCreated(); // We reuse this to fetch accounts
    } catch (err) {
      console.error('Failed to update account:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this account?")) return;
    setDeletingId(id);
    try {
      await deleteAccount(id);
      onAccountDeleted();
    } catch (err) {
      console.error('Failed to delete account:', err);
    } finally {
      setDeletingId(null);
    }
  };

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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 bg-surface-hover hover:bg-surface-hover/80 text-text-primary text-sm font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer border border-border"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {isSubmitting ? 'Saving...' : 'Encrypt & Save'}
            </button>
          </div>
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
            <div key={account.id} className="flex flex-col gap-2">
              {editingAccountId === account.id ? (
                <div className="p-4 bg-surface rounded-xl border border-accent/50 space-y-3">
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Username"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-border-focus"
                    />
                  </div>
                  <div className="relative">
                    <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Meta Business ID"
                      value={editBusinessId}
                      onChange={(e) => setEditBusinessId(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-border-focus"
                    />
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="password"
                      placeholder="New Access Token (Leave blank to keep current)"
                      value={editAccessToken}
                      onChange={(e) => setEditAccessToken(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-border-focus"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAccountId(null)}
                      className="flex-1 py-2 bg-surface-hover text-sm font-medium rounded-xl border border-border transition-colors cursor-pointer flex justify-center items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button
                      onClick={() => handleSaveAccountEdit(account.id)}
                      disabled={isSavingEdit}
                      className="flex-[2] py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer flex justify-center items-center gap-1"
                    >
                      {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left ${
                    selectedAccountId === account.id
                      ? 'bg-accent-muted border border-accent/30'
                      : 'bg-surface hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  <button 
                    onClick={() => onSelectAccount(account.id)}
                    className="flex-1 flex items-center gap-3 cursor-pointer min-w-0 text-left"
                  >
                    <div
                      className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-sm font-bold ${
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
                  </button>
                  
                  <button
                    onClick={(e) => handleEditAccountClick(e, account)}
                    className="p-2 hover:bg-accent/10 text-text-muted hover:text-accent rounded-lg transition-colors cursor-pointer"
                    title="Edit Account"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAccount(account.id);
                    }}
                    disabled={deletingId === account.id}
                    className="p-2 hover:bg-danger/10 text-text-muted hover:text-danger rounded-lg transition-colors cursor-pointer"
                    title="Delete Account"
                  >
                    {deletingId === account.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  {selectedAccountId === account.id && (
                    <div className="w-2 h-2 flex-shrink-0 rounded-full bg-accent status-pulse ml-1" />
                  )}
                </div>
              )}
              
              <div className="pl-3 pr-3 pb-2 pt-1">
                <SlotsConfigurator
                  accountId={account.id}
                  slots={slotsByAccount[account.id] || []}
                  onSlotsChanged={onSlotsChanged}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
