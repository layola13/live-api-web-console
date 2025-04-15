/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { 
  GoogleGenAI, 
  Session, 
  Content, 
  Part, 
  Blob as GenAIBlob,
  FunctionCall,
  GenerationConfig,
  Tool,
  Modality
} from "@google/genai";
import { EventEmitter } from "eventemitter3";
import { difference } from "lodash";
import { base64ToArrayBuffer } from "./utils";

// 自定义 LiveServerMessage 类型来匹配 @google/genai 的实际消息结构
interface LiveServerMessage {
  setupComplete?: unknown;
  toolCall?: {
    functionCalls?: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>;
  };
  toolCallCancellation?: {
    ids?: string[];
  };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    modelTurn?: {
      parts?: Array<Part>;
    };
  };
}

// 必要的消息类型
export type ServerContentMessage = {
  serverContent: ServerContent;
};

export type ToolCallMessage = {
  toolCall: ToolCall;
};

export type ToolCallCancellationMessage = {
  toolCallCancellation: ToolCallCancellation;
};

export type ToolResponseMessage = {
  toolResponse: {
    functionResponses: LiveFunctionResponse[];
  };
};

export type ClientContentMessage = {
  clientContent: {
    turns: Content[];
    turnComplete: boolean;
  };
};

// 类型检查函数
export const isClientContentMessage = (a: unknown): a is ClientContentMessage =>
  typeof a === 'object' && a !== null && 'clientContent' in a;

export const isServerContentMessage = (a: unknown): a is ServerContentMessage =>
  typeof a === 'object' && a !== null && 'serverContent' in a;

export const isToolCallMessage = (a: unknown): a is ToolCallMessage =>
  typeof a === 'object' && a !== null && 'toolCall' in a;

export const isToolCallCancellationMessage = (a: unknown): a is ToolCallCancellationMessage =>
  typeof a === 'object' && a !== null && 'toolCallCancellation' in a;

export const isToolResponseMessage = (a: unknown): a is ToolResponseMessage =>
  typeof a === 'object' && a !== null && 'toolResponse' in a;

// 必要的自定义类型定义
export type LiveConfig = {
  model: string;
  systemInstruction?: { parts: Part[] };
  generationConfig?: Partial<LiveGenerationConfig>;
  tools?: Array<Tool | { googleSearch: {} } | { codeExecution: {} }>;
};

export type LiveGenerationConfig = GenerationConfig & {
  responseModalities: "text" | "audio" | "image";
  speechConfig?: {
    voiceConfig?: {
      prebuiltVoiceConfig?: {
        voiceName: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede" | string;
      };
    };
    languageCode?: string;
  };
};

export type LiveFunctionCall = FunctionCall & {
  id: string;
};

export type ToolCall = {
  functionCalls: LiveFunctionCall[];
};

export type ToolCallCancellation = {
  ids: string[];
};

export type LiveFunctionResponse = {
  response: Record<string, unknown>;
  id: string;
};

export type StreamingLog = {
  date: Date;
  type: string;
  count?: number;
  message: string | object;
};

export type ServerContent = ModelTurn | TurnComplete | Interrupted;

export type ModelTurn = {
  modelTurn: {
    parts: Part[];
  };
};

export type TurnComplete = { turnComplete: boolean };

export type Interrupted = { interrupted: true };

// 必要的类型检查函数
export const isModelTurn = (a: any): a is ModelTurn =>
  typeof (a as ModelTurn).modelTurn === "object";

export const isTurnComplete = (a: any): a is TurnComplete =>
  typeof (a as TurnComplete).turnComplete === "boolean";

export const isInterrupted = (a: any): a is Interrupted =>
  (a as Interrupted).interrupted;

/**
 * The events that this client will emit
 */
interface MultimodalLiveClientEventTypes {
  open: () => void;
  log: (log: StreamingLog) => void;
  close: (event: CloseEvent) => void;
  audio: (data: ArrayBuffer) => void;
  content: (data: ServerContent) => void;
  interrupted: () => void;
  setupcomplete: () => void;
  turncomplete: () => void;
  toolcall: (toolCall: ToolCall) => void;
  toolcallcancellation: (toolcallCancellation: ToolCallCancellation) => void;
}

