import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

export const LIL_SYSTEM_INSTRUCTION = `You are Lil, Lily Hollenberg's personal voice assistant.

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

interface VoiceRequestBody {
  text?: string;
  audio?: string;
  mimeType?: string;
  history?: Array<{ role: 'user' | 'lil'; text: string }>;
}

interface VercelLikeRequest extends IncomingMessage {
  body?: VoiceRequestBody | string;
}

interface VercelLikeResponse extends ServerResponse {
  status?: (code: number) => VercelLikeResponse;
  json?: (data: unknown) => void;
}

function sendJson(res: VercelLikeResponse, statusCode: number, data: unknown) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const next = res.status(statusCode);
    if (typeof next.json === 'function') {
      next.json(data);
      return;
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function readBody(req: VercelLikeRequest): Promise<VoiceRequestBody> {
  if (req.body) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body) as VoiceRequestBody;
    }
    return req.body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as VoiceRequestBody) : {};
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      error:
        'GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY in your environment variables.',
    });
    return;
  }

  try {
    const body = await readBody(req);
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let userText = (body.text ?? '').trim();

    if (!userText && body.audio) {
      const transcribeRes = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: body.mimeType || 'audio/webm',
                data: body.audio,
              },
            },
            { text: 'Transcribe this audio accurately in its original language.' },
          ],
        },
      });
      userText = (transcribeRes.text ?? '').trim();
    }

    if (!userText) {
      sendJson(res, 400, { error: 'No speech or text was detected. Please try again.' });
      return;
    }

    const historyTurns = (body.history ?? []).slice(-10).map((entry) => ({
      role: entry.role === 'lil' ? 'model' : 'user',
      parts: [{ text: entry.text }],
    }));

    const replyRes = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        ...historyTurns,
        { role: 'user', parts: [{ text: userText }] },
      ],
      config: {
        systemInstruction: LIL_SYSTEM_INSTRUCTION,
      },
    });

    const replyText = (replyRes.text ?? '').trim();
    if (!replyText) {
      sendJson(res, 500, { error: 'Lil could not generate a response. Please try again.' });
      return;
    }

    const ttsRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: replyText,
              speechMetadata: {
                style:
                  'Calm, grounded, understated 25-year-old female professional from Acton, Massachusetts, even-toned and natural',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioBase64 =
      ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? '';

    sendJson(res, 200, {
      userText,
      replyText,
      audioBase64,
      mimeType: 'audio/wav',
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Voice service request failed.';
    sendJson(res, 500, { error: message });
  }
}
