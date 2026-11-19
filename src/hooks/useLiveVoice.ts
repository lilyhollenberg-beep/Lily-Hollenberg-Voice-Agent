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

export function useLiveVoice() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
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
    setIsSpeaking(false);
  }, []);

  const cleanup = useCallback(() => {
    stopOutputPlayback();

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
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
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

  const playAudioChunk = useCallback((base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const float32 = base64ToFloat32(base64);
    if (float32.length === 0) return;

    // Compute RMS for output visualization
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

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.error) {
              setError(msg.error);
              cleanup();
              setStatus('error');
              return;
            }
            if (msg.ready) {
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
          setError('Connection to voice service failed. Please try again.');
          cleanup();
          setStatus('error');
        };

        ws.onclose = () => {
          cleanup();
          setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
        };

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) return;
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);

          // Update subtle mic level when Lil is not speaking
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
    [status, cleanup, appendTranscript, playAudioChunk, stopOutputPlayback]
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
      if (status === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
        appendTranscript('user', text);
        wsRef.current.send(JSON.stringify({ text }));
      } else if (status === 'idle' || status === 'error') {
        connect(text);
      }
    },
    [status, appendTranscript, connect]
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
    audioLevel,
    error,
    transcript,
    connect,
    disconnect,
    toggleMute,
    sendTextPrompt,
    clearTranscript,
  };
}
