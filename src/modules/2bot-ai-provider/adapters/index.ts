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

export {
    togetherImageGeneration, togetherTextGeneration,
    togetherTextGenerationStream
} from "./together.adapter";

export {
    fireworksImageGeneration, fireworksTextGeneration,
    fireworksTextGenerationStream
} from "./fireworks.adapter";

export {
    openrouterTextGeneration,
    openrouterTextGenerationStream
} from "./openrouter.adapter";

export {
    vertexImageGeneration,
    vertexTextGeneration,
    vertexTextGenerationStream
} from "./vertex-ai.adapter";

export {
    genLangTextGeneration,
    genLangTextGenerationStream
} from "./google-genlang.adapter";

export {
    veoVideoGeneration
} from "./google-veo.adapter";
