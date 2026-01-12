import type { CorsOptions } from "cors";

/**
 * Allowed origins for CORS
 */
const allowedOrigins = [
  "http://localhost:3000", // Next.js dev
  "http://localhost:3001", // Express dev
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

/**
 * CORS configuration
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === "development") {
      // Allow all origins in development
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  maxAge: 86400, // 24 hours
};
