import { MultimodalLiveClient } from '../src/lib/multimodal-live-client';

// 使用环境变量中的API密钥或在此处提供
const API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_API_KEY';

async function startTextChat() {
  // 创建客户端实例
  const client = new MultimodalLiveClient({ apiKey: API_KEY });
  
  // 注册事件处理程序
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
        console.log('Model:', part.text);
      }
    });
  });
  
  client.on('turncomplete', () => {
    console.log('Turn complete, you can send another message.');
    promptUser();
  });
  
  client.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
  });
  
  // 连接到Gemini服务
  await client.connect({
    model: 'gemini-2.0-flash-live-001', // 使用适当的模型
    generationConfig: {
      temperature: 0.7,
      responseModalities: ['TEXT']
    }
  });
  
  console.log('Connected! Type your message and press Enter. Type "exit" to quit.');
  promptUser();
  
  // 处理用户输入
  function promptUser() {
    process.stdin.once('data', (data) => {
      const input = data.toString().trim();
      
      if (input.toLowerCase() === 'exit') {
        client.disconnect();
        return;
      }
      
      // 发送用户输入到模型
      client.send({ text: input });
    });
  }
}

startTextChat().catch(err => console.error('Error:', err));