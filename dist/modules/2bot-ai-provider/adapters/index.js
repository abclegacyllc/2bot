"use strict";
/**
 * 2Bot AI Provider Adapters Index
 *
 * @module modules/2bot-ai-provider/adapters
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicTextGenerationStream = exports.anthropicTextGeneration = exports.openaiTextGenerationStream = exports.openaiTextGeneration = exports.openaiSpeechSynthesis = exports.openaiSpeechRecognition = exports.openaiImageGeneration = void 0;
var openai_adapter_1 = require("./openai.adapter");
Object.defineProperty(exports, "openaiImageGeneration", { enumerable: true, get: function () { return openai_adapter_1.openaiImageGeneration; } });
Object.defineProperty(exports, "openaiSpeechRecognition", { enumerable: true, get: function () { return openai_adapter_1.openaiSpeechRecognition; } });
Object.defineProperty(exports, "openaiSpeechSynthesis", { enumerable: true, get: function () { return openai_adapter_1.openaiSpeechSynthesis; } });
Object.defineProperty(exports, "openaiTextGeneration", { enumerable: true, get: function () { return openai_adapter_1.openaiTextGeneration; } });
Object.defineProperty(exports, "openaiTextGenerationStream", { enumerable: true, get: function () { return openai_adapter_1.openaiTextGenerationStream; } });
var anthropic_adapter_1 = require("./anthropic.adapter");
Object.defineProperty(exports, "anthropicTextGeneration", { enumerable: true, get: function () { return anthropic_adapter_1.anthropicTextGeneration; } });
Object.defineProperty(exports, "anthropicTextGenerationStream", { enumerable: true, get: function () { return anthropic_adapter_1.anthropicTextGenerationStream; } });
//# sourceMappingURL=index.js.map