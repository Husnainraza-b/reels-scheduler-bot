import { useState, useEffect } from 'react';
import { toZonedTime } from 'date-fns-tz';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CalendarClock,
  Video,
  RefreshCw,
  Loader2,
  Pencil,
  Trash2,
  Film,
  FileText,
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
  { label: string; dotClass: string; badgeClass: string; isActive: boolean }
> = {
  pending: {
    label: 'Scheduled',
    dotClass: 'bg-surface-high border-[3px] border-surface',
    badgeClass: 'bg-surface-card text-text-secondary border border-outline/20',
    isActive: false,
  },
  processing: {
    label: 'Publishing Now',
    dotClass: 'bg-accent border-[3px] border-surface timeline-dot-active animate-pulse',
    badgeClass: 'bg-accent/10 text-accent border border-accent/20',
    isActive: true,
  },
  rescheduling: {
    label: 'Rescheduling',
    dotClass: 'bg-warning border-[3px] border-surface animate-pulse',
    badgeClass: 'bg-warning/10 text-warning border border-warning/20',
    isActive: true,
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-text-muted border-[3px] border-surface',
    badgeClass: 'bg-text-muted/10 text-text-muted border border-text-muted/20',
    isActive: false,
  },
};

function formatPKT(utcTimestamp: string | null): string {
  if (!utcTimestamp || utcTimestamp.includes('2099')) return 'Unscheduled';
  const zonedDate = toZonedTime(new Date(utcTimestamp), TIMEZONE);
  return format(zonedDate, 'h:mm a');
}

function formatPKTFull(utcTimestamp: string | null): string {
  if (!utcTimestamp || utcTimestamp.includes('2099')) return 'No Date Assigned';
  const zonedDate = toZonedTime(new Date(utcTimestamp), TIMEZONE);
  return format(zonedDate, 'EEE, MMM d');
}

