
import React, { useRef, useEffect } from 'react';
import { PdfDocument } from '../types';
import { FileIcon, UploadIcon, TrashIcon } from './icons';

interface FileManagerProps {
  documents: PdfDocument[];
  selectedDocIds: Set<number>;
  activeDocId?: number | null;
  onSelectionChange: (selectedIds: Set<number>) => void;
  onDocumentClick: (document: PdfDocument) => void;
  onFilesAdd: (files: FileList) => void;
  onDeleteSelected: () => void;
  onClearLibrary: () => void;
}

const FileManager: React.FC<FileManagerProps> = ({
  documents,
  selectedDocIds,
  activeDocId,
  onSelectionChange,
  onDocumentClick,
  onFilesAdd,
  onDeleteSelected,
  onClearLibrary
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active document into view
  useEffect(() => {
    if (activeDocId && listRef.current) {
        const activeEl = listRef.current.querySelector(`[data-doc-id="${activeDocId}"]`);
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
  }, [activeDocId]);

  const handleCheckboxChange = (docId: number, isChecked: boolean) => {
    const newSet = new Set(selectedDocIds);
    if (isChecked) {
      newSet.add(docId);
    } else {
      newSet.delete(docId);
    }
    onSelectionChange(newSet);
  };

  const handleSelectAll = (isChecked: boolean) => {
    if (isChecked) {
      onSelectionChange(new Set(documents.map(d => d.id)));
    } else {
      onSelectionChange(new Set());
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdd(e.target.files);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-2xl border border-slate-800/60 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
        <h2 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Library</h2>
        <div className="flex items-center space-x-3">
             <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="appearance-none h-3 w-3 rounded-sm border border-slate-600 checked:bg-sky-500 checked:border-sky-500 transition-colors focus:ring-0 focus:ring-offset-0 bg-slate-800"
                    checked={selectedDocIds.size === documents.length && documents.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    disabled={documents.length === 0}
                  />
                  <span className="ml-2 text-[10px] font-medium text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-wide">
                    All
                  </span>
             </label>
             
             {/* Action Buttons */}
             {selectedDocIds.size > 0 ? (
                <>
                <div className="h-4 w-px bg-slate-700 mx-1"></div>
                <button 
                  onClick={onDeleteSelected}
                  className="flex items-center space-x-1 text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 shadow-sm"
                  title="Delete Selected Documents"
                >
                    <TrashIcon className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase">Delete ({selectedDocIds.size})</span>
                </button>
                </>
             ) : (
                 documents.length > 0 && (
                    <button 
                      onClick={onClearLibrary}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-white/5"
                      title="Clear All Documents"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                 )
             )}
        </div>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent p-2 space-y-1">
        {documents.map((doc, index) => {
          const isActive = activeDocId === doc.id;
          return (
            <div
              key={doc.id}
              data-doc-id={doc.id}
              className={`group flex items-center p-3 rounded-xl transition-all duration-200 border ${
                isActive 
                ? 'bg-sky-500/10 border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.05)]' 
                : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
              }`}
            >
              <div className="flex items-center h-full pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className={`appearance-none h-4 w-4 rounded-md border transition-all cursor-pointer focus:ring-0 focus:ring-offset-0 ${
                        selectedDocIds.has(doc.id) 
                        ? 'bg-sky-500 border-sky-500' 
                        : 'bg-slate-800 border-slate-600 hover:border-slate-500'
                    }`}
                    checked={selectedDocIds.has(doc.id)}
                    onChange={(e) => handleCheckboxChange(doc.id, e.target.checked)}
                  />
              </div>
              
              <div 
                className="flex-1 ml-3 cursor-pointer min-w-0"
                onClick={() => onDocumentClick(doc)}
              >
                <div className="flex items-center mb-0.5">
                    <FileIcon className={`w-3.5 h-3.5 mr-2 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span className={`text-xs font-mono opacity-50 ${isActive ? 'text-sky-300' : 'text-slate-500'}`}>0{index + 1}</span>
                </div>
                <p className={`text-sm font-medium truncate leading-snug ${
                    isActive 
                    ? 'text-sky-100 underline decoration-sky-500/50 underline-offset-4 decoration-1' 
                    : 'text-slate-300 group-hover:text-slate-200'
                }`} title={doc.file.name}>
                  {doc.file.name.replace('.pdf', '')}
                </p>
              </div>
            </div>
          );
        })}
        
        {documents.length === 0 && (
            <div className="text-center py-10 opacity-30">
                <p className="text-xs text-slate-400">No documents</p>
            </div>
        )}
      </div>

      {/* Footer / Add Button */}
      <div className="p-3 border-t border-white/5 bg-slate-900/30">
        <label
            htmlFor="add-files"
            className="w-full flex items-center justify-center cursor-pointer rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 px-4 py-3 text-sm font-medium text-slate-300 transition-all active:scale-[0.98] group shadow-lg"
          >
            <UploadIcon className="w-4 h-4 mr-2 text-slate-400 group-hover:text-sky-400 transition-colors" />
            <span>Import PDF</span>
        </label>
         <input
            type="file"
            id="add-files"
            className="hidden"
            accept=".pdf"
            onChange={handleFileSelect}
            multiple
          />
      </div>
    </div>
  );
};

export default FileManager;
