const fs = require('fs');

const content = fs.readFileSync('src/App.tsx', 'utf8');

const startIdx = content.indexOf('  const renderContent = () => {');
const endIdx = content.indexOf('            {/* Tab Content */}');

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find start or end index');
  process.exit(1);
}

const replacement = `  const renderContent = () => {
    if (!selectedClient && activeTab !== 'settings') {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-6 border border-[#E5E5E5]">
            <Users size={32} className="text-[#141414]" />
          </div>
          <h2 className="text-2xl font-bold mb-2 tracking-tight">No Client Selected</h2>
          <p className="text-[#8E8E8E] max-w-sm">Select a client from the sidebar to start managing their ad performance and creative assets.</p>
        </div>
      );
    }

    if (activeTab === 'settings') {
      return renderSettingsTab();
    }

    return (
      <div className="space-y-8">
        {isGeneratingReport && activeTab !== 'ai-performance-report' && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900 uppercase tracking-widest">AI Report Generating</p>
                <p className="text-xs text-emerald-700">Correlating DNA patterns... {Math.round(generationProgress)}%</p>
              </div>
            </div>
            <button 
              onClick={() => setActiveTab('ai-performance-report')}
              className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-colors"
            >
              View Progress
            </button>
          </div>
        )}
        
        {syncError && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center text-white">
                <AlertCircle size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-rose-900 uppercase tracking-widest">Sync Error</p>
                <p className="text-xs text-rose-700">{syncError.message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {syncError.isAuthError && (
                <button 
                  onClick={() => {
                    handleMetaConnect();
                    setSyncError(null);
                  }}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={14} />
                  Reconnect Meta
                </button>
              )}
              {syncError.accounts && (
                <button 
                  onClick={() => setActiveTab('settings')}
                  className="px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-colors"
                >
                  Select Account
                </button>
              )}
              <button 
                onClick={() => setSyncError(null)}
                className="p-2 text-rose-400 hover:text-rose-600"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-[#8E8E8E] mb-1">
              <span>Clients</span>
              <ChevronRight size={14} />
              <span>{selectedClient?.name}</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">{selectedClient?.name}</h2>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={exportToCSV}
              className="px-4 py-2 border border-[#E5E5E5] bg-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[#FAFAFA] transition-colors"
            >
              <Download size={16} />
              Export for Meta
            </button>
            <button 
              onClick={generateCopyVariations}
              disabled={isGenerating}
              className="px-4 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
            >
              {isGenerating ? <Clock size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Generate Ads
            </button>
          </div>
        </div>

`;

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync('src/App.tsx', newContent);
console.log('Successfully replaced renderContent');
