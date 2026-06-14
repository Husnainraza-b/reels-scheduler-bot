-- ==============================================================================
-- Migration: Add queue_status to accounts table
-- ==============================================================================
-- This adds the queue_status column to support Pause/Resume functionality.
-- The default state is 'active'.
-- Valid values are 'active' and 'paused'.
--
-- Run this in your Supabase SQL Editor.
-- ==============================================================================

ALTER TABLE public.accounts
ADD COLUMN queue_status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Add a constraint to ensure only valid statuses are used
ALTER TABLE public.accounts
ADD CONSTRAINT chk_queue_status CHECK (queue_status IN ('active', 'paused'));
