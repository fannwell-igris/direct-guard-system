import axios from "axios";

export const TOKEN_STORAGE_KEY = "cms_token";

export const api = axios.create({
  baseURL: "http://localhost:3000/api",
});

// Attach the token to every outgoing request, if we have one.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401 (expired/invalid token), clear it and force back to login.
// Doesn't try to distinguish "never logged in" from "token expired" —
// both cases need the same fix.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/** Every API response follows { status: "ok", data } or { status: "error", message }. */
export interface ApiResponse<T> {
  status: "ok" | "error";
  data?: T;
  message?: string;
}
