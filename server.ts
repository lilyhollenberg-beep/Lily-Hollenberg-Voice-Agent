import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import voiceHandler, { LIL_SYSTEM_INSTRUCTION } from './api/voice.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.post('/api/voice', (req, res) => {
    void voiceHandler(req, res);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs: WebSocket) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      clientWs.send(
        JSON.stringify({
          error:
            'GEMINI_API_KEY is not configured. Please check Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let isClosing = false;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: LIL_SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            sendSafe({ ready: true });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (!content) return;

            if (content.inputTranscription?.text) {
              sendSafe({ inputTranscript: content.inputTranscription.text });
            }
            if (content.outputTranscription?.text) {
              sendSafe({ outputTranscript: content.outputTranscription.text });
            }
            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  sendSafe({ audio: part.inlineData.data });
                }
              }
            }
            if (content.interrupted) {
              sendSafe({ interrupted: true });
            }
            if (content.turnComplete) {
              sendSafe({ turnComplete: true });
            }
          },
          onerror: (err: unknown) => {
            const msg =
              err instanceof Error ? err.message : 'Live session error occurred.';
            sendSafe({ error: msg });
          },
          onclose: () => {
            if (!isClosing) {
              sendSafe({ closed: true });
            }
          },
        },
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to connect to Gemini Live API.';
      sendSafe({ error: msg });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!liveSession || isClosing) return;
      try {
        const parsed = JSON.parse(raw.toString());
        if (typeof parsed.audio === 'string' && parsed.audio.length > 0) {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
          liveSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: parsed.text.trim() }] }],
            turnComplete: true,
          });
        }
      } catch {
        // Ignore malformed frames
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      liveSession = null;
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
