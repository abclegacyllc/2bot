import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Re-export shared utilities for convenience
export { APP_CONFIG, GATEWAY_TYPES, HTTP_STATUS, PLAN_LIMITS, PLAN_PRICING, RATE_LIMITS } from "@/shared/constants";
export { AppError, BadRequestError, NotFoundError, UnauthorizedError } from "@/shared/errors";
export type {
    ApiResponse, BaseEntity, PaginatedResponse,
    PaginationParams,
    PlanType
} from "@/shared/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
