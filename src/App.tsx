/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, Download, Trash2, Plus, Loader2, Check, X, Smartphone, List, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface SavedEntry {
  id: string;
  text: string;
  timestamp: string;
}

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detectedItems, setDetectedItems] = useState<string[]>([]);
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'camera' | 'history'>('camera');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load saved entries from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ocr_saved_entries');
    if (stored) {
      try {
        setSavedEntries(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored entries", e);
      }
    }
  }, []);

  // Save entries to localStorage
  useEffect(() => {
    localStorage.setItem('ocr_saved_entries', JSON.stringify(savedEntries));
  }, [savedEntries]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraActive(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("تعذر الوصول إلى الكاميرا. يرجى التأكد من منح الأذونات اللازمة.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg');
    setCapturedImage(base64Image);
    stopCamera();
    performOCR(base64Image);
  };

  const performOCR = async (base64Data: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const model = "gemini-3-flash-preview";
      const prompt = "Extract all text, letters, and numbers from this image. Return them as a simple comma-separated list of strings. Only return the extracted items, nothing else.";
      
      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data.split(',')[1],
        },
      };

      const result = await genAI.models.generateContent({
        model,
        contents: [{ parts: [imagePart, { text: prompt }] }],
      });

      const text = result.text || "";
      const items = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
      setDetectedItems(items);
    } catch (err) {
      console.error("OCR Error:", err);
      setError("حدث خطأ أثناء معالجة الصورة. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveEntry = (text: string) => {
    const newEntry: SavedEntry = {
      id: crypto.randomUUID(),
      text,
      timestamp: new Date().toLocaleString('ar-EG'),
    };
    setSavedEntries([newEntry, ...savedEntries]);
    setDetectedItems(prev => prev.filter(item => item !== text));
  };

  const deleteEntry = (id: string) => {
    setSavedEntries(savedEntries.filter(entry => entry.id !== id));
  };

  const exportToExcel = () => {
    if (savedEntries.length === 0) return;

    const data = savedEntries.map(entry => ({
      "النص المستخرج": entry.text,
      "التاريخ والوقت": entry.timestamp,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "OCR Data");
    XLSX.writeFile(workbook, `OCR_Data_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setDetectedItems([]);
    startCamera();
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#141414]/10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Smartphone className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight uppercase italic serif">OCR to Excel</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setView('camera')}
            className={`p-2 rounded-full transition-colors ${view === 'camera' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'}`}
          >
            <Camera className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setView('history')}
            className={`p-2 rounded-full transition-colors ${view === 'history' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'}`}
          >
            <History className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === 'camera' ? (
            <motion.div 
              key="camera-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Camera Section */}
              <div className="relative aspect-[3/4] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
                {!capturedImage ? (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    {!isCameraActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white p-8 text-center">
                        <Camera className="w-16 h-16 mb-4 opacity-50" />
                        <button 
                          onClick={startCamera}
                          className="px-8 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                        >
                          تشغيل الكاميرا
                        </button>
                      </div>
                    )}
                    {isCameraActive && (
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                        <button 
                          onClick={captureFrame}
                          className="w-20 h-20 bg-white rounded-full border-8 border-white/30 flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
                        >
                          <div className="w-14 h-14 bg-white rounded-full border-2 border-black" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                )}

                {isLoading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-12 h-12 animate-spin mb-4" />
                    <p className="font-mono text-sm tracking-widest uppercase">جاري استخراج النص...</p>
                  </div>
                )}
              </div>

              {/* Results Section */}
              {capturedImage && !isLoading && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-mono uppercase opacity-50">النتائج المكتشفة</h2>
                    <button 
                      onClick={resetCapture}
                      className="text-xs font-mono uppercase underline underline-offset-4 hover:opacity-50"
                    >
                      إعادة المحاولة
                    </button>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {detectedItems.length > 0 ? (
                      detectedItems.map((item, idx) => (
                        <motion.button
                          key={idx}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => saveEntry(item)}
                          className="px-4 py-2 bg-white border border-[#141414]/10 rounded-full text-sm font-medium hover:bg-[#141414] hover:text-white transition-all flex items-center gap-2"
                        >
                          {item}
                          <Plus className="w-4 h-4" />
                        </motion.button>
                      ))
                    ) : (
                      !error && <p className="text-sm opacity-50 italic">لم يتم العثور على نص واضح. حاول التقاط صورة أقرب.</p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="history-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold serif italic">السجل المحفوظ</h2>
                {savedEntries.length > 0 && (
                  <button 
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-6 py-2 bg-[#141414] text-white rounded-full text-sm font-bold hover:bg-[#141414]/80 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    تصدير إلى Excel
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {savedEntries.length > 0 ? (
                  savedEntries.map((entry) => (
                    <motion.div 
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group bg-white p-4 rounded-2xl border border-[#141414]/5 flex justify-between items-center hover:border-[#141414]/20 transition-all"
                    >
                      <div>
                        <p className="text-lg font-medium">{entry.text}</p>
                        <p className="text-[10px] font-mono opacity-40 uppercase tracking-tighter">{entry.timestamp}</p>
                      </div>
                      <button 
                        onClick={() => deleteEntry(entry.id)}
                        className="p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-full transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-20 opacity-30">
                    <List className="w-12 h-12 mx-auto mb-4" />
                    <p>لا توجد بيانات محفوظة بعد</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
