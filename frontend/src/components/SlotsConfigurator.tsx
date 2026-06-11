import { useState } from 'react';
import { Clock, Plus, Trash2, Loader2, Pencil, Check, X } from 'lucide-react';
import type { PostingSlot } from '../services/api';
import { createSlot, deleteSlot, updateSlot } from '../services/api';

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

  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [editSlotTime, setEditSlotTime] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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

  const handleStartEdit = (slot: PostingSlot) => {
    setEditingSlotId(slot.id);
    setEditSlotTime(formatSlotTime(slot.slot_time));
    setErrorMsg('');
  };

  const handleSaveEdit = async (slotId: number) => {
    if (!editSlotTime) return;
    setIsSavingEdit(true);
    setErrorMsg('');
    try {
      const normalizedTime = editSlotTime.length === 5 ? `${editSlotTime}:00` : editSlotTime;
      if (slots.some(s => s.id !== slotId && (s.slot_time === normalizedTime || s.slot_time.startsWith(editSlotTime)))) {
        setErrorMsg('This slot time already exists');
        setIsSavingEdit(false);
        return;
      }
      
      await updateSlot(slotId, { slot_time: editSlotTime });
      setEditingSlotId(null);
      onSlotsChanged();
    } catch (err: any) {
      console.error('Failed to update slot:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update slot');
    } finally {
      setIsSavingEdit(false);
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
    <div className="bg-surface-hover/50 rounded-xl border border-border/50 p-3 mt-1">
      {/* Error Message */}
      {errorMsg && (
        <div className="mb-3 p-2 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger">
          {errorMsg}
        </div>
      )}

      {/* Add Slot Form */}
      <div className="flex gap-2 mb-3">
        <input
          type="time"
          value={timeSlot}
          onChange={(e) => setTimeSlot(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-border-focus transition-colors"
        />
        <button
          onClick={handleAddSlot}
          disabled={isAdding}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg transition-colors duration-200 flex items-center gap-1 cursor-pointer"
        >
          {isAdding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Slots List */}
      {sortedSlots.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-2">
          No posting slots configured.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sortedSlots.map((slot) => (
            editingSlotId === slot.id ? (
              <div
                key={slot.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-surface-hover rounded-md border border-accent/50 transition-colors"
              >
                <input
                  type="time"
                  value={editSlotTime}
                  onChange={(e) => setEditSlotTime(e.target.value)}
                  className="w-20 bg-surface border border-border rounded text-xs text-text-primary focus:outline-none focus:border-border-focus px-1"
                />
                <button
                  onClick={() => handleSaveEdit(slot.id)}
                  disabled={isSavingEdit}
                  className="text-success hover:text-success-hover cursor-pointer"
                >
                  {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setEditingSlotId(null)}
                  className="text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                key={slot.id}
                className="group flex items-center gap-1.5 px-2 py-1 bg-surface rounded-md border border-border hover:border-accent/30 transition-colors"
              >
                <Clock className="w-3 h-3 text-accent" />
                <span className="text-xs text-text-primary font-mono">
                  {formatSlotTime(slot.slot_time)}
                </span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity ml-1">
                  <button
                    onClick={() => handleStartEdit(slot)}
                    className="cursor-pointer"
                    title="Edit Slot"
                  >
                    <Pencil className="w-3 h-3 text-text-muted hover:text-accent" />
                  </button>
                  <button
                    onClick={() => handleDeleteSlot(slot.id)}
                    disabled={deletingId === slot.id}
                    className="cursor-pointer"
                    title="Delete Slot"
                  >
                    {deletingId === slot.id ? (
                      <Loader2 className="w-3 h-3 text-text-muted animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 text-danger hover:text-danger-hover" />
                    )}
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
