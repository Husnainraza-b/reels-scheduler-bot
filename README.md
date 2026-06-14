# 🚀 Instagram Reels Scheduler Bot & Dashboard
**Current Project State Generated on:** June 12, 2026, 22:43 PKT

This document serves as the absolute single source of truth for the entire Reels Automation project. It breaks down the frontend, backend, every logical workflow, the database schema, and every security measure implemented. If you read this file, you will understand the project from A-Z.

---

## 🏗️ Technology Stack

**Frontend:**
- **React 19 & Vite:** Lightning-fast modern frontend stack.
- **Tailwind CSS v4:** Utility-first styling framework for the admin dashboard.
- **TypeScript:** Fully typed codebase for error prevention.
- **Axios & Date-fns:** For backend communication and timezone manipulation.

**Backend:**
- **NestJS:** Scalable and structured Node.js backend framework.
- **Supabase (PostgreSQL):** Database layer handling relations, queue states, and custom SQL RPCs.
- **Cloudflare R2:** S3-compatible, zero-egress fee object storage for hosting the raw MP4 video files.
- **Slack API:** For listening to file upload events and seamlessly capturing reels directly from Slack channels.

---

## 🧠 Core Logics & Workflows Explained in Simple Words

### 1. The Slack Ingestion Flow (Video Upload)
**Goal:** Allow users to drop a video in a Slack channel and have it automatically scheduled for Instagram.
- **Flow:** 
  1. A user uploads an MP4 video to a designated Slack channel. They can optionally add a text message which becomes the Instagram Reel's caption.
  2. Slack fires an Event Webhook to our NestJS backend.
  3. The backend's `SlackSignatureGuard` securely intercepts the request and verifies the cryptographic signature to ensure it legitimately came from Slack.
  4. The backend downloads the video directly from Slack's servers into memory.
  5. The backend immediately uploads the video to **Cloudflare R2 Storage** to get a permanent public URL.
  6. It calls the **Atomic Gap Finder** to calculate the exact timestamp this video should be posted based on the account's posting slots.
  7. Finally, it inserts a new row into the `queue` database table.

### 2. The Atomic Gap Finder Logic (SQL RPC)
**Goal:** Automatically assign the next available, chronologically perfect time slot to a newly uploaded video.
- **Flow:** 
  1. When a video is received, the backend calls a custom PostgreSQL function (`calculate_next_slot`).
  2. **Race Condition Prevention:** It immediately acquires a strict database-level lock. This means if 10 videos are uploaded in the exact same millisecond, the database forces them to form a single-file line, ensuring no two videos are assigned the exact same time slot.
  3. It scans the account's predefined `posting_slots` (e.g., 9:00 AM, 3:00 PM) day by day, starting from today up to 60 days in the future.
  4. It skips any slots in the past.
  5. For each valid future slot, it checks if there is already a `pending` video in the `queue` table scheduled for that exact timestamp.
  6. The very first unoccupied timestamp it finds is returned and assigned to the new video.

### 3. The "Lift and Restack" Reshuffle Logic
**Goal:** Prevent "Ghost Collisions" and perfectly adapt the queue if the user changes their schedule or deletes a queued video.
- **Flow:** 
  1. If a user deletes a video from the queue, OR if they Add/Edit/Delete a posting slot from the dashboard, the schedule is now inaccurate. The system instantly triggers a master reshuffle.
  2. **Fetch:** It grabs all videos for that account with a `pending` status, strictly ordered by their original upload time (`created_at`).
  3. **Lift:** It updates the status of all these videos from `pending` to `calculating`. *Why?* Because the Gap Finder explicitly ignores videos in the `calculating` state. By doing this, the database is tricked into viewing the entire future schedule as completely empty.
  4. **Restack:** It loops through every single lifted video one by one, calls the Gap Finder to assign it a fresh slot based on the new configurations, and updates its status back to `pending`. Everything perfectly snaps into place.

### 4. The Cron Publisher Flow (Posting to Instagram)
**Goal:** Check the queue every minute and post videos whose scheduled time has arrived.
- **Flow:** 
  1. A backend Cron job ticks every single minute.
  2. It queries the `queue` table for any videos where `status = 'pending'` AND `scheduled_for <= NOW()`.
  3. It locks these rows by updating their status to `processing`. This ensures that if the server crashes and restarts, it won't accidentally double-post the same video.
  4. It decrypts the Instagram `access_token` securely.
  5. It communicates with the **Instagram Graph API** to upload the video from Cloudflare R2 and publish the reel with the associated caption.
  6. If successful, the video's status is changed to `published`. If Instagram throws an error, the status is changed to `failed`.
  7. Upon successful publish, the large MP4 video file is instantly deleted from Cloudflare R2 to conserve storage space.
  8. A secondary automated cleanup routine runs during this cron to permanently delete any `queue` records from Supabase that were published more than 30 days ago, keeping the database lean and well within free tier limits.

