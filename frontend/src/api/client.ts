import axios from "axios";
import { requestPasswordConfirmation } from "../lib/passwordConfirmController";

// VITE_API_URL is set per-environment (Vercel project settings) to point
// at the deployed backend, e.g. https://cms-backend.up.railway.app/api.
// Falls back to localhost for local development, where it's unset.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  headers: { "Content-Type": "application/json" },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cms_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401, and transparently handle the
// PASSWORD_CONFIRMATION_REQUIRED response the backend sends for any
// ADMIN delete (added 2026-09-25) — every delete button in the app gets
// the password-confirmation prompt this way, with no per-page changes.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cms_token");
      localStorage.removeItem("cms_user");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    const code = error.response?.data?.code;
    const config = error.config;
    if (
      error.response?.status === 403 &&
      code === "PASSWORD_CONFIRMATION_REQUIRED" &&
      config &&
      !config._passwordConfirmRetried
    ) {
      const password = await requestPasswordConfirmation();
      if (password === null) {
        // Person cancelled the prompt — surface the original error as-is.
        return Promise.reject(error);
      }
      config._passwordConfirmRetried = true;
      config.headers = { ...config.headers, "x-confirm-password": password };
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;
