
import React, { useState, useCallback, useEffect } from 'react';
import { Message, Sender, PdfDocument } from './types';
import { parsePdf } from './services/pdfService';
import { queryPdfContentStream, summarizePdfContentStream } from './services/geminiService';
import { saveDocumentToDB, loadDocumentsFromDB, saveMessages, loadMessages, saveSettings, loadSettings, clearDocumentsDB, clearMessages, deleteDocumentFromDB } from './services/storageService';
import FileUpload from './components/FileUpload';
import ChatView from './components/ChatView';
import PdfViewer from './components/PdfViewer';
import FileManager from './components/FileManager';
import { LoaderIcon, BookIcon, FileIcon, AiIcon } from './components/icons';

type MobileTab = 'library' | 'pdf' | 'chat';

const App: React.FC = () => {
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [activeDocument, setActiveDocument] = useState<PdfDocument | null>(null);
  
  // citationTarget now includes a timestamp (ts) to force updates even if page is same, and optional quote
  const [citationTarget, setCitationTarget] = useState<{ docId: number; page: number; ts: number; quote?: string } | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  
  // Mobile Navigation State
  const [mobileTab, setMobileTab] = useState<MobileTab>('library');
  
  // "Deep Think" toggle state
  const [useDeepReasoning, setUseDeepReasoning] = useState<boolean>(false);

  // Check API Key on mount
  useEffect(() => {
    const checkApiKey = async () => {
      const win = window as any;
      if (win.aistudio) {
        try {
          const hasKey = await win.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } catch (e) {
          console.error("Error checking API key:", e);
          setHasApiKey(false);
        }
      } else {
        // Fallback for dev environments where key might be in .env
        setHasApiKey(!!process.env.API_KEY);
      }
      setIsCheckingKey(false);
    };
    checkApiKey();
  }, []);

  // Hydration Effect: Restore state from DB and LocalStorage on mount
  useEffect(() => {
    const hydrate = async () => {
      setIsRestoring(true);
      try {
        const storedDocs = await loadDocumentsFromDB();
        const storedMessages = loadMessages();
        const storedDeepReasoning = loadSettings('deep_reasoning', false);

        if (storedDocs.length > 0) {
            setDocuments(storedDocs);
            // Auto-select all restored documents for immediate context
            setSelectedDocIds(new Set(storedDocs.map(d => d.id)));
            // Set the first doc as active so the viewer isn't empty
            setActiveDocument(storedDocs[0]);
        }
        
        if (storedMessages.length > 0) {
            // Clean messages to ensure no stuck loading states
            setMessages(storedMessages);
        }

        setUseDeepReasoning(storedDeepReasoning);
      } catch (e) {
        console.error("Failed to restore session", e);
      } finally {
        setIsRestoring(false);
      }
    };
    
    hydrate();
  }, []);

  // Save messages whenever they change
  useEffect(() => {
      if (!isRestoring) {
        saveMessages(messages);
      }
  }, [messages, isRestoring]);

  // Save settings
  useEffect(() => {
      if (!isRestoring) {
          saveSettings('deep_reasoning', useDeepReasoning);
      }
  }, [useDeepReasoning, isRestoring]);

  const handleConnectApiKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      try {
        await win.aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) {
        console.error("Failed to select key", e);
        setError("Failed to connect API Key. Please try again.");
      }
    }
  };

  const handleFileChange = async (files: FileList) => {
    if (files.length === 0) return;
    
    setIsProcessingFiles(true);
    setError(null);
    const newDocuments: PdfDocument[] = [...documents];
    const newSelectedDocIds = new Set(selectedDocIds);

    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') {
        setError(`Skipped non-PDF file: ${file.name}`);
        continue;
      }
      try {
        const text = await parsePdf(file);
        const newDoc: PdfDocument = {
          id: Date.now() + Math.random(),
          file,
          text,
        };
        
        // Persist to IndexedDB
        await saveDocumentToDB(newDoc);

        newDocuments.push(newDoc);
        newSelectedDocIds.add(newDoc.id);
      } catch (e) {
        setError(`Failed to parse ${file.name}. It may be corrupted.`);
        console.error(e);
      }
    }

    setDocuments(newDocuments);
    setSelectedDocIds(newSelectedDocIds);
    if (!activeDocument && newDocuments.length > 0) {
      setActiveDocument(newDocuments[0]);
    }
    
    if (messages.length === 0 && newDocuments.length > 0) {
      const isMultiple = newDocuments.length > 1;
      
      const suggestedQuestions = isMultiple 
        ? [
            "**Thematic Synthesis:** Identify recurring themes and consensus findings across all documents.",
            "**Methodological Contrast:** Compare the research designs, sample populations, and analytical approaches.",
            "**Conflict Resolution:** Highlight any contradictory evidence or theoretical disagreements between the papers.",
            "**Integrated Conclusions:** What are the aggregate implications of this collection for the field?"
          ]
        : [
            "**Research Framework:** What are the core research questions, hypotheses, and theoretical underpinnings?",
            "**Methodological Rigor:** Evaluate the study design, sampling strategy, data collection, and analysis methods.",
            "**Empirical Evidence:** Summarize key findings, noting statistical significance and effect sizes.",
            "**Critical Limitations:** Identify potential biases, confounding variables, or scope limitations acknowledged by the authors."
          ];

      const questionsList = suggestedQuestions.map(q => `• ${q}`).join('\n');

      const initialMessage: Message = {
        id: Date.now(),
        text: `**System Ready.** ${files.length} document(s) processed.\n\nTo gain a comprehensive understanding, I recommend asking the following:\n\n${questionsList}\n\nSelect your documents to begin analysis.`,
        sender: Sender.AI,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([initialMessage]);
    }

    setIsProcessingFiles(false);
  };
  
  const handleDeleteSelected = async () => {
    if (selectedDocIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedDocIds.size} selected document(s)?`)) return;

    setIsProcessingFiles(true);
    try {
        const idsToDelete = Array.from(selectedDocIds);
        
        // Delete from DB
        await Promise.all(idsToDelete.map((id) => deleteDocumentFromDB(id as number)));
        
        // Update State
        const newDocuments = documents.filter(doc => !selectedDocIds.has(doc.id));
        setDocuments(newDocuments);
        
        // Clear selection
        setSelectedDocIds(new Set());
        
        // If active document was deleted, reset or pick another
        if (activeDocument && selectedDocIds.has(activeDocument.id)) {
            setActiveDocument(newDocuments.length > 0 ? newDocuments[0] : null);
        }
    } catch (e) {
        console.error("Failed to delete documents", e);
        setError("Failed to delete selected documents.");
    } finally {
        setIsProcessingFiles(false);
    }
  };

  const handleClearLibrary = async () => {
      if (window.confirm("Are you sure you want to clear your entire library and chat history? This action cannot be undone.")) {
          await clearDocumentsDB();
          clearMessages();
          setDocuments([]);
          setMessages([]);
          setSelectedDocIds(new Set());
          setActiveDocument(null);
      }
  };

  const handleSendMessage = useCallback(async (text: string) => {
    const selectedDocuments = documents.filter(doc => selectedDocIds.has(doc.id));
    if (!text.trim() || selectedDocuments.length === 0) return;

    const userMessage: Message = {
      id: Date.now(),
      text: text,
      sender: Sender.USER,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    const aiMessageId = Date.now() + 1;
    const aiPlaceholder: Message = {
      id: aiMessageId,
      text: '', 
      sender: Sender.AI,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
    setIsLoading(true);

    try {
      const stream = queryPdfContentStream(selectedDocuments, text, useDeepReasoning);
      
      let accumulatedText = '';
      
      for await (const chunk of stream) {
        accumulatedText += chunk;
        setMessages((prev) => 
          prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, text: accumulatedText } 
              : msg
          )
        );
      }

      setMessages((prev) => 
        prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, isStreaming: false } 
            : msg
        )
      );

    } catch (e) {
      console.error(e);
      setMessages((prev) => 
        prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, text: msg.text + '\n\n[Error: Connection interrupted]', isStreaming: false } 
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [documents, selectedDocIds, useDeepReasoning]);
  
  const handleSummarize = useCallback(async () => {
    const selectedDocuments = documents.filter(doc => selectedDocIds.has(doc.id));
    if (selectedDocuments.length === 0) return;

    const summaryRequestMessage: Message = {
      id: Date.now(),
      text: `Generate a comprehensive academic summary for the selected ${selectedDocuments.length} document(s).`,
      sender: Sender.USER,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const aiMessageId = Date.now() + 1;
    const aiPlaceholder: Message = {
      id: aiMessageId,
      text: '', 
      sender: Sender.AI,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, summaryRequestMessage, aiPlaceholder]);
    setIsLoading(true);
    
    // Switch to chat view on mobile so user sees the summary generating
    setMobileTab('chat');

    try {
      const stream = summarizePdfContentStream(selectedDocuments);
      let accumulatedText = '';
      
      for await (const chunk of stream) {
        accumulatedText += chunk;
        setMessages((prev) => 
          prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, text: accumulatedText } 
              : msg
          )
        );
      }
       setMessages((prev) => 
        prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, isStreaming: false } 
            : msg
        )
      );
    } catch (e)      {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [documents, selectedDocIds]);

  const handleCitationClick = (docIndex: number, page: number, quote?: string) => {
    // Citations are 1-based (e.g. [1:12]), documents array is 0-based
    const targetDoc = documents.find((doc, i) => i === docIndex - 1);
    
    if (targetDoc) {
      setActiveDocument(targetDoc);
      // Use timestamp to force update even if clicking the same citation twice
      setCitationTarget({ docId: targetDoc.id, page, quote, ts: Date.now() });
      // Switch to PDF view on mobile
      setMobileTab('pdf');
      // Clear any previous errors
      setError(null);
    } else {
        setError(`Citation refers to Document #${docIndex}, which is missing from the library. Please upload it to view the source.`);
    }
  };
  
  const handleDocumentSelect = (doc: PdfDocument) => {
      setActiveDocument(doc);
      setCitationTarget(null);
      setMobileTab('pdf');
  };

  if (isRestoring || isCheckingKey) {
    return (
        <div className="flex h-screen w-screen bg-slate-950 items-center justify-center">
             <div className="flex flex-col items-center space-y-4 animate-fade-in-up">
                <div className="relative">
                     <div className="absolute inset-0 bg-sky-500 blur-xl rounded-full opacity-20 animate-pulse"></div>
                     <LoaderIcon className="w-10 h-10 animate-spin text-sky-400 relative z-10" />
                </div>
                <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">Initializing System</p>
             </div>
        </div>
    );
  }

  const renderInitialView = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 bg-slate-950 relative overflow-hidden h-full">
      {/* Ambient Background Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-900/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-900/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10 animate-fade-in-up flex flex-col items-center">
        <div className="text-center mb-8 lg:mb-12 px-4">
            <div className="inline-flex items-center justify-center p-2 mb-6 bg-slate-900/50 border border-slate-700/50 rounded-2xl shadow-xl backdrop-blur-xl">
               <BookIcon className="w-8 h-8 text-sky-400" />
            </div>
            <h1 className="text-3xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 tracking-tight">
              Academic Research Assistant
            </h1>
            <p className="text-slate-400 text-base lg:text-xl font-light leading-relaxed max-w-lg mx-auto">
              Upload papers, analyze methodologies, and synthesize complex findings with <span className="text-sky-400 font-medium">Gemini 2.5</span> precision.
            </p>
        </div>
        
        {error && (
          <div className="w-full bg-red-950/30 border border-red-500/20 text-red-200 p-4 rounded-xl mb-8 flex items-center justify-center text-sm backdrop-blur-md animate-fade-in-up">
             <span className="mr-2">⚠️</span> {error}
          </div>
        )}
        
        {!hasApiKey ? (
             <div className="w-full bg-slate-900/40 p-8 lg:p-12 rounded-3xl border border-slate-700/30 shadow-2xl backdrop-blur-xl text-center">
                 <h3 className="text-white font-semibold text-lg mb-2">Access Required</h3>
                 <p className="text-slate-400 text-sm mb-8">To perform advanced research analysis, you must connect a Google Cloud project with billing enabled.</p>
                 <button 
                    onClick={handleConnectApiKey}
                    className="inline-flex items-center justify-center px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-sky-900/30"
                 >
                    Connect API Key
                 </button>
                 <div className="mt-6 text-xs text-slate-500">
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-sky-400">Billing Information</a>
                 </div>
             </div>
        ) : (
            <>
                <div className="w-full bg-slate-900/40 p-6 lg:p-10 rounded-3xl border border-slate-700/30 shadow-2xl backdrop-blur-xl hover:border-slate-600/50 transition-colors duration-500">
                    <FileUpload onFileChange={handleFileChange} />
                </div>

                {isProcessingFiles && (
                <div className="flex items-center justify-center mt-8 space-x-3">
                    <div className="relative">
                        <div className="absolute inset-0 bg-sky-500 blur rounded-full opacity-20 animate-pulse"></div>
                        <LoaderIcon className="w-6 h-6 animate-spin text-sky-400 relative z-10" />
                    </div>
                    <span className="font-medium text-sky-200/80 tracking-wide text-sm">Parsing documents...</span>
                </div>
                )}
            </>
        )}
      </div>
    </div>
  );
  
  const renderWorkspaceView = () => {
    // If documents are loaded but key is invalid/revoked, force re-connect via overlay
    if (!hasApiKey) {
        return (
            <div className="flex h-screen w-screen bg-slate-950 items-center justify-center p-4">
                 <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl border border-slate-700 text-center shadow-2xl relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
                     <h3 className="text-xl font-bold text-white mb-2">Connection Lost</h3>
                     <p className="text-slate-400 mb-6">Your API session has expired or is missing permissions. Please reconnect to continue your research.</p>
                     <button 
                        onClick={handleConnectApiKey}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition-all"
                     >
                        Reconnect Access
                     </button>
                 </div>
            </div>
        );
    }
  
    return (
    <div className="flex-1 flex flex-col h-[100dvh] lg:h-screen bg-slate-950 relative overflow-hidden">
        {/* Background Ambient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 pointer-events-none" />
        
        {/* Top Bar Error Toast */}
        {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center animate-fade-in-up max-w-lg text-sm">
                <span className="mr-2 text-lg">⚠️</span>
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 hover:text-white">&times;</button>
            </div>
        )}
        
        {/* Main Workspace Area - Responsive Grid/Stack */}
        <div className="flex-1 lg:grid lg:grid-cols-12 gap-4 p-2 lg:p-4 overflow-hidden relative z-10">
            
            {/* Left Sidebar: Library */}
            <div className={`
                lg:col-span-3 lg:flex flex-col h-full min-w-[280px] z-10
                ${mobileTab === 'library' ? 'flex' : 'hidden'}
                w-full
            `}>
                 <FileManager
                    documents={documents}
                    selectedDocIds={selectedDocIds}
                    activeDocId={activeDocument?.id}
                    onSelectionChange={setSelectedDocIds}
                    onDocumentClick={handleDocumentSelect}
                    onFilesAdd={handleFileChange}
                    onDeleteSelected={handleDeleteSelected}
                    onClearLibrary={handleClearLibrary}
                 />
            </div>
            
            {/* Center: PDF Viewer */}
            <div className={`
                lg:col-span-5 lg:flex flex-col h-full z-10
                ${mobileTab === 'pdf' ? 'flex' : 'hidden'}
                w-full
            `}>
               <div className="h-full rounded-2xl border border-slate-800/60 bg-slate-900/40 shadow-2xl backdrop-blur-sm overflow-hidden relative group flex flex-col">
                   {activeDocument ? (
                     <PdfViewer 
                        key={activeDocument.id} 
                        file={activeDocument.file}
                        text={activeDocument.text}
                        pageJump={citationTarget?.docId === activeDocument.id ? { page: citationTarget.page, ts: citationTarget.ts } : undefined}
                        citationQuote={citationTarget?.docId === activeDocument.id ? citationTarget.quote : undefined}
                     />
                   ) : (
                     <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6 text-center">
                        <BookIcon className="w-16 h-16 mb-4 opacity-10"/>
                        <p className="text-sm font-medium tracking-wide opacity-50">SELECT A DOCUMENT FROM THE LIBRARY</p>
                     </div>
                   )}
               </div>
            </div>

            {/* Right: Chat */}
            <div className={`
                lg:col-span-4 lg:flex flex-col h-full z-10
                ${mobileTab === 'chat' ? 'flex' : 'hidden'}
                w-full
            `}>
              <ChatView
                messages={messages}
                onSendMessage={handleSendMessage}
                onSummarize={handleSummarize}
                isLoading={isLoading}
                onCitationClick={handleCitationClick}
                documents={documents}
                useDeepReasoning={useDeepReasoning}
                setUseDeepReasoning={setUseDeepReasoning}
              />
            </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden flex-shrink-0 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800/50 pb-safe z-50">
            <div className="flex items-center justify-around p-2">
                 <button 
                    onClick={() => setMobileTab('library')} 
                    className={`flex flex-col items-center justify-center w-full py-2 space-y-1 transition-colors ${mobileTab === 'library' ? 'text-sky-400' : 'text-slate-500'}`}
                 >
                    <FileIcon className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Library</span>
                 </button>
                 
                 <button 
                    onClick={() => setMobileTab('pdf')} 
                    className={`flex flex-col items-center justify-center w-full py-2 space-y-1 transition-colors ${mobileTab === 'pdf' ? 'text-sky-400' : 'text-slate-500'}`}
                 >
                    <BookIcon className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Reader</span>
                 </button>
                 
                 <button 
                    onClick={() => setMobileTab('chat')} 
                    className={`flex flex-col items-center justify-center w-full py-2 space-y-1 transition-colors ${mobileTab === 'chat' ? 'text-sky-400' : 'text-slate-500'}`}
                 >
                    <div className="relative">
                        <AiIcon className="w-6 h-6" />
                        {messages.length > 0 && !messages[messages.length-1].text && isLoading && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Assistant</span>
                 </button>
            </div>
        </div>
    </div>
    );
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 font-sans text-slate-200 selection:bg-sky-500/30 selection:text-white overflow-hidden">
       {documents.length === 0 ? renderInitialView() : renderWorkspaceView()}
    </div>
  );
};

export default App;
