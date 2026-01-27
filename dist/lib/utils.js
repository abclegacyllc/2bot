"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnauthorizedError = exports.NotFoundError = exports.BadRequestError = exports.AppError = exports.RATE_LIMITS = exports.PLAN_PRICING = exports.PLAN_LIMITS = exports.HTTP_STATUS = exports.GATEWAY_TYPES = exports.APP_CONFIG = void 0;
exports.cn = cn;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
// Re-export shared utilities for convenience
var constants_1 = require("@/shared/constants");
Object.defineProperty(exports, "APP_CONFIG", { enumerable: true, get: function () { return constants_1.APP_CONFIG; } });
Object.defineProperty(exports, "GATEWAY_TYPES", { enumerable: true, get: function () { return constants_1.GATEWAY_TYPES; } });
Object.defineProperty(exports, "HTTP_STATUS", { enumerable: true, get: function () { return constants_1.HTTP_STATUS; } });
Object.defineProperty(exports, "PLAN_LIMITS", { enumerable: true, get: function () { return constants_1.PLAN_LIMITS; } });
Object.defineProperty(exports, "PLAN_PRICING", { enumerable: true, get: function () { return constants_1.PLAN_PRICING; } });
Object.defineProperty(exports, "RATE_LIMITS", { enumerable: true, get: function () { return constants_1.RATE_LIMITS; } });
var errors_1 = require("@/shared/errors");
Object.defineProperty(exports, "AppError", { enumerable: true, get: function () { return errors_1.AppError; } });
Object.defineProperty(exports, "BadRequestError", { enumerable: true, get: function () { return errors_1.BadRequestError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return errors_1.NotFoundError; } });
Object.defineProperty(exports, "UnauthorizedError", { enumerable: true, get: function () { return errors_1.UnauthorizedError; } });
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
//# sourceMappingURL=utils.js.map