import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, MessageSquare, Search, Bot, Mic, History } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatHistoryPanel } from './ChatHistoryPanel';
import { streamChat } from '../lib/llm';
import { filterHospitals, getCardLabel, getAllSpecialities } from '../lib/filterHospitals';
import { getCurrentPosition, pincodeToCoords, cityToCoords } from '../lib/geocode';
import {
  getCurrentChatSession,
  saveChatMessages,
  logActivity,
  createChatSession,
  getChatSessionList,
  switchChatSession,
  deleteChatSession,
} from '../lib/storage';
import type {
  ChatMode,
  ChatMessage as ChatMessageType,
  HospitalFSMState,
  MapAction,
  CardType,
  UserLocation,
  FilteredHospital,
  LLMMessage,
  ChatSession,
} from '../types';

interface ChatPanelProps {
  userName: string;
  onMapAction: (action: MapAction) => void;
  onHospitalSelect: (h: FilteredHospital | null) => void;
  onMessagesChange?: (messages: ChatMessageType[], llmContext?: LLMMessage[]) => void;
}

// ─── System prompt for the local LLM ───────────────────────────

const SYSTEM_PROMPT = `You are SwasthSetu, an AI health assistant for Indian users. You are knowledgeable about:

1. **Medicines** — uses, common side effects, drug interactions, general dosage guidelines, and when to consult a doctor. Always remind users to consult a qualified healthcare professional before starting or changing any medication.

2. **Government Health Schemes** — MAA Card (Mahila Arogya Sakhi, Gujarat) and Ayushman Bharat (PMJAY) — what they cover, eligibility, and how to use them.

3. **General Health** — first aid, when to seek emergency care (call 108), nutrition tips, and guidance on when to visit a hospital.

4. **Hospital Search** — the app has a built-in hospital finder. When the user asks about finding nearby hospitals, tell them to tap the \"🏥 Find Hospitals\" button, or provide a brief answer and suggest using the hospital finder.

Guidelines:
- Be concise and practical. Use bullet points when helpful.
- If the user asks about finding nearby hospitals, suggest they tap the \"🏥 Find Hospitals\" button.
- For emergencies (chest pain, severe bleeding, unconsciousness, difficulty breathing), immediately tell them to call 108 and suggest using the hospital finder.
- Respond in the same language the user uses (English, Hindi, Hinglish, or other Indian languages).
- Never prescribe specific treatments — always recommend consulting a doctor.
- Format medicine information clearly: generic name, common uses, key side effects, when to avoid.
- Keep responses focused and not overly long unless the user asks for detail.`;

// English + Hindi/Hinglish emergency keywords. The system prompt promises
// the AI responds in Hindi/Hinglish, so emergency detection needs to
// recognize it too — a person typing "seene mein dard" or "behosh ho gaya"
// during a real emergency was previously getting no 108/hospital response.
const EMERGENCY_RE =
  /chest pain|unconscious|severe bleeding|stroke|not breathing|accident|seene mein dard|chest me dard|behosh|behoshi|saans nahi|saans nhi|khoon beh raha|zyada khoon|dil ka dora|heart attack|paralysis|lakwa|\u0938\u0940\u0928\u0947 \u092e\u0947\u0902 \u0926\u0930\u094d\u0926|\u092c\u0947\u0939\u094b\u0936|\u0916\u0942\u0928 \u092c\u0939 \u0930\u0939\u093e|\u0926\u093f\u0932 \u0915\u093e \u0926\u094c\u0930\u093e|\u0938\u093e\u0902\u0938 \u0928\u0939\u0940\u0902 \u0906 \u0930\u0939\u0940/i;

type TypingIndicator = { id: string; role: 'typing' };

