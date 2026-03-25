
import { LayoutDashboard, Tag, Package, BarChart3, Settings, Plus, Users, Scan, Bell, Search, ArrowUpRight, ExternalLink } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-bg-soft flex font-sans">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col p-6 bg-white border-r border-slate-100 shadow-sm fixed h-full z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-xl bg-purple-gradient flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Scan className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">WowTag Admin</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { icon: LayoutDashboard, label: 'Dashboard', active: true },
            { icon: Package, label: 'Products', active: false },
            { icon: Tag, label: 'Tag Mapping', active: false },
            { icon: BarChart3, label: 'Analytics', active: false },
            { icon: Users, label: 'Customers', active: false },
          ].map((item, idx) => (
            <button 
              key={idx}
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 group cursor-pointer ${
                item.active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <item.icon className={`w-5 h-5 ${item.active ? 'text-white' : 'text-slate-400 group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-50">
          <button className="flex items-center gap-4 px-4 py-3 rounded-2xl text-slate-400 hover:bg-slate-50 w-full transition-all cursor-pointer">
            <Settings className="w-5 h-5 text-slate-400" />
            <span className="font-semibold text-sm">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 lg:px-10 flex items-center justify-between sticky top-0 z-10">
          <div className="flex-1 max-w-xl relative hidden md:block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search everything..." 
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <button className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-50 relative cursor-pointer">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-px bg-slate-100 mx-2"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800 leading-none">Jay Seo</p>
                <p className="text-xs text-slate-400 mt-1">Super Admin</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jay" alt="User Avatar" />
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 space-y-10">
          {/* Welcome Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Overview Dashboard</h2>
              <p className="text-slate-400 mt-1 font-medium">Hello Jay, here's what's happening with WowTag today.</p>
            </div>
            <div className="flex gap-3">
              <button className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-white hover:shadow-sm transition-all flex items-center gap-2 cursor-pointer">
                Download Report
              </button>
              <button className="purple-btn !py-2.5 !text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add New Product
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Total Scans', value: '12,842', change: '+12.5%', icon: Scan, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Active Tags', value: '4,291', change: '+8.2%', icon: Tag, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Revenue', value: '$24.5k', change: '+14.1%', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Conversion', value: '3.2%', change: '+2.4%', icon: ArrowUpRight, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-50 transition-all hover:shadow-xl hover:shadow-slate-200/50 group cursor-default">
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <span className="text-emerald-500 text-xs font-bold px-2 py-1 bg-emerald-50 rounded-lg">{stat.change}</span>
                </div>
                <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">{stat.label}</p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{stat.value}</h3>
              </div>
            ))}
          </div>

          {/* Charts Area */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Main chart placeholder */}
            <div className="xl:col-span-2 glass-card rounded-3xl p-8 relative overflow-hidden group">
              <div className="flex justify-between items-center mb-10 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Scan Activity Map</h3>
                  <p className="text-xs text-slate-400 font-medium">Daily scanning trends across all active tags</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button className="px-4 py-1.5 text-xs font-bold rounded-lg bg-white shadow-sm text-slate-800 cursor-pointer">Daily</button>
                  <button className="px-4 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">Weekly</button>
                </div>
              </div>
              <div className="w-full h-80 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100 flex items-center justify-center relative group-hover:bg-slate-50 transition-colors">
                <div className="text-center group-hover:scale-105 transition-transform">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg mx-auto mb-4">
                    <BarChart3 className="w-8 h-8 text-primary" />
                  </div>
                  <span className="text-slate-400 font-bold">Activity Visualization Coming Soon</span>
                </div>
              </div>
            </div>

            {/* Popular items side pane */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-50">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold text-slate-800">Popular Tags</h3>
                <button className="text-slate-400 hover:text-primary transition-colors cursor-pointer">
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 group cursor-pointer">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border border-white transition-transform group-hover:scale-105">
                      <img src={`https://picsum.photos/seed/tag-${i}/100`} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm group-hover:text-primary transition-colors">Product Alpha #{i}</p>
                      <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase">UID: NFC_X92K4_00{i}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800 text-sm">{(142 * (6-i)).toLocaleString()}</p>
                      <p className="text-[10px] text-emerald-500 font-bold">scans</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-10 py-3 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer">
                View All Activity
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
