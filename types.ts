import React from 'react';

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

declare global {
  namespace JSX {
      interface IntrinsicElements {
          [elemName: string]: any;
          'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
              src?: string;
              'camera-controls'?: boolean;
              'auto-rotate'?: boolean;
              'shadow-intensity'?: string;
          };
      }
  }
}
