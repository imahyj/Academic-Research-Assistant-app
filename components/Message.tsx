
import React, { useMemo, useRef, useEffect } from 'react';
import { Message, Sender, PdfDocument } from '../types';
import { UserIcon, AiIcon } from './icons';

declare const marked: any;

interface MessageBubbleProps {
  message: Message;
  documents: PdfDocument[];
  onCitationClick: (docIndex: number, page: number, quote?: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, documents, onCitationClick }) => {
  const isUser = message.sender === Sender.USER;
  const contentRef = useRef<HTMLDivElement>(null);

  const containerClasses = isUser ? 'flex justify-end' : 'flex justify-start';
  const bubbleClasses = isUser
    ? 'bg-sky-600 text-white rounded-2xl rounded-tr-sm shadow-lg shadow-sky-900/20'
    : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-2xl rounded-tl-sm shadow-lg';
  
  const icon = isUser ? (
      <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center border border-sky-500/50 shadow-inner">
          <UserIcon className="w-5 h-5 text-sky-200" />
      </div>
  ) : (
      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
          <AiIcon className="w-5 h-5 text-emerald-400" />
      </div>
  );

  // Configure marked for professional table rendering
  useMemo(() => {
    if (!marked) return;
    const renderer = new marked.Renderer();
    
    // Add not-prose to isolate table styles from the typography plugin
    renderer.table = (header: string, body: string) => {
        return `
        <div class="overflow-x-auto my-6 rounded-xl border border-slate-700/50 shadow-sm bg-slate-900/40 not-prose">
            <table class="min-w-full divide-y divide-slate-700/50 text-left text-sm">
                <thead class="bg-slate-800/60 text-slate-200">
                    ${header}
                </thead>
                <tbody class="divide-y divide-slate-700/50 bg-transparent">
                    ${body}
                </tbody>
            </table>
        </div>`;
    };
    
    renderer.tablerow = (content: string) => {
        return `<tr class="hover:bg-slate-700/30 transition-colors even:bg-slate-800/20">${content}</tr>`;
    };
    
    renderer.tablecell = (content: string, flags: any) => {
        const type = flags.header ? 'th' : 'td';
        const classes = flags.header 
            ? 'px-4 py-3 text-xs uppercase tracking-wider font-bold text-sky-100/90' 
            : 'px-4 py-3 text-slate-300 whitespace-pre-wrap leading-relaxed';
        return `<${type} class="${classes}">${content}</${type}>`;
    };

    marked.use({ renderer, gfm: true, breaks: true });
  }, []);

  const parsedContent = useMemo(() => {
    if (isUser) return null;

    // 1. Tokenize Citations
    // Supports [1:12] or [1:12 | "quoted text"]
    const citationMap = new Map<string, {docIndex: number, page: number, quote?: string}>();
    
    // Regex breakdown:
    // \[\s*(\d+)\s*:\s*(\d+)\s*   -> Matches [ Index : Page
    // (?:\|\s*["']([^"']+)["'])?  -> Optional Non-capturing group for | "Quote"
    // \s*\]                       -> Matches closing ]
    const regex = /\[\s*(\d+)\s*:\s*(\d+)\s*(?:\|\s*["']([^"']+)["'])?\s*\]/g;

    let processedText = message.text.replace(regex, (match, docIdx, pageNum, quote) => {
        const token = `CITATIONTOKEN${docIdx}X${pageNum}X${Math.random().toString(36).substr(2, 9)}`;
        citationMap.set(token, { 
            docIndex: parseInt(docIdx), 
            page: parseInt(pageNum),
            quote: quote ? quote.trim() : undefined
        });
        return token;
    });

    // 2. Parse Markdown to HTML
    let html = marked.parse(processedText);

    // 3. Re-inject Citations as interactive buttons
    citationMap.forEach((value, token) => {
         const doc = documents[value.docIndex - 1];
         const isValid = !!doc;
         
         const tooltip = isValid 
            ? `Jump to: ${doc.file.name} (Page ${value.page})${value.quote ? `\nQuote: "${value.quote}"` : ''}` 
            : `Document #${value.docIndex} is missing from library`;
            
         const styleClasses = isValid 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:scale-105 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.1)]'
            : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-help opacity-80';

         // We encode the quote in a data attribute (escaping it roughly)
         const quoteAttr = value.quote ? `data-citation-quote="${value.quote.replace(/"/g, '&quot;')}"` : '';

         const buttonHtml = `
            <button 
                data-citation-doc="${value.docIndex}" 
                data-citation-page="${value.page}"
                ${quoteAttr}
                class="citation-btn inline-flex items-center justify-center mx-1 px-2 py-0.5 border rounded-md text-[10px] font-bold uppercase tracking-wider transition-all select-none align-baseline transform ${styleClasses}"
                title="${tooltip}"
            >REF ${value.docIndex}:${value.page}</button>
         `;
         
         html = html.split(token).join(buttonHtml);
    });

    return html;
  }, [message.text, isUser, documents]);

  // Event Delegation for Citation Clicks
  useEffect(() => {
      const container = contentRef.current;
      if (!container) return;

      const handleClick = (e: MouseEvent) => {
          const target = (e.target as HTMLElement).closest('.citation-btn');
          if (target) {
              const docIndex = parseInt(target.getAttribute('data-citation-doc') || '0');
              const page = parseInt(target.getAttribute('data-citation-page') || '0');
              const quote = target.getAttribute('data-citation-quote') || undefined;
              
              if (docIndex && page) {
                  onCitationClick(docIndex, page, quote);
              }
          }
      };

      container.addEventListener('click', handleClick);
      return () => container.removeEventListener('click', handleClick);
  }, [parsedContent, onCitationClick]);

  return (
    <div className={`${containerClasses} space-x-4 animate-fade-in-up group items-end`}>
      {!isUser && <div className="flex-shrink-0 mb-1">{icon}</div>}
      <div className={`px-6 py-5 max-w-3xl ${bubbleClasses}`}>
         {isUser ? (
             <p className="whitespace-pre-wrap text-[15px] leading-relaxed font-light">{message.text}</p>
         ) : (
             <div 
                ref={contentRef}
                className="prose prose-invert prose-sm max-w-none 
                prose-p:leading-7 prose-p:mb-4 last:prose-p:mb-0 prose-p:text-slate-300
                prose-headings:text-slate-100 prose-headings:font-bold prose-headings:tracking-tight prose-headings:mt-6 prose-headings:mb-3
                prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-sky-100 prose-strong:font-semibold
                prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4 prose-li:marker:text-slate-600
                prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4
                prose-blockquote:border-l-2 prose-blockquote:border-emerald-500/50 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-400 prose-blockquote:bg-slate-900/30 prose-blockquote:py-1 prose-blockquote:rounded-r-md
                prose-code:text-sky-300 prose-code:bg-slate-900/50 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                "
                dangerouslySetInnerHTML={{ __html: parsedContent || '' }}
             />
         )}
         
         {message.isStreaming && (
             <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-sky-400 animate-pulse rounded-full"></span>
         )}
         
         <div className="flex items-center justify-end mt-2 space-x-2">
             {!isUser && message.text.length > 100 && !message.isStreaming && (
                <div className="flex items-center space-x-1 text-[10px] text-slate-500 uppercase tracking-widest font-bold opacity-60">
                   <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                   <span>Gemini 2.5 Flash</span>
                </div>
             )}
         </div>
      </div>
      {isUser && <div className="flex-shrink-0 mb-1">{icon}</div>}
    </div>
  );
};

export default MessageBubble;
