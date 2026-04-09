const fs = require('fs');

const content = fs.readFileSync('src/App.tsx', 'utf8');

const startIdx = content.indexOf('            {/* Tab Content */}');
const endIdx = content.indexOf('      {/* Add Client Modal */}');

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find start or end index');
  process.exit(1);
}

// We want to replace the end of the AnimatePresence block and the floating closing brackets
// with the proper closing of renderContent and the start of the App return statement.

// Let's find the exact string to replace.
const sectionToReplace = content.substring(startIdx, endIdx);

// The section currently ends with:
//               </motion.div>
//             </AnimatePresence>
//           </div>
//         )}
//       </div>
// 

const replacement = sectionToReplace.replace(
  /              <\/motion\.div>\n            <\/AnimatePresence>\n          <\/div>\n        \)}\n      <\/div>\n\n/g,
  `              </motion.div>
            </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#141414] font-sans flex overflow-hidden">
      {/* Left Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E5E5] flex flex-col shrink-0 z-40">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center relative">
              <Plane className="text-white w-4 h-4 -rotate-12" />
              <Sparkles className="text-emerald-400 w-2.5 h-2.5 absolute -top-0.5 -right-0.5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">Ad Copilot Ai</h1>
          </div>

          <nav className="space-y-8">
            {/* Ad Studio Section */}
            <div>
              <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-4 px-2">Ad Studio</p>
              <div className="space-y-1">
                {[
                  { id: 'copy', label: 'Ad Copy', icon: Type },
                  { id: 'images', label: 'Ad Visuals', icon: ImageIcon },
                  { id: 'ai-ad-builder', label: 'AI Ad Builder', icon: Sparkles },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group",
                      activeTab === item.id 
                        ? "bg-[#141414] text-white shadow-md shadow-[#141414]/10" 
                        : "text-[#8E8E8E] hover:bg-[#F5F5F4] hover:text-[#141414]"
                    )}
                  >
                    <item.icon size={16} className={cn(
                      "transition-colors",
                      activeTab === item.id ? "text-emerald-400" : "text-[#8E8E8E] group-hover:text-[#141414]"
                    )} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Insights Section */}
            <div>
              <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-4 px-2">Insights</p>
              <div className="space-y-1">
                {[
                  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
                  { id: 'performance', label: 'Performance', icon: TrendingUp },
                  { id: 'breakdowns', label: 'Breakdowns', icon: BarChart3 },
                  { id: 'funnel', label: 'Funnel', icon: Activity },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group",
                      activeTab === item.id 
                        ? "bg-[#141414] text-white shadow-md shadow-[#141414]/10" 
                        : "text-[#8E8E8E] hover:bg-[#F5F5F4] hover:text-[#141414]"
                    )}
                  >
                    <item.icon size={16} className={cn(
                      "transition-colors",
                      activeTab === item.id ? "text-emerald-400" : "text-[#8E8E8E] group-hover:text-[#141414]"
                    )} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reports Section */}
            <div>
              <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-4 px-2">Reports</p>
              <div className="space-y-1">
                {[
                  { id: 'ai-performance-report', label: 'AI Report', icon: FileText },
                  { id: 'kpi-settings', label: 'KPI Settings', icon: Settings },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group",
                      activeTab === item.id 
                        ? "bg-[#141414] text-white shadow-md shadow-[#141414]/10" 
                        : "text-[#8E8E8E] hover:bg-[#F5F5F4] hover:text-[#141414]"
                    )}
                  >
                    <item.icon size={16} className={cn(
                      "transition-colors",
                      activeTab === item.id ? "text-emerald-400" : "text-[#8E8E8E] group-hover:text-[#141414]"
                    )} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-[#E5E5E5]">
          <div className="flex items-center justify-between mb-4 px-2">
            <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest">Clients</p>
            <button 
              onClick={() => setIsAddingClient(true)}
              className="p-1 hover:bg-[#F5F5F4] rounded-md transition-colors text-[#141414]"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {clients.map(client => (
              <div key={client.id} className="flex items-center group">
                <button
                  onClick={() => setSelectedClient(client)}
                  className={cn(
                    "flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-left truncate",
                    selectedClient?.id === client.id 
                      ? "bg-[#F5F5F4] text-[#141414]" 
                      : "text-[#8E8E8E] hover:bg-[#F5F5F4] hover:text-[#141414]"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    selectedClient?.id === client.id ? "bg-emerald-400" : "bg-transparent"
                  )} />
                  <span className="truncate">{client.name}</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedClient(client);
                    setIsClientSettingsOpen(true);
                  }}
                  className={cn(
                    "p-2 rounded-xl transition-all shrink-0 ml-1",
                    selectedClient?.id === client.id 
                      ? "text-[#141414] hover:bg-[#E5E5E5]" 
                      : "text-transparent group-hover:text-[#8E8E8E] hover:bg-[#F5F5F4]"
                  )}
                >
                  <Settings size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[#F5F5F4]">
        <div className="p-8 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Right Sidebar - Global Controls */}
      <aside className={cn(
        "bg-white border-l border-[#E5E5E5] flex flex-col transition-all duration-300 z-40 shrink-0 overflow-hidden",
        isRightSidebarOpen ? "w-80" : "w-12"
      )}>
        <div className="flex items-center justify-between p-4 border-b border-[#E5E5E5]">
          {isRightSidebarOpen && <h2 className="font-bold text-sm uppercase tracking-widest">Global Controls</h2>}
          <button 
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className="p-1.5 hover:bg-[#F5F5F4] rounded-lg transition-colors text-[#8E8E8E] hover:text-[#141414]"
          >
            {isRightSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {isRightSidebarOpen && (
          <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
            {/* Date Period */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Date Period</h3>
                <Calendar size={14} className="text-[#8E8E8E]" />
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1 bg-[#F5F5F4] p-1 rounded-xl">
                  {[3, 7, 14, 30].map(days => (
                    <button 
                      key={days}
                      onClick={() => applyQuickDate(days)}
                      className="py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-white hover:shadow-sm transition-all"
                    >
                      {days}D
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-[#8E8E8E] uppercase ml-1">Start Date</label>
                    <input 
                      type="date" 
                      value={dateRange.start}
                      onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                      className="w-full p-2.5 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-[#8E8E8E] uppercase ml-1">End Date</label>
                    <input 
                      type="date" 
                      value={dateRange.end}
                      onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                      className="w-full p-2.5 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5"
                    />
                  </div>
                </div>
                <button 
                  onClick={toggleComparison}
                  className={cn(
                    "w-full py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2",
                    isComparing ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-[#E5E5E5] text-[#141414] hover:bg-[#FAFAFA]"
                  )}
                >
                  <TrendingUp size={14} />
                  {isComparing ? "Comparing Enabled" : "Compare Period"}
                </button>
              </div>
            </section>

            {/* Ad Account */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Meta Ad Account</h3>
                <Activity size={14} className="text-[#8E8E8E]" />
              </div>
              <select 
                value={selectedClient?.ad_account_id || ''}
                onChange={(e) => handleSaveMetaSettings(e.target.value)}
                className="w-full p-3 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5 appearance-none cursor-pointer"
              >
                <option value="">Select Ad Account</option>
                {availableAdAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_id})</option>
                ))}
              </select>
            </section>

            {/* Campaigns */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Campaigns</h3>
                <div className="flex gap-1">
                  {['ALL', 'ACTIVE', 'PAUSED'].map(s => (
                    <button 
                      key={s}
                      onClick={() => setCampaignStatusFilter(s as any)}
                      className={cn(
                        "px-2 py-0.5 text-[8px] font-black rounded transition-all",
                        campaignStatusFilter === s ? "bg-[#141414] text-white" : "bg-[#F5F5F4] text-[#8E8E8E] hover:text-[#141414]"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#F5F5F4] rounded-2xl p-2 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                {isFetchingCampaigns ? (
                  <div className="py-4 text-center">
                    <RefreshCw size={16} className="animate-spin mx-auto text-[#8E8E8E]" />
                  </div>
                ) : metaCampaigns.length === 0 ? (
                  <p className="text-[10px] text-[#8E8E8E] text-center py-4 italic">No campaigns found</p>
                ) : (
                  metaCampaigns.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-xl cursor-pointer transition-all group">
                      <input 
                        type="checkbox"
                        checked={selectedCampaignIds.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedCampaignIds(prev => [...prev, c.id]);
                          else setSelectedCampaignIds(prev => prev.filter(id => id !== c.id));
                        }}
                        className="rounded border-[#E5E5E5] text-[#141414] focus:ring-[#141414]/10"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold truncate group-hover:text-[#141414]">{c.name}</p>
                        <p className="text-[8px] text-[#8E8E8E] uppercase tracking-tighter">{c.status}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </section>

            {/* Ad Sets */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Ad Sets</h3>
                <div className="flex gap-1">
                  {['ALL', 'ACTIVE', 'PAUSED'].map(s => (
                    <button 
                      key={s}
                      onClick={() => setAdSetStatusFilter(s as any)}
                      className={cn(
                        "px-2 py-0.5 text-[8px] font-black rounded transition-all",
                        adSetStatusFilter === s ? "bg-[#141414] text-white" : "bg-[#F5F5F4] text-[#8E8E8E] hover:text-[#141414]"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#F5F5F4] rounded-2xl p-2 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                {isFetchingAdSets ? (
                  <div className="py-4 text-center">
                    <RefreshCw size={16} className="animate-spin mx-auto text-[#8E8E8E]" />
                  </div>
                ) : metaAdSets.length === 0 ? (
                  <p className="text-[10px] text-[#8E8E8E] text-center py-4 italic">
                    {selectedCampaignIds.length === 0 ? "Select campaigns first" : "No ad sets found"}
                  </p>
                ) : (
                  metaAdSets.map(as => (
                    <label key={as.id} className="flex items-center gap-2 p-2 hover:bg-white rounded-xl cursor-pointer transition-all group">
                      <input 
                        type="checkbox"
                        checked={selectedAdSetIds.includes(as.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedAdSetIds(prev => [...prev, as.id]);
                          else setSelectedAdSetIds(prev => prev.filter(id => id !== as.id));
                        }}
                        className="rounded border-[#E5E5E5] text-[#141414] focus:ring-[#141414]/10"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold truncate group-hover:text-[#141414]">{as.name}</p>
                        <p className="text-[8px] text-[#8E8E8E] uppercase tracking-tighter">{as.status}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </section>

            {/* Primary Conversion Setting */}
            <section className="pt-4 border-t border-[#E5E5E5]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Primary Conversion</h3>
                <Zap size={14} className="text-amber-500" />
              </div>
              <select 
                value={selectedClient?.primary_conversion_event || 'conversions'}
                onChange={(e) => selectedClient && handleUpdateClient(selectedClient.id, { primary_conversion_event: e.target.value })}
                className="w-full p-3 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5 appearance-none cursor-pointer"
              >
                <option value="conversions">Standard Conversions</option>
                <option value="offsite_conversion.fb_pixel_view_content">View Content</option>
                <option value="offsite_conversion.fb_pixel_purchase">Purchase</option>
                <option value="offsite_conversion.fb_pixel_lead">Lead</option>
                <option value="offsite_conversion.fb_pixel_add_to_cart">Add to Cart</option>
                <option value="offsite_conversion.fb_pixel_initiate_checkout">Initiate Checkout</option>
                <option value="offsite_conversion.fb_pixel_complete_registration">Complete Registration</option>
              </select>
              <p className="mt-2 text-[9px] text-[#8E8E8E] leading-relaxed italic">
                This setting defines what counts as a "Conversion" for winner detection and scoring.
              </p>
            </section>
          </div>
        )}
      </aside>

`
);

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync('src/App.tsx', newContent);
console.log('Successfully replaced end of renderContent and start of App return');
