import React from 'react';
import { Share2, Download, Play, ChevronRight, Bookmark } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-bg-soft flex flex-col items-center p-6 pb-20">
      {/* Header Space */}
      <div className="w-full max-w-md flex justify-between items-center mb-10">
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <ChevronRight className="w-6 h-6 text-primary rotate-180" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">WowTag</h1>
        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
          <Bookmark className="w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* Main Visual Card */}
      <div className="w-full max-w-md relative mb-8">
        <div className="w-full aspect-[3/4] rounded-4xl overflow-hidden shadow-2xl relative">
          <div className="absolute inset-0 bg-purple-gradient opacity-20"></div>
          <img 
            src="https://images.unsplash.com/photo-1515562141207-7a18b5ce7142?auto=format&fit=crop&q=80&w=800" 
            alt="Product" 
            className="w-full h-full object-cover"
          />
          {/* Floating Glass UI */}
          <div className="absolute bottom-6 left-6 right-6 glass-card p-6 rounded-3xl">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Premium Jewelry</h2>
            <p className="text-slate-500 mb-4 text-sm leading-relaxed">
              Experience the craftsmanship and history behind our unique collection.
            </p>
            <button className="w-full purple-btn flex items-center justify-center gap-2">
              <Play className="w-5 h-5 fill-current" />
              Watch Manual Video
            </button>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="w-full max-w-md space-y-4">
        {[
          { icon: Share2, title: 'Share Certificate', desc: 'Send this digital copy' },
          { icon: Download, title: 'Download Manual', desc: 'Available in PDF' },
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-5 rounded-3xl flex items-center gap-4 shadow-sm border border-white">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <item.icon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800">{item.title}</h3>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </div>
        ))}
      </div>

      {/* Navigation Dummy */}
      <div className="fixed bottom-6 w-full max-w-md flex justify-center px-6">
        <div className="bg-slate-900 rounded-full py-4 px-10 flex gap-12 items-center shadow-2xl">
          <div className="w-2 h-2 rounded-full bg-white"></div>
          <div className="w-2 h-2 rounded-full bg-white/30"></div>
          <div className="w-2 h-2 rounded-full bg-white/30"></div>
        </div>
      </div>
    </div>
  );
}

export default App;
