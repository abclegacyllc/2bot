"use strict";
// Billing Module - Phase 5: Billing System
// Exports: billingTypes, stripeService
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeService = exports.BILLING_MODULE = void 0;
exports.BILLING_MODULE = "billing";
// Types
__exportStar(require("./billing.types"), exports);
// Service
var stripe_service_1 = require("./stripe.service");
Object.defineProperty(exports, "stripeService", { enumerable: true, get: function () { return stripe_service_1.stripeService; } });
//# sourceMappingURL=index.js.map