function getTimeUntil(utcTimestamp: string | null): string {
  if (!utcTimestamp || utcTimestamp.includes('2099')) return 'Waiting for slot';
  const target = new Date(utcTimestamp);
  const now = new Date();
  if (target <= now) return 'Due now';
  return `Due ${formatDistanceToNow(target, { addSuffix: true })}`;
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
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isConfirmLocked, setIsConfirmLocked] = useState<boolean>(false);
  const [localQueueItems, setLocalQueueItems] = useState<QueueItem[]>(queueItems);

  useEffect(() => {
    if (pendingDeleteId !== null) {
      setIsConfirmLocked(true);
      const timer = setTimeout(() => {
        setIsConfirmLocked(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [pendingDeleteId]);

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

  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();

    setDeletingId(id);
    setPendingDeleteId(null);
    try {
      await deleteQueueItem(id);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete item:', err);
      alert('Failed to delete video. Please try again.');
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  };

  return (
    <div className="flex flex-col">
      {/* ─── Queue Header ─── */}
      <div className="flex items-end justify-between border-b border-outline/20 pb-4 mb-8">
        <div>
          <h1 className="text-3xl font-light text-text-primary tracking-tight">Live Queue</h1>
          <p className="text-base text-text-secondary mt-1 flex items-center gap-2">
            <span>{localQueueItems.length} items pending</span>
            <span className="w-1 h-1 rounded-full bg-outline/50" />
            <span className="font-mono text-sm opacity-70">PKT (UTC+5)</span>
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer group"
        >
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <RefreshCw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-700 ease-in-out" />
          )}
        </button>
      </div>

      {/* ─── Timeline Feed ─── */}
      {localQueueItems.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-30" />
          <p className="text-base text-text-muted">
            No items in the queue. Upload a video via Slack to get started.
          </p>
        </div>
      ) : (
        <div className="relative ml-4 pl-8 border-l border-outline/20 space-y-12 pb-12">
          {localQueueItems.map((item) => {
            const account = accounts.find((a) => a.id === item.account_id);
            const isPaused = account?.queue_status === 'paused';
            const effectiveStatus = (item.status === 'pending' && isPaused) ? 'paused' : item.status;
            
            const statusCfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG['pending'];
            const isDeleting = deletingId === item.id;

            return (
              <div
                key={item.id}
                className={`group relative transition-all duration-200 ${
                  isDeleting ? 'opacity-50 pointer-events-none scale-[0.98]' : ''
                }`}
              >
                {/* Timeline Dot */}
                <div className={`absolute -left-[37px] top-2 w-3 h-3 rounded-full ${statusCfg.dotClass}`} />

                {/* Header: Time + Status + Actions */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-3">
                    <span className={`${statusCfg.isActive ? 'text-2xl font-normal text-text-primary' : 'text-xl text-text-secondary/80'}`}>
                      {formatPKT(item.scheduled_for)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusCfg.badgeClass}`}>
                      {statusCfg.isActive || effectiveStatus === 'paused' ? statusCfg.label : getTimeUntil(item.scheduled_for)}
                    </span>
                  </div>

                  {/* Hover Actions */}
                  {item.status === 'pending' && editingId !== item.id && (
                    <div className={`flex items-center gap-2 transition-opacity duration-300 ${pendingDeleteId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {pendingDeleteId === item.id ? (
                        <div className="flex items-center gap-3 bg-surface-card px-3 py-1 rounded border border-danger/30">
                          <span className="text-xs text-text-secondary">Delete?</span>
                          <button
                            onClick={(e) => {
                              if (!isConfirmLocked) handleConfirmDelete(e, item.id);
                            }}
                            disabled={isConfirmLocked}
                            className={`text-xs font-medium transition-colors ${
                              isConfirmLocked 
                                ? 'text-danger/30 cursor-not-allowed' 
                                : 'text-danger hover:text-danger/80 cursor-pointer'
                            }`}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={(e) => handleCancelDelete(e)}
                            className="text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditClick(item)}
                            disabled={isDeleting}
                            className="text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-30"
                            title="Edit Caption"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, item.id)}
                            disabled={isDeleting}
                            className="text-text-secondary hover:text-danger cursor-pointer disabled:opacity-30"
                            title="Delete"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-5 h-5 animate-spin text-danger" />
                            ) : (
                              <Trash2 className="w-5 h-5" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Content Card */}
                <div className={`bg-surface-lowest border border-outline/20 rounded-sm p-5 transition-all hover:border-outline/40 ${statusCfg.isActive ? 'hover:bg-surface-low/50' : ''}`}>
                  {/* File Info */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded bg-surface-high flex items-center justify-center flex-shrink-0">
                      <Film className="w-5 h-5 text-text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary font-mono truncate">
                        {item.video_url.split('/').pop()}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {getAccountUsername(item.account_id, accounts)} · {formatPKTFull(item.scheduled_for)}
                      </p>
                    </div>
                    <a
                      href={item.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
                    >
                      <Video className="w-5 h-5" />
                    </a>
                  </div>

                  {/* Caption: Edit Mode */}
                  {editingId === item.id ? (
                    <div className="bg-surface/50 p-4 border-l-2 border-accent/30 rounded-r-sm space-y-3">
                      <textarea
                        value={editCaptionText}
                        onChange={(e) => setEditCaptionText(e.target.value)}
                        className="w-full p-0 text-base text-text-primary bg-transparent focus:outline-none focus:ring-0 resize-none border-none italic"
                        rows={3}
                        placeholder="Write a caption..."
                        disabled={isSavingCaption}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          disabled={isSavingCaption}
                          className="text-sm font-medium text-text-secondary hover:text-text-primary px-3 py-1 cursor-pointer disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveCaption(item.id)}
                          disabled={isSavingCaption}
                          className="text-sm font-medium bg-accent text-surface px-4 py-1.5 rounded-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSavingCaption && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Caption: Display */}
                      {item.caption ? (
                        <blockquote className="bg-surface/50 p-4 border-l-2 border-outline/30 text-base text-text-secondary italic rounded-r-sm leading-relaxed">
                          "{item.caption}"
                        </blockquote>
                      ) : (
                        item.status === 'pending' && (
                          <div
                            onClick={() => handleEditClick(item)}
                            className="bg-surface/30 p-4 border-l-2 border-dashed border-outline/20 text-base text-text-muted/50 italic rounded-r-sm cursor-pointer hover:bg-surface-card transition-colors flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            + Add Caption
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* End of Queue Indicator */}
          <div className="relative pt-4">
            <div className="absolute -left-[33px] top-6 w-1 h-1 rounded-full bg-outline/30" />
            <div className="absolute -left-[33px] top-10 w-1 h-1 rounded-full bg-outline/20" />
            <div className="absolute -left-[33px] top-14 w-1 h-1 rounded-full bg-outline/10" />
            <p className="text-xs font-semibold uppercase text-text-muted/40 tracking-widest pl-2">
              End of scheduled queue
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
