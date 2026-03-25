import React from 'react';
import { LayoutDashboard, Tag, Package, BarChart3, Settings, Plus, Users, Scan } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-bg-soft flex">
      {/* Sidebar (Desktop Only) */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-xl bg-purple-gradient flex items-center justify-center shadow-lg">
            <Scan className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">WowTag Admin</span>
        </div>
        
        <nav className="flex flex-col gap-2">
          {[
            { icon: LayoutDashboard, label: 'Dashboard', active: true },
            { icon: Package, label: 'Products', active: false },
            { icon: Tag, label: 'Tag Mapping', active: false },
            { icon: BarChart3, label: 'Analytics', active: false },
            { icon: Users, label: 'Customers', active: false },
            { icon: Settings, label: 'Settings', active: false },
          ].map((item, idx) => (
            <button 
              key={idx}
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${
                item.active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Welcome Back!</h1>
            <p className="text-slate-400 mt-1">Check Tag scan trends and manage your store.</p>
          </div>
          <button className="purple-btn flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Product
          </button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {[
            { label: 'Total Scans', value: '12,842', change: '+12%', icon: Scan, color: 'bg-emerald-500' },
            { label: 'Active Tags', value: '4,291', change: '+8%', icon: Tag, color: 'bg-indigo-500' },
            { label: 'Products', value: '86', change: '+2', icon: Package, color: 'bg-amber-500' },
            { label: 'New Visitors', value: '1,503', change: '+24%', icon: Users, color: 'bg-rose-500' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white p-6 rounded-4xl shadow-sm border border-white">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center text-white shadow-md`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <span className="text-emerald-500 text-sm font-bold bg-emerald-50 px-2 py-1 rounded-lg">{stat.change}</span>
              </div>
              <p className="text-slate-400 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{stat.value}</h3>
            </div>
          ))}
        </div>

        {/* Main Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Recent Activity */}
          <div className="lg:col-span-2 glass-card rounded-4xl p-8">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-slate-800">Scan Activity Map</h3>
              <button className="text-primary font-semibold hover:underline">View Details</button>
            </div>
            {/* Visual Placeholder */}
            <div className="w-full h-80 bg-bg-soft rounded-3xl flex items-center justify-center border-2 border-dashed border-slate-200">
              <span className="text-slate-400">Activity Chart Placeholder</span>
            </div>
          </div>

          {/* Right: Top Products */}
          <div className="bg-white rounded-4xl p-8 shadow-sm border border-white">
            <h3 className="text-xl font-bold text-slate-800 mb-8">Popular Tags</h3>
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-bg-soft flex items-center justify-center overflow-hidden">
                    <img src={`https://picsum.photos/seed/${i}/100`} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">Product #{i}00124</p>
                    <p className="text-xs text-slate-400">UID: NFC_X92K4_{i}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{12 * (6-i)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
