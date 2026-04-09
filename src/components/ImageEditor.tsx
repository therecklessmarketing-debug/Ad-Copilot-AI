import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Undo, 
  Redo, 
  Sparkles, 
  Save, 
  RotateCcw, 
  Loader2,
  Image as ImageIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { EditorState, ImageAdjustments } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImageEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialImageUrl: string;
  onSave: (newImageUrl: string) => void;
  ai: GoogleGenAI;
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0
};

export default function ImageEditor({ isOpen, onClose, initialImageUrl, onSave, ai }: ImageEditorProps) {
  const [history, setHistory] = useState<EditorState[]>([
    { imageUrl: initialImageUrl, adjustments: { ...DEFAULT_ADJUSTMENTS } }
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'adjust' | 'ai'>('adjust');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentState = history[currentIndex];

  useEffect(() => {
    if (isOpen) {
      setHistory([{ imageUrl: initialImageUrl, adjustments: { ...DEFAULT_ADJUSTMENTS } }]);
      setCurrentIndex(0);
      setAiPrompt('');
    }
  }, [isOpen, initialImageUrl]);

  const addToHistory = useCallback((newState: EditorState) => {
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  }, [currentIndex, history]);

  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleRedo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleAdjustmentChange = (key: keyof ImageAdjustments, value: number) => {
    const newAdjustments = { ...currentState.adjustments, [key]: value };
    // Update current state in place for real-time preview
    const newHistory = [...history];
    newHistory[currentIndex] = { ...currentState, adjustments: newAdjustments };
    setHistory(newHistory);
  };

  const commitAdjustments = () => {
    // This is called on mouseUp to create a history point
    // We only push if it's actually different from the previous state
    if (currentIndex > 0) {
      const prevState = history[currentIndex - 1];
      if (JSON.stringify(prevState.adjustments) === JSON.stringify(currentState.adjustments) && prevState.imageUrl === currentState.imageUrl) {
        return;
      }
    }
    // We don't actually need to "push" here because handleAdjustmentChange already updated the current index.
    // Wait, that's wrong for undo/redo. 
    // If I update current index, I lose the ability to undo to the state *before* the slider started moving.
    
    // Correct logic:
    // 1. handleAdjustmentChange updates a TEMPORARY state for preview.
    // 2. onMouseUp calls addToHistory with that state.
  };

  // Let's fix the adjustment logic
  const [previewAdjustments, setPreviewAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);

  useEffect(() => {
    if (currentState) {
      setPreviewAdjustments(currentState.adjustments);
    }
  }, [currentState]);

  const handlePreviewAdjustmentChange = (key: keyof ImageAdjustments, value: number) => {
    setPreviewAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const handleCommitAdjustment = () => {
    addToHistory({
      imageUrl: currentState.imageUrl,
      adjustments: { ...previewAdjustments }
    });
  };

  const handleAIEdit = async () => {
    if (!aiPrompt.trim()) return;
    setIsAIGenerating(true);
    try {
      const processedImageUrl = await getProcessedImage();
      const base64Data = processedImageUrl.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            {
              text: aiPrompt,
            },
          ],
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (imagePart?.inlineData) {
        const newImageUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
        addToHistory({
          imageUrl: newImageUrl,
          adjustments: { ...DEFAULT_ADJUSTMENTS }
        });
        setAiPrompt('');
      }
    } catch (err) {
      console.error("AI Edit failed:", err);
    } finally {
      setIsAIGenerating(false);
    }
  };

  const getProcessedImage = (): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { brightness, contrast, saturation, blur } = previewAdjustments;
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = currentState.imageUrl;
    });
  };

  const handleSave = async () => {
    const finalImageUrl = await getProcessedImage();
    onSave(finalImageUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 lg:p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#F5F5F4] flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#141414] flex items-center justify-center text-white">
              <ImageIcon size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Image Editor</h2>
              <p className="text-[10px] text-[#8E8E8E] uppercase tracking-widest font-bold">AI-Powered Creative Studio</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#F5F5F4] rounded-xl p-1 mr-4">
              <button 
                onClick={handleUndo}
                disabled={currentIndex === 0}
                className="p-2 text-[#141414] disabled:opacity-30 hover:bg-white rounded-lg transition-all"
                title="Undo"
              >
                <Undo size={18} />
              </button>
              <button 
                onClick={handleRedo}
                disabled={currentIndex === history.length - 1}
                className="p-2 text-[#141414] disabled:opacity-30 hover:bg-white rounded-lg transition-all"
                title="Redo"
              >
                <Redo size={18} />
              </button>
            </div>
            
            <button 
              onClick={onClose}
              className="p-2 text-[#8E8E8E] hover:text-[#141414] hover:bg-[#F5F5F4] rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Main Preview Area */}
          <div className="flex-1 bg-[#F5F5F4] p-8 flex items-center justify-center overflow-hidden relative">
            <div className="relative max-w-full max-h-full shadow-2xl rounded-lg overflow-hidden">
              <img 
                src={currentState.imageUrl} 
                alt="Preview" 
                className="max-w-full max-h-[60vh] lg:max-h-[70vh] object-contain"
                referrerPolicy="no-referrer"
                style={{
                  filter: `brightness(${previewAdjustments.brightness}%) contrast(${previewAdjustments.contrast}%) saturate(${previewAdjustments.saturation}%) blur(${previewAdjustments.blur}px)`
                }}
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            
            {/* Floating History Indicator */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-lg flex items-center gap-3">
               <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">History</span>
               <div className="flex gap-1">
                 {history.map((_, i) => (
                   <div 
                    key={i} 
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      i === currentIndex ? "bg-[#141414] w-4" : "bg-[#E5E5E5]"
                    )} 
                   />
                 ))}
               </div>
            </div>
          </div>

          {/* Sidebar Controls */}
          <div className="w-full lg:w-80 border-l border-[#F5F5F4] flex flex-col bg-white">
            <div className="flex border-b border-[#F5F5F4]">
              <button 
                onClick={() => setActiveTab('adjust')}
                className={cn(
                  "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
                  activeTab === 'adjust' ? "border-[#141414] text-[#141414]" : "border-transparent text-[#8E8E8E]"
                )}
              >
                Adjustments
              </button>
              <button 
                onClick={() => setActiveTab('ai')}
                className={cn(
                  "flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
                  activeTab === 'ai' ? "border-[#141414] text-[#141414]" : "border-transparent text-[#8E8E8E]"
                )}
              >
                AI Edit
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {activeTab === 'adjust' ? (
                <div className="space-y-6">
                  {[
                    { label: 'Brightness', key: 'brightness', min: 0, max: 200 },
                    { label: 'Contrast', key: 'contrast', min: 0, max: 200 },
                    { label: 'Saturation', key: 'saturation', min: 0, max: 200 },
                    { label: 'Blur', key: 'blur', min: 0, max: 20 }
                  ].map((adj) => (
                    <div key={adj.key} className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">{adj.label}</label>
                        <span className="text-[10px] font-mono font-bold">{previewAdjustments[adj.key as keyof ImageAdjustments]}{adj.key === 'blur' ? 'px' : '%'}</span>
                      </div>
                      <input 
                        type="range"
                        min={adj.min}
                        max={adj.max}
                        value={previewAdjustments[adj.key as keyof ImageAdjustments]}
                        onChange={(e) => handlePreviewAdjustmentChange(adj.key as keyof ImageAdjustments, parseInt(e.target.value))}
                        onMouseUp={handleCommitAdjustment}
                        className="w-full h-1.5 bg-[#F5F5F4] rounded-lg appearance-none cursor-pointer accent-[#141414]"
                      />
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      addToHistory({
                        imageUrl: currentState.imageUrl,
                        adjustments: { ...DEFAULT_ADJUSTMENTS }
                      });
                    }}
                    className="w-full py-3 border border-[#E5E5E5] rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#F5F5F4] transition-all"
                  >
                    <RotateCcw size={14} />
                    Reset All
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-[10px] text-emerald-700 leading-relaxed">
                      Describe what you want to change or add to the image. Gemini will process your request and generate a new version.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">AI Edit Prompt</label>
                    <textarea 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g. Add a sunset in the background, change the shirt color to blue..."
                      className="w-full h-32 p-4 bg-[#F5F5F4] rounded-xl border border-transparent focus:border-[#141414] focus:ring-0 transition-all text-sm resize-none"
                    />
                  </div>
                  
                  <button 
                    onClick={handleAIEdit}
                    disabled={isAIGenerating || !aiPrompt.trim()}
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-black/10"
                  >
                    {isAIGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    {isAIGenerating ? 'Generating...' : 'Apply AI Edit'}
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-[#F5F5F4] bg-[#FAFAFA]">
              <button 
                onClick={handleSave}
                className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all shadow-xl shadow-black/10"
              >
                <Save size={18} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
