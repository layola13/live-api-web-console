import { MultimodalLiveClient } from '../src/lib/multimodal-live-client';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_API_KEY';

// 这个例子需要预先准备好的音频文件
const AUDIO_FILE_PATH = path.join(__dirname, 'audio-sample.pcm');

async function startVoiceChat() {
  const client = new MultimodalLiveClient({ apiKey: API_KEY });
  
  client.on('log', (log) => {
    console.log(`[${log.date.toISOString()}] ${log.type}: ${JSON.stringify(log.message)}`);
  });
  
  client.on('open', () => {
    console.log('Connection opened!');
  });
  
  client.on('content', (modelTurn) => {
    const parts = modelTurn.modelTurn.parts;
    parts.forEach(part => {
      if (part.text) {
        console.log('Model text response:', part.text);
      }
    });
  });
  
  client.on('audio', (audioBuffer) => {
    console.log(`Received audio response: ${audioBuffer.byteLength} bytes`);
    // 在实际应用中，您可能希望将音频输出到扬声器
    // 这里我们只是保存到文件以便演示
    fs.writeFileSync('model-response.pcm', Buffer.from(audioBuffer));
  });
  
  client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
  });
  
  // 连接到Gemini服务并启用语音功能
  await client.connect({
    model: 'gemini-2.0-flash-live-001',
    generationConfig: {
      temperature: 0.7,
      responseModalities: ['AUDIO', 'TEXT'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'en-default',
          },
        },
        languageCode: 'en-US',
      }
    }
  });
  
  console.log('Connected! Sending audio sample...');
  
  // 读取音频文件并发送
  try {
    const audioData = fs.readFileSync(AUDIO_FILE_PATH);
    
    // 创建一个音频Blob对象
    const audioBlob = {
      data: audioData.toString('base64'),
      mimeType: 'audio/pcm;rate=16000',
    };
    
    // 发送实时音频输入
    client.sendRealtimeInput(audioBlob);
    
    console.log('Audio sent. Waiting for response...');
    
    // 为了示例简单，我们在5秒后断开连接
    setTimeout(() => {
      client.disconnect();
    }, 5000);
    
  } catch (err) {
    console.error('Error reading or sending audio:', err);
    client.disconnect();
  }
}

startVoiceChat().catch(err => console.error('Error:', err));