let msgCounter = 0;
function uid(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ userName, onMapAction, onHospitalSelect, onMessagesChange }) => {
  // ─── Mode state ───────────────────────────────────────────
  const [mode, setMode] = useState<ChatMode>('ai_chat');

  // ─── Shared message list (both modes) ────────────────────
  const [messages, setMessages] = useState<(ChatMessageType | TypingIndicator)[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── LLM context (only AI messages, not FSM) ──────────────
  const llmMessagesRef = useRef<LLMMessage[]>([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);

  // ─── Hospital FSM state ──────────────────────────────────
  const [fsmState, setFsmState] = useState<HospitalFSMState>('greet');
  const [cardType, setCardType] = useState<CardType>('none');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);

  // ─── Chat history (past sessions) ─────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const GREETING_TEXT =
    "Namaste 🙏 I'm SwasthSetu, your AI health assistant. I can help you with:\n\n• **Medicine information** — uses, side effects, interactions\n• **Hospital search** — find nearby scheme hospitals on the map\n• **Health guidance** — first aid, when to see a doctor\n\nAsk me anything, or tap below to find hospitals.";

  // ─── Auto-scroll ─────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, streamingText]);
  // ─── Abort stream on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ─── Load saved chat on mount ─────────────────────────────
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return; // StrictMode double-invokes this in dev
    didInitRef.current = true;

    const saved = getCurrentChatSession();
    if (saved && saved.messages.length > 0) {
      setMessages(saved.messages);
      setActiveSessionId(saved.id);
      if (saved.llmContext?.length) {
        llmMessagesRef.current = saved.llmContext;
      }
    } else {
      if (saved) setActiveSessionId(saved.id);
      addBotMessage(GREETING_TEXT, ['🏥 Find Hospitals']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Persist messages on change ──────────────────────────
  useEffect(() => {
    const real = messages.filter((m) => m.role !== 'typing') as ChatMessageType[];
    if (real.length > 0) {
      saveChatMessages(real, llmMessagesRef.current);
      onMessagesChange?.(real, llmMessagesRef.current);
    }
  }, [messages, onMessagesChange]);

  // ─── Helper: add bot message ─────────────────────────────
  const addBotMessage = useCallback(
    async (text: string, quickReplies?: string[]) => {
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== 'typing'),
        {
          id: uid(),
          role: 'bot',
          text,
          quickReplies,
          timestamp: Date.now(),
        } as ChatMessageType,
      ]);
    },
    [],
  );

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev.filter((m) => m.role !== 'typing'),
      { id: uid(), role: 'user', text, timestamp: Date.now() } as ChatMessageType,
    ]);
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  CHAT HISTORY — past sessions (browse / switch / new / delete)
  // ═══════════════════════════════════════════════════════════

  /** Reset all per-session UI state (message list, LLM context, hospital
   *  FSM, map/hospital selection) to a clean slate — used both when
   *  switching to another saved session and when starting a new one. */
  const resetSessionUiState = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText('');
    setMode('ai_chat');
    setFsmState('greet');
    setCardType('none');
    setUserLocation(null);
    setRadiusKm(25);
    onMapAction({ type: 'clear_markers' });
    onHospitalSelect(null);
  }, [onMapAction, onHospitalSelect]);

  const openHistory = useCallback(() => {
    setSessionList(getChatSessionList());
    setShowHistory(true);
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) {
        setShowHistory(false);
        return;
      }
      const session = switchChatSession(sessionId);
      if (!session) return;

      resetSessionUiState();
      setActiveSessionId(session.id);
      setMessages(session.messages);
      llmMessagesRef.current = session.llmContext?.length
        ? session.llmContext
        : [{ role: 'system', content: SYSTEM_PROMPT }];
      setShowHistory(false);
      logActivity('section_switch', `resumed chat ${session.id}`);
    },
    [activeSessionId, resetSessionUiState],
  );

  const handleNewChat = useCallback(() => {
    resetSessionUiState();
    const session = createChatSession();
    setActiveSessionId(session.id);
    llmMessagesRef.current = [{ role: 'system', content: SYSTEM_PROMPT }];
    setMessages([]);
    addBotMessage(GREETING_TEXT, ['🏥 Find Hospitals']);
    setShowHistory(false);
  }, [resetSessionUiState, addBotMessage]);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      deleteChatSession(sessionId);
      const remaining = getChatSessionList();
      setSessionList(remaining);

      if (sessionId === activeSessionId) {
        // The active session was deleted — move to the most recently
        // updated remaining one, or start fresh if none are left.
        const next = [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (next) {
          handleSelectSession(next.id);
        } else {
          handleNewChat();
        }
      }
    },
    [activeSessionId, handleSelectSession, handleNewChat],
  );

  // ═══════════════════════════════════════════════════════════
  //  EMERGENCY HANDLER (shared)
  // ═══════════════════════════════════════════════════════════

  const handleEmergencyFromChat = useCallback(async (triggerText?: string) => {
    logActivity('emergency_trigger', triggerText || 'unknown');
    setCardType('none');
    await addBotMessage(
      '🚨 This sounds like an emergency. **Call 108 immediately.**\n\nShowing the nearest emergency hospital on the map.',
    );
    const emergencyResults = filterHospitals({
      lat: 23.0225,
      lon: 72.5714,
      cardType: 'none',
      radiusKm: 50,
      emergencyOnly: true,
    });
    if (emergencyResults.length > 0) {
      const nearest = emergencyResults[0];
      onMapAction({
        type: 'show_markers',
        hospitals: emergencyResults,
        center: { lat: nearest.lat, lon: nearest.lon },
      });
      onHospitalSelect(nearest);
      await addBotMessage(
        `Nearest emergency: **${nearest.name}** (${nearest.distanceKm.toFixed(1)} km). Tap the marker for directions.`,
        ['🏥 Find Hospitals', 'Ask AI'],
      );
    }
  }, [addBotMessage, onMapAction, onHospitalSelect]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  AI CHAT MODE — streaming LLM
  // ═══════════════════════════════════════════════════════════

  const handleLLMSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;
  
      if (EMERGENCY_RE.test(text)) {
        addUserMessage(text);
        await handleEmergencyFromChat(text);
        return;
      }
  
      addUserMessage(text);
      setInputText('');
      setIsStreaming(true);
      setStreamingText('');
      logActivity('message_sent', text.slice(0, 100));
  
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== 'typing'),
        { id: uid(), role: 'typing' } as TypingIndicator,
      ]);
  
      llmMessagesRef.current.push({ role: 'user', content: text });
  
      const controller = new AbortController();
      abortRef.current = controller;
  
      let accumulated = '';
  
      await streamChat(
        llmMessagesRef.current,
        {
          onToken: (token) => {
            if (accumulated === '') {
              setMessages((prev) => prev.filter((m) => m.role !== 'typing'));
            }
            accumulated += token;
            setStreamingText(accumulated);
          },
          onComplete: (full) => {
            const finalText = full || accumulated;
            setIsStreaming(false);
            setStreamingText('');
            abortRef.current = null;
            logActivity('llm_stream_complete', `${accumulated.length} chars`);
  
            if (finalText) {
              setMessages((prev) => [
                ...prev.filter((m) => m.role !== 'typing'),
                { id: uid(), role: 'bot', text: finalText, timestamp: Date.now() } as ChatMessageType,
              ]);
              llmMessagesRef.current.push({ role: 'assistant', content: finalText });
            } else {
              setMessages((prev) => prev.filter((m) => m.role !== 'typing'));
            }
          },
          onError: (err) => {
            setIsStreaming(false);
            setStreamingText('');
            abortRef.current = null;
            logActivity('llm_error', err.message.slice(0, 100));
  
            setMessages((prev) => [
              ...prev.filter((m) => m.role !== 'typing'),
              {
                id: uid(),
                role: 'bot',
                text: `⚠️ ${err.message}\n\nMake sure llama-server is running:\n\`llama-server -m gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf ...\`\n\nYou can still use the 🏥 Find Hospitals feature while the server is offline.`,
                timestamp: Date.now(),
              } as ChatMessageType,
            ]);
  
            llmMessagesRef.current.pop();
          },
        },
        {},
        controller.signal,
      );
    },
    [isStreaming, addUserMessage, handleEmergencyFromChat],
  );

  // ═══════════════════════════════════════════════════════════
  //  HOSPITAL SEARCH FSM
  // ═══════════════════════════════════════════════════════════

  const startHospitalSearch = useCallback(async () => {
    logActivity('hospital_search', 'Started hospital finder FSM');
    setMode('hospital_search');
    setFsmState('ask_card');
    setCardType('none');
    setUserLocation(null);
    setRadiusKm(25);

    await addBotMessage('Which government health scheme card do you have?', [
      'MAA Card',
      'Ayushman Card',
      'Both',
      'None',
    ]);
  }, [addBotMessage]);

  const handleFSMInput = useCallback(
    async (text: string) => {
      switch (fsmState) {
        case 'ask_card': {
          const t = text.toLowerCase().trim();
          let selected: CardType | null = null;
          if (t.includes('maa') && !t.includes('both')) selected = 'maa';
          else if (t.includes('ayushman') && !t.includes('both')) selected = 'ayushman';
          else if (t.includes('both')) selected = 'both';
          else if (t.includes('none') || t.includes('no card')) selected = 'none';

          if (selected) {
            addUserMessage(text);
            setCardType(selected);
            setFsmState('ask_location');
            await addBotMessage(
              `Got it — ${getCardLabel(selected)}. Where should I search?`,
              ['📍 Share my location', 'Enter pincode', 'Enter city'],
            );
          } else {
            addUserMessage(text);
            await addBotMessage('Please select one of the options:', [
              'MAA Card',
              'Ayushman Card',
              'Both',
              'None',
            ]);
          }
          break;
        }

        case 'ask_location': {
          const t = text.toLowerCase().trim();
          if (t.includes('share') || t.includes('location') || t.includes('gps')) {
            addUserMessage('📍 Share my location');
            await addBotMessage('Getting your location...');
            try {
              const pos = await getCurrentPosition();
              setUserLocation({ coords: { lat: pos.lat, lon: pos.lon }, placeName: pos.placeName, mode: 'gps' });
              await performSearch(pos.lat, pos.lon, pos.placeName);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Location failed.';
              await addBotMessage(msg, ['Enter pincode', 'Enter city']);
            }
          } else if (t.includes('pincode')) {
            addUserMessage(text);
            setFsmState('ask_pincode');
            await addBotMessage('Please type your 6-digit pincode:');
          } else if (t.includes('city')) {
            addUserMessage(text);
            setFsmState('ask_city');
            await addBotMessage('Please type your city name (e.g. Ahmedabad, Surat):');
          } else if (/^\d{5,6}$/.test(text.trim())) {
            addUserMessage(text);
            await handlePincodeLookup(text.trim());
          } else {
            addUserMessage(text);
            await handleCityLookup(text.trim());
          }
          break;
        }

        case 'ask_pincode': {
          addUserMessage(text);
          await handlePincodeLookup(text.trim());
          break;
        }

        case 'ask_city': {
          addUserMessage(text);
          await handleCityLookup(text.trim());
          break;
        }

        case 'results': {
          const t = text.toLowerCase().trim();
          if (t.includes('filter') || t.includes('speciality')) {
            addUserMessage(text);
            setFsmState('ask_speciality');
            const specs = getAllSpecialities();
            await addBotMessage('Which speciality?', specs.slice(0, 6));
          } else if (t.includes('widen') || t.includes('expand') || t.includes('more')) {
            addUserMessage(text);
            if (userLocation) {
              const newRadius = Math.min(radiusKm + 25, 100);
              setRadiusKm(newRadius);
              await performSearch(userLocation.coords.lat, userLocation.coords.lon, userLocation.placeName, newRadius);
            }
          } else {
            // Any other input in results mode → switch back to AI chat
            addUserMessage(text);
            switchToAIChat();
          }
          break;
        }

        case 'ask_speciality': {
          addUserMessage(text);
          if (userLocation) {
            await performSearch(userLocation.coords.lat, userLocation.coords.lon, userLocation.placeName, radiusKm, text.trim());
          }
          break;
        }

        default:
          break;
      }
    },
    [fsmState, cardType, userLocation, radiusKm, addUserMessage, addBotMessage, onMapAction],
  );

  const performSearch = async (
    lat: number,
    lon: number,
    placeName: string,
    radius?: number,
    speciality?: string,
  ) => {
    const r = radius ?? radiusKm;
    setFsmState('searching');
    const specLabel = speciality ? ` (${speciality})` : '';
    await addBotMessage(`Searching for ${getCardLabel(cardType)} hospitals${specLabel} near ${placeName}…`);
    await delay(800);

    const results = filterHospitals({
      lat, lon, cardType, radiusKm: r, speciality,
    });

    setFsmState('results');
    onMapAction({ type: 'show_markers', hospitals: results, center: { lat, lon } });

    if (results.length === 0) {
      await addBotMessage(
        `No ${getCardLabel(cardType)} hospitals found within ${r} km.`,
        ['Widen search', '💬 Ask AI'],
      );
    } else {
      const nearest = results[0];
      await addBotMessage(
        `Found ${results.length} hospital${results.length > 1 ? 's' : ''} within ${r} km.\n\nNearest: 🏥 **${nearest.name}** (${nearest.distanceKm.toFixed(1)} km).\n\nTap any marker on the map for details.`,
        ['Filter by speciality', 'Widen search', '💬 Ask AI'],
      );

      // Add summary to LLM context so AI knows about the search
      const hospitalList = results
        .slice(0, 5)
        .map((h, i) => `${i + 1}. ${h.name} (${h.distanceKm.toFixed(1)} km) — ${h.address}`)
        .join('\n');
      llmMessagesRef.current.push({
        role: 'user',
        content: `[System: User searched for ${getCardLabel(cardType)} hospitals near ${placeName}. Results:\n${hospitalList}]`,
      });
      llmMessagesRef.current.push({
        role: 'assistant',
        content: 'I have the hospital search results. The user can ask me follow-up questions about these hospitals.',
      });
    }
  };

  const handlePincodeLookup = async (pincode: string) => {
    await addBotMessage(`Looking up pincode ${pincode}…`);
    try {
      const result = await pincodeToCoords(pincode);
      setUserLocation({ coords: { lat: result.lat, lon: result.lon }, placeName: result.placeName, mode: 'pincode' });
      await performSearch(result.lat, result.lon, result.placeName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not find that pincode.';
      await addBotMessage(`${msg} Please try again.`, ['Enter city', '💬 Ask AI']);
      setFsmState('ask_location');
    }
  };

  const handleCityLookup = async (city: string) => {
    await addBotMessage(`Looking up ${city}…`);
    try {
      const result = await cityToCoords(city);
      setUserLocation({ coords: { lat: result.lat, lon: result.lon }, placeName: result.placeName, mode: 'city' });
      await performSearch(result.lat, result.lon, result.placeName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not find that city.';
      await addBotMessage(`${msg} Please try again.`, ['Enter pincode', '💬 Ask AI']);
      setFsmState('ask_location');
    }
  };

  // ═══════════════════════════════════════════════════════════
  //  MODE SWITCHING
  // ═══════════════════════════════════════════════════════════

  const switchToAIChat = useCallback(() => {
    setMode('ai_chat');
    setFsmState('greet');
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  UNIFIED INPUT HANDLER
  // ═══════════════════════════════════════════════════════════

  const handleQuickReply = useCallback(
    (reply: string) => {
      // Mode-switching quick replies
      if (reply.includes('Find Hospitals') || reply === '🏥 Find Hospitals') {
        startHospitalSearch();
        return;
      }
      if (reply.includes('Ask AI') || reply === '💬 Ask AI') {
        switchToAIChat();
        return;
      }

      // FSM quick replies
      if (mode === 'hospital_search') {
        handleFSMInput(reply);
        return;
      }

      // AI chat quick replies → treat as text input
      handleLLMSend(reply);
    },
    [mode, handleLLMSend, handleFSMInput, startHospitalSearch, switchToAIChat, addUserMessage],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');

    if (mode === 'hospital_search') {
      handleFSMInput(text);
    } else {
      handleLLMSend(text);
    }
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="avatar-wrap">
              <div className="avatar avatar-bot" style={{ width: 34, height: 34 }}>
                <Bot size={17} strokeWidth={2} />
              </div>
              <span className="online-dot" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-base font-semibold truncate"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
              >
                SwasthSetu Assistant
              </h2>
              <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: 'var(--online)' }}
                />
                {mode === 'ai_chat' ? 'Online · AI Health Chat' : 'Hospital Finder'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openHistory}
              className="glass glass-hover flex items-center justify-center w-8 h-8 rounded-full cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Past conversations"
              title="Past conversations"
            >
              <History size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => {
                if (mode === 'ai_chat') startHospitalSearch();
                else switchToAIChat();
              }}
              className="glass glass-hover flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              {mode === 'ai_chat' ? (
                <>
                  <Search size={13} strokeWidth={1.5} />
                  Find Hospitals
                </>
              ) : (
                <>
                  <MessageSquare size={13} strokeWidth={1.5} />
                  Ask AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ChatHistoryPanel
        open={showHistory}
        sessions={sessionList}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
        onNewChat={handleNewChat}
        onClose={() => setShowHistory(false)}
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto glass-scroll px-4 pb-2 min-h-0"
        role="log"
        aria-live="polite"
      >
        {messages.map((msg) => {
          if (msg.role === 'typing') {
            return (
              <div key={msg.id} className="flex justify-start mb-3">
                <div className="bubble-bot px-4 py-3 flex gap-1.5 items-center" style={{ borderRadius: '4px 20px 20px 20px' }}>
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            );
          }
          return (
            <ChatMessage
              key={msg.id}
              message={msg as ChatMessageType}
              userName={userName}
              onQuickReply={handleQuickReply}
            />
          );
        })}

        {/* Streaming message */}
        {isStreaming && streamingText && (
          <div className="flex justify-start mb-3">
            <div
              className="bubble-bot max-w-[85%] px-4 py-[10px] text-[15px] leading-relaxed"
              style={{ borderRadius: '4px 20px 20px 20px', color: 'var(--text-primary)' }}
            >
              <span style={{ letterSpacing: '-0.01em', whiteSpace: 'pre-wrap' }}>{streamingText}</span>
              <span className="inline-block w-[2px] h-[16px] ml-0.5 align-text-bottom streaming-cursor" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 p-3 pt-1"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-1 glass" style={{ borderRadius: 16 }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              mode === 'ai_chat'
                ? 'Ask about medicines, health, hospitals…'
                : 'Type a pincode, city, or select an option…'
            }
            className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-[15px]"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
            aria-label="Chat message input"
            disabled={isStreaming}
          />
          <button
            type="button"
            disabled
            title="Voice input coming soon"
            aria-label="Voice input (coming soon)"
            className="flex items-center justify-center w-9 h-9 rounded-full cursor-not-allowed"
            style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
          >
            <Mic size={16} strokeWidth={1.5} />
          </button>
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="flex items-center justify-center w-9 h-9 mr-1.5 rounded-full cursor-pointer"
              style={{ background: '#ff3b30' }}
              aria-label="Stop generating"
            >
              <Square size={14} color="#fff" fill="#fff" strokeWidth={0} />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center justify-center w-9 h-9 mr-1.5 rounded-full cursor-pointer"
              style={{ background: 'var(--accent-gradient)' }}
              aria-label="Send message"
            >
              <Send size={16} color="#fff" strokeWidth={2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};