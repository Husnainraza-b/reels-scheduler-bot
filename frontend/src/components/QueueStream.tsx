import { toZonedTime } from 'date-fns-tz';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CalendarClock,
  Video,
  MessageSquareText,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  Zap,
} from 'lucide-react';
import type { QueueItem, Account } from '../services/api';

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
              {queueItems.length} item{queueItems.length !== 1 ? 's' : ''} scheduled
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
      {queueItems.length === 0 ? (
        <div className="text-center py-12">
          <CalendarClock className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-muted">
            No items in the queue. Upload a video via Slack to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {queueItems.map((item, index) => {
            const statusCfg =
              STATUS_CONFIG[item.status] || STATUS_CONFIG['pending'];

            return (
              <div
                key={item.id}
                className="group relative flex items-start gap-4 p-4 bg-surface rounded-xl border border-border hover:border-border-focus/30 transition-all duration-200"
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

                  {/* Caption */}
                  {item.caption && (
                    <div className="flex items-start gap-2 mt-1.5">
                      <MessageSquareText className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {item.caption}
                      </p>
                    </div>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
