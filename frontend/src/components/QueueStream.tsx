import { useState, useEffect } from 'react';
import { toZonedTime } from 'date-fns-tz';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CalendarClock,
  Video,
  MessageSquareText,
  RefreshCw,
  Loader2,
  Clock,
  Zap,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import type { QueueItem, Account } from '../services/api';
import { updateQueueCaption, deleteQueueItem } from '../services/api';

interface QueueStreamProps {
  queueItems: QueueItem[];
  accounts: Account[];
  isLoading: boolean;
  onRefresh: () => void;
}

const TIMEZONE = 'Asia/Karachi';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending',
    color: 'text-accent',
    bgColor: 'bg-accent-muted',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  processing: {
    label: 'Publishing',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    icon: <Zap className="w-3.5 h-3.5" />,
  },
  rescheduling: {
    label: 'Rescheduling',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
};

function formatPKT(utcTimestamp: string): string {
  const zonedDate = toZonedTime(new Date(utcTimestamp), TIMEZONE);
  return format(zonedDate, 'EEE, MMM d · h:mm a');
}

function getTimeUntil(utcTimestamp: string): string {
  const target = new Date(utcTimestamp);
  const now = new Date();
  if (target <= now) return 'Due now';
  return formatDistanceToNow(target, { addSuffix: true });
}

function getAccountUsername(
  accountId: number,
  accounts: Account[],
): string {
  const account = accounts.find((a) => a.id === accountId);
  return account ? `@${account.username}` : `#${accountId}`;
}

export default function QueueStream({
  queueItems,
  accounts,
  isLoading,
  onRefresh,
}: QueueStreamProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaptionText, setEditCaptionText] = useState<string>('');
  const [isSavingCaption, setIsSavingCaption] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [localQueueItems, setLocalQueueItems] = useState<QueueItem[]>(queueItems);

  useEffect(() => {
    setLocalQueueItems(queueItems);
  }, [queueItems]);

  const handleEditClick = (item: QueueItem) => {
    setEditingId(item.id);
    setEditCaptionText(item.caption || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditCaptionText('');
  };

  const handleSaveCaption = async (id: number) => {
    setIsSavingCaption(true);
    try {
      const updatedItem = await updateQueueCaption(id, editCaptionText);
      setLocalQueueItems((prev) =>
        prev.map((x) => (x.id === id ? { ...x, caption: updatedItem.caption } : x))
      );
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update caption:', err);
      alert('Failed to update caption. Please try again.');
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this video? This cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteQueueItem(id);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete item:', err);
      alert('Failed to delete video. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Live Queue</h2>
            <p className="text-sm text-text-muted">
              {localQueueItems.length} item{localQueueItems.length !== 1 ? 's' : ''} scheduled
              <span className="ml-1 text-text-muted">· PKT timezone</span>
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2.5 bg-surface hover:bg-surface-hover border border-border rounded-xl transition-colors duration-200 cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 text-text-secondary" />
          )}
        </button>
      </div>

      {/* Queue Items */}
      {localQueueItems.length === 0 ? (
        <div className="text-center py-12">
          <CalendarClock className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-muted">
            No items in the queue. Upload a video via Slack to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {localQueueItems.map((item, index) => {
            const statusCfg =
              STATUS_CONFIG[item.status] || STATUS_CONFIG['pending'];
            const isDeleting = deletingId === item.id;

            return (
              <div
                key={item.id}
                className={`group relative flex items-start gap-4 p-4 bg-surface rounded-xl border border-border hover:border-border-focus/30 transition-all duration-200 ${
                  isDeleting ? 'opacity-50 pointer-events-none scale-[0.98] border-danger/30 bg-danger/5' : ''
                }`}
              >
                {/* Index Badge */}
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center">
                  <span className="text-xs font-bold text-text-muted">
                    {index + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusCfg.color} ${statusCfg.bgColor}`}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>

                    {/* Account */}
                    <span className="text-xs text-text-muted">
                      {getAccountUsername(item.account_id, accounts)}
                    </span>
                  </div>

                  {/* Schedule Time */}
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarClock className="w-3.5 h-3.5 text-accent" />
                    <span className="text-sm font-medium text-text-primary">
                      {formatPKT(item.scheduled_for)}
                    </span>
                    <span className="text-xs text-text-muted">
                      ({getTimeUntil(item.scheduled_for)})
                    </span>
                  </div>

                  {/* Caption Editing or Display */}
                  {editingId === item.id ? (
                    <div className="mt-2.5 space-y-2 bg-surface-card p-3 rounded-lg border border-border-focus/20">
                      <textarea
                        value={editCaptionText}
                        onChange={(e) => setEditCaptionText(e.target.value)}
                        className="w-full p-2 text-xs text-text-primary bg-surface border border-border rounded-lg focus:outline-none focus:border-border-focus resize-none"
                        rows={3}
                        placeholder="Write a caption..."
                        disabled={isSavingCaption}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          disabled={isSavingCaption}
                          className="px-2.5 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-md text-[10px] font-semibold text-text-secondary transition-colors duration-150 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveCaption(item.id)}
                          disabled={isSavingCaption}
                          className="px-2.5 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-[10px] font-semibold transition-colors duration-150 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        >
                          {isSavingCaption ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Caption Display */}
                      {item.caption ? (
                        <div className="flex items-start gap-2 mt-1.5">
                          <MessageSquareText className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-text-secondary line-clamp-2">
                            {item.caption}
                          </p>
                        </div>
                      ) : (
                        item.status === 'pending' && (
                          <div className="flex items-start gap-2 mt-1.5 opacity-40 hover:opacity-100 transition-opacity duration-150">
                            <MessageSquareText className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                            <button
                              onClick={() => handleEditClick(item)}
                              className="text-xs text-text-muted hover:text-text-secondary italic underline cursor-pointer bg-transparent border-none p-0"
                            >
                              Add caption...
                            </button>
                          </div>
                        )
                      )}
                    </>
                  )}

                  {/* Media URL */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Video className="w-3.5 h-3.5 text-text-muted" />
                    <a
                      href={item.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:text-accent-hover truncate max-w-xs transition-colors"
                    >
                      {item.video_url.split('/').pop()}
                    </a>
                  </div>
                </div>

                {/* Actions Panel */}
                {item.status === 'pending' && editingId !== item.id && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 self-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleEditClick(item)}
                      disabled={isDeleting}
                      className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-30"
                      title="Edit Caption"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={isDeleting}
                      className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors duration-150 cursor-pointer disabled:opacity-30"
                      title="Delete Video"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 text-danger animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
