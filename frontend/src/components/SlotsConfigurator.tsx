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

  const formatSlotTime = (slotTime: string): string => {
    return slotTime.substring(0, 5);
  };

  const sortedSlots = [...slots].sort((a, b) =>
    a.slot_time.localeCompare(b.slot_time),
  );

  return (
    <div>
      <span className="text-[10px] text-text-muted/70 uppercase tracking-widest block mb-3">
        Daily Slots
      </span>

      {/* Error */}
      {errorMsg && (
        <div className="mb-3 p-2 bg-danger/10 border border-danger/20 rounded-sm text-label-sm text-danger">
          {errorMsg}
        </div>
      )}

      {/* Slots as pills */}
      <div className="flex flex-wrap items-center gap-2">
        {sortedSlots.map((slot) => (
          editingSlotId === slot.id ? (
            <div
              key={slot.id}
              className="flex items-center gap-1.5 px-3 py-1 bg-surface-card rounded-full border border-accent/50"
            >
              <input
                type="time"
                value={editSlotTime}
                onChange={(e) => setEditSlotTime(e.target.value)}
                className="w-20 bg-transparent border-none text-xs font-medium text-text-primary font-mono focus:outline-none focus:ring-0 p-0"
              />
              <button
                onClick={() => handleSaveEdit(slot.id)}
                disabled={isSavingEdit}
                className="text-success hover:opacity-80 cursor-pointer"
              >
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setEditingSlotId(null)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div
              key={slot.id}
              className="group flex items-center gap-1.5 px-3 py-1 bg-surface-card text-text-primary text-xs font-mono rounded-full border border-outline/20 hover:border-outline/40 transition-colors"
            >
              <Clock className="w-3 h-3 text-text-muted" />
              {formatSlotTime(slot.slot_time)}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <button
                  onClick={() => handleStartEdit(slot)}
                  className="cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3 text-text-muted hover:text-accent" />
                </button>
                <button
                  onClick={() => handleDeleteSlot(slot.id)}
                  disabled={deletingId === slot.id}
                  className="cursor-pointer"
                  title="Delete"
                >
                  {deletingId === slot.id ? (
                    <Loader2 className="w-3 h-3 text-text-muted animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 text-danger hover:text-danger/80" />
                  )}
                </button>
              </div>
            </div>
          )
        ))}

        {/* Inline Add Slot */}
        <div className="relative flex items-center group/input">
          <Plus className="w-3.5 h-3.5 text-text-muted absolute left-0 opacity-50 group-focus-within/input:opacity-100 transition-opacity" />
          <input
            type="time"
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            className="bg-transparent border-0 border-b border-outline/30 text-xs font-mono text-text-secondary pl-5 py-1 w-20 focus:outline-none focus:ring-0 focus:border-accent focus:text-text-primary transition-colors"
          />
          <button
            onClick={handleAddSlot}
            disabled={isAdding}
            className="ml-1 text-text-muted hover:text-accent cursor-pointer disabled:opacity-50"
          >
            {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
