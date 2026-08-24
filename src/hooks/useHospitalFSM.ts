// src/hooks/useHospitalFSM.ts
import { useCallback, useState } from 'react';
import { filterHospitals, getCardLabel, getAllSpecialities } from '../lib/filterHospitals';
import { getCurrentPosition, pincodeToCoords, cityToCoords } from '../lib/geocode';
import { logActivity } from '../lib/storage';
import type { CardType, HospitalFSMState, UserLocation, MapAction, FilteredHospital, LLMMessage } from '../types';

interface UseHospitalFSMOptions {
  addBotMessage: (text: string, quickReplies?: string[]) => Promise<void>;
  addUserMessage: (text: string) => void;
  onMapAction: (action: MapAction) => void;
  onHospitalSelect: (h: FilteredHospital | null) => void;
  llmMessagesRef: React.MutableRefObject<LLMMessage[]>;
  onSwitchToAI: () => void;
  /** Called whenever a location is successfully resolved (GPS, pincode, city). */
  onLocationUpdate?: (coords: { lat: number; lon: number }) => void;
}

export function useHospitalFSM({
  addBotMessage,
  addUserMessage,
  onMapAction,
  onHospitalSelect,
  llmMessagesRef,
  onSwitchToAI,
  onLocationUpdate,
}: UseHospitalFSMOptions) {
  const [fsmState, setFsmState] = useState<HospitalFSMState>('greet');
  const [cardType, setCardType] = useState<CardType>('none');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);

  const reset = useCallback(() => {
    setFsmState('greet');
    setCardType('none');
    setUserLocation(null);
    setRadiusKm(25);
  }, []);

  const startHospitalSearch = useCallback(async () => {
    logActivity('hospital_search', 'Started hospital finder FSM');
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

  const performSearch = useCallback(
    async (lat: number, lon: number, placeName: string, radius?: number, speciality?: string) => {
      const r = radius ?? radiusKm;
      setFsmState('searching');
      const specLabel = speciality ? ` (${speciality})` : '';
      await addBotMessage(`Searching for ${getCardLabel(cardType)} hospitals${specLabel} near ${placeName}…`);
      await new Promise((resolve) => setTimeout(resolve, 800));

      const results = await filterHospitals({ lat, lon, cardType, radiusKm: r, speciality });

      setFsmState('results');
      onMapAction({ type: 'show_markers', hospitals: results, center: { lat, lon } });

      if (results.length === 0) {
        await addBotMessage(`No ${getCardLabel(cardType)} hospitals found within ${r} km.`, [
          'Widen search',
          '💬 Ask AI',
        ]);
      } else {
        const nearest = results[0];
        await addBotMessage(
          `Found ${results.length} hospital${results.length > 1 ? 's' : ''} within ${r} km.\n\nNearest: 🏥 **${nearest.name}** (${nearest.distanceKm.toFixed(1)} km).\n\nTap any marker on the map for details.`,
          ['Filter by speciality', 'Widen search', '💬 Ask AI']
        );

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
    },
    [cardType, radiusKm, addBotMessage, onMapAction, llmMessagesRef]
  );

  const handlePincodeLookup = useCallback(
    async (pincode: string) => {
      await addBotMessage(`Looking up pincode ${pincode}…`);
      try {
        const result = await pincodeToCoords(pincode);
        setUserLocation({ coords: { lat: result.lat, lon: result.lon }, placeName: result.placeName, mode: 'pincode' });
        onLocationUpdate?.({ lat: result.lat, lon: result.lon });
        await performSearch(result.lat, result.lon, result.placeName);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not find that pincode.';
        await addBotMessage(`${msg} Please try again.`, ['Enter city', '💬 Ask AI']);
        setFsmState('ask_location');
      }
    },
    [addBotMessage, performSearch, onLocationUpdate]
  );

  const handleCityLookup = useCallback(
    async (city: string) => {
      await addBotMessage(`Looking up ${city}…`);
      try {
        const result = await cityToCoords(city);
        setUserLocation({ coords: { lat: result.lat, lon: result.lon }, placeName: result.placeName, mode: 'city' });
        onLocationUpdate?.({ lat: result.lat, lon: result.lon });
        await performSearch(result.lat, result.lon, result.placeName);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not find that city.';
        await addBotMessage(`${msg} Please try again.`, ['Enter pincode', '💬 Ask AI']);
        setFsmState('ask_location');
      }
    },
    [addBotMessage, performSearch, onLocationUpdate]
  );

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
            await addBotMessage(`Got it — ${getCardLabel(selected)}. Where should I search?`, [
              '📍 Share my location',
              'Enter pincode',
              'Enter city',
            ]);
          } else {
            addUserMessage(text);
            await addBotMessage('Please select one of the options:', ['MAA Card', 'Ayushman Card', 'Both', 'None']);
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
              onLocationUpdate?.({ lat: pos.lat, lon: pos.lon });
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
            const specs = await getAllSpecialities();
            await addBotMessage('Which speciality?', specs.slice(0, 6));
          } else if (t.includes('widen') || t.includes('expand') || t.includes('more')) {
            addUserMessage(text);
            if (userLocation) {
              const newRadius = Math.min(radiusKm + 25, 100);
              setRadiusKm(newRadius);
              await performSearch(userLocation.coords.lat, userLocation.coords.lon, userLocation.placeName, newRadius);
            }
          } else {
            addUserMessage(text);
            onSwitchToAI();
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
    [fsmState, cardType, userLocation, radiusKm, addUserMessage, addBotMessage, performSearch, handlePincodeLookup, handleCityLookup, onSwitchToAI, onLocationUpdate]
  );

  return {
    fsmState,
    cardType,
    userLocation,
    radiusKm,
    startHospitalSearch,
    handleFSMInput,
    reset,
    setFsmState,
    setRadiusKm,
  };
}
