

import React, { useState, useRef, useEffect } from 'react';
import { Message, PdfDocument } from '../types';
import MessageBubble from './Message';
import { SendIcon, LoaderIcon, SummarizeIcon, TableIcon, BrainIcon, DownloadIcon } from './icons';

interface ChatViewProps {
  messages: Message[];
  documents: PdfDocument[];
  onSendMessage: (text: string) => void;
  onSummarize: () => void;
  isLoading: boolean;
  onCitationClick: (docIndex: number, page: number, quote?: string) => void;
  useDeepReasoning: boolean;
  setUseDeepReasoning: (val: boolean) => void;
}

const ChatView: React.FC<ChatViewProps> = ({ 
    messages, 
    documents, 
    onSendMessage, 
    onSummarize, 
    isLoading, 
    onCitationClick,
    useDeepReasoning,
    setUseDeepReasoning
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
      scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText);
      setInputText('');
    }
  };
  
  const handlePromptStarterClick = (prompt: string) => {
    if (!isLoading) {
      onSendMessage(prompt);
    }
  };

  const handleExport = () => {
      if (messages.length === 0) return;
      
      const content = messages.map(m => {
          const role = m.sender === 'user' ? '## User' : '## Assistant';
          return `${role} (${m.timestamp})\n\n${m.text}\n`;
      }).join('\n---\n\n');
      
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research-session-${new Date().toISOString().slice(0,10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const promptStarters = [
    "Identify methodological flaws.",
    "Compare sample populations.",
    "Synthesize the findings.",
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-2xl border border-slate-800/60 backdrop-blur-xl shadow-2xl overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5 bg-white/5 backdrop-blur-xl flex justify-between items-center z-20">
        <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-sky-400 animate-pulse' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'}`}></div>
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase opacity-90">Research Assistant</h2>
        </div>
        <div className="flex items-center space-x-3">
            <div className="text-[10px] text-slate-400 font-mono bg-black/20 px-2 py-1 rounded-md border border-white/5 hidden sm:block">
                {documents.length} SOURCES
            </div>
            {messages.length > 0 && (
                <button 
                    onClick={handleExport}
                    className="p-1.5 text-slate-400 hover:text-sky-300 transition-colors rounded hover:bg-white/5"
                    title="Export Session to Markdown"
                >
                    <DownloadIcon className="w-4 h-4" />
                </button>
            )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
        {messages.map((message) => (
          <MessageBubble 
            key={message.id} 
            message={message} 
            onCitationClick={onCitationClick}
            documents={documents}
          />
        ))}
        {isLoading && messages.length > 0 && !messages[messages.length - 1].isStreaming && messages[messages.length - 1].sender === 'user' && (
          <div className="flex justify-start animate-fade-in-up">
              <div className={`flex items-center space-x-3 rounded-2xl px-5 py-3 border backdrop-blur-md ${
                  useDeepReasoning 
                  ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200' 
                  : 'bg-slate-800/40 border-slate-700/40 text-slate-300'
              }`}>
                  {useDeepReasoning ? (
                      <BrainIcon className="w-4 h-4 animate-pulse text-indigo-400"/>
                  ) : (
                      <LoaderIcon className="w-4 h-4 animate-spin text-sky-400"/>
                  )}
                  <span className="text-sm font-medium tracking-wide">
                      {useDeepReasoning ? "Analyzing complexity..." : "Thinking..."}
                  </span>
              </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent z-20">
        {/* Quick Actions */}
        {messages.length <= 1 && (
             <div className="flex flex-wrap gap-2 mb-4 px-2 justify-center">
                {promptStarters.map((prompt, index) => (
                    <button 
                      key={index}
                      onClick={() => handlePromptStarterClick(prompt)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 rounded-full text-xs font-medium text-slate-300 transition-all active:scale-95 backdrop-blur-md"
                    >
                      {prompt}
                    </button>
                ))}
            </div>
        )}

        <div className="relative group rounded-3xl bg-slate-950 border border-slate-800/80 shadow-2xl transition-all focus-within:border-sky-500/30 focus-within:shadow-[0_0_20px_rgba(14,165,233,0.1)] focus-within:bg-slate-900">
             
             {/* Toolbar inside input */}
             <div className="flex items-center justify-between px-3 pt-2">
                 <button 
                    type="button"
                    onClick={() => setUseDeepReasoning(!useDeepReasoning)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
                        useDeepReasoning 
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]' 
                        : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                    disabled={isLoading}
                 >
                     <BrainIcon className={`w-4 h-4 transition-transform duration-300 ${useDeepReasoning ? 'scale-110 text-indigo-400' : ''}`} />
                     <span className={`text-xs font-bold uppercase tracking-wider ${useDeepReasoning ? '' : 'hidden sm:inline-block'}`}>Deep Reasoning</span>
                     {useDeepReasoning && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse ml-1"></span>}
                 </button>

                 <div className="flex items-center space-x-1">
                    <button
                        onClick={onSummarize}
                        disabled={isLoading}
                        className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-white/5 rounded-full transition-colors"
                        title="Quick Summary"
                    >
                        <SummarizeIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handlePromptStarterClick("Extract the key data points (methodology, sample size, results) into a Markdown table.")}
                        disabled={isLoading}
                        className="p-2 text-slate-500 hover:text-sky-400 hover:bg-white/5 rounded-full transition-colors"
                        title="Extract Table"
                    >
                        <TableIcon className="w-4 h-4" />
                    </button>
                 </div>
             </div>

             <form onSubmit={handleSubmit} className="flex items-end pb-2 pr-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                }}
                placeholder={useDeepReasoning ? "Ask a complex question about synthesis..." : "Ask anything about your documents..."}
                className={`w-full bg-transparent border-0 rounded-xl py-3 pl-4 pr-2 text-slate-200 placeholder-slate-600 focus:ring-0 resize-none min-h-[50px] max-h-[120px] text-sm leading-relaxed scrollbar-hide`}
                disabled={isLoading}
                rows={1}
              />
              <button
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className={`mb-1 p-2.5 rounded-xl text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95 ${
                    useDeepReasoning 
                    ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-900/30' 
                    : 'bg-gradient-to-tr from-sky-600 to-sky-500 shadow-lg shadow-sky-900/30'
                }`}
              >
                 {isLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
              </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default ChatView;