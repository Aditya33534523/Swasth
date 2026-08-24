// src/hooks/useAIStream.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/llm';
import { getLLMSettings } from '../lib/llmSettings';
import { logActivity } from '../lib/storage';
import { filterHospitals } from '../lib/filterHospitals';
import { EMERGENCY_RE } from '../constants/emergency';
import type { LLMMessage, MapAction, FilteredHospital } from '../types';

interface UseAIStreamOptions {
  llmMessagesRef: React.MutableRefObject<LLMMessage[]>;
  addUserMessage: (text: string, image?: string) => void;
  addBotMessage: (text: string, quickReplies?: string[]) => Promise<void>;
  onMapAction: (action: MapAction) => void;
  onHospitalSelect: (h: FilteredHospital | null) => void;
  /** External ref to track last known coordinates (updated by hospital FSM). */
  lastKnownCoordsRef?: React.MutableRefObject<{ lat: number; lon: number } | null>;
}

export function useAIStream({
  llmMessagesRef,
  addUserMessage,
  addBotMessage,
  onMapAction,
  onHospitalSelect,
  lastKnownCoordsRef,
}: UseAIStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const internalCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const coordsRef = lastKnownCoordsRef || internalCoordsRef;

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleEmergency = useCallback(
    async (triggerText?: string) => {
      logActivity('emergency_trigger', triggerText || 'unknown');
      await addBotMessage(
        '🚨 This sounds like an emergency. **Call 108 immediately.**\n\nShowing the nearest emergency hospital on the map.'
      );

      const emergencyCoords = coordsRef.current || { lat: 23.0225, lon: 72.5714 };
      const emergencyResults = await filterHospitals({
        lat: emergencyCoords.lat,
        lon: emergencyCoords.lon,
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
          ['🏥 Find Hospitals', 'Ask AI']
        );
      }
    },
    [addBotMessage, onMapAction, onHospitalSelect, coordsRef]
  );

  const handleLLMSend = useCallback(
    async (text: string, imageBase64?: string) => {
      if (isStreaming) return;

      const userText = text.trim();
      const promptText = userText || (imageBase64 ? 'Please analyze this image, read any medicine/prescription/health details, and explain clearly.' : '');
      if (!promptText && !imageBase64) return;

      if (EMERGENCY_RE.test(promptText)) {
        addUserMessage(promptText, imageBase64);
        await handleEmergency(promptText);
        return;
      }

      addUserMessage(userText, imageBase64);
      setIsStreaming(true);
      setStreamingText('');
      logActivity('message_sent', (userText || (imageBase64 ? '[Image attachment]' : '')).slice(0, 100));

      if (imageBase64) {
        llmMessagesRef.current.push({
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        });
      } else {
        llmMessagesRef.current.push({ role: 'user', content: promptText });
      }

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = '';

      await streamChat(
        llmMessagesRef.current,
        {
          onToken: (token) => {
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
              addBotMessage(finalText);
              llmMessagesRef.current.push({ role: 'assistant', content: finalText });
            }
          },
          onError: (err) => {
            setIsStreaming(false);
            setStreamingText('');
            abortRef.current = null;
            logActivity('llm_error', err.message.slice(0, 100));

            addBotMessage(
              `⚠️ ${err.message}\n\nMake sure Ollama is running:\n\`ollama serve\`\n\nYou can still use the 🏥 Find Hospitals feature while the server is offline.`
            );
            llmMessagesRef.current.pop();
          },
        },
        (() => {
          const s = getLLMSettings();
          return { ...(s.baseUrl ? { baseUrl: s.baseUrl } : {}), model: s.model };
        })(),
        controller.signal
      );
    },
    [isStreaming, addUserMessage, addBotMessage, handleEmergency, llmMessagesRef]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { isStreaming, streamingText, handleLLMSend, stopStreaming };
}
