export type CardType = 'maa' | 'ayushman' | 'both' | 'none';

export interface Hospital {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  pincode: string;
  lat: number;
  lon: number;
  phone: string;
  specialities: string[];
  acceptsMaa: boolean;
  acceptsAyushman: boolean;
  emergency: boolean;
  source: 'pmjay_hem' | 'maa_gujarat' | 'osm' | 'google_places';
  verifiedOn: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export type HospitalFSMState =
  | 'greet'
  | 'ask_card'
  | 'ask_location'
  | 'ask_pincode'
  | 'ask_city'
  | 'searching'
  | 'results'
  | 'ask_speciality'
  | 'detail'
  | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  text: string;
  quickReplies?: string[];
  timestamp: number;
}

export type ChatMode = 'ai_chat' | 'hospital_search';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MapAction {
  type: 'show_markers' | 'clear_markers' | 'fly_to' | 'highlight_marker';
  hospitals?: FilteredHospital[];
  center?: Coordinates;
  hospitalId?: string;
}

export interface FilteredHospital extends Hospital {
  distanceKm: number;
}

export type LocationMode = 'gps' | 'pincode' | 'city';

export interface UserLocation {
  coords: Coordinates;
  placeName: string;
  mode: LocationMode;
}

// ─── Auth & Session ─────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: number;
}

// ─── Chat Persistence ───────────────────────────────────────

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  llmContext: LLMMessage[];
  createdAt: number;
  updatedAt: number;
}

// ─── Activity Logging ──────────────────────────────────────

export type ActivityAction =
  | 'login'
  | 'logout'
  | 'register'
  | 'message_sent'
  | 'message_received'
  | 'hospital_search'
  | 'hospital_result'
  | 'marker_click'
  | 'hospital_sheet_open'
  | 'directions_click'
  | 'theme_toggle'
  | 'section_switch'
  | 'emergency_trigger'
  | 'llm_stream_start'
  | 'llm_stream_complete'
  | 'llm_error';

export interface ActivityLog {
  id: string;
  userId: string;
  action: ActivityAction;
  details: string;
  timestamp: number;
}