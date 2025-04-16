// 导出所有公共类和接口
export { MultimodalLiveClient } from './lib/multimodal-live-client';
export { AudioRecorder } from './lib/audio-recorder';
export { AudioStreamer } from './lib/audio-streamer';
export { audioContext, base64ToArrayBuffer } from './lib/utils';

// 导出类型
export type {
  LiveConfig,
  LiveGenerationConfig,
  ServerContent,
  StreamingLog,
  ToolCall,
  ToolCallCancellation,
  LiveFunctionResponse,
  MultimodalLiveAPIClientConnection
} from './lib/multimodal-live-client';