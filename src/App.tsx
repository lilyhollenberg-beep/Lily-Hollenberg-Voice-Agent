import { useState } from 'react';
import { Mic, MicOff, PhoneOff, ArrowUpRight, Mail, Phone, FileText } from 'lucide-react';
import { useLiveVoice } from './hooks/useLiveVoice';
import {
  CAPABILITIES,
  EDUCATION,
  EXPERIENCE,
  KEY_METRICS,
  STARTER_PROMPTS,
} from './data/profile';

const WAVE_MULTIPLIERS = [0.45, 0.75, 1.0, 0.85, 0.6, 0.95, 0.7, 0.5, 0.35];

export default function App() {
  const {
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
  } = useLiveVoice();

  const [imgError, setImgError] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState('');

  const isActive = status === 'connected';
  const isConnecting = status === 'connecting';
  const isVisualActive = isActive || isRecordingTurn || isSpeaking;

  const handlePrimaryVoiceAction = () => {
    if (isRecordingTurn) {
      stopServerlessRecording();
    } else if (isActive || isConnecting) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1C1917] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E7E0D5]">
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-editorial text-2xl font-medium tracking-tight text-[#1C1917] whitespace-nowrap shrink-0"
          >
            Lily Hollenberg
          </a>

          <nav className="hidden md:flex items-center gap-8 text-sm text-[#6B645C]">
            <a
              href="#assistant"
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0"
            >
              Voice Assistant
            </a>
            <a
              href="#experience"
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0"
            >
              Experience
            </a>
            <a
              href="#education"
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0"
            >
              Education
            </a>
            <a
              href="#contact"
              className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePrimaryVoiceAction}
              disabled={isProcessingTurn}
              className="px-4 py-2 text-xs font-medium tracking-wide bg-[#1C1917] text-[#FAF7F2] rounded-md hover:bg-[#332E2A] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1917]"
            >
              {isRecordingTurn
                ? 'Stop & Send'
                : isActive
                  ? 'End Session'
                  : isConnecting
                    ? 'Connecting...'
                    : isProcessingTurn
                      ? 'Responding...'
                      : 'Speak with Lil'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section
          id="assistant"
          className="max-w-[1200px] mx-auto px-6 md:px-10 pt-12 pb-16 md:pt-16 md:pb-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-stretch">
            {/* Left Column: Editorial Intro + Live Voice Interface */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <p className="text-xs tracking-[0.14em] uppercase text-[#6B645C] mb-4">
                  Paris · Boston · English &amp; Français
                </p>

                <h1 className="font-editorial text-[clamp(2.5rem,4.5vw,4rem)] leading-[1.06] font-normal tracking-tight text-[#1C1917] text-balance mb-5">
                  Meet Lil, Lily’s bilingual voice assistant.
                </h1>

                <p className="text-[15px] leading-relaxed text-[#57514A] max-w-[54ch] mb-8">
                  Speak naturally in English or French. Lil represents Lily Hollenberg—M1
                  Luxury Communication &amp; Media Strategy student at Sup de Pub in Paris,
                  Summa Cum Laude Emory graduate, and former Stila Cosmetics content creator
                  seeking an international alternance.
                </p>
              </div>

              {/* Minimalistic Voice Console */}
              <div className="bg-[#F3EEE6] border border-[#E7E0D5] rounded-xl p-6 md:p-7">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E7E0D5]">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePrimaryVoiceAction}
                      disabled={isConnecting || isProcessingTurn}
                      className={`inline-flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1917] ${
                        isActive || isRecordingTurn
                          ? 'bg-[#7F2D24] text-[#FAF7F2] hover:bg-[#69231B]'
                          : 'bg-[#1C1917] text-[#FAF7F2] hover:bg-[#332E2A] disabled:opacity-60'
                      }`}
                    >
                      {isRecordingTurn ? (
                        <>
                          <PhoneOff className="w-4 h-4" />
                          <span>Stop &amp; send</span>
                        </>
                      ) : isActive ? (
                        <>
                          <PhoneOff className="w-4 h-4" />
                          <span>End conversation</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          <span>
                            {isConnecting
                              ? 'Connecting to Lil...'
                              : isProcessingTurn
                                ? 'Lil is responding...'
                                : 'Start voice conversation'}
                          </span>
                        </>
                      )}
                    </button>

                    {isActive && (
                      <button
                        type="button"
                        onClick={toggleMute}
                        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-md border border-[#D9D0C3] bg-[#FAF7F2] text-[#1C1917] hover:bg-[#EFE9DF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        <span>{isMuted ? 'Muted' : 'Mute'}</span>
                      </button>
                    )}
                  </div>

                  {/* Subtle Live Audio Visualizer */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#6B645C] whitespace-nowrap">
                      {isRecordingTurn
                        ? 'Listening — click Stop & send'
                        : isProcessingTurn
                          ? 'Thinking'
                          : isSpeaking
                            ? 'Lil is speaking'
                            : isActive
                              ? isMuted
                                ? 'Microphone muted'
                                : 'Listening'
                              : isConnecting
                                ? 'Preparing voice'
                                : 'Ready in EN & FR'}
                    </span>
                    <div
                      className="flex items-center gap-1 h-6"
                      aria-hidden="true"
                    >
                      {WAVE_MULTIPLIERS.map((mult, idx) => {
                        const heightPct = isVisualActive
                          ? Math.max(18, Math.min(100, Math.round(audioLevel * 100 * mult) + 18))
                          : 18;
                        return (
                          <span
                            key={idx}
                            style={{ transform: `scaleY(${heightPct / 100})` }}
                            className={`w-[2px] h-6 rounded-full origin-center transition-transform duration-100 ${
                              isVisualActive ? 'bg-[#1C1917]' : 'bg-[#C9BFB0]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="mt-4 text-sm text-[#7F2D24] bg-[#FAF7F2] border border-[#E2C6C2] rounded-md px-4 py-2.5"
                  >
                    {error}
                  </p>
                )}

                {/* Quick Bilingual Prompts */}
                <div className="pt-5">
                  <p className="text-xs text-[#6B645C] mb-3">
                    Or ask Lil in English or French
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draftQuestion.trim() || isProcessingTurn) return;
                      sendTextPrompt(draftQuestion);
                      setDraftQuestion('');
                    }}
                    className="flex items-center gap-2 mb-3"
                  >
                    <input
                      type="text"
                      value={draftQuestion}
                      onChange={(e) => setDraftQuestion(e.target.value)}
                      placeholder="Type a question for Lil (EN / FR)..."
                      aria-label="Type a question for Lil"
                      className="flex-1 min-w-0 px-3.5 py-2 text-sm rounded-md bg-[#FAF7F2] border border-[#E7E0D5] text-[#1C1917] placeholder:text-[#8C7E6D] focus:outline-none focus:border-[#1C1917]"
                    />
                    <button
                      type="submit"
                      disabled={!draftQuestion.trim() || isProcessingTurn}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-[#1C1917] text-[#FAF7F2] hover:bg-[#332E2A] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Ask
                    </button>
                  </form>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {STARTER_PROMPTS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        disabled={isProcessingTurn}
                        onClick={() => sendTextPrompt(item.prompt)}
                        className="text-left px-3.5 py-2.5 rounded-md bg-[#FAF7F2] border border-[#E7E0D5] hover:border-[#C9BFB0] disabled:opacity-60 transition-colors cursor-pointer group"
                      >
                        <span className="text-[11px] font-medium text-[#8C7E6D] mr-2">
                          {item.lang}
                        </span>
                        <span className="text-[13px] text-[#1C1917] group-hover:underline underline-offset-2">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Transcript */}
                {transcript.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-[#E7E0D5]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-[#6B645C]">Conversation transcript</span>
                      <button
                        type="button"
                        onClick={clearTranscript}
                        className="text-xs text-[#6B645C] hover:text-[#1C1917] underline underline-offset-2 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                      {transcript.map((entry) => (
                        <div key={entry.id} className="text-sm leading-relaxed">
                          <span className="font-medium text-[#1C1917] mr-2">
                            {entry.role === 'lil' ? 'Lil:' : 'You:'}
                          </span>
                          <span className="text-[#57514A]">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Lily's Headshot */}
            <div className="lg:col-span-5 flex flex-col">
              <div className="relative flex-1 min-h-[380px] lg:min-h-0 rounded-xl overflow-hidden bg-[#EFE9DF] border border-[#E7E0D5]">
                {!imgError ? (
                  <img
                    src="/assets/aistudio/Headshot_729f69f8.jpeg"
                    alt="Portrait headshot of Lily Hollenberg"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                    <span className="font-editorial text-4xl text-[#1C1917] mb-2">LH</span>
                    <span className="text-xs text-[#6B645C]">Lily Hollenberg</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[#6B645C]">
                <span>Lily Hollenberg · Sup de Pub Paris</span>
                <a
                  href="/assets/aistudio/HollenbergLilyM.CV__1__2eb2eaf2.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#1C1917] hover:underline underline-offset-4 whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View CV (PDF)</span>
                </a>
              </div>
            </div>
          </div>

          {/* Full-width Key Metrics Row */}
          <div className="mt-14 pt-8 border-t border-[#E7E0D5] grid grid-cols-2 lg:grid-cols-4 gap-8">
            {KEY_METRICS.map((metric) => (
              <div key={metric.label}>
                <p className="font-editorial text-3xl md:text-4xl text-[#1C1917] tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-1.5 text-xs text-[#6B645C] leading-relaxed">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Experience Section */}
        <section
          id="experience"
          className="border-t border-[#E7E0D5] bg-[#F5F0E8]/60 py-16 md:py-24"
        >
          <div className="max-w-[1200px] mx-auto px-6 md:px-10">
            <div className="max-w-2xl mb-12">
              <p className="text-xs tracking-[0.14em] uppercase text-[#6B645C] mb-3">
                Selected Experience
              </p>
              <h2 className="font-editorial text-3xl md:text-4xl font-normal text-[#1C1917]">
                Beauty, sustainable fashion, and brand storytelling.
              </h2>
            </div>

            <div className="divide-y divide-[#E7E0D5] border-t border-b border-[#E7E0D5]">
              {EXPERIENCE.map((item) => (
                <article
                  key={`${item.organization}-${item.period}`}
                  className="py-8 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8"
                >
                  <div className="md:col-span-4">
                    <h3 className="font-editorial text-2xl text-[#1C1917]">
                      {item.organization}
                    </h3>
                    <p className="mt-1 text-xs text-[#6B645C]">
                      {item.location} · {item.period}
                    </p>
                  </div>
                  <div className="md:col-span-8">
                    <p className="text-sm font-medium text-[#1C1917] mb-3">
                      {item.role}
                    </p>
                    <ul className="space-y-2 text-sm text-[#57514A] leading-relaxed">
                      {item.highlights.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Education & Capabilities */}
        <section id="education" className="py-16 md:py-24">
          <div className="max-w-[1200px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-12 gap-14">
            <div className="lg:col-span-6">
              <p className="text-xs tracking-[0.14em] uppercase text-[#6B645C] mb-3">
                Education
              </p>
              <h2 className="font-editorial text-3xl md:text-4xl font-normal text-[#1C1917] mb-8">
                Academic foundation.
              </h2>
              <div className="space-y-8">
                {EDUCATION.map((edu) => (
                  <div
                    key={edu.institution}
                    className="pb-8 border-b border-[#E7E0D5] last:border-b-0 last:pb-0"
                  >
                    <p className="text-xs text-[#6B645C] mb-1">
                      {edu.institution} · {edu.location} · {edu.period}
                    </p>
                    <h3 className="font-editorial text-2xl text-[#1C1917]">
                      {edu.degree}
                    </h3>
                    {edu.note && (
                      <p className="mt-2 text-sm text-[#57514A] leading-relaxed">
                        {edu.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6">
              <p className="text-xs tracking-[0.14em] uppercase text-[#6B645C] mb-3">
                Capabilities &amp; Interests
              </p>
              <h2 className="font-editorial text-3xl md:text-4xl font-normal text-[#1C1917] mb-8">
                Tools, languages, and craft.
              </h2>
              <div className="space-y-6">
                {CAPABILITIES.map((cap) => (
                  <div
                    key={cap.group}
                    className="pb-6 border-b border-[#E7E0D5] last:border-b-0 last:pb-0"
                  >
                    <p className="text-sm font-medium text-[#1C1917] mb-1.5">
                      {cap.group}
                    </p>
                    <p className="text-sm text-[#57514A] leading-relaxed">
                      {cap.items}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Contact Footer */}
      <footer id="contact" className="border-t border-[#E7E0D5] bg-[#F3EEE6]/70">
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-14 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
          <div>
            <p className="text-xs tracking-[0.14em] uppercase text-[#6B645C] mb-3">
              Contact
            </p>
            <h2 className="font-editorial text-3xl md:text-4xl font-normal text-[#1C1917] mb-3">
              Open for Paris alternance opportunities.
            </h2>
            <p className="text-sm text-[#57514A] max-w-md">
              2-week enterprise / 1-week school rhythm in luxury communication, media
              strategy, fashion, beauty, or culture.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 text-sm text-[#1C1917]">
            <a
              href="mailto:lilyhollenberg@gmail.com"
              className="inline-flex items-center gap-2 hover:underline underline-offset-4 whitespace-nowrap"
            >
              <Mail className="w-4 h-4 text-[#6B645C]" />
              <span>lilyhollenberg@gmail.com</span>
            </a>
            <a
              href="tel:+33749691675"
              className="inline-flex items-center gap-2 hover:underline underline-offset-4 whitespace-nowrap tabular-nums"
            >
              <Phone className="w-4 h-4 text-[#6B645C]" />
              <span>07 49 69 16 75</span>
            </a>
            <a
              href="https://www.linkedin.com/in/lily-hollenberg"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline underline-offset-4 whitespace-nowrap"
            >
              <span>LinkedIn</span>
              <ArrowUpRight className="w-4 h-4 text-[#6B645C]" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
