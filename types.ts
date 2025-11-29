
export enum Sender {
  USER = 'user',
  AI = 'ai',
}

export interface Message {
  id: number;
  text: string;
  sender: Sender;
  timestamp: string;
  isStreaming?: boolean;
}

export interface PdfDocument {
  id: number;
  file: File;
  text: string;
}
