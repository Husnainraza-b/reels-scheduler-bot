import { useEffect, useState } from 'react';
import { getAnalyticsOverview, type AnalyticsOverview } from '../services/api';
import { Loader2, CheckCircle2, XCircle, Clock, CalendarDays } from 'lucide-react';

export default function AnalyticsDashboard() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const data = await getAnalyticsOverview();
        setOverview(data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setError('Failed to load analytics data.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-4 bg-danger/10 border border-danger/20 rounded-sm">
        <span className="text-danger">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Global Metrics */}
      <div>
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-widest mb-4">
          GLOBAL METRICS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-lowest border border-outline/10 p-5 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium text-text-secondary">Total Pending</h3>
            </div>
            <p className="text-3xl font-light text-text-primary">{overview.global.total_pending}</p>
          </div>
          <div className="bg-surface-lowest border border-outline/10 p-5 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <h3 className="text-sm font-medium text-text-secondary">Total Published</h3>
            </div>
            <p className="text-3xl font-light text-text-primary">{overview.global.total_published}</p>
          </div>
          <div className="bg-surface-lowest border border-outline/10 p-5 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-danger" />
              <h3 className="text-sm font-medium text-text-secondary">Total Failed</h3>
            </div>
            <p className="text-3xl font-light text-text-primary">{overview.global.total_failed}</p>
          </div>
        </div>
      </div>

      {/* Per-Account Metrics */}
      <div>
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-widest mb-4">
          PER-ACCOUNT METRICS
        </h2>
        <div className="flex flex-col gap-4">
          {overview.accounts.length === 0 ? (
            <p className="text-text-muted text-sm">No accounts found.</p>
          ) : (
            overview.accounts.map((acc) => {
              const isPaused = acc.queue_status === 'paused';
              const runwayDate = acc.runway
                ? new Date(acc.runway).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'None';

              return (
                <div key={acc.username} className="bg-surface-lowest border border-outline/10 p-5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-text-primary">@{acc.username}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isPaused
                            ? 'bg-text-muted/10 text-text-muted border border-text-muted/20'
                            : 'bg-success/10 text-success border border-success/20'
                        }`}
                      >
                        {acc.queue_status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1 text-sm text-text-secondary">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>{acc.total_slots} Daily Slots</span>
                      </div>
                      {acc.slot_times && acc.slot_times.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {acc.slot_times.map((st, i) => {
                            // Convert 24h '18:00:00' to 12h '6:00 PM'
                            const [h, m] = st.split(':');
                            let hour = parseInt(h, 10);
                            const period = hour >= 12 ? 'PM' : 'AM';
                            if (hour === 0) hour = 12;
                            else if (hour > 12) hour -= 12;
                            const displayTime = `${hour}:${m} ${period}`;
                            return (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-high text-text-secondary border border-outline/10">
                                {displayTime}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-xs text-text-muted uppercase tracking-wider">Pending</span>
                      <span className="text-lg text-text-primary">{acc.pending}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-text-muted uppercase tracking-wider">Published</span>
                      <span className="text-lg text-text-primary">{acc.published}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-text-muted uppercase tracking-wider">Failed</span>
                      <span className={`text-lg ${acc.failed > 0 ? 'text-danger' : 'text-text-primary'}`}>
                        {acc.failed}
                      </span>
                    </div>
                  </div>

                  <div className="md:w-[200px] md:text-right flex flex-col">
                    <span className="text-xs text-text-muted uppercase tracking-wider">Queue Runway</span>
                    <span className="text-sm font-medium text-text-primary mt-1">
                      {acc.runway ? `Runs out on ${runwayDate}` : 'No pending items'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
