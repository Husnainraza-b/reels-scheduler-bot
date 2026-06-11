import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' },
});

// A mechanism to inject the token from context
let currentToken: string | null = null;
export const setApiToken = (token: string | null) => {
  currentToken = token;
};

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

// ─── Types (aligned to actual DB schema) ───

export interface Account {
  id: number;
  username: string;
  instagram_business_id: string;
  created_at: string;
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
  retry_count: number;
  error_message: string | null;
  slack_file_id: string | null;
  published_at: string | null;
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

export async function deleteAccount(id: number): Promise<void> {
  await api.delete(`/dashboard/accounts/${id}`);
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

export default api;
