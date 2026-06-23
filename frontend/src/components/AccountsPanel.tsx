import { useState } from 'react';
import {
  UserPlus,
  KeyRound,
  AtSign,
  Loader2,
  CheckCircle2,
  Trash2,
  X,
  Pencil,
  Settings,
  Pause,
  Play
} from 'lucide-react';
import { FaInstagram, FaFacebook, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import type { Account, PostingSlot, PlatformsEnabled } from '../services/api';
import { createAccount, deleteAccount, updateAccount, toggleQueueStatus } from '../services/api';
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
  // Add Form State
  const [username, setUsername] = useState('');
  const [platforms, setPlatforms] = useState<PlatformsEnabled>({
    instagram: true,
    facebook: false,
    tiktok: false,
    x: false,
    youtube: false,
  });
  const [businessId, setBusinessId] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tiktokAccessToken, setTiktokAccessToken] = useState('');
  const [twitterAccessToken, setTwitterAccessToken] = useState('');
  const [twitterAccessSecret, setTwitterAccessSecret] = useState('');
  const [youtubeRefreshToken, setYoutubeRefreshToken] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<number | null>(null);

  // Edit Form State
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPlatforms, setEditPlatforms] = useState<PlatformsEnabled>({
    instagram: true,
    facebook: false,
    tiktok: false,
    x: false,
    youtube: false,
  });
  const [editBusinessId, setEditBusinessId] = useState('');
  const [editFacebookPageId, setEditFacebookPageId] = useState('');
  const [editAccessToken, setEditAccessToken] = useState('');
  const [editTiktokAccessToken, setEditTiktokAccessToken] = useState('');
  const [editTwitterAccessToken, setEditTwitterAccessToken] = useState('');
  const [editTwitterAccessSecret, setEditTwitterAccessSecret] = useState('');
  const [editYoutubeRefreshToken, setEditYoutubeRefreshToken] = useState('');

  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [togglingQueueId, setTogglingQueueId] = useState<number | null>(null);

  const handleEditAccountClick = (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    setEditingAccountId(account.id);
    setEditUsername(account.username);
    setEditPlatforms(
      account.platforms_enabled || {
        instagram: true,
        facebook: false,
        tiktok: false,
        x: false,
        youtube: false,
      }
    );
    setEditBusinessId(account.instagram_business_id || '');
    setEditFacebookPageId(account.facebook_page_id || '');
    setEditAccessToken('');
    setEditTiktokAccessToken('');
    setEditTwitterAccessToken('');
    setEditTwitterAccessSecret('');
    setEditYoutubeRefreshToken('');
  };

  const handleSaveAccountEdit = async (id: number) => {
    if (!editUsername) return;
    setIsSavingEdit(true);
    setErrorMsg('');
    try {
      const payload: any = {
        username: editUsername,
        platforms_enabled: editPlatforms,
      };
      
      if (editPlatforms.instagram) payload.instagram_business_id = editBusinessId;
      if (editPlatforms.facebook) payload.facebook_page_id = editFacebookPageId;
      if (editAccessToken) payload.access_token = editAccessToken;
      if (editTiktokAccessToken) payload.tiktok_access_token = editTiktokAccessToken;
      if (editTwitterAccessToken) payload.twitter_access_token = editTwitterAccessToken;
      if (editTwitterAccessSecret) payload.twitter_access_secret = editTwitterAccessSecret;
      if (editYoutubeRefreshToken) payload.youtube_refresh_token = editYoutubeRefreshToken;

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

  const handleToggleQueue = async (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    setTogglingQueueId(account.id);
    setErrorMsg('');
    try {
      const newStatus = account.queue_status === 'active' ? 'paused' : 'active';
      await toggleQueueStatus(account.id, newStatus);
      // Wait a moment for reshuffle if resumed, then refresh accounts
      setTimeout(() => onAccountCreated(), 500); 
    } catch (err) {
      console.error('Failed to toggle queue:', err);
      setErrorMsg((err as any).response?.data?.error || 'Failed to update queue status');
    } finally {
      setTogglingQueueId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await createAccount({
        username,
        platforms_enabled: platforms,
        instagram_business_id: platforms.instagram ? businessId : undefined,
        facebook_page_id: platforms.facebook ? facebookPageId : undefined,
        access_token: accessToken || undefined,
        tiktok_access_token: tiktokAccessToken || undefined,
        twitter_access_token: twitterAccessToken || undefined,
        twitter_access_secret: twitterAccessSecret || undefined,
        youtube_refresh_token: youtubeRefreshToken || undefined,
      });
      setUsername('');
      setBusinessId('');
      setFacebookPageId('');
      setAccessToken('');
      setTiktokAccessToken('');
      setTwitterAccessToken('');
      setTwitterAccessSecret('');
      setYoutubeRefreshToken('');
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
          
          <div className="flex flex-col gap-3 mb-2">
            <label className="text-xs font-semibold uppercase text-text-secondary tracking-widest">Platforms</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.instagram} onChange={(e) => setPlatforms({ ...platforms, instagram: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                <span className="text-sm text-text-primary flex items-center gap-1.5"><FaInstagram className="w-4 h-4" /> Instagram</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.facebook} onChange={(e) => setPlatforms({ ...platforms, facebook: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                <span className="text-sm text-text-primary flex items-center gap-1.5"><FaFacebook className="w-4 h-4" /> Facebook</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.tiktok} onChange={(e) => setPlatforms({ ...platforms, tiktok: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                <span className="text-sm text-text-primary flex items-center gap-1.5"><FaTiktok className="w-4 h-4" /> TikTok</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.x} onChange={(e) => setPlatforms({ ...platforms, x: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                <span className="text-sm text-text-primary flex items-center gap-1.5"><FaXTwitter className="w-4 h-4" /> X (Twitter)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={platforms.youtube} onChange={(e) => setPlatforms({ ...platforms, youtube: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                <span className="text-sm text-text-primary flex items-center gap-1.5"><FaYoutube className="w-4 h-4" /> YouTube</span>
              </label>
            </div>
          </div>

          <div className="input-underline">
            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
              <AtSign className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
              <input
                type="text"
                placeholder="Profile Alias"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0"
                required
              />
            </div>
          </div>

          {(platforms.instagram || platforms.facebook) && (
            <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-secondary uppercase">Meta Credentials</span>
              {platforms.instagram && (
                <div className="input-underline">
                  <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                    <FaInstagram className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                    <input type="text" placeholder="Instagram Business ID" value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                  </div>
                </div>
              )}
              {platforms.facebook && (
                <div className="input-underline">
                  <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                    <FaFacebook className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                    <input type="text" placeholder="Facebook Page ID" value={facebookPageId} onChange={(e) => setFacebookPageId(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                  </div>
                </div>
              )}
              <div className="input-underline">
                <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                  <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                  <input type="password" placeholder="Meta Graph Access Token" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                </div>
              </div>
            </div>
          )}

          {platforms.tiktok && (
            <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-secondary uppercase">TikTok Credentials</span>
              <div className="input-underline">
                <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                  <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                  <input type="password" placeholder="TikTok Access Token" value={tiktokAccessToken} onChange={(e) => setTiktokAccessToken(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                </div>
              </div>
            </div>
          )}

          {platforms.x && (
            <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-secondary uppercase">X (Twitter) Credentials</span>
              <div className="input-underline">
                <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                  <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                  <input type="password" placeholder="Twitter Access Token" value={twitterAccessToken} onChange={(e) => setTwitterAccessToken(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                </div>
              </div>
              <div className="input-underline">
                <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                  <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                  <input type="password" placeholder="Twitter Access Secret" value={twitterAccessSecret} onChange={(e) => setTwitterAccessSecret(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                </div>
              </div>
            </div>
          )}

          {platforms.youtube && (
            <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
              <span className="text-xs font-semibold text-text-secondary uppercase">YouTube Credentials</span>
              <div className="input-underline">
                <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                  <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                  <input type="password" placeholder="YouTube Refresh Token" value={youtubeRefreshToken} onChange={(e) => setYoutubeRefreshToken(e.target.value)} className="w-full bg-transparent border-none text-body-md text-text-primary focus:outline-none focus:ring-0 placeholder:text-text-muted/30 p-0" required />
                </div>
              </div>
            </div>
          )}
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
      <div className="flex flex-col gap-4">
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
                    
                    <div className="flex flex-col gap-3 mb-2">
                      <label className="text-xs font-semibold uppercase text-text-secondary tracking-widest">Platforms Enabled</label>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editPlatforms.instagram} onChange={(e) => setEditPlatforms({ ...editPlatforms, instagram: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                          <span className="text-sm text-text-primary flex items-center gap-1.5"><FaInstagram className="w-4 h-4" /> Instagram</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editPlatforms.facebook} onChange={(e) => setEditPlatforms({ ...editPlatforms, facebook: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                          <span className="text-sm text-text-primary flex items-center gap-1.5"><FaFacebook className="w-4 h-4" /> Facebook</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editPlatforms.tiktok} onChange={(e) => setEditPlatforms({ ...editPlatforms, tiktok: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                          <span className="text-sm text-text-primary flex items-center gap-1.5"><FaTiktok className="w-4 h-4" /> TikTok</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editPlatforms.x} onChange={(e) => setEditPlatforms({ ...editPlatforms, x: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                          <span className="text-sm text-text-primary flex items-center gap-1.5"><FaXTwitter className="w-4 h-4" /> X</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editPlatforms.youtube} onChange={(e) => setEditPlatforms({ ...editPlatforms, youtube: e.target.checked })} className="rounded bg-surface border-outline/30 text-accent focus:ring-0 cursor-pointer" />
                          <span className="text-sm text-text-primary flex items-center gap-1.5"><FaYoutube className="w-4 h-4" /> YouTube</span>
                        </label>
                      </div>
                    </div>

                    <div className="input-underline">
                      <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                        <AtSign className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Username"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0"
                          required
                        />
                      </div>
                    </div>

                    {(editPlatforms.instagram || editPlatforms.facebook) && (
                      <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
                        <span className="text-xs font-semibold text-text-secondary uppercase">Meta Credentials</span>
                        {editPlatforms.instagram && (
                          <div className="input-underline">
                            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                              <FaInstagram className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                              <input type="text" placeholder="Instagram Business ID" value={editBusinessId} onChange={(e) => setEditBusinessId(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" required />
                            </div>
                          </div>
                        )}
                        {editPlatforms.facebook && (
                          <div className="input-underline">
                            <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                              <FaFacebook className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                              <input type="text" placeholder="Facebook Page ID" value={editFacebookPageId} onChange={(e) => setEditFacebookPageId(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" required />
                            </div>
                          </div>
                        )}
                        <div className="input-underline">
                          <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                            <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                            <input type="password" placeholder="New Meta Graph Access Token (leave blank to keep)" value={editAccessToken} onChange={(e) => setEditAccessToken(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" />
                          </div>
                        </div>
                      </div>
                    )}

                    {editPlatforms.tiktok && (
                      <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
                        <span className="text-xs font-semibold text-text-secondary uppercase">TikTok Credentials</span>
                        <div className="input-underline">
                          <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                            <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                            <input type="password" placeholder="New TikTok Access Token (leave blank to keep)" value={editTiktokAccessToken} onChange={(e) => setEditTiktokAccessToken(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" />
                          </div>
                        </div>
                      </div>
                    )}

                    {editPlatforms.x && (
                      <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
                        <span className="text-xs font-semibold text-text-secondary uppercase">X (Twitter) Credentials</span>
                        <div className="input-underline">
                          <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                            <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                            <input type="password" placeholder="New Twitter Access Token (leave blank to keep)" value={editTwitterAccessToken} onChange={(e) => setEditTwitterAccessToken(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" />
                          </div>
                        </div>
                        <div className="input-underline">
                          <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                            <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                            <input type="password" placeholder="New Twitter Access Secret (leave blank to keep)" value={editTwitterAccessSecret} onChange={(e) => setEditTwitterAccessSecret(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" />
                          </div>
                        </div>
                      </div>
                    )}

                    {editPlatforms.youtube && (
                      <div className="p-4 bg-surface/30 rounded border border-outline/10 flex flex-col gap-3">
                        <span className="text-xs font-semibold text-text-secondary uppercase">YouTube Credentials</span>
                        <div className="input-underline">
                          <div className="flex items-center border-b border-outline/30 pb-2 focus-within:border-transparent transition-colors">
                            <KeyRound className="w-4 h-4 text-text-muted mr-3 flex-shrink-0" />
                            <input type="password" placeholder="New YouTube Refresh Token (leave blank to keep)" value={editYoutubeRefreshToken} onChange={(e) => setEditYoutubeRefreshToken(e.target.value)} className="w-full bg-transparent border-none text-base text-text-primary focus:outline-none focus:ring-0 p-0" />
                          </div>
                        </div>
                      </div>
                    )}
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
                        <div className="flex items-center gap-2">
                          <h3 className={isActive ? 'text-2xl font-normal text-text-primary' : 'text-lg text-text-primary'}>
                            @{account.username}
                          </h3>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${account.queue_status === 'paused' ? 'bg-text-muted/10 text-text-muted border-text-muted/20' : 'bg-success/10 text-success border-success/20'}`}>
                            {account.queue_status || 'ACTIVE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-text-secondary">
                            ID: {account.instagram_business_id || 'N/A'}
                          </p>
                          {account.platforms_enabled && (
                            <>
                              <span className="text-text-secondary/50">·</span>
                              <div className="flex items-center gap-1.5 text-text-secondary/80">
                                {account.platforms_enabled.instagram && <FaInstagram className="w-3.5 h-3.5" />}
                                {account.platforms_enabled.facebook && <FaFacebook className="w-3.5 h-3.5" />}
                                {account.platforms_enabled.tiktok && <FaTiktok className="w-3.5 h-3.5" />}
                                {account.platforms_enabled.x && <FaXTwitter className="w-3.5 h-3.5" />}
                                {account.platforms_enabled.youtube && <FaYoutube className="w-3.5 h-3.5" />}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Hover Actions */}
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                        {isActive ? (
                          <>
                            <button
                              onClick={(e) => handleToggleQueue(e, account)}
                              disabled={togglingQueueId === account.id}
                              className={`p-1.5 transition-colors rounded cursor-pointer ${account.queue_status === 'paused' ? 'text-success hover:bg-success/10' : 'text-text-secondary hover:text-text-primary hover:bg-surface-high'}`}
                              title={account.queue_status === 'paused' ? 'Resume Queue' : 'Pause Queue'}
                            >
                              {togglingQueueId === account.id ? (
                                <Loader2 className="w-[18px] h-[18px] animate-spin" />
                              ) : account.queue_status === 'paused' ? (
                                <Play className="w-[18px] h-[18px]" fill="currentColor" />
                              ) : (
                                <Pause className="w-[18px] h-[18px]" fill="currentColor" />
                              )}
                            </button>
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
