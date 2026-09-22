import axios from "axios";

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

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cms_token");
      localStorage.removeItem("cms_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
