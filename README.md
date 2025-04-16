# Google GenAI Live Library

A JavaScript/TypeScript library for interacting with Google's Generative AI models in real-time, supporting audio streaming, video streaming, and tool calls.

## Installation

```bash
npm install google-genai-live-lib
# or
yarn add google-genai-live-lib
```

## Usage

### Basic setup

```typescript
import { MultimodalLiveClient, type LiveConfig } from 'google-genai-live-lib';

// Configure your client
const client = new MultimodalLiveClient({
  apiKey: 'YOUR_API_KEY'
});

// Define your config
const config: LiveConfig = {
  model: "models/gemini-2.0-flash-live-001",
  generationConfig: {
    responseModalities: "text",
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      languageCode: "en-US",
    },
  },
  systemInstruction: {
    parts: [{ text: 'You are a helpful assistant.' }],
  },
  tools: [
    { googleSearch: {} },
  ],
};

// Connect to the API
await client.connect(config);

// Send a message
client.send([{ text: "Hello, how are you?" }]);

// Listen for responses
client.on("content", (content) => {
  console.log("Received content:", content);
});

// Disconnect when done
client.disconnect();
```

### Audio streaming

```typescript
import { AudioRecorder, AudioStreamer, audioContext } from 'google-genai-live-lib';

// Set up audio recording
const audioRecorder = new AudioRecorder();

// Set up audio playback
const ctx = await audioContext({ id: "audio-out" });
const audioStreamer = new AudioStreamer(ctx);

// Set up event handlers
client.on("audio", (data) => {
  audioStreamer.addPCM16(new Uint8Array(data));
});

audioRecorder.on("data", (base64) => {
  client.sendRealtimeInput({
    mimeType: "audio/pcm;rate=16000",
    data: base64,
  });
});

// Start recording
audioRecorder.start();
```

## API Reference

[Link to API documentation]

## License

Apache-2.0