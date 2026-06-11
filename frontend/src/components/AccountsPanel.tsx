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
  Pencil,
  Settings
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
  const [errorMsg, setErrorMsg] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<number | null>(null);

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
    setErrorMsg('');
    try {
      const payload: any = { username: editUsername, instagram_business_id: editBusinessId };
      if (editAccessToken) payload.access_token = editAccessToken;
      await updateAccount(id, payload);
      setEditingAccountId(null);
      setSuccessMsg('Account updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      onAccountCreated();
    } catch (err: any) {
      console.error('Failed to update account:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update account');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteAccountConfirm = async (id: number) => {
    setDeletingId(id);
    setAccountToDelete(null);
    setErrorMsg('');
    try {
      await deleteAccount(id);
      onAccountDeleted();
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !businessId || !accessToken) return;

    setIsSubmitting(true);
    setErrorMsg('');
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
    } catch (err: any) {
      console.error('Failed to create account:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-widest">
          ACTIVE ROUTINES
        </h2>
        <span className="text-xs text-text-muted/50">{accounts.length} Total</span>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/20 rounded-sm">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span className="text-base text-success">{successMsg}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/20 rounded-sm">
          <X className="w-4 h-4 text-danger" />
          <span className="text-base text-danger">{errorMsg}</span>
        </div>
      )}

      {/* Add Account Trigger */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full py-4 border border-dashed border-outline/40 bg-transparent text-text-secondary text-sm font-medium rounded-sm hover:bg-surface-lowest hover:border-outline transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer group"
      >
        <UserPlus className="w-4 h-4 opacity-70 group-hover:opacity-100" />
        New Routine Profile
      </button>

      {/* Inline Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="w-full p-5 border border-outline/20 bg-surface-lowest rounded-sm flex flex-col gap-4">
          <div className="input-underline">
            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
              <AtSign className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
              <input
                type="text"
                placeholder="Profile Alias"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0"
              />
            </div>
          </div>
          <div className="input-underline">
            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
              <Camera className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
              <input
                type="text"
                placeholder="Meta Business ID"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0"
              />
            </div>
          </div>
          <div className="input-underline">
            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
              <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
              <input
                type="password"
                placeholder="Access Token (encrypted)"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm font-medium text-text-secondary hover:text-text-primary px-3 py-1 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="text-sm font-medium bg-accent text-surface px-4 py-1.5 rounded-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      )}

      {/* ─── Account Cards ─── */}

      {/* Mobile: Horizontal scroll strip */}
      <div className="flex md:hidden gap-4 overflow-x-auto hide-scrollbar pb-2 -mx-6 px-6">
        {accounts.map((account) => {
          const isActive = selectedAccountId === account.id;
          const slots = slotsByAccount[account.id] || [];
          return (
            <button
              key={account.id}
              onClick={() => onSelectAccount(account.id)}
              className={`flex-shrink-0 w-64 p-4 rounded-lg flex flex-col gap-2 text-left cursor-pointer transition-all ${isActive
                  ? 'bg-surface-card border-l-2 border-l-accent border-y border-r border-outline/10'
                  : 'bg-surface-card border border-surface-hover'
                }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-primary">@{account.username}</span>
                {isActive && <CheckCircle2 className="w-4 h-4 text-accent-hover" />}
              </div>
              <div className="flex gap-2 mt-2">
                {slots.slice(0, 3).map((s) => (
                  <span key={s.id} className="px-2 py-1 bg-surface-hover rounded-sm text-xs text-text-secondary">
                    {s.slot_time.substring(0, 5)}
                  </span>
                ))}
                {slots.length > 3 && (
                  <span className="px-2 py-1 text-xs text-text-muted">+{slots.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: Vertical list */}
      <div className="hidden md:flex flex-col gap-4">
        {accounts.length === 0 ? (
          <p className="text-base text-text-muted text-center py-8">
            No accounts connected. Add your first routine above.
          </p>
        ) : (
          accounts.map((account) => {
            const isActive = selectedAccountId === account.id;

            return (
              <div key={account.id} className="flex flex-col">
                {editingAccountId === account.id ? (
                  /* ─── Edit Form ─── */
                  <div className="p-5 bg-surface-lowest border border-outline/20 rounded-sm flex flex-col gap-4">
                    <div className="input-underline">
                      <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                        <AtSign className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Username"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                    </div>
                    <div className="input-underline">
                      <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                        <Camera className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Meta Business ID"
                          value={editBusinessId}
                          onChange={(e) => setEditBusinessId(e.target.value)}
                          className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                    </div>
                    <div className="input-underline">
                      <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                        <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                        <input
                          type="password"
                          placeholder="New Token (leave blank to keep)"
                          value={editAccessToken}
                          onChange={(e) => setEditAccessToken(e.target.value)}
                          className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setEditingAccountId(null)}
                        className="text-sm font-medium text-text-secondary hover:text-text-primary px-3 py-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveAccountEdit(account.id)}
                        disabled={isSavingEdit}
                        className="text-sm font-medium bg-accent text-surface px-4 py-1.5 rounded-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ─── Account Card ─── */
                  <div
                    className={`group relative w-full p-5 flex flex-col gap-4 transition-all duration-300 cursor-pointer ${isActive
                        ? 'bg-surface-low border-l-2 border-l-accent border-y border-r border-outline/10 rounded-r-sm hover:shadow-[0_0_30px_rgba(0,0,0,0.5)]'
                        : 'bg-transparent border border-outline/10 rounded-sm hover:bg-surface-lowest hover:border-outline/30'
                      }`}
                    onClick={() => onSelectAccount(account.id)}
                  >
                    <div className={`flex items-start justify-between ${!isActive ? 'opacity-60 group-hover:opacity-100 transition-opacity' : ''}`}>
                      <div>
                        <h3 className={isActive ? 'text-2xl font-normal text-text-primary' : 'text-lg text-text-primary'}>
                          @{account.username}
                        </h3>
                        <p className="text-xs text-text-secondary mt-1">
                          ID: {account.instagram_business_id}
                        </p>
                      </div>

                      {/* Hover Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        {isActive ? (
                          <>
                            <button
                              onClick={(e) => handleEditAccountClick(e, account)}
                              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded hover:bg-surface-high cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="w-[18px] h-[18px]" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAccountToDelete(account.id);
                              }}
                              disabled={deletingId === account.id}
                              className="p-1.5 text-text-secondary hover:text-danger transition-colors rounded hover:bg-surface-high cursor-pointer"
                              title="Delete"
                            >
                              {deletingId === account.id ? (
                                <Loader2 className="w-[18px] h-[18px] animate-spin text-danger" />
                              ) : (
                                <Trash2 className="w-[18px] h-[18px]" />
                              )}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectAccount(account.id); }}
                            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded cursor-pointer"
                          >
                            <Settings className="w-[18px] h-[18px]" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Slots — only show on active */}
                    {isActive && (
                      <div className="pt-4 border-t border-outline/10">
                        <SlotsConfigurator
                          accountId={account.id}
                          slots={slotsByAccount[account.id] || []}
                          onSlotsChanged={onSlotsChanged}
                        />
                      </div>
                    )}

                    {/* Inactive: dot indicators for slots */}
                    {!isActive && (slotsByAccount[account.id] || []).length > 0 && (
                      <div className="flex gap-2 opacity-50 group-hover:opacity-80 transition-opacity">
                        {(slotsByAccount[account.id] || []).map((_, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-outline" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── Delete Confirmation Modal ─── */}
      {accountToDelete !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all">
            <div>
              <h2 className="text-lg font-medium text-zinc-100 mb-2">
                Delete Account
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Are you absolutely sure? Deleting this account will permanently remove the account, its access tokens, and ALL scheduled videos associated with it from the queue and storage. This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800/50">
              <button
                onClick={() => setAccountToDelete(null)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteAccountConfirm(accountToDelete)}
                disabled={deletingId !== null}
                className="px-4 py-2 text-sm font-medium bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40 rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {deletingId !== null && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
