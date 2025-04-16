import { MultimodalLiveClient } from '../src/lib/multimodal-live-client';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_API_KEY';

// 这个例子需要预先准备好的图像文件作为视频帧
const IMAGE_FILE_PATH = path.join(__dirname, 'screenshot.jpg');

async function startVideoShare() {
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
        console.log('Model analysis of screen content:', part.text);
      }
    });
  });
  
  client.on('turncomplete', () => {
    console.log('Model analysis complete');
  });
  
  client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
  });
  
  // 连接到Gemini服务
  await client.connect({
    model: 'gemini-2.0-flash-live-001',
    generationConfig: {
      temperature: 0.7,
      responseModalities: ['TEXT']
    }
  });
  
  console.log('Connected! Sending screen capture...');
  
  // 读取图像文件并发送作为屏幕共享
  try {
    const imageData = fs.readFileSync(IMAGE_FILE_PATH);
    
    // 创建一个图像Blob对象
    const imageBlob = {
      data: imageData.toString('base64'),
      mimeType: 'image/jpeg',
    };
    
    // 发送文本请求和图像
    client.send([
      { text: "Please analyze what's shown in this screenshot:" },
      { inlineData: imageBlob }
    ]);
    
    console.log('Image sent. Waiting for analysis...');
    
    // 为了演示，我们等待10秒后断开连接
    setTimeout(() => {
      client.disconnect();
    }, 10000);
    
  } catch (err) {
    console.error('Error reading or sending image:', err);
    client.disconnect();
  }
}

startVideoShare().catch(err => console.error('Error:', err));