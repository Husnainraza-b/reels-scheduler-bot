import { useState } from 'react';
import { Clock, Plus, Trash2, Loader2 } from 'lucide-react';
import type { PostingSlot } from '../services/api';
import { createSlot, deleteSlot } from '../services/api';

interface SlotsConfiguratorProps {
  accountId: number;
  slots: PostingSlot[];
  onSlotsChanged: () => void;
}

export default function SlotsConfigurator({
  accountId,
  slots,
  onSlotsChanged,
}: SlotsConfiguratorProps) {
  const [timeSlot, setTimeSlot] = useState('18:00');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [errorMsg, setErrorMsg] = useState('');

  const handleAddSlot = async () => {
    if (!timeSlot) return;
    setIsAdding(true);
    setErrorMsg('');
    try {
      // Basic client-side check to prevent immediate duplicate
      const normalizedTime = timeSlot.length === 5 ? `${timeSlot}:00` : timeSlot;
      if (slots.some(s => s.slot_time === normalizedTime || s.slot_time.startsWith(timeSlot))) {
        setErrorMsg('This slot already exists for this account');
        setIsAdding(false);
        return;
      }
      
      await createSlot(accountId, {
        slot_time: timeSlot,
      });
      onSlotsChanged();
    } catch (err: any) {
      console.error('Failed to add slot:', err);
      if (err.response?.status === 409) {
        setErrorMsg('This slot already exists for this account');
      } else {
        setErrorMsg(err.response?.data?.error || 'Failed to add slot');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    setDeletingId(slotId);
    setErrorMsg('');
    try {
      await deleteSlot(slotId);
      onSlotsChanged();
    } catch (err: any) {
      console.error('Failed to delete slot:', err);
      if (err.response?.status === 409) {
        setErrorMsg('Slot deletion conflict.');
      } else {
        setErrorMsg(err.response?.data?.error || 'Failed to delete slot');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Format slot_time from "HH:MM:SS" to "HH:MM" for display
  const formatSlotTime = (slotTime: string): string => {
    return slotTime.substring(0, 5);
  };

  // Sort slots by time
  const sortedSlots = [...slots].sort((a, b) =>
    a.slot_time.localeCompare(b.slot_time),
  );

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
          <Clock className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Posting Slots</h2>
          <p className="text-sm text-text-muted">
            {slots.length} slot{slots.length !== 1 ? 's' : ''} · applies every day
          </p>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-xl text-sm text-danger">
          {errorMsg}
        </div>
      )}

      {/* Add Slot Form */}
      <div className="flex gap-2 mb-6">
        <input
          type="time"
          value={timeSlot}
          onChange={(e) => setTimeSlot(e.target.value)}
          className="flex-1 px-3 py-2.5 bg-surface-hover border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-border-focus transition-colors"
        />
        <button
          onClick={handleAddSlot}
          disabled={isAdding}
          className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl transition-colors duration-200 flex items-center gap-1 cursor-pointer"
        >
          {isAdding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Slots List */}
      {sortedSlots.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">
          No posting slots configured. Add your first slot above.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sortedSlots.map((slot) => (
            <div
              key={slot.id}
              className="group flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border hover:border-danger/30 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span className="text-sm text-text-primary font-mono">
                {formatSlotTime(slot.slot_time)}
              </span>
              <button
                onClick={() => handleDeleteSlot(slot.id)}
                disabled={deletingId === slot.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {deletingId === slot.id ? (
                  <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 text-danger hover:text-danger-hover" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
