import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' },
});

// A mechanism to inject the token from context
let currentToken: string | null = localStorage.getItem('auth_token');
export const setApiToken = (token: string | null) => {
  currentToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
};

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

// Response interceptor — redirect to login on expired/invalid session
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      currentToken = null;
      localStorage.removeItem('auth_token');
      // Force navigation to login screen
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Types (aligned to actual DB schema) ───

export interface Account {
  id: number;
  username: string;
  instagram_business_id: string;
  created_at: string;
  queue_status: string;
}

export interface PostingSlot {
  id: number;
  account_id: number;
  slot_time: string; // "HH:MM:SS" from Postgres TIME column
}

export interface QueueItem {
  id: number;
  account_id: number;
  video_url: string;
  caption: string | null;
  scheduled_for: string;
  status: string;
  slack_file_id: string | null;
  created_at: string;
}

// ─── Auth Endpoints ───
export async function loginApi(password: string): Promise<boolean> {
  try {
    await api.post('/auth/login', { password });
    return true;
  } catch {
    return false;
  }
}

export async function verifyAuth(): Promise<boolean> {
  try {
    await api.get('/dashboard/accounts');
    return true;
  } catch (error) {
    return false;
  }
}

// ─── Account Endpoints ───

export async function getAccounts(): Promise<Account[]> {
  const { data } = await api.get<Account[]>('/dashboard/accounts');
  return data;
}

export async function createAccount(payload: {
  username: string;
  instagram_business_id: string;
  access_token: string;
}): Promise<Account> {
  const { data } = await api.post<Account>('/dashboard/accounts', payload);
  return data;
}

export async function updateAccount(
  id: number,
  payload: {
    username?: string;
    instagram_business_id?: string;
    access_token?: string;
  }
): Promise<Account> {
  const { data } = await api.patch<Account>(`/dashboard/accounts/${id}`, payload);
  return data;
}

export async function deleteAccount(id: number): Promise<void> {
  await api.delete(`/dashboard/accounts/${id}`);
}

export async function toggleQueueStatus(id: number, status: 'active' | 'paused'): Promise<Account> {
  const { data } = await api.post<Account>(`/dashboard/accounts/${id}/toggle-queue`, { status });
  return data;
}

// ─── Slot Endpoints ───

export async function getSlots(accountId: number): Promise<PostingSlot[]> {
  const { data } = await api.get<PostingSlot[]>(`/dashboard/accounts/${accountId}/slots`);
  return data;
}

export async function createSlot(
  accountId: number,
  payload: { slot_time: string },
): Promise<{ slot: PostingSlot; reshuffled: number; frozen: number }> {
  const { data } = await api.post<{ slot: PostingSlot; reshuffled: number; frozen: number }>(
    `/dashboard/accounts/${accountId}/slots`,
    payload,
  );
  return data;
}

export async function updateSlot(
  slotId: number,
  payload: { slot_time: string },
): Promise<{ slot: PostingSlot; reshuffled: number; frozen: number }> {
  const { data } = await api.patch<{ slot: PostingSlot; reshuffled: number; frozen: number }>(
    `/dashboard/slots/${slotId}`,
    payload,
  );
  return data;
}

export async function deleteSlot(
  slotId: number,
): Promise<{ reshuffled: number; frozen: number }> {
  const { data } = await api.delete<{ reshuffled: number; frozen: number }>(
    `/dashboard/slots/${slotId}`,
  );
  return data;
}

// ─── Queue Endpoints ───

export async function getQueue(accountId: number): Promise<QueueItem[]> {
  const { data } = await api.get<QueueItem[]>(`/dashboard/accounts/${accountId}/queue`);
  return data;
}

export async function updateQueueCaption(id: number, caption: string): Promise<QueueItem> {
  const { data } = await api.patch<QueueItem>(`/queue/${id}/caption`, { caption });
  return data;
}

export async function deleteQueueItem(id: number): Promise<void> {
  await api.delete(`/queue/${id}`);
}

// ─── Analytics Endpoints ───

export interface AccountAnalytics {
  username: string;
  queue_status: string;
  total_slots: number;
  slot_times: string[];
  pending: number;
  published: number;
  failed: number;
  runway: string | null;
}

export interface AnalyticsOverview {
  global: {
    total_pending: number;
    total_published: number;
    total_failed: number;
  };
  accounts: AccountAnalytics[];
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { data } = await api.get<AnalyticsOverview>('/analytics/overview');
  return data;
}

export default api;
