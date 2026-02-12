import axios from "axios";

import { API_BASE } from "@/config/env";
import { getAuthToken } from "@/features/auth/utils/token";

export const api = axios.create({
  baseURL: `${API_BASE}/v1`,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function extractMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const message = (data as any).message;
  if (Array.isArray(message)) {
    const parts = message.filter((entry) => typeof entry === "string");
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof message === "string" && message.trim()) return message;
  return null;
}

function getDefaultRequestFailedMessage() {
  if (typeof document !== "undefined" && document.documentElement.lang.startsWith("am")) {
    return "ጥያቄው አልተሳካም";
  }
  return "Request failed";
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const messageFromBody = extractMessage(error.response?.data);
    if (messageFromBody) return messageFromBody;
    if (error.response?.statusText) return error.response.statusText;
    if (typeof error.message === "string" && error.message.trim())
      return error.message;
    return getDefaultRequestFailedMessage();
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return getDefaultRequestFailedMessage();
}
