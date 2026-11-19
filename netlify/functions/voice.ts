import { GoogleGenAI } from '@google/genai';
import { LIL_SYSTEM_INSTRUCTION } from '../../api/voice';

interface VoiceRequestBody {
  text?: string;
  audio?: string;
  mimeType?: string;
  history?: Array<{ role: 'user' | 'lil'; text: string }>;
}

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const rawApiKey = process.env.GEMINI_API_KEY ?? '';
  const apiKey = rawApiKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return jsonResponse(500, {
      error:
        'GEMINI_API_KEY is missing or invalid. Please set a valid Gemini API key in Netlify Site configuration > Environment variables and redeploy.',
    });
  }

  try {
    const body = (await req.json()) as VoiceRequestBody;
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
      return jsonResponse(400, {
        error: 'No speech or text was detected. Please try again.',
      });
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
      return jsonResponse(500, {
        error: 'Lil could not generate a response. Please try again.',
      });
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

    return jsonResponse(200, {
      userText,
      replyText,
      audioBase64,
      mimeType: 'audio/wav',
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Voice service request failed.';
    return jsonResponse(500, { error: message });
  }
};
