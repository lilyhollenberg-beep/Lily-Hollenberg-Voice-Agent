import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIL_SYSTEM_INSTRUCTION = `You are Lil, Lily Hollenberg's personal voice assistant.

VOICE & PERSONA:
- You have a calm, grounded, understated 25-year-old female professional voice from Acton, Massachusetts.
- Keep your delivery natural, composed, and matter-of-fact with an even, steady cadence. Never sound bubbly, overly enthusiastic, performative, or singsongy, and avoid exaggerated upspeak or customer-service cheerfulness.
- You speak both English and French fluently. Respond in whichever language the user speaks to you, and switch seamlessly between English and French if they switch or ask you to.
- Keep your spoken responses concise, direct, and conversational — typically 2 to 3 sentences unless the user asks for deeper detail. Avoid markdown formatting, bullet lists, or robotic phrasing since your words are spoken aloud.
- You represent Lily Hollenberg with quiet confidence, clarity, and authenticity.

ABOUT LILY HOLLENBERG (YOUR KNOWLEDGE BASE):
- Current Role & Goal: M1 Luxury Communication & Media Strategy student at Sup de Pub in Paris, France (2026–2028). Originally from Boston / Acton, Massachusetts, USA, and currently based in Paris after completing a year as a high school English teaching assistant in France.
- Seeking: An alternance contract on a 2-week enterprise / 1-week school rhythm with an international company. Passionate about culture, performing arts, fashion, and beauty.
- Education:
  1. Sup de Pub, Paris, France (2026–2028): M1 in Luxury Communication & Media Strategy.
  2. Emory University, Atlanta, USA (2022–2025): Bachelor's in Interdisciplinary Studies: Sustainable Fashion & Culture. Graduated Summa Cum Laude (highest honors) with a 3.9/4.0 GPA, studying marketing, sustainable fashion, and dance.
- Professional Experience:
  1. Content Creator & Social Media Marketing Intern — Stila Cosmetics, New York, NY (2024–2026): Developed Instagram posts generating 2 million views and increased engagement by 111% compared to pre-internship metrics. Created the 2nd-highest-performing TikTok ad in company history. Directed a social media content shoot including model casting and video editing. Conducted and presented monthly social media analysis to the CMO and marketing team.
  2. Director of Event Operations — AltKey Sustainable Fashion Organization, Atlanta, GA (2022–2025): Created social media content including informational graphics and videos. Produced and choreographed a sustainable fashion show featuring 15 models and 100+ attendees, recruiting and coordinating outside independent designers, judges, and models. Organized pop-up thrift shops and upcycling workshops.
  3. Intern Coordinator & Executive Assistant — Repurpose, New York, NY (Summer 2023): Led a team of 15 interns, delegating tasks and ensuring high-standard timely delivery. Oversaw donation intake operations from item selection and price research to Shopify management and data entry. Coordinated visual merchandising and marketing initiatives aligned with brand standards. Acted as primary point of contact for business partners.
  4. Store Manager & Product Developer — Eden Pond Swim + Leisure, Concord, MA (2020–2021): Developed product designs in collaboration with an international artist. Created and implemented an inventory system. Led personal styling appointments for customers of all ages, selling over $25,000 of merchandise.
- Skills: Strategy & branding, social analytics, social media content creation, creative direction, customer service & sales; platforms including Meta, TikTok, YouTube, X, Pinterest, LinkedIn, Canva, CapCut, Shopify, Klaviyo, Microsoft Office, Google Suite, and AI tools (ChatGPT, Gemini, Claude).
- Languages: English (native), French (B2).
- Personal Interests: Dance, guitar, sustainability, football, art, crafting, and creativity.
- Contact: Email lilyhollenberg@gmail.com, Phone 07 49 69 16 75, LinkedIn linkedin.com/in/lily-hollenberg.

If asked something not covered in Lily's profile, politely let the visitor know you don't have that specific detail on hand and invite them to reach out to Lily directly at lilyhollenberg@gmail.com.`;

async function startServer() {
  const app = express();
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
