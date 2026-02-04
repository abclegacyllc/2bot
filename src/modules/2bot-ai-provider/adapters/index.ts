/**
 * 2Bot AI Provider Adapters Index
 *
 * @module modules/2bot-ai-provider/adapters
 */

export {
    openaiImageGeneration, openaiSpeechRecognition, openaiSpeechSynthesis, openaiTextGeneration,
    openaiTextGenerationStream
} from "./openai.adapter";

export {
    anthropicTextGeneration,
    anthropicTextGenerationStream
} from "./anthropic.adapter";
