import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { MultimodalLiveClient } from '../src/lib/multimodal-live-client';
import jwt from 'jsonwebtoken';
import cors from 'cors';

// 环境变量配置
const API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_GEMINI_API_KEY';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const PORT = process.env.PORT || 3000;
const TOKEN_EXPIRY = '1h'; // 令牌有效期1小时

// 创建Express应用和HTTP服务器
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 用户验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Missing token' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// 创建客户端会话存储
const clientSessions = new Map();

// REST API端点

// 获取临时访问令牌
app.post('/api/token', (req, res) => {
  // 在实际应用中，应该验证用户凭据
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  // 生成JWT令牌
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  
  res.json({ token, expiresIn: TOKEN_EXPIRY });
});

// WebSocket连接处理
io.use((socket, next) => {
  // 验证WebSocket连接的令牌
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: Missing token'));
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
    
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username}`);
  
  // 处理连接请求
  socket.on('connect_gemini', async (config) => {
    try {
      // 创建一个新的客户端实例
      const client = new MultimodalLiveClient({ apiKey: API_KEY });
      
      // 注册事件处理
      client.on('log', (log) => {
        socket.emit('log', log);
      });
      
      client.on('open', () => {
        socket.emit('open');
      });
      
      client.on('content', (modelTurn) => {
        socket.emit('content', modelTurn);
      });
      
      client.on('audio', (audioBuffer) => {
        socket.emit('audio', Buffer.from(audioBuffer).toString('base64'));
      });
      
      client.on('turncomplete', () => {
        socket.emit('turncomplete');
      });
      
      client.on('toolcall', (toolCall) => {
        socket.emit('toolcall', toolCall);
      });
      
      client.on('close', () => {
        socket.emit('close');
        // 清理客户端会话
        clientSessions.delete(socket.id);
      });
      
      // 连接到Gemini服务
      await client.connect(config);
      
      // 存储客户端会话
      clientSessions.set(socket.id, client);
      
      socket.emit('connected', { status: 'success' });
      
    } catch (error) {
      console.error('Connection error:', error);
      socket.emit('error', { 
        message: 'Failed to connect to Gemini API',
        details: error.message 
      });
    }
  });
  
  // 处理文本消息
  socket.on('send_text', (message) => {
    const client = clientSessions.get(socket.id);
    if (!client) {
      return socket.emit('error', { message: 'No active session' });
    }
    
    try {
      client.send(message.parts, message.turnComplete);
    } catch (error) {
      socket.emit('error', { 
        message: 'Failed to send message',
        details: error.message 
      });
    }
  });
  
  // 处理实时音频输入
  socket.on('send_audio', (audioData) => {
    const client = clientSessions.get(socket.id);
    if (!client) {
      return socket.emit('error', { message: 'No active session' });
    }
    
    try {
      const audioBlob = {
        data: audioData,
        mimeType: 'audio/pcm;rate=16000',
      };
      client.sendRealtimeInput(audioBlob);
    } catch (error) {
      socket.emit('error', { 
        message: 'Failed to send audio',
        details: error.message 
      });
    }
  });
  
  // 处理工具响应
  socket.on('send_tool_response', (response) => {
    const client = clientSessions.get(socket.id);
    if (!client) {
      return socket.emit('error', { message: 'No active session' });
    }
    
    try {
      client.sendToolResponse(response);
    } catch (error) {
      socket.emit('error', { 
        message: 'Failed to send tool response',
        details: error.message 
      });
    }
  });
  
  // 断开连接
  socket.on('disconnect_gemini', () => {
    const client = clientSessions.get(socket.id);
    if (client) {
      client.disconnect();
      clientSessions.delete(socket.id);
    }
  });
  
  // 处理客户端断开连接
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username}`);
    const client = clientSessions.get(socket.id);
    if (client) {
      client.disconnect();
      clientSessions.delete(socket.id);
    }
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});