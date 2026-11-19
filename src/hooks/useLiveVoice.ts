import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'lil';
  text: string;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.floor(input.length / ratio);
  const out = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    const s = Math.max(-1, Math.min(1, avg));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export function useLiveVoice() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecordingTurn, setIsRecordingTurn] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const pendingPromptRef = useRef<string | null>(null);
  const useServerlessRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const levelIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const stopOutputPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Already stopped
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current.src = '';
      htmlAudioRef.current = null;
    }
    if (levelIntervalRef.current !== null) {
      window.clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }

    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  const cleanup = useCallback(() => {
    stopOutputPlayback();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecordingTurn(false);
    setIsProcessingTurn(false);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    setAudioLevel(0);
    setIsSpeaking(false);
  }, [stopOutputPlayback]);

  const disconnect = useCallback(() => {
    pendingPromptRef.current = null;
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  const appendTranscript = useCallback((role: 'user' | 'lil', chunk: string) => {
    if (!chunk) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${chunk}`,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text: chunk.trimStart(),
        },
      ];
    });
  }, []);

  const addFullTurn = useCallback((role: 'user' | 'lil', text: string) => {
    if (!text.trim()) return;
    setTranscript((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role,
        text: text.trim(),
      },
    ]);
  }, []);

  const playWavBase64 = useCallback(
    async (base64: string, mimeType = 'audio/wav') => {
      if (!base64) return;
      stopOutputPlayback();
      const audio = new Audio(`data:${mimeType};base64,${base64}`);
      htmlAudioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        levelIntervalRef.current = window.setInterval(() => {
          setAudioLevel(0.28 + Math.random() * 0.42);
        }, 110);
      };
      audio.onended = () => {
        stopOutputPlayback();
      };
      audio.onerror = () => {
        stopOutputPlayback();
      };

      try {
        await audio.play();
      } catch {
        stopOutputPlayback();
      }
    },
    [stopOutputPlayback]
  );

  const sendServerlessTurn = useCallback(
    async (payload: { text?: string; audio?: string; mimeType?: string }) => {
      setError(null);
      setIsProcessingTurn(true);
      try {
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            history: transcriptRef.current.slice(-10).map((t) => ({
              role: t.role,
              text: t.text,
            })),
          }),
        });
        const rawText = await res.text();
        let data: {
          error?: string;
          userText?: string;
          replyText?: string;
          audioBase64?: string;
          mimeType?: string;
        } = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          throw new Error(
            'Voice service endpoint is unavailable. Please ensure the serverless function is deployed and GEMINI_API_KEY is set.'
          );
        }
        if (!res.ok) {
          throw new Error(data.error || 'Voice service request failed.');
        }

        if (payload.audio && data.userText) {
          addFullTurn('user', data.userText);
        }
        if (data.replyText) {
          addFullTurn('lil', data.replyText);
        }
        if (data.audioBase64) {
          await playWavBase64(data.audioBase64, data.mimeType || 'audio/wav');
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unable to reach voice service.';
        setError(message);
      } finally {
        setIsProcessingTurn(false);
      }
    },
    [addFullTurn, playWavBase64]
  );

  const startServerlessRecording = useCallback(async () => {
    setError(null);
    stopOutputPlayback();
    try {
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }));
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecordingTurn(false);
        if (levelIntervalRef.current !== null) {
          window.clearInterval(levelIntervalRef.current);
          levelIntervalRef.current = null;
        }
        setAudioLevel(0);

        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        recordedChunksRef.current = [];
        if (blob.size < 200) return;

        const base64 = await blobToBase64(blob);
        const cleanMime = (recorder.mimeType || 'audio/webm').split(';')[0];
        await sendServerlessTurn({ audio: base64, mimeType: cleanMime });
      };

      recorder.start();
      setIsRecordingTurn(true);
      setStatus('idle');
      levelIntervalRef.current = window.setInterval(() => {
        setAudioLevel(0.2 + Math.random() * 0.45);
      }, 120);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone permissions to speak with Lil.'
          : err instanceof Error
            ? err.message
            : 'Unable to access microphone.';
      setError(message);
      setStatus('error');
    }
  }, [sendServerlessTurn, stopOutputPlayback]);

  const stopServerlessRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const playAudioChunk = useCallback((base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const float32 = base64ToFloat32(base64);
    if (float32.length === 0) return;

    let sum = 0;
    for (let i = 0; i < float32.length; i += 4) {
      sum += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sum / (float32.length / 4));
    setAudioLevel(Math.min(1, rms * 3.2));

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsSpeaking(false);
        setAudioLevel(0);
      }
    };
  }, []);

  const connect = useCallback(
    async (initialPrompt?: string) => {
      if (status === 'connecting' || status === 'connected') return;

      // If we already know WebSockets are unavailable (e.g. Vercel serverless), use HTTP voice mode directly
      if (useServerlessRef.current) {
        if (initialPrompt) {
          addFullTurn('user', initialPrompt);
          await sendServerlessTurn({ text: initialPrompt });
        } else {
          await startServerlessRecording();
        }
        return;
      }

      setError(null);
      setStatus('connecting');
      if (initialPrompt) {
        pendingPromptRef.current = initialPrompt;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        await inputCtx.resume();
        await outputCtx.resume();
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
        wsRef.current = ws;

        let becameReady = false;
        let fellBack = false;

        const triggerServerlessFallback = () => {
          if (fellBack || becameReady) return;
          fellBack = true;
          useServerlessRef.current = true;
          const savedPrompt = pendingPromptRef.current;
          pendingPromptRef.current = null;
          cleanup();
          setStatus('idle');
          if (savedPrompt) {
            addFullTurn('user', savedPrompt);
            void sendServerlessTurn({ text: savedPrompt });
          } else {
            void startServerlessRecording();
          }
        };

        const connectTimeout = window.setTimeout(() => {
          if (!becameReady) {
            triggerServerlessFallback();
          }
        }, 3000);

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.error) {
              window.clearTimeout(connectTimeout);
              setError(msg.error);
              cleanup();
              setStatus('error');
              return;
            }
            if (msg.ready) {
              becameReady = true;
              window.clearTimeout(connectTimeout);
              setStatus('connected');
              if (pendingPromptRef.current) {
                const promptToSend = pendingPromptRef.current;
                pendingPromptRef.current = null;
                appendTranscript('user', promptToSend);
                ws.send(JSON.stringify({ text: promptToSend }));
              }
            }
            if (msg.audio) {
              playAudioChunk(msg.audio);
            }
            if (msg.inputTranscript) {
              appendTranscript('user', msg.inputTranscript);
            }
            if (msg.outputTranscript) {
              appendTranscript('lil', msg.outputTranscript);
            }
            if (msg.interrupted) {
              stopOutputPlayback();
            }
            if (msg.closed) {
              cleanup();
              setStatus('idle');
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = () => {
          window.clearTimeout(connectTimeout);
          if (!becameReady) {
            triggerServerlessFallback();
          } else {
            setError('Connection to voice service interrupted. Please try again.');
            cleanup();
            setStatus('error');
          }
        };

        ws.onclose = () => {
          window.clearTimeout(connectTimeout);
          if (!becameReady) {
            triggerServerlessFallback();
          } else {
            cleanup();
            setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
          }
        };

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);

          if (activeSourcesRef.current.size === 0) {
            let sum = 0;
            for (let i = 0; i < inputData.length; i += 8) {
              sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / (inputData.length / 8));
            setAudioLevel(Math.min(1, rms * 4));
          }

          const pcm16 = downsampleTo16k(inputData, inputCtx.sampleRate);
          const base64 = int16ToBase64(pcm16);
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Microphone access was denied. Please allow microphone permissions to speak with Lil.'
            : err instanceof Error
              ? err.message
              : 'Unable to start voice session.';
        setError(message);
        cleanup();
        setStatus('error');
      }
    },
    [
      status,
      cleanup,
      appendTranscript,
      addFullTurn,
      playAudioChunk,
      stopOutputPlayback,
      sendServerlessTurn,
      startServerlessRecording,
    ]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  const sendTextPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (status === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
        appendTranscript('user', trimmed);
        wsRef.current.send(JSON.stringify({ text: trimmed }));
      } else {
        addFullTurn('user', trimmed);
        void sendServerlessTurn({ text: trimmed });
      }
    },
    [status, appendTranscript, addFullTurn, sendServerlessTurn]
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    isMuted,
    isSpeaking,
    isRecordingTurn,
    isProcessingTurn,
    audioLevel,
    error,
    transcript,
    connect,
    disconnect,
    toggleMute,
    stopServerlessRecording,
    sendTextPrompt,
    clearTranscript,
  };
}
