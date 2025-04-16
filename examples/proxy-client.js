// Import from your library
import { AudioRecorder } from '../src/lib/audio-recorder.js';
import { AudioStreamer } from '../src/lib/audio-streamer.js';
import { audioContext } from '../src/lib/utils.js';

// Configuration
const API_URL = 'http://localhost:3000';
let socket;
let token;
let audioRecorder;
let audioStreamer;
let context;

// DOM Elements
const loginForm = document.getElementById('login-form');
const chatInterface = document.getElementById('chat-interface');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('login-btn');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const recordBtn = document.getElementById('record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const statusElement = document.getElementById('status');
const volumeLevel = document.getElementById('volume-level');

// Initialize audio context and components
async function initAudio() {
  context = await audioContext({ sampleRate: 16000 });
  audioStreamer = new AudioStreamer(context);
  
  // Set up audio completion handler
  audioStreamer.onComplete = () => {
    updateStatus('Audio playback complete');
  };
  
  // Initialize audio recorder
  audioRecorder = new AudioRecorder(16000);
  
  // Handle recorded audio data
  audioRecorder.on('data', (audioBase64) => {
    // Send audio to server
    socket.emit('send_audio', audioBase64);
  });
  
  // Update volume meter
  audioRecorder.on('volume', (volume) => {
    // Scale the volume (0-1) to a percentage for the meter
    const volumePercent = Math.min(100, Math.max(0, volume * 100));
    volumeLevel.style.width = `${volumePercent}%`;
    volumeLevel.style.backgroundColor = volumePercent > 75 ? '#ff4d4d' : 
                                      volumePercent > 50 ? '#ffc14d' : 
                                      '#4caf50';
  });
  
  await audioStreamer.resume();
}

// Login and get token
loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      token = data.token;
      loginForm.style.display = 'none';
      chatInterface.style.display = 'block';
      updateStatus('Got token, ready to connect');
      await initAudio();
    } else {
      alert(`Error: ${data.error}`);
    }
  } catch (error) {
    alert(`Network error: ${error.message}`);
  }
});

// Connect to Gemini API via proxy
connectBtn.addEventListener('click', () => {
  if (!token) {
    updateStatus('No token available');
    return;
  }
  
  // Initialize Socket.io connection
  socket = io(API_URL, {
    auth: { token }
  });
  
  // Socket event handlers
  socket.on('connect', () => {
    updateStatus('Socket connected, establishing Gemini session...');
    
    // Configure and connect to Gemini
    socket.emit('connect_gemini', {
      model: 'gemini-2.0-flash-live-001',
      generationConfig: {
        temperature: 0.7,
        responseModalities: ['TEXT', 'AUDIO'],
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
  });
  
  socket.on('connected', () => {
    updateStatus('Connected to Gemini');
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    sendBtn.disabled = false;
    recordBtn.disabled = false;
  });
  
  socket.on('content', (modelTurn) => {
    const parts = modelTurn.modelTurn.parts;
    parts.forEach(part => {
      if (part.text) {
        addMessage('model', part.text);
      }
    });
  });
  
  socket.on('audio', async (audioBase64) => {
    try {
      // Convert base64 to Uint8Array for AudioStreamer
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Add audio data to the streamer
      audioStreamer.addPCM16(bytes);
    } catch (error) {
      console.error('Error processing audio response:', error);
    }
  });
  
  socket.on('log', (log) => {
    console.log(`[${new Date(log.date).toLocaleTimeString()}] ${log.type}:`, log.message);
  });
  
  socket.on('turncomplete', () => {
    updateStatus('Model turn complete');
  });
  
  socket.on('close', () => {
    updateStatus('Disconnected from Gemini');
    resetUI();
  });
  
  socket.on('error', (error) => {
    updateStatus(`Error: ${error.message}`);
    console.error('Error details:', error.details);
  });
  
  socket.on('disconnect', () => {
    updateStatus('Disconnected from server');
    resetUI();
  });
});

// Send text message
sendBtn.addEventListener('click', () => {
  const message = messageInput.value.trim();
  if (!message) return;
  
  addMessage('user', message);
  
  socket.emit('send_text', {
    parts: [{ text: message }],
    turnComplete: true
  });
  
  messageInput.value = '';
  updateStatus('Waiting for response...');
});

// Disconnect from Gemini
disconnectBtn.addEventListener('click', () => {
  if (socket) {
    socket.emit('disconnect_gemini');
  }
});

// Record audio
recordBtn.addEventListener('click', async () => {
  try {
    await audioRecorder.start();
    updateStatus('Recording audio...');
    recordBtn.style.display = 'none';
    stopRecordBtn.style.display = 'inline-block';
    stopRecordBtn.disabled = false;
  } catch (error) {
    alert(`Error starting recording: ${error.message}`);
    console.error(error);
  }
});

// Stop recording
stopRecordBtn.addEventListener('click', () => {
  audioRecorder.stop();
  recordBtn.style.display = 'inline-block';
  stopRecordBtn.style.display = 'none';
  volumeLevel.style.width = '0%';
  updateStatus('Recording stopped, waiting for response...');
});

// Helper functions
function addMessage(sender, text) {
  const messageElement = document.createElement('div');
  messageElement.classList.add(sender === 'user' ? 'user-message' : 'model-message');
  messageElement.textContent = text;
  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateStatus(message) {
  statusElement.textContent = message;
}

function resetUI() {
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  sendBtn.disabled = true;
  recordBtn.disabled = true;
  stopRecordBtn.disabled = true;
  stopRecordBtn.style.display = 'none';
  recordBtn.style.display = 'inline-block';
  volumeLevel.style.width = '0%';
  
  if (audioRecorder) {
    audioRecorder.stop();
  }
  
  if (audioStreamer) {
    audioStreamer.stop();
  }
}