export interface LogEntry {
  id: string | number;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'alert' | 'system';
}

export interface Metrics {
  confidence: number;
  blinkRate: number;
  textureStatus: 'clean' | 'artifacts' | 'checking';
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}
