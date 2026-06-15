const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost";
export const API_URL = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;
export const BRAND_NAME = "Varasto";
