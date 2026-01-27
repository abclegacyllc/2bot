"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = exports.requestLogger = exports.notFoundHandler = exports.errorHandler = exports.corsOptions = exports.startServer = exports.createApp = exports.SERVER_CONFIG = void 0;
// Server Entry Point
var app_1 = require("./app");
Object.defineProperty(exports, "SERVER_CONFIG", { enumerable: true, get: function () { return app_1.SERVER_CONFIG; } });
Object.defineProperty(exports, "createApp", { enumerable: true, get: function () { return app_1.createApp; } });
Object.defineProperty(exports, "startServer", { enumerable: true, get: function () { return app_1.startServer; } });
var cors_1 = require("./middleware/cors");
Object.defineProperty(exports, "corsOptions", { enumerable: true, get: function () { return cors_1.corsOptions; } });
var error_handler_1 = require("./middleware/error-handler");
Object.defineProperty(exports, "errorHandler", { enumerable: true, get: function () { return error_handler_1.errorHandler; } });
Object.defineProperty(exports, "notFoundHandler", { enumerable: true, get: function () { return error_handler_1.notFoundHandler; } });
var request_logger_1 = require("./middleware/request-logger");
Object.defineProperty(exports, "requestLogger", { enumerable: true, get: function () { return request_logger_1.requestLogger; } });
var routes_1 = require("./routes");
Object.defineProperty(exports, "router", { enumerable: true, get: function () { return routes_1.router; } });
//# sourceMappingURL=index.js.map