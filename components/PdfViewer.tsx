

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LoaderIcon, LiquidIcon, OriginalIcon, SerifIcon, SansIcon } from './icons';

declare const pdfjsLib: any;

interface PdfViewerProps {
  file: File;
  text?: string;
  pageJump?: { page: number; ts: number };
  citationQuote?: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file, text = "", pageJump, citationQuote }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [scale, setScale] = useState<number>(1.2);
  const [isFitWidth, setIsFitWidth] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [isLiquidMode, setIsLiquidMode] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(18);
  const [isSerif, setIsSerif] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // React to external page jump requests (e.g. from citation clicks)
  useEffect(() => {
    if (pageJump) {
        setCurrentPage(pageJump.page);
        setPageInput(pageJump.page.toString());
    }
  }, [pageJump]);

  const highlightQuote = useCallback((quote: string) => {
      if (!textLayerRef.current) return;
      
      const textLayer = textLayerRef.current;
      const spans = Array.from(textLayer.children) as HTMLElement[];
      const normalizedQuote = quote.toLowerCase().replace(/\s+/g, ' ').trim();

      // Clear previous highlights
      spans.forEach(span => {
          span.style.backgroundColor = 'transparent';
          span.style.borderRadius = '0';
      });

      if (!normalizedQuote) return;

      // Masterclass Highlighting Algorithm: Multi-Span Range Matching
      // 1. Build a full string of the page text with a mapping back to DOM indices
      let fullPageText = '';
      const spanMap: { start: number; end: number; element: HTMLElement }[] = [];

      spans.forEach((span) => {
          const text = span.textContent?.toLowerCase().replace(/\s+/g, ' ') || ' ';
          // Add a space separator if the span doesn't end with one, but purely for search index mapping implies continuity
          // PDF.js splits words, so we append directly. However, we need to handle word breaks carefully.
          // For now, naive concatenation is better than span-by-span check.
          const startIndex = fullPageText.length;
          fullPageText += text;
          spanMap.push({
              start: startIndex,
              end: fullPageText.length,
              element: span
          });
      });

      // 2. Find the quote index in the normalized full text
      const quoteIndex = fullPageText.indexOf(normalizedQuote);

      if (quoteIndex !== -1) {
          const quoteEnd = quoteIndex + normalizedQuote.length;

          // 3. Highlight all spans that intersect with this range
          spanMap.forEach((mapping) => {
              // Check for intersection
              const overlap = Math.max(0, Math.min(quoteEnd, mapping.end) - Math.max(quoteIndex, mapping.start));
              
              if (overlap > 0) {
                  mapping.element.style.backgroundColor = 'rgba(255, 230, 0, 0.4)';
                  mapping.element.style.borderRadius = '2px';
                  
                  // Optional: Scroll the first matched element into view if it's off screen
                  if (quoteIndex >= mapping.start && quoteIndex < mapping.end) {
                      mapping.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }
              }
          });
      }

  }, []);

  const renderPage = useCallback(async (pageNum: number, currentScale: number, fitWidth: boolean) => {
    if (!pdfDoc) return;
    if (pageNum < 1 || pageNum > pdfDoc.numPages) return;

    setIsRendering(true);

    try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const textLayer = textLayerRef.current;
        const container = containerRef.current;
        if (!canvas || !textLayer || !container) return;
    
        let viewport = page.getViewport({ scale: currentScale });
        
        if (fitWidth) {
            const availableWidth = container.clientWidth - 48; 
            const unscaledViewport = page.getViewport({ scale: 1 });
            const widthScale = availableWidth / unscaledViewport.width;
            viewport = page.getViewport({ scale: widthScale });
        }
        
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 
          ? [outputScale, 0, 0, outputScale, 0, 0] 
          : null;

        const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport,
            transform: transform
        };
        
        await page.render(renderContext).promise;

        const textContent = await page.getTextContent();
        textLayer.innerHTML = ''; 
        textLayer.style.height = `${viewport.height}px`;
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.left = `0px`; 
        textLayer.style.top = `0px`;
        textLayer.style.setProperty('--scale-factor', `${viewport.scale}`);

        await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: viewport,
            textDivs: []
        }).promise;
        
        // Apply highlight if a quote exists for this page render
        if (citationQuote) {
            highlightQuote(citationQuote);
        }

    } catch(e) {
        console.error("Failed to render page", e)
    } finally {
        setIsRendering(false);
    }

  }, [pdfDoc, citationQuote, highlightQuote]);

  useEffect(() => {
    const loadPdf = async () => {
        const fileReader = new FileReader();
        fileReader.onload = async (event) => {
            if (!event.target?.result) return;
            const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
            try {
                const doc = await pdfjsLib.getDocument(typedarray).promise;
                setPdfDoc(doc);
                setCurrentPage(1);
                setPageInput('1');
            } catch(e) {
                console.error("Failed to load PDF document", e)
            }
        };
        fileReader.readAsArrayBuffer(file);
    };
    loadPdf();
  }, [file]);

  useEffect(() => {
    if (pdfDoc && !isLiquidMode) {
      renderPage(currentPage, scale, isFitWidth);
    }
  }, [pdfDoc, currentPage, scale, isFitWidth, renderPage, isLiquidMode]);

  useEffect(() => {
      const handleResize = () => {
          if (isFitWidth && pdfDoc && !isLiquidMode) {
              renderPage(currentPage, scale, true);
          }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [isFitWidth, pdfDoc, currentPage, scale, renderPage, isLiquidMode]);
  
  // Keyboard Navigation
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Only trigger if we are not in an input field
          if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
          
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              goToNextPage();
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              goToPrevPage();
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, pdfDoc]);

  const goToPrevPage = () => {
      const newPage = Math.max(1, currentPage - 1);
      setCurrentPage(newPage);
      setPageInput(newPage.toString());
  };
  
  const goToNextPage = () => {
      const newPage = pdfDoc ? Math.min(pdfDoc.numPages, currentPage + 1) : currentPage;
      setCurrentPage(newPage);
      setPageInput(newPage.toString());
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (pdfDoc && !isNaN(pageNum) && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
        setCurrentPage(pageNum);
    } else {
        setPageInput(currentPage.toString());
    }
  };

  const zoomIn = () => {
      setIsFitWidth(false);
      setScale(s => Math.min(3.0, s + 0.2));
  };
  const zoomOut = () => {
      setIsFitWidth(false);
      setScale(s => Math.max(0.6, s - 0.2));
  };
  const toggleFitWidth = () => {
      setIsFitWidth(prev => !prev);
      if (isFitWidth) setScale(1.2);
  };
  
  const increaseFontSize = () => setFontSize(s => Math.min(32, s + 2));
  const decreaseFontSize = () => setFontSize(s => Math.max(14, s - 2));

  const displayScale = isFitWidth ? 'FIT' : `${Math.round(scale * 100)}%`;

  return (
    <div className="flex flex-col h-full w-full relative bg-slate-900/50" ref={containerRef}>
       {/* Single Unified HUD Header */}
      <div className="flex-shrink-0 flex justify-between items-center px-4 py-3 border-b border-white/5 bg-slate-900/80 backdrop-blur-md z-20 overflow-x-auto scrollbar-hide">
         <div className="flex items-center space-x-4 min-w-0 flex-1 mr-4">
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[150px] lg:max-w-none" title={file.name}>
                {file.name}
            </span>
            <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-slate-400 border border-white/5">
                {pdfDoc?.numPages || 0} Pages
            </span>
         </div>
         
         <div className="flex items-center space-x-2 bg-slate-950/50 rounded-lg p-1 border border-white/5 flex-shrink-0">
             
            {/* Liquid Mode Toggle */}
            <button
                onClick={() => setIsLiquidMode(!isLiquidMode)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded transition-all ${
                    isLiquidMode 
                    ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.2)]' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title={isLiquidMode ? "Switch to Original Layout" : "Switch to Liquid Mode (Reflowable Text)"}
            >
                {isLiquidMode ? <OriginalIcon className="w-4 h-4" /> : <LiquidIcon className="w-4 h-4" />}
                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                    {isLiquidMode ? 'Original' : 'Liquid Mode'}
                </span>
            </button>
             
            <div className="w-px h-4 bg-white/10 mx-1"></div>

            {/* Page Controls Integrated - Only show in Original Mode */}
            {!isLiquidMode && (
                <>
                <button 
                    onClick={goToPrevPage} 
                    disabled={currentPage <= 1} 
                    className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous Page (Left Arrow)"
                >
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <form onSubmit={handlePageSubmit} className="flex items-center">
                     <input 
                        type="text" 
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        className="w-8 bg-transparent text-center text-xs font-mono text-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">/ {pdfDoc?.numPages || '-'}</span>
                </form>
                <button 
                    onClick={goToNextPage} 
                    disabled={!pdfDoc || currentPage >= pdfDoc.numPages} 
                    className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next Page (Right Arrow)"
                >
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                
                {/* Divider */}
                <div className="w-px h-4 bg-white/10 mx-1"></div>
                
                {/* Zoom Controls */}
                <button 
                    onClick={toggleFitWidth}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider transition-colors ${
                        isFitWidth ? 'text-sky-400 bg-sky-900/20' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    Fit
                </button>
                <button onClick={zoomOut} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white hidden sm:block">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <span className="text-[10px] text-slate-500 font-mono w-8 text-center hidden sm:block">{displayScale}</span>
                <button onClick={zoomIn} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white hidden sm:block">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                </>
            )}
            
            {/* Liquid Mode Typography Controls */}
            {isLiquidMode && (
                <div className="flex items-center space-x-2 animate-fade-in-up">
                    <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-white/5">
                        <button 
                            onClick={() => setIsSerif(false)} 
                            className={`p-1.5 rounded-md transition-all ${!isSerif ? 'bg-slate-700 text-sky-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Sans Serif"
                        >
                            <SansIcon className="w-3.5 h-3.5" />
                        </button>
                        <button 
                            onClick={() => setIsSerif(true)} 
                            className={`p-1.5 rounded-md transition-all ${isSerif ? 'bg-slate-700 text-sky-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Serif"
                        >
                            <SerifIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    
                    <div className="w-px h-4 bg-white/10"></div>
                    
                    <div className="flex items-center space-x-0.5">
                        <button 
                            onClick={decreaseFontSize} 
                            className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white text-[10px] font-bold"
                            title="Decrease Font Size"
                        >
                            A-
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono w-6 text-center select-none">{fontSize}</span>
                        <button 
                            onClick={increaseFontSize} 
                            className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white text-[10px] font-bold"
                            title="Increase Font Size"
                        >
                            A+
                        </button>
                    </div>
                </div>
            )}
         </div>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-8 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent flex justify-center bg-transparent">
        {isLiquidMode ? (
             <div className="max-w-2xl w-full bg-slate-950/80 rounded-2xl p-8 lg:p-12 shadow-2xl border border-white/5 animate-fade-in-up">
                 <div 
                    className={`prose prose-invert prose-lg max-w-none text-slate-300 leading-loose whitespace-pre-wrap text-justify selection:bg-indigo-500/30 selection:text-white ${isSerif ? 'font-serif' : 'font-sans'}`}
                    style={{ fontSize: `${fontSize}px` }}
                 >
                     {text || <span className="text-slate-500 italic">No text content available to display in Liquid Mode. Ensure the PDF contains selectable text.</span>}
                 </div>
             </div>
        ) : (
            <div className="relative shadow-2xl transition-transform duration-200 ease-out" style={{ width: 'fit-content', height: 'fit-content' }}>
                {isRendering && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                        <LoaderIcon className="w-8 h-8 animate-spin text-sky-500 mb-2"/>
                    </div>
                )}
                <canvas ref={canvasRef} className="block bg-white" />
                <div ref={textLayerRef} className="textLayer absolute top-0 left-0 origin-top-left" />
            </div>
        )}
      </div>

      <style>{`
        .textLayer {
            opacity: 0.6;
            mix-blend-mode: multiply;
            line-height: 1.0;
        }
        .textLayer > span {
            color: transparent;
            position: absolute;
            white-space: pre;
            cursor: text;
            transform-origin: 0% 0%;
        }
        ::selection {
            background: rgba(14, 165, 233, 0.3);
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default PdfViewer;