export type MultimodalLiveAPIClientConnection = {
  apiKey: string;
};

/**
 * A event-emitting class that manages the connection to the Gemini AI service and emits
 * events to the rest of the application.
 */
export class MultimodalLiveClient extends EventEmitter<MultimodalLiveClientEventTypes> {
  private genAI: GoogleGenAI;
  private session: Session | null = null;
  protected config: LiveConfig | null = null;
  public url: string | null = null;
  public getConfig() {
    return { ...this.config };
  }

  constructor({ apiKey }: MultimodalLiveAPIClientConnection) {
    super();
    this.genAI = new GoogleGenAI({ apiKey });
    this.send = this.send.bind(this);
  }

  log(type: string, message: StreamingLog["message"]) {
    const log: StreamingLog = {
      date: new Date(),
      type,
      message,
    };
    this.emit("log", log);
  }

  async connect(config: LiveConfig): Promise<boolean> {
    this.config = config;
  
    try {
      // Extract responseModalities from generationConfig to avoid duplication
      const { responseModalities, ...restGenerationConfig } = config.generationConfig || {};
      
      // Convert string modality to the proper Modality enum value
      const modalityValue = responseModalities === "audio" 
        ? Modality.AUDIO 
        : responseModalities === "image" 
          ? Modality.IMAGE 
          : Modality.TEXT;
  
      this.session = await this.genAI.live.connect({
        model: config.model,
        config: {
          systemInstruction: config.systemInstruction,
          tools: config.tools,
          // Set responseModalities as an array with properly converted value
          responseModalities: [modalityValue],
          speechConfig: config.generationConfig?.speechConfig,
          // Use the rest of generationConfig without responseModalities
          generationConfig: restGenerationConfig,
        },
        callbacks: {
          onopen: () => {
            this.log("client.open", "connected to socket");
            this.emit("open");
            this.emit("setupcomplete");
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleServerMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            const message = `Error: ${e.message}`;
            this.log(`server.error`, message);
          },
          onclose: (e: CloseEvent) => {
            this.log(
              `server.close`,
              `disconnected ${e.reason ? `with reason: ${e.reason}` : ""}`
            );
            this.emit("close", e);
            this.session = null;
          },
        },
      });
  
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log("server.error", `Connection error: ${errorMessage}`);
      throw new Error(`Could not connect: ${errorMessage}`);
    }
  }
 
  disconnect(): boolean {
    if (this.session) {
      this.session.close();
      this.session = null;
      this.log("client.close", "Disconnected");
      return true;
    }
    return false;
  }

  /**
   * 处理从服务器收到的消息
   */
  private handleServerMessage(message: LiveServerMessage) {
    // Handle tool call messages
    if (message.toolCall) {
      const functionCalls = message.toolCall.functionCalls || [];
      const validFunctionCalls: LiveFunctionCall[] = functionCalls
        .filter(fc => fc.id && fc.name)
        .map(fc => ({
          id: fc.id as string,
          name: fc.name as string,
          args: fc.args || {},
        }));

      if (validFunctionCalls.length > 0) {
        const toolCall: ToolCall = {
          functionCalls: validFunctionCalls
        };
        this.log("server.toolCall", { toolCall });
        this.emit("toolcall", toolCall);
      }
      return;
    }

    // Handle tool call cancellation
    if (message.toolCallCancellation) {
      const cancellation: ToolCallCancellation = {
        ids: message.toolCallCancellation.ids || [],
      };
      this.log("server.toolCallCancellation", { cancellation });
      this.emit("toolcallcancellation", cancellation);
      return;
    }

    // Handle content messages
    if (message.serverContent) {
      const content = message.serverContent;
      
      // Handle interruptions
      if (content.interrupted) {
        this.log("server.interrupted", "Model response interrupted");
        this.emit("interrupted");
        return;
      }
      
      // Handle turn completion
      if (content.turnComplete) {
        this.log("server.turnComplete", "Turn complete");
        this.emit("turncomplete");
      }
      
      // Handle model turn with parts
      if (content.modelTurn && content.modelTurn.parts) {
        const parts = content.modelTurn.parts;
        
        // Handle audio parts
        const audioParts = parts.filter(
          (p: Part) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm")
        );
        
        // Extract other (non-audio) parts
        const otherParts = difference(parts, audioParts);
        
        // Process audio parts
        audioParts.forEach((part: Part) => {
          if (part.inlineData?.data) {
            const data = base64ToArrayBuffer(part.inlineData.data);
            this.emit("audio", data);
            this.log("server.audio", `audio buffer (${data.byteLength})`);
          }
        });
        
        // If we have non-audio parts, emit content event
        if (otherParts.length > 0) {
          const modelTurn: ModelTurn = {
            modelTurn: {
              parts: otherParts as Part[]
            }
          };
          this.emit("content", modelTurn);
          this.log("server.content", { serverContent: modelTurn });
        }
      }
    }
  }

