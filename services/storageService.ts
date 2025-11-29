
import { Message, PdfDocument } from '../types';

const DB_NAME = 'AcademicResearchAssistantDB';
const STORE_NAME = 'documents';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveDocumentToDB = async (doc: PdfDocument): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record = {
      id: doc.id,
      name: doc.file.name,
      blob: doc.file, // IndexedDB can store File/Blob objects natively
      text: doc.text
    };
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const loadDocumentsFromDB = async (): Promise<PdfDocument[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const records = request.result;
      const docs = records.map((record: any) => ({
        id: record.id,
        // Reconstruct the File object from the stored Blob
        file: new File([record.blob], record.name, { type: 'application/pdf' }),
        text: record.text
      }));
      resolve(docs);
    };
  });
};

export const deleteDocumentFromDB = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const clearDocumentsDB = async (): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

export const saveMessages = (messages: Message[]) => {
  // We strip isStreaming state before saving to avoid stuck loaders on reload
  const cleanMessages = messages.map(m => ({ ...m, isStreaming: false }));
  localStorage.setItem('chat_messages', JSON.stringify(cleanMessages));
};

export const loadMessages = (): Message[] => {
  const stored = localStorage.getItem('chat_messages');
  return stored ? JSON.parse(stored) : [];
};

export const clearMessages = () => {
    localStorage.removeItem('chat_messages');
};

export const saveSettings = (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value));
}

export const loadSettings = (key: string, defaultValue: any) => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
}