### 5. Resilient Error Handling & Retry Logic
**Goal:** Ensure temporary Meta API glitches don't ruin the posting schedule, and permanently failed videos don't block the queue.
- **Flow:**
  1. If publishing fails, the system implements exponential backoff, retrying the post up to 3 times (with 5-minute, 10-minute, etc. delays).
  2. A real-time failure alert is sent to a configured Slack channel.
  3. If all retries are exhausted, the system automatically triggers a queue reshuffle for that account. The failed video is bumped to the *next available posting slot*, ensuring the content is still posted eventually.
  4. A final "rescheduled" alert is sent to Slack with the new timeslot.

### 6. Analytics & Runway Tracking
**Goal:** Give admins a bird's-eye view of account health and content buffers.
- **Flow:**
  1. The Analytics module calculates global stats (total pending, published, failed).
  2. For each account, it calculates the "runway" — the furthest date into the future that content is currently scheduled for. This tells the social media manager exactly when they need to create more content.

### 7. Account Pausing (Emergency Stop)
**Goal:** Instantly halt publishing for a specific account without deleting its queue or schedule.
- **Flow:** 
  1. Admins can toggle an account's `queue_status` to `paused`.
  2. The Cron Publisher instantly respects this flag and skips processing any pending videos for that account until it is resumed.

---

## 💾 Data Schema & Models

### 1. `accounts` Table
Stores the Instagram accounts connected to the system.
- `id` (BIGINT, Primary Key)
- `username` (TEXT) - e.g., @my_instagram_page.
- `instagram_business_id` (TEXT) - The unique ID provided by Facebook/Instagram.
- `access_token` (TEXT) - The highly sensitive Graph API token. **Stored Encrypted**.
- `queue_status` (TEXT) - Can be `active` or `paused`.
- `created_at` (TIMESTAMPTZ)

### 2. `posting_slots` Table
Defines the daily recurring schedule for when an account should post.
- `id` (BIGINT, Primary Key)
- `account_id` (BIGINT, Foreign Key -> accounts.id)
- `slot_time` (TIME) - e.g., `09:00:00` or `15:30:00`.

### 3. `queue` Table
The central nervous system tracking every video.
- `id` (BIGINT, Primary Key)
- `account_id` (BIGINT, Foreign Key -> accounts.id)
- `video_url` (TEXT) - The public Cloudflare R2 URL.
- `caption` (TEXT) - The text to be posted alongside the reel.
- `scheduled_for` (TIMESTAMPTZ) - The exact moment this video should go live.
- `status` (TEXT) - Can be: `pending`, `calculating`, `processing`, `published`, or `failed`.
- `slack_file_id` (TEXT) - To trace the video back to the original Slack message.
- `created_at` (TIMESTAMPTZ)

---

## 🛡️ Security, Rate Limiting & Protection Measures

We have treated security as a first-class citizen. Here is every security measure applied:

### 1. AES-256-CBC Bank-Grade Encryption (Data at Rest)
Instagram `access_tokens` grant total control over a social media page. They are **never** stored in plain text.
- Before saving to the database, tokens pass through an encryption layer.
- They are encrypted using an industry-standard encryption algorithm and a secret key.
- Every single encryption generates a totally random Initialization Vector (IV). This means even if two accounts use the exact same token, their encrypted strings in the database will look completely different, neutralizing pattern-analysis attacks.

### 2. Slack HMAC Signature Validation (Spoof Prevention)
Our webhook endpoint is publicly exposed on the internet so Slack can reach it.
- To prevent hackers from sending fake requests claiming to be Slack, we use a signature validation guard.
- Slack signs every request using a secure signing secret. The guard intercepts the raw HTTP body, computes its own cryptographic hash, and compares it to Slack's signature. If they don't match identically, the request is instantly rejected with a 401 Unauthorized.

### 3. HTTP Helmet Protection
The backend utilizes the `helmet` package to automatically set crucial HTTP response headers:
- Prevents Cross-Site Scripting (XSS).
- Prevents MIME-type sniffing.
- Enforces strict transport security and prevents clickjacking by disabling frame embedding.

### 4. Admin Auth Guard (Dashboard Security)
All dashboard APIs (creating accounts, editing slots, deleting queue items) are protected by an `AdminAuthGuard`. This ensures that random internet users cannot access or manipulate the core database via the frontend endpoints.

### 5. Transactional Locks (Race Condition Security)
As mentioned in the Gap Finder flow, we use database-level locking. If a malicious actor or a glitch fires 100 simultaneous requests to schedule videos, the database entirely ignores parallel execution for that specific account and processes them in a strict queue. This secures database integrity.

### 6. Rate Limiting Strategy
- **Application Level:** Currently, there is NO hard-coded rate limiting middleware (like NestJS Throttler) directly inside the codebase. 
- **Infrastructure Level:** The project is designed to rely on upstream infrastructure for rate limiting. Protection against DDoS or brute-force API spam is delegated to external gateways (like Cloudflare Proxy or Supabase's native API rate limits), keeping the Node.js event loop lightweight and focused purely on business logic.
