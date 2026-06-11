-- ==============================================================================
-- Atomic Gap Finder for Instagram Scheduler Bot
-- ==============================================================================
-- This function runs inside a database transaction to prevent race conditions.
-- It locks the queue table using SELECT FOR UPDATE and assigns the next
-- available posting slot chronologically.
--
-- Run this in your Supabase SQL Editor.
-- ==============================================================================

CREATE OR REPLACE FUNCTION calculate_next_slot(p_account_id BIGINT)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
AS $$
DECLARE
    candidate_slot TIMESTAMP WITH TIME ZONE;
    slot_rec RECORD;
    v_locked BIGINT;
    v_max_days INT := 60;
    v_day_offset INT;
    v_candidate_pkt TIMESTAMP;
    v_candidate_utc TIMESTAMP WITH TIME ZONE;
    v_is_occupied BOOLEAN;
BEGIN
    -- 1. Acquire an advisory lock to serialize Gap Finder operations per account
    -- This prevents two simultaneous uploads from assigning the same slot
    PERFORM pg_advisory_xact_lock(p_account_id::integer);

    -- 2. Verify account has slots configured
    IF NOT EXISTS (SELECT 1 FROM posting_slots WHERE account_id = p_account_id) THEN
        RAISE EXCEPTION 'No posting slots configured for account %', p_account_id;
    END IF;

    -- 3. Find the next available slot
    -- We walk forward day by day, applying the slot_time values
    FOR v_day_offset IN 0..v_max_days LOOP
        
        FOR slot_rec IN 
            SELECT slot_time FROM posting_slots 
            WHERE account_id = p_account_id 
            ORDER BY slot_time ASC
        LOOP
            -- Construct the candidate datetime in PKT (UTC+5)
            -- Note: In PostgreSQL, we can construct the timestamp for a specific day
            -- and then convert to UTC.
            -- now() AT TIME ZONE 'Asia/Karachi' gives the current local time in PKT.
            
            v_candidate_pkt := date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') + (v_day_offset || ' days')::INTERVAL + slot_rec.slot_time;
            
            -- Convert PKT to UTC
            v_candidate_utc := v_candidate_pkt AT TIME ZONE 'Asia/Karachi';

            -- Skip past slots
            IF v_candidate_utc <= now() THEN
                CONTINUE;
            END IF;

            -- Check if slot is occupied by a pending queue item
            SELECT EXISTS (
                SELECT 1 FROM queue 
                WHERE account_id = p_account_id 
                  AND status = 'pending' 
                  AND scheduled_for = v_candidate_utc
            ) INTO v_is_occupied;

            IF NOT v_is_occupied THEN
                RETURN v_candidate_utc;
            END IF;
            
        END LOOP;
        
    END LOOP;

    RAISE EXCEPTION 'Queue full or no available slots found within % days', v_max_days;
END;
$$;
