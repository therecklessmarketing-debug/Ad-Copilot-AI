import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../utils/cn';
import Markdown from 'react-markdown';

interface AIChatProps {
  selectedClient: any;
  selectedCampaignIds: string[];
  dateRange: { start: string; end: string };
  performanceData: any[];
}

export const AIChat: React.FC<AIChatProps> = ({
  selectedClient,
  selectedCampaignIds,
  dateRange,
  performanceData
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || !selectedClient) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      // Build context
      const contextStr = `
You are an expert AI media buyer and data analyst assistant.
Current Context:
- Client/Ad Account: ${selectedClient.name}
- Date Range: ${dateRange.start} to ${dateRange.end}
- Selected Campaigns: ${selectedCampaignIds.length > 0 ? selectedCampaignIds.join(', ') : 'All Campaigns'}
- Total Ads in View: ${performanceData.length}

Performance Data Summary:
${performanceData.slice(0, 50).map(ad => {
  const metrics = JSON.parse(ad.metrics_json || '{}');
  return `- Ad: ${ad.ad_name} | Spend: $${metrics.spend || 0} | ROAS: ${metrics.purchase_roas || 0} | CPA: $${metrics.cost_per_action_type?.find((a: any) => a.action_type === 'purchase')?.value || 0}`;
}).join('\n')}
${performanceData.length > 50 ? '... (showing top 50 ads)' : ''}

Please answer the user's question based on this context. Be concise, helpful, and analytical. Use markdown for formatting.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { text: contextStr },
          ...messages.map(m => ({ text: `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}` })),
          { text: `User: ${userMessage}` }
        ]
      });

      setMessages(prev => [...prev, { role: 'ai', content: response.text || 'Sorry, I could not generate a response.' }]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I encountered an error while processing your request.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!selectedClient) return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 p-4 bg-emerald-500 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-all z-50",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 w-96 h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 z-50 border border-[#E5E5E5] overflow-hidden",
          isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-10 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#141414]">AI Assistant</h3>
              <p className="text-[10px] text-[#8E8E8E]">
                {selectedClient.name} • {dateRange.start} to {dateRange.end}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-[#8E8E8E] hover:text-[#141414] hover:bg-[#E5E5E5] rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {messages.length === 0 && (
            <div className="text-center text-[#8E8E8E] text-xs mt-10">
              Ask me anything about your ad account performance, campaigns, or creatives.
            </div>
          )}
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={cn(
                "max-w-[85%] p-3 rounded-2xl text-sm",
                msg.role === 'user' 
                  ? "bg-emerald-500 text-white ml-auto rounded-tr-sm" 
                  : "bg-[#F5F5F4] text-[#141414] mr-auto rounded-tl-sm"
              )}
            >
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <div className="markdown-body text-sm prose prose-sm max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="bg-[#F5F5F4] text-[#141414] mr-auto rounded-2xl rounded-tl-sm p-3 max-w-[85%] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#8E8E8E]" />
              <span className="text-xs text-[#8E8E8E]">AI is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#E5E5E5] bg-white">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask about your performance..."
              className="flex-1 p-3 bg-[#F5F5F4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 border border-transparent focus:border-emerald-500/30"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