  /**
   * Send realtime input such as audio/video
   */
  sendRealtimeInput(chunk: GenAIBlob) {
    if (!this.session) {
      throw new Error("Session is not connected");
    }
    
    const mediaType = chunk.mimeType ? chunk.mimeType.split('/')[0] : 'unknown';
    
    try {
      // 根据 genAI API 传递单个媒体对象
      this.session.sendRealtimeInput({ media: chunk });
      this.log('client.realtimeInput', mediaType);
    } catch (error) {
      console.error('Error sending realtime input:', error);
      throw error;
    }
  }

  /**
   * Send a response to a function call
   */
  sendToolResponse(toolResponse: { functionResponses: LiveFunctionResponse[] }) {
    if (!this.session) {
      throw new Error("Session is not connected");
    }
    
    try {
      // 调整为与 @google/genai 兼容的格式
      const responses = toolResponse.functionResponses.map(fr => ({
        id: fr.id,
        response: fr.response
      }));
      
      this.session.sendToolResponse({ functionResponses: responses });
      this.log('client.toolResponse', { toolResponse });
    } catch (error) {
      console.error('Error sending tool response:', error);
      throw error;
    }
  }

  /**
   * Send text content to the model
   */
  send(parts: Part | Part[], turnComplete: boolean = true) {
    if (!this.session) {
      throw new Error("Session is not connected");
    }
    
    parts = Array.isArray(parts) ? parts : [parts];
    const content: Content = {
      role: "user",
      parts,
    };

    try {
      this.session.sendClientContent({
        turns: [content],
        turnComplete
      });
      this.log('client.send', { content, turnComplete });
    } catch (error) {
      console.error('Error sending content:', error);
      throw error;
    }
  }

  /**
   * For compatibility with the previous implementation
   * Routes request to the appropriate method based on its type
   */
  _sendDirect(request: object) {
    if (!this.session) {
      throw new Error("Session is not connected");
    }
    
    if ('clientContent' in request) {
      const clientContent = (request as any).clientContent;
      this.session.sendClientContent(clientContent);
    } else if ('realtimeInput' in request) {
      const realtimeInput = (request as any).realtimeInput;
  // 如果有多个媒体块，逐个发送
  if (Array.isArray(realtimeInput.mediaChunks)) {
    for (const chunk of realtimeInput.mediaChunks) {
      this.session.sendRealtimeInput({ media: chunk });
    }
  } else if (realtimeInput.mediaChunks) {
    // 单个媒体块
    this.session.sendRealtimeInput({ media: realtimeInput.mediaChunks });
  }
    } else if ('toolResponse' in request) {
      const toolResponse = (request as any).toolResponse;
      const responses = toolResponse.functionResponses.map((fr: LiveFunctionResponse) => ({
        id: fr.id,
        response: fr.response
      }));
      this.session.sendToolResponse({ functionResponses: responses });
    } else if ('setup' in request) {
      // Setup is handled by connect()
      console.log('Setup is handled by connect()');
    } else {
      console.warn('Unknown request type:', request);
    }
  }
}