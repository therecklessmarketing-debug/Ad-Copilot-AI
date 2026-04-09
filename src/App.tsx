/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Users, 
  Image as ImageIcon, 
  Type, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download, 
  ChevronRight,
  LayoutDashboard,
  Settings,
  Sparkles,
  Trash2,
  ExternalLink,
  Upload,
  Loader2,
  BarChart3,
  TrendingUp,
  Facebook,
  Tag,
  Filter,
  Calendar,
  Table,
  Save,
  Search,
  Edit3,
  Target,
  Plane,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  FileText,
  Printer,
  Folder,
  Layout,
  Layers,
  Sliders,
  Activity,
  GitMerge,
  LayoutList,
  ChevronLeft,
  Zap,
  Undo,
  Redo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { 
  AVAILABLE_METRICS, 
  ATTRIBUTION_WINDOWS, 
  REPORTING_LEVELS, 
  BREAKDOWN_DIMENSIONS 
} from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { GoogleGenAI, Type as GenAIType } from "@google/genai";
import ImageEditor from './components/ImageEditor';
import { AIChat } from './components/AIChat';
import { CreativeAnalysisService } from './services/creativeAnalysisService';
import { Client, CopyCreative, ImageCreative, CopyType, CreativeStatus, CreativeDNA, CopyGroup, KPISettings, AdBreakdown, IntelligenceData } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getMappedMetrics = (rawMetrics: any, settings: KPISettings | null) => {
  const mappings = settings?.metric_mappings || {
    conversions: [], purchases: [], revenue: [], roas: [], primary_kpi: [], secondary_kpi: []
  };
  const conversionsByType = rawMetrics.conversions_by_type || {};
  const valuesByType = rawMetrics.values_by_type || {};
  const roasByType = rawMetrics.roas_by_type || {};

  const mapped: any = { ...rawMetrics };

  // Smart Mapping Heuristic
  const findSmartEvent = (typeMap: any, keywords: string[]) => {
    if (!typeMap) return 0;
    const keys = Object.keys(typeMap);
    if (keys.length === 0) return 0;

    // 1. Try to find keys that match keywords and have non-zero values
    const candidates = keys.filter(k => 
      keywords.some(kw => k.toLowerCase().includes(kw)) && (typeMap[k] > 0)
    );

    if (candidates.length > 0) {
      return candidates.reduce((sum, k) => sum + typeMap[k], 0);
    }

    // 2. Fallback: if only one event has data, pick it
    const nonZeroKeys = keys.filter(k => typeMap[k] > 0);
    if (nonZeroKeys.length === 1) {
      return typeMap[nonZeroKeys[0]];
    }

    return 0;
  };

  // Calculate Conversions
  if (mappings.conversions && mappings.conversions.length > 0) {
    mapped.conversions = mappings.conversions.reduce((sum: number, type: string) => sum + (conversionsByType[type] || 0), 0);
  } else {
    const smartConversions = findSmartEvent(conversionsByType, ['purchase', 'lead', 'complete_registration', 'conversion']);
    if (smartConversions > 0) mapped.conversions = smartConversions;
  }

  // Calculate Purchases
  if (mappings.purchases && mappings.purchases.length > 0) {
    mapped.purchases = mappings.purchases.reduce((sum: number, type: string) => sum + (conversionsByType[type] || 0), 0);
  } else {
    const smartPurchases = findSmartEvent(conversionsByType, ['purchase', 'checkout']);
    if (smartPurchases > 0) mapped.purchases = smartPurchases;
  }

  // Calculate Revenue
  if (mappings.revenue && mappings.revenue.length > 0) {
    mapped.revenue = mappings.revenue.reduce((sum: number, type: string) => sum + (valuesByType[type] || 0), 0);
  } else {
    const smartRevenue = findSmartEvent(valuesByType, ['purchase', 'revenue', 'value']);
    if (smartRevenue > 0) mapped.revenue = smartRevenue;
  }

  // Calculate ROAS
  if (mappings.roas && mappings.roas.length > 0) {
    const totalRoas = mappings.roas.reduce((sum: number, type: string) => sum + (roasByType[type] || 0), 0);
    mapped.roas = totalRoas;
    mapped.purchase_roas = totalRoas;
  } else if (mapped.revenue !== undefined && mapped.spend > 0) {
    mapped.roas = mapped.revenue / mapped.spend;
    mapped.purchase_roas = mapped.roas;
  }

  // Calculate Cost per Conversion
  if (mapped.conversions > 0) {
    mapped.cost_per_conversion = mapped.spend / mapped.conversions;
  } else {
    mapped.cost_per_conversion = 0;
  }

  // Map Primary/Secondary KPIs if they are specific events
  if (mappings.primary_kpi && mappings.primary_kpi.length > 0) {
    mapped.primary_kpi_value = mappings.primary_kpi.reduce((sum: number, type: string) => sum + (conversionsByType[type] || 0), 0);
  }
  
  if (mappings.secondary_kpi && mappings.secondary_kpi.length > 0) {
    mapped.secondary_kpi_value = mappings.secondary_kpi.reduce((sum: number, type: string) => sum + (conversionsByType[type] || 0), 0);
  }

  return mapped;
};

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [creatives, setCreatives] = useState<{ copy: CopyCreative[], images: ImageCreative[] }>({ copy: [], images: [] });
  const [copyGroups, setCopyGroups] = useState<CopyGroup[]>([]);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingCopy, setIsAddingCopy] = useState<CopyType | null>(null);
  const [isManagingGroups, setIsManagingGroups] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#141414');
  const [editingGroup, setEditingGroup] = useState<CopyGroup | null>(null);
  const [editingCopy, setEditingCopy] = useState<CopyCreative | null>(null);
  const [editCopyContent, setEditCopyContent] = useState('');
  const [editCopyGroupId, setEditCopyGroupId] = useState<number | null>(null);
  const [selectedGroupIdForNewCopy, setSelectedGroupIdForNewCopy] = useState<number | null>(null);
  const [copySearchTerm, setCopySearchTerm] = useState('');
  const [copyStatusFilter, setCopyStatusFilter] = useState<CreativeStatus | 'all'>('all');
  const [copyGroupFilter, setCopyGroupFilter] = useState<number | 'all' | 'none'>('all');
  const [imageSearchTerm, setImageSearchTerm] = useState('');
  const [imageStatusFilter, setImageStatusFilter] = useState<CreativeStatus | 'all'>('all');
  const [copyInputMethod, setCopyInputMethod] = useState<'manual' | 'ai' | null>(null);
  const [aiGenerationDirection, setAiGenerationDirection] = useState('');
  const [isInputtingAiDirection, setIsInputtingAiDirection] = useState(false);
  const [aiGeneratedVariations, setAiGeneratedVariations] = useState<any[]>([]);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [availableAdAccounts, setAvailableAdAccounts] = useState<any[]>([]);
  const [isFetchingAccounts, setIsFetchingAccounts] = useState(false);

  const [metaPermissions, setMetaPermissions] = useState<any[]>([]);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);

  const checkMetaPermissions = async () => {
    setIsCheckingPermissions(true);
    try {
      const res = await fetch('/api/meta/permissions');
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401 || errorData.is_auth_error) {
          setSyncError({ message: errorData.error, isAuthError: true });
          fetchMetaSettings();
        }
        return;
      }
      const data = await res.json();
      setMetaPermissions(data);
    } catch (err) {
      console.error("Failed to fetch meta permissions:", err);
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const fetchAdAccounts = async () => {
    setIsFetchingAccounts(true);
    try {
      const res = await fetch('/api/meta/ad-accounts');
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401 || errorData.is_auth_error) {
          setSyncError({ message: errorData.error, isAuthError: true });
          fetchMetaSettings();
        }
        return;
      }
      const data = await res.json();
      setAvailableAdAccounts(data);
    } catch (err) {
      console.error("Failed to fetch ad accounts:", err);
    } finally {
      setIsFetchingAccounts(false);
    }
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', industry: '', ad_account_id: '', landing_page_url: '' });
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [newCopy, setNewCopy] = useState('');
  const [newImage, setNewImage] = useState({ 
    name: '', 
    url11: '', 
    url916: '', 
    url45: '', 
    detected_text: '', 
    detected_cta: '',
    visual_type: '',
    creative_id: '',
    dna_json: ''
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'intelligence' | 'copy' | 'images' | 'generator' | 'performance' | 'ai-insights' | 'winning-ads' | 'creative-dna' | 'ai-performance-report' | 'settings' | 'ai-ad-builder' | 'kpi-settings' | 'column-settings' | 'breakdowns' | 'funnel' | 'conversion-mapping'>('dashboard');
  const [kpiSettings, setKpiSettings] = useState<KPISettings | null>(null);
  const [columnPresets, setColumnPresets] = useState<any[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['spend', 'impressions', 'clicks', 'inline_link_clicks', 'ctr', 'cpc', 'conversions', 'cost_per_conversion', 'roas']);
  const [adBreakdowns, setAdBreakdowns] = useState<AdBreakdown[]>([]);
  const [isSyncingBreakdowns, setIsSyncingBreakdowns] = useState(false);
  const [isSavingKPIs, setIsSavingKPIs] = useState(false);

  const fetchKPISettings = async (clientId: number) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/kpi-settings`);
      if (res.ok) {
        const data = await res.json();
        setKpiSettings(data);
      } else {
        // Default settings if none found
        setKpiSettings({
          primary_kpi: 'roas',
          secondary_kpi: 'cost_per_conversion',
          guardrail_kpis: ['cpm', 'ctr'],
          conversion_events: ['purchase'],
          attribution_window: '7d_click_1d_view',
          reporting_level: 'ad',
          confidence_threshold: 90,
          min_sample_size: 1000,
          weights: {
            delivery: 15,
            engagement: 20,
            conversion: 40,
            quality: 10,
            creative: 15
          }
        });
      }
    } catch (err) {
      console.error("Failed to fetch KPI settings:", err);
    }
  };

  const saveKPISettings = async (settings: KPISettings) => {
    if (!selectedClient) return;
    setIsSavingKPIs(true);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/kpi-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setKpiSettings(settings);
      }
    } catch (err) {
      console.error("Failed to save KPI settings:", err);
    } finally {
      setIsSavingKPIs(false);
    }
  };

  const fetchBreakdowns = async (clientId: number) => {
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
        campaignIds: selectedCampaignIds.join(','),
        adsetIds: selectedAdSetIds.join(',')
      });
      const res = await fetch(`/api/clients/${clientId}/breakdowns?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAdBreakdowns(data);
      }
    } catch (err) {
      console.error("Failed to fetch breakdowns:", err);
    }
  };

  const syncBreakdowns = async () => {
    if (!selectedClient) return;
    setIsSyncingBreakdowns(true);
    try {
      const res = await fetch(`/api/clients/${selectedClient.id}/sync-breakdowns`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchBreakdowns(selectedClient.id);
      } else if (res.status === 401) {
        setSyncError({ message: "Meta authentication expired. Please reconnect your account in settings.", isAuthError: true });
      } else {
        const errorData = await res.json();
        setSyncError({ message: errorData.error || "Failed to sync breakdowns" });
      }
    } catch (err) {
      console.error("Failed to sync breakdowns:", err);
      setSyncError({ message: "Failed to sync breakdowns. Please try again." });
    } finally {
      setIsSyncingBreakdowns(false);
    }
  };

  const [builderMode, setBuilderMode] = useState<'insights' | 'advanced'>('insights');
  const [isGeneratingAsset, setIsGeneratingAsset] = useState(false);
  const [generatedAsset, setGeneratedAsset] = useState<{ type: 'static' | 'video' | 'gif', url: string, prompt: string } | null>(null);
  const [builderPrompt, setBuilderPrompt] = useState('');
  const [builderAssetType, setBuilderAssetType] = useState<'static' | 'video' | 'gif'>('static');
  const [builderUrl, setBuilderUrl] = useState('');
  const [builderObjective, setBuilderObjective] = useState<'Sales' | 'Leads' | 'Educate' | 'Awareness'>('Sales');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [veoOperationId, setVeoOperationId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();
  }, []);

  const openApiKeyDialog = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState('');
  const [onEditorSaveCallback, setOnEditorSaveCallback] = useState<{ fn: (newUrl: string) => void }>({ fn: () => {} });

  const openImageEditor = (imageUrl: string, onSave: (newUrl: string) => void) => {
    setEditingImageUrl(imageUrl);
    setOnEditorSaveCallback({ fn: onSave });
    setIsEditorOpen(true);
  };

  const pollVeoOperation = async (initialOperation: any) => {
    let operation = initialOperation;
    const maxAttempts = 60; // 10 minutes max (10s intervals)
    let attempts = 0;

    while (!operation.done && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      try {
        const res = await ai.operations.getVideosOperation({ operation: operation });
        operation = res;
        attempts++;
      } catch (err) {
        console.error("Error polling Veo:", err);
        break;
      }
    }

    if (operation.done && operation.response?.generatedVideos?.[0]?.video?.uri) {
      const downloadLink = operation.response.generatedVideos[0].video.uri;
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey || '',
        },
      });
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      
      setGeneratedAsset({
        type: builderAssetType,
        url: base64,
        prompt: builderPrompt
      });
    } else {
      setGenerationError("Video generation timed out or failed.");
    }
    setIsGeneratingAsset(false);
  };

  const generateAIAdAsset = async (customPrompt?: string) => {
    if (!selectedClient) return;
    if (!hasApiKey) {
      await openApiKeyDialog();
    }

    setIsGeneratingAsset(true);
    setGenerationError(null);
    setGeneratedAsset(null);

    let finalPrompt = customPrompt || builderPrompt;
    
    try {
      // If URL is provided, use Gemini to analyze it first
      if (builderUrl.trim()) {
        const analysisResponse = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Analyze the landing page at ${builderUrl}. 
          Extract key visual elements, brand style, product details, and unique selling points. 
          The marketing objective is: ${builderObjective}.
          Based on this, create a highly detailed and optimized prompt for an AI image/video generator that would create a high-converting ad for this product.
          Incorporate these user instructions if provided: ${finalPrompt}.
          Return ONLY the optimized prompt text.`,
          config: {
            tools: [{ urlContext: {} }]
          }
        });
        finalPrompt = analysisResponse.text || finalPrompt;
      } else {
        // Even without URL, incorporate the objective into the prompt
        finalPrompt = `Objective: ${builderObjective}. ${finalPrompt}`;
      }

      if (builderAssetType === 'static' || builderAssetType === 'gif') {
        // Use Gemini 3.1 Flash Image for high quality
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: [{ parts: [{ text: finalPrompt }] }],
          config: {
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          }
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imagePart?.inlineData) {
          setGeneratedAsset({
            type: builderAssetType,
            url: `data:image/png;base64,${imagePart.inlineData.data}`,
            prompt: finalPrompt
          });
        } else {
          throw new Error("No image generated in response.");
        }
        setIsGeneratingAsset(false);
      } else if (builderAssetType === 'video') {
        const operation = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: finalPrompt,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
          }
        });
        setVeoOperationId(operation.name || null);
        pollVeoOperation(operation);
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      setGenerationError(err.message || "An unexpected error occurred during generation.");
      setIsGeneratingAsset(false);
    }
  };

  const saveGeneratedAssetToVisuals = async () => {
    if (!selectedClient || !generatedAsset) return;

    try {
      const res = await fetch('/api/creatives/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClient.id,
          name: `AI Generated ${generatedAsset.type.toUpperCase()}: ${generatedAsset.prompt.substring(0, 30)}...`,
          variants: [{ ratio: generatedAsset.type === 'video' ? '16:9' : '1:1', url: generatedAsset.url }],
          visual_type: generatedAsset.type === 'static' ? 'Static' : generatedAsset.type === 'video' ? 'Video' : 'GIF',
          dna_json: JSON.stringify({
            visual_style: 'AI Generated',
            emotional_trigger: 'Optimized',
            primary_subject: 'AI Generated Content'
          })
        }),
      });
      
      if (res.ok) {
        fetchCreatives(selectedClient.id);
        setActiveTab('images');
        setGeneratedAsset(null);
      }
    } catch (err) {
      console.error("Error saving asset:", err);
    }
  };
  const [isClientSelectorOpen, setIsClientSelectorOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<string[]>([]);
  
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<'ACTIVE' | 'PAUSED' | 'ALL'>('ACTIVE');
  const [adSetStatusFilter, setAdSetStatusFilter] = useState<'ACTIVE' | 'PAUSED' | 'ALL'>('ACTIVE');
  const [metaAdSets, setMetaAdSets] = useState<any[]>([]);
  const [isFetchingAdSets, setIsFetchingAdSets] = useState(false);
  const [winningCriteria, setWinningCriteria] = useState({ minSpend: 100, minConversions: 5, metric: 'roas' });
  const [winningAdsColumns, setWinningAdsColumns] = useState<string[]>(['spend', 'conversions', 'roas', 'ctr']);
  const [isCustomizingWinningColumns, setIsCustomizingWinningColumns] = useState(false);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzingPerformance, setIsAnalyzingPerformance] = useState(false);
  const [metaSettings, setMetaSettings] = useState<{ access_token: string | null, ad_account_id: string | null }>({ access_token: null, ad_account_id: null });
  const [dateRange, setDateRange] = useState(() => {
    const saved = localStorage.getItem('ad_studio_date_range');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved date range", e);
      }
    }
    return { 
      start: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
      end: new Date().toISOString().split('T')[0] 
    };
  });

  useEffect(() => {
    if (selectedClient && activeTab === 'breakdowns') {
      fetchBreakdowns(selectedClient.id);
    }
  }, [selectedClient, activeTab, dateRange, selectedCampaignIds, selectedAdSetIds]);
  const [compareRange, setCompareRange] = useState<{ start: string, end: string } | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('Default');
  const [isCustomizingColumns, setIsCustomizingColumns] = useState(false);
  const [isClientSettingsOpen, setIsClientSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'campaign' | 'brand' | 'ai' | 'conversions'>('campaign');
  const [metaCampaigns, setMetaCampaigns] = useState<any[]>([]);
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false);
  const [conversionSettings, setConversionSettings] = useState<any[]>([]);
  const [creativeDna, setCreativeDna] = useState<Record<string, CreativeDNA>>({});
  const [isAnalyzingDNA, setIsAnalyzingDNA] = useState<string | null>(null);
  const [dnaInsights, setDnaInsights] = useState<string | null>(null);
  const [aiPerformanceReport, setAiPerformanceReport] = useState<any | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [reportsHistory, setReportsHistory] = useState<any[]>([]);
  const [activeColumns, setActiveColumns] = useState<string[]>(['spend', 'ctr', 'conversions', 'roas']);
  const [performanceDataCompare, setPerformanceDataCompare] = useState<any[]>([]);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [isFetchingOverview, setIsFetchingOverview] = useState(false);
  const [intelligenceData, setIntelligenceData] = useState<IntelligenceData | null>(null);
  const [isFetchingIntelligence, setIsFetchingIntelligence] = useState(false);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

  const fetchIntelligenceData = async (clientId: number) => {
    setIsFetchingIntelligence(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/intelligence`);
      if (res.ok) {
        const data = await res.json();
        setIntelligenceData(data);
      }
    } catch (err) {
      console.error("Error fetching intelligence data:", err);
    } finally {
      setIsFetchingIntelligence(false);
    }
  };

  const handleAnalyzeAllCreatives = async () => {
    if (!selectedClient || !performanceData.length) return;
    
    setIsAnalyzingAll(true);
    const analysisService = new CreativeAnalysisService(process.env.GEMINI_API_KEY || '');
    
    try {
      for (const ad of performanceData) {
        // Find the creative for this ad
        // This is a simplification. In a real app, we'd have the creative details.
        // For now, let's assume we can get the components from the ad data.
        const primaryText = ad.primary_text || '';
        const headline = ad.headline || '';
        const description = ad.description || '';
        const imageUrl = ad.image_url || '';

        if (!imageUrl && !primaryText) continue;

        let visualDna = {};
        if (imageUrl) {
          visualDna = await analysisService.analyzeVisual(imageUrl);
        }

        const primaryDna = primaryText ? await analysisService.analyzeCopy(primaryText) : null;
        const headlineDna = headline ? await analysisService.analyzeCopy(headline) : null;
        const descriptionDna = description ? await analysisService.analyzeCopy(description) : null;

        const fullDna = {
          meta_ad_id: ad.meta_ad_id,
          campaign_id: ad.campaign_id,
          adset_id: ad.adset_id,
          creative_id: ad.creative_id,
          ...visualDna,
          primary_text_dna: primaryDna,
          headline_dna: headlineDna,
          description_dna: descriptionDna
        };

        await fetch('/api/creatives/dna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullDna)
        });
      }
      
      await fetchIntelligenceData(selectedClient.id);
    } catch (err) {
      console.error("Error analyzing all creatives:", err);
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  const fetchOverviewData = async (clientId: number) => {
    setIsFetchingOverview(true);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      if (selectedCampaignIds.length > 0) params.append('campaignIds', selectedCampaignIds.join(','));
      if (selectedAdSetIds.length > 0) params.append('adsetIds', selectedAdSetIds.join(','));
      
      const res = await fetch(`/api/clients/${clientId}/overview?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data);
      }
    } catch (err) {
      console.error("Error fetching overview data:", err);
    } finally {
      setIsFetchingOverview(false);
    }
  };

  useEffect(() => {
    if (selectedClient && activeTab === 'dashboard') {
      fetchOverviewData(selectedClient.id);
    }
    if (selectedClient && activeTab === 'intelligence') {
      fetchIntelligenceData(selectedClient.id);
    }
  }, [selectedClient, activeTab, dateRange, selectedCampaignIds, selectedAdSetIds]);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'META_AUTH_SUCCESS') {
        fetchMetaSettings();
        setSyncError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch clients on load
  useEffect(() => {
    fetchClients();
    fetchMetaSettings();
    fetchColumnPresets();
    fetchCreativeDna();
  }, []);

  useEffect(() => {
    localStorage.setItem('ad_studio_date_range', JSON.stringify(dateRange));
  }, [dateRange]);

  useEffect(() => {
    if (selectedClient) {
      fetchPerformance();
    }
  }, [dateRange, selectedClient, isComparing, compareRange, selectedCampaignIds, selectedAdSetIds]);

  useEffect(() => {
    if (selectedClient && metaSettings.access_token) {
      handleMetaSync();
    }
  }, [selectedClient, metaSettings.access_token, dateRange]);

  useEffect(() => {
    if (selectedClient) {
      fetchReportsHistory(selectedClient.id);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (metaSettings.access_token) {
      fetchAdAccounts();
      checkMetaPermissions();
    }
  }, [metaSettings.access_token]);

  useEffect(() => {
    if (selectedClient && metaSettings.access_token) {
      fetchMetaCampaigns();
    }
  }, [selectedClient, metaSettings.access_token, campaignStatusFilter]);

  useEffect(() => {
    if (selectedClient && metaSettings.access_token && selectedCampaignIds.length > 0) {
      fetchMetaAdSets();
    } else {
      setMetaAdSets([]);
    }
  }, [selectedClient, metaSettings.access_token, selectedCampaignIds, adSetStatusFilter]);

  useEffect(() => {
    if (selectedClient?.landing_page_url) {
      setBuilderUrl(selectedClient.landing_page_url);
    } else {
      setBuilderUrl('');
    }
  }, [selectedClient?.id, selectedClient?.landing_page_url]);

  const fetchReportsHistory = async (clientId: number) => {
    const res = await fetch(`/api/clients/${clientId}/reports`);
    const data = await res.json();
    setReportsHistory(data);
  };

  const deleteReport = async (reportId: number) => {
    await fetch(`/api/reports/${reportId}`, { method: 'DELETE' });
    if (selectedClient) fetchReportsHistory(selectedClient.id);
  };

  useEffect(() => {
    if (selectedClient) {
      fetchConversionSettings(selectedClient.id);
    }
  }, [selectedClient]);

  const detectPrimaryConversionEvent = (metrics: any) => {
    const actions = metrics.actions || [];
    if (actions.length === 0) return 'conversions';

    // Standard Meta event mapping
    const standardEvents = [
      { key: 'offsite_conversion.fb_pixel_purchase', id: 'purchase' },
      { key: 'offsite_conversion.fb_pixel_lead', id: 'lead' },
      { key: 'offsite_conversion.fb_pixel_view_content', id: 'view_content' },
      { key: 'offsite_conversion.fb_pixel_subscribe', id: 'subscribe' },
      { key: 'offsite_conversion.fb_pixel_add_to_cart', id: 'add_to_cart' },
      { key: 'offsite_conversion.fb_pixel_initiate_checkout', id: 'initiate_checkout' },
      { key: 'offsite_conversion.fb_pixel_complete_registration', id: 'complete_registration' },
      { key: 'contact', id: 'contact' },
      { key: 'customize_product', id: 'customize_product' },
      { key: 'donate', id: 'donate' },
      { key: 'find_location', id: 'find_location' },
      { key: 'schedule', id: 'schedule' },
      { key: 'search', id: 'search' },
      { key: 'start_trial', id: 'start_trial' },
      { key: 'submit_application', id: 'submit_application' },
    ];

    // Find the event with the highest volume that is in our standard list
    let bestEvent = 'conversions';
    let maxVal = 0;

    standardEvents.forEach(event => {
      const action = actions.find((a: any) => a.action_type === event.key || a.action_type === event.id);
      const val = parseInt(action?.value || 0);
      if (val > maxVal) {
        maxVal = val;
        bestEvent = event.id;
      }
    });

    return bestEvent;
  };

  const calculateAdvancedScore = (ad: any, settings: KPISettings) => {
    const { weights } = settings;
    const metrics = typeof ad.metrics_json === 'string' ? JSON.parse(ad.metrics_json || '{}') : (ad.metrics || {});
    
    // Detect primary event if not explicitly set to something specific
    const primaryEvent = settings.primary_kpi.includes('conversion') || settings.primary_kpi === 'roas' 
      ? detectPrimaryConversionEvent(metrics)
      : settings.primary_kpi;

    // 1. Delivery Layer
    const spend = parseFloat(metrics.spend || 0);
    const deliveryScore = spend > 0 ? 85 : 40; 
    
    // 2. Engagement Layer
    const ctr = parseFloat(metrics.ctr || 0);
    const engagementScore = Math.min(100, (ctr / 1.5) * 100);
    
    // 3. Conversion Layer
    let conversionVal = 0;
    if (settings.primary_kpi === 'roas') {
      conversionVal = parseFloat(metrics.roas || 0) / 3.0;
    } else {
      const action = (metrics.actions || []).find((a: any) => 
        a.action_type === primaryEvent || 
        a.action_type === `offsite_conversion.fb_pixel_${primaryEvent}`
      );
      const count = parseInt(action?.value || parseInt(metrics.conversions || 0));
      // Normalize: 1 conversion per $50 spend as a baseline
      const baseline = spend / 50;
      conversionVal = baseline > 0 ? count / baseline : (count > 0 ? 1 : 0);
    }
    const conversionScore = Math.min(100, conversionVal * 100);
    
    // 4. Quality Layer (CVR)
    const uniqueClicks = parseInt(metrics.inline_link_clicks || metrics.clicks || 1);
    const conversions = parseInt(metrics.conversions || 0);
    const cvr = (conversions / Math.max(1, uniqueClicks)) * 100;
    const qualityScore = Math.min(100, (cvr / 5.0) * 100);
    
    // 5. Creative Efficiency
    const creativeScore = 75;

    const finalScore = (
      (deliveryScore * (weights.delivery || 20)) +
      (engagementScore * (weights.engagement || 20)) +
      (conversionScore * (weights.conversion || 20)) +
      (qualityScore * (weights.quality || 20)) +
      (creativeScore * (weights.creative || 20))
    ) / 100;

    return Math.min(100, Math.max(0, finalScore));
  };

  const analyzePerformanceWithAI = async () => {
    if (performanceData.length === 0 || !kpiSettings) return;
    setIsAnalyzingPerformance(true);
    try {
      const context = performanceData.map(p => {
        const creative = creatives.images.find(img => img.creative_id === p.creative_id);
        const metrics = JSON.parse(p.metrics_json || '{}');
        const dna = creative?.dna_json ? JSON.parse(creative.dna_json) : (creativeDna[p.meta_ad_id] || null);
        const score = calculateAdvancedScore(p, kpiSettings);
        const uniqueClicks = parseInt(metrics.inline_link_clicks || metrics.clicks || 0);
        const conversions = parseInt(metrics.conversions || 0);
        const lpCvr = uniqueClicks > 0 ? (conversions / uniqueClicks) * 100 : 0;
        
        return {
          name: p.ad_name || p.creative_id,
          id: p.creative_id || 'External',
          spend: metrics.spend,
          conversions: metrics.conversions,
          ctr: metrics.ctr,
          unique_link_clicks: uniqueClicks,
          lp_cvr: lpCvr.toFixed(2) + '%',
          roas: metrics.roas,
          score: score.toFixed(1),
          visual_type: creative?.visual_type || dna?.visual_style || 'Unknown',
          text: creative?.detected_text || dna?.visual_text_content || 'Unknown',
          dna: dna
        };
      });

      const breakdownContext = adBreakdowns.slice(0, 50).map(b => ({
        type: b.breakdown_type,
        value: b.breakdown_value,
        spend: b.metrics.spend,
        roas: b.metrics.roas
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{
          parts: [{
            text: `Act as an Elite Meta Ads Performance Analyst. Analyze this data for "${selectedClient?.name}":
            
            KPI SETTINGS:
            - Primary KPI: ${kpiSettings.primary_kpi}
            - Secondary KPI: ${kpiSettings.secondary_kpi}
            - Attribution Window: ${kpiSettings.attribution_window}
            
            AD PERFORMANCE DATA (with Advanced Scoring):
            ${JSON.stringify(context)}
            
            GRANULAR BREAKDOWN DATA:
            ${JSON.stringify(breakdownContext)}
            
            CLIENT CONTEXT:
            - Industry: ${selectedClient?.industry}
            - Goal: ${selectedClient?.campaign_goal}
            ${selectedClient?.landing_page_url ? `- Landing Page: ${selectedClient.landing_page_url}` : ''}
            
            TASKS:
            1. **Executive Scorecard**: Provide a high-level assessment of the account health based on the weighted scores.
            2. **Creative Intelligence**: Which DNA attributes are driving the highest scores? Be specific about visual styles and copy hooks.
            3. **Breakdown Insights**: Identify "hidden gems" or "wasteful spend" in platforms, placements, or demographics.
            4. **Funnel Diagnostic**: Where is the funnel leaking? (Awareness -> Unique Clicks -> LP CVR -> Conversion). Pay special attention to Landing Page Conversion Rate (LP CVR).
            5. **Strategic Roadmap**: Provide 3 high-impact actions for the next 7 days.
            
            IMPORTANT: Avoid generic advice. Use the specific data points provided. If an ad has a high score but low spend, explain why it's a scaling opportunity. Mention specific conversion events like ViewContent or Subscribe if they are prominent in the data.`
          }]
        }]
      });

      setAiInsights(response.text || "No insights generated.");
    } catch (err) {
      console.error("AI Analysis failed:", err);
    } finally {
      setIsAnalyzingPerformance(false);
    }
  };

  const fetchColumnPresets = async () => {
    const res = await fetch('/api/column-presets');
    const data = await res.json();
    setColumnPresets(data);
  };

  const fetchCreativeDna = async () => {
    const res = await fetch('/api/meta/creative-dna');
    const data = await res.json();
    const dnaMap: Record<string, CreativeDNA> = {};
    data.forEach((dna: CreativeDNA) => {
      dnaMap[dna.meta_ad_id] = dna;
    });
    setCreativeDna(dnaMap);
  };

  const analyzeCreativeDNA = async (adId: string) => {
    setIsAnalyzingDNA(adId);
    try {
      // 1. Get creative details from Meta
      const res = await fetch(`/api/meta/ad-creative-details?adId=${adId}`);
      const creative = await res.json();
      
      if (creative.error) throw new Error(creative.error);

      // 2. Fetch image and convert to base64
      const imgRes = await fetch(creative.imageUrl);
      const blob = await imgRes.blob();
      const base64Image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });

      // 3. Send to Gemini for DNA extraction
      const prompt = `Analyze this ad creative (image and copy) and extract its "Creative DNA" as a structured JSON object.
      
      Ad Copy:
      Headline: ${creative.headline}
      Primary Text: ${creative.primaryText}
      Description: ${creative.description}
      
      Extract the following attributes:
      - visual_style: (e.g., lifestyle photography, product focused, testimonial, infographic, etc.)
      - primary_subject: (e.g., person, product, food, environment)
      - people_present: boolean
      - age_group_estimate: (e.g., Gen Z, Millennial, Gen X, Senior)
      - facial_expression: (e.g., smiling, neutral, excited)
      - text_overlay_present: boolean
      - visual_text_content: text appearing in the image
      - cta_button_present: boolean
      - cta_button_text: text on the button in image
      - cta_button_color: color of the button
      - primary_color: dominant color
      - background_color: background color
      - layout_type: (e.g., centered, asymmetrical, split)
      - text_density: (e.g., low, medium, high)
      - graphic_elements_json: JSON object of boolean tags for (icons, arrows, highlight_boxes, checkmarks, bullet_lists, badges, ratings)
      - visual_complexity_score: 1-10
      - headline_text: the headline
      - headline_length: character count
      - headline_structure: (e.g., question, benefit, curiosity, authority)
      - primary_text_length: character count
      - copy_structure: (e.g., problem-solution, testimonial, listicle, direct offer)
      - emotional_trigger: (e.g., fear, joy, curiosity, urgency)
      - offer_type: (e.g., discount, free trial, guide, consultation)
      - cta_language: (e.g., learn more, shop now, get started)
      - copy_complexity_score: 1-10
      - psychological_triggers_json: JSON object of boolean tags for (scarcity, social_proof, authority, reciprocity, liking, commitment)
      
      ADVANCED ATTRIBUTES:
      - color_palette: string[] (dominant hex codes)
      - emotional_triggers: string[] (deeper psychological hooks)
      - copy_hook_type: (e.g., story, statistic, question, direct challenge)
      - copy_length_category: (short, medium, long)
      - pacing_style: (fast, slow, rhythmic)
      - detected_objects: string[] (specific items in image)
      - brand_presence_score: number (1-10)
      
      Return ONLY the JSON object.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
              { text: prompt }
            ]
          }
        ],
        config: { responseMimeType: 'application/json' }
      });

      const dnaData = JSON.parse(response.text || '{}');
      dnaData.meta_ad_id = adId;
      
      // Ensure JSON fields are strings for DB
      dnaData.graphic_elements_json = JSON.stringify(dnaData.graphic_elements_json || {});
      dnaData.psychological_triggers_json = JSON.stringify(dnaData.psychological_triggers_json || {});

      // 4. Save to DB (Legacy and Advanced)
      await fetch('/api/meta/creative-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dnaData)
      });

      await fetch('/api/meta/creative-dna-advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meta_ad_id: adId,
          visual_style: dnaData.visual_style,
          color_palette: JSON.stringify(dnaData.color_palette || []),
          emotional_triggers: dnaData.emotional_triggers || [],
          copy_hook_type: dnaData.copy_hook_type,
          copy_length_category: dnaData.copy_length_category,
          pacing_style: dnaData.pacing_style,
          detected_objects: dnaData.detected_objects || [],
          brand_presence_score: dnaData.brand_presence_score
        }),
      });

      fetchCreativeDna();
    } catch (err) {
      console.error("DNA Analysis failed:", err);
    } finally {
      setIsAnalyzingDNA(null);
    }
  };

  const generateAiPerformanceReport = async () => {
    if (!selectedClient || performanceData.length === 0) return;
    setIsGeneratingReport(true);
    setGenerationProgress(0);
    
    // Progress animation
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 95) return prev;
        return prev + (100 - prev) * 0.1;
      });
    }, 1000);

    try {
      // 1. Ensure we have DNA for as many ads as possible in the current view
      const adsWithoutDna = performanceData.filter(ad => !creativeDna[ad.meta_ad_id]);
      if (adsWithoutDna.length > 0) {
        const toAnalyze = adsWithoutDna.slice(0, 5);
        for (const ad of toAnalyze) {
          await analyzeCreativeDNA(ad.meta_ad_id);
        }
      }

      // 2. Prepare data context
      const adContext = performanceData.slice(0, 20).map(ad => {
        const dna = creativeDna[ad.meta_ad_id];
        const metrics = JSON.parse(ad.metrics_json || '{}');
        const score = calculateAdvancedScore(ad, kpiSettings!);
        return {
          ad_name: ad.ad_name,
          meta_ad_id: ad.meta_ad_id,
          metrics: {
            spend: metrics.spend,
            roas: metrics.purchase_roas,
            cpa: metrics.cost_per_action_type?.find((a: any) => a.action_type === 'purchase')?.value
          },
          score: score.toFixed(1),
          dna: dna || 'pending'
        };
      });

      const breakdownContext = adBreakdowns.slice(0, 20).map(b => ({
        type: b.breakdown_type,
        value: b.breakdown_value,
        spend: b.metrics.spend,
        roas: b.metrics.roas,
        cpa: b.metrics.cpa
      }));

      const prompt = `
        You are an Elite Meta Ads Performance Analyst and Creative Strategist. 
        Generate a comprehensive "AI Performance Intelligence Report" for the client "${selectedClient.name}" for the period ${dateRange.start} to ${dateRange.end}.
        
        KPI SETTINGS:
        - Primary KPI: ${kpiSettings?.primary_kpi}
        - Secondary KPI: ${kpiSettings?.secondary_kpi}
        - Attribution Window: ${kpiSettings?.attribution_window}
        
        AD PERFORMANCE & DNA:
        ${JSON.stringify(adContext, null, 2)}
        
        GRANULAR BREAKDOWNS:
        ${JSON.stringify(breakdownContext, null, 2)}
        
        Client Context:
        - Industry: ${selectedClient.industry}
        - Goal: ${selectedClient.campaign_goal}
        
        Your report must be data-driven, professional, and insightful. It should be formatted as a JSON object with the following structure:
        {
          "executive_summary": "A concise high-level summary of account health.",
          "kpi_scorecard": {
            "overall_score": 85,
            "trend": "up",
            "primary_kpi_performance": "Excellent"
          },
          "visual_performance_data": [
            { "attribute": "e.g. Lifestyle", "roas": 3.2, "ctr": 1.5 }
          ],
          "copy_performance_data": [
            { "attribute": "e.g. Urgency", "roas": 4.1, "ctr": 2.1 }
          ],
          "breakdown_intelligence": [
            { "dimension": "Platform", "winner": "Instagram", "insight": "IG Stories driving 40% lower CPA than Feed." }
          ],
          "funnel_diagnostics": {
            "leakage_point": "Add to Cart to Purchase",
            "recommendation": "Implement retargeting with social proof."
          },
          "featured_ads": [
            { "meta_ad_id": "ID", "reason": "Winner", "performance_highlight": "High ROAS" }
          ],
          "expansion_strategies": [
            { "title": "Strategy", "description": "Details", "action_steps": ["Step 1"] }
          ],
          "full_markdown_report": "The complete detailed report in Markdown format."
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      let text = response.text || "{}";
      // Clean text in case of markdown or other issues
      text = text.trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      }
      
      try {
        const reportData = JSON.parse(text);
        setAiPerformanceReport(reportData);
        
        // Save to history
        await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: selectedClient.id,
            date_range_start: dateRange.start,
            date_range_end: dateRange.end,
            report_json: text
          })
        });
        fetchReportsHistory(selectedClient.id);
        setGenerationProgress(100);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw Text:", text);
        throw new Error(`Invalid JSON response from AI: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } catch (error) {
      console.error("Report generation failed:", error);
      setAiPerformanceReport({ 
        error: error instanceof Error ? `Report generation failed: ${error.message}` : "Error generating report. Please try again." 
      });
    } finally {
      clearInterval(progressInterval);
      setIsGeneratingReport(false);
    }
  };

  const generateDNAInsights = async () => {
    if (performanceData.length === 0 || Object.keys(creativeDna).length === 0) return;
    setIsAnalyzingPerformance(true);
    try {
      const correlationData = performanceData.map(p => {
        const dna = creativeDna[p.meta_ad_id];
        if (!dna) return null;
        const metrics = JSON.parse(p.metrics_json || '{}');
        return {
          ad_name: p.ad_name,
          metrics,
          dna
        };
      }).filter(Boolean);

      const prompt = `Analyze the correlation between "Creative DNA" attributes and performance metrics for these ads: ${JSON.stringify(correlationData)}.
      
      Identify:
      1. **Winning Visual Patterns**: Which visual styles, subjects, and layouts are driving the best CTR and ROAS?
      2. **Winning Copy Patterns**: Which headline structures, emotional triggers, and CTA language are most effective?
      3. **Psychological Trigger Impact**: Which triggers (social proof, urgency, etc.) are correlating with lower CPL?
      4. **Optimization Recommendations**: Provide 3-5 specific "Creative DNA" recipes for future ad generation.
      
      Format as a data-driven intelligence report.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }]
      });

      setDnaInsights(response.text || "No insights generated.");
    } catch (err) {
      console.error("DNA Insights failed:", err);
    } finally {
      setIsAnalyzingPerformance(false);
    }
  };

  const exportForManusAI = () => {
    if (!selectedClient || !performanceData.length) return;

    const reportContent = `
# MANUS AI AGENT INSTRUCTIONS
You are a Senior Growth Marketing Agent. Analyze the following Meta Ads performance data and Creative DNA for the client "${selectedClient.name}".
Your goal is to:
1. Identify the highest-performing creative patterns.
2. Suggest 3 new creative concepts based on the winning DNA.
3. Provide a budget reallocation strategy for the next 30 days.

## CLIENT CONTEXT
- Name: ${selectedClient.name}
- Industry: ${selectedClient.industry || 'General'}
- Date Range: ${dateRange.start} to ${dateRange.end}

## PERFORMANCE DATA SUMMARY
- Total Spend: $${performanceData.reduce((acc, curr) => acc + (JSON.parse(curr.metrics_json || '{}').spend || 0), 0).toFixed(2)}
- Total Conversions: ${performanceData.reduce((acc, curr) => acc + (JSON.parse(curr.metrics_json || '{}').conversions || 0), 0)}
- Avg ROAS: ${(performanceData.reduce((acc, curr) => acc + (JSON.parse(curr.metrics_json || '{}').roas || 0), 0) / performanceData.length).toFixed(2)}x

## CREATIVE DNA PROFILES
${Object.entries(creativeDna).map(([adId, dna]) => `
### Ad ID: ${adId}
- Visual Style: ${dna.visual_style}
- Emotional Trigger: ${dna.emotional_trigger}
- Primary Subject: ${dna.primary_subject}
`).join('\n')}

## RAW PERFORMANCE LOG
${performanceData.map(p => {
  const m = JSON.parse(p.metrics_json || '{}');
  return `- Ad: ${p.meta_ad_name} | Spend: $${m.spend} | ROAS: ${m.roas}x | CTR: ${m.ctr}%`;
}).join('\n')}

---
*Generated by Ad Studio Intelligence Bridge for Manus AI*
    `;

    const blob = new Blob([reportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedClient.name.replace(/\s+/g, '_')}_ManusAI_Context.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchMetaCampaigns = async () => {
    if (!selectedClient) return;
    setIsFetchingCampaigns(true);
    try {
      const res = await fetch(`/api/meta/campaigns?clientId=${selectedClient.id}&status=${campaignStatusFilter}`);
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401 || errorData.is_auth_error) {
          setSyncError({ message: errorData.error, isAuthError: true });
          fetchMetaSettings();
        }
        return;
      }
      const data = await res.json();
      setMetaCampaigns(data);
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setIsFetchingCampaigns(false);
    }
  };

  const fetchMetaAdSets = async () => {
    if (!selectedClient) return;
    setIsFetchingAdSets(true);
    try {
      const campaignIds = selectedCampaignIds.join(',');
      const res = await fetch(`/api/meta/adsets?clientId=${selectedClient.id}&status=${adSetStatusFilter}${campaignIds ? `&campaignIds=${campaignIds}` : ''}`);
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 401 || errorData.is_auth_error) {
          setSyncError({ message: errorData.error, isAuthError: true });
          fetchMetaSettings();
        }
        return;
      }
      const data = await res.json();
      setMetaAdSets(data);
    } catch (err) {
      console.error("Failed to fetch adsets:", err);
    } finally {
      setIsFetchingAdSets(false);
    }
  };

  const handleUpdateClient = async (clientId: number, updates: Partial<Client>) => {
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...updates } : c));
        if (selectedClient?.id === clientId) {
          setSelectedClient(prev => prev ? { ...prev, ...updates } : null);
        }
      }
    } catch (err) {
      console.error("Failed to update client:", err);
    }
  };

  const fetchConversionSettings = async (clientId: number) => {
    const res = await fetch(`/api/clients/${clientId}/conversion-settings`);
    const data = await res.json();
    setConversionSettings(data);
  };

  const handleSavePreset = async (name: string) => {
    const res = await fetch('/api/column-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, columns: activeColumns }),
    });
    if (res.ok) {
      fetchColumnPresets();
    }
  };

  const handleAddConversionSetting = async (key: string, name: string) => {
    if (!selectedClient) return;
    const res = await fetch(`/api/clients/${selectedClient.id}/conversion-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_event_key: key, display_name: name, importance: 5 }),
    });
    if (res.ok) {
      fetchConversionSettings(selectedClient.id);
    }
  };

  const handleUpdateConversionSetting = async (id: number, updates: any) => {
    const res = await fetch(`/api/conversion-settings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok && selectedClient) {
      fetchConversionSettings(selectedClient.id);
    }
  };
  const calculateScore = (metrics: any) => {
    if (kpiSettings) {
      return Math.round(calculateAdvancedScore({ metrics_json: JSON.stringify(metrics) }, kpiSettings));
    }

    if (!selectedClient || conversionSettings.length === 0) {
      // Default scoring if no settings
      const ctrScore = Math.min((metrics.ctr || 0) / 2, 1) * 20; // 2% CTR = 20 pts
      const roasScore = Math.min((metrics.roas || 0) / 4, 1) * 50; // 4 ROAS = 50 pts
      const spendScore = metrics.spend > 0 ? 30 : 0;
      return Math.round(ctrScore + roasScore + spendScore);
    }

    let totalScore = 0;
    let totalWeight = 0;

    // Funnel engagement (CTR) - weight 2
    const ctr = metrics.ctr || 0;
    const ctrTarget = 1.5; // 1.5% target
    totalScore += (Math.min(ctr / ctrTarget, 1.5)) * 20; 
    totalWeight += 20;

    // Conversion activity based on settings
    conversionSettings.filter(s => s.is_active).forEach(setting => {
      const action = (metrics.actions || []).find((a: any) => a.action_type === setting.event_key);
      const value = parseInt(action?.value || 0);
      const weight = setting.importance * 10;
      
      // Normalize: 1 conversion per $50 spend as a baseline for "good"
      const baseline = metrics.spend / 50;
      const performance = baseline > 0 ? value / baseline : (value > 0 ? 1 : 0);
      
      totalScore += Math.min(performance, 2) * weight;
      totalWeight += weight;
    });

    return Math.min(Math.round((totalScore / totalWeight) * 100), 100);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => {
      const newRange = { ...prev, [field]: value };
      if (new Date(newRange.start) > new Date(newRange.end)) {
        if (field === 'start') {
          newRange.end = newRange.start;
        } else {
          newRange.start = newRange.end;
        }
      }
      return newRange;
    });
  };

  const applyQuickDate = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
  };

  const toggleComparison = () => {
    if (!isComparing) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      const diff = end.getTime() - start.getTime();
      
      const compEnd = new Date(start.getTime() - 1);
      const compStart = new Date(compEnd.getTime() - diff);
      
      setCompareRange({
        start: compStart.toISOString().split('T')[0],
        end: compEnd.toISOString().split('T')[0]
      });
    }
    setIsComparing(!isComparing);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'META_AUTH_SUCCESS') {
        fetchPerformance();
        fetchMetaSettings();
        // Also fetch accounts after successful connection
        fetchAdAccounts();
        setSyncError(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchMetaSettings = async () => {
    const res = await fetch('/api/meta/settings');
    const data = await res.json();
    setMetaSettings(data);
  };

  const handleSaveMetaSettings = async (adAccountIdRaw: string) => {
    const adAccountId = adAccountIdRaw.replace('act_', '');
    await fetch('/api/meta/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ad_account_id: adAccountId,
        clientId: selectedClient?.id
      }),
    });
    await fetchMetaSettings();
    if (selectedClient) {
      setClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, ad_account_id: adAccountId } : c));
      setSelectedClient(prev => prev ? { ...prev, ad_account_id: adAccountId } : null);
    }
    setSyncError(null);
  };

  const fetchPerformance = async () => {
    if (!selectedClient) return;
    
    const campaignIds = selectedCampaignIds.join(',');
    const adsetIds = selectedAdSetIds.join(',');
    
    let url = `/api/meta/performance?startDate=${dateRange.start}&endDate=${dateRange.end}&clientId=${selectedClient.id}`;
    if (campaignIds) url += `&campaignIds=${campaignIds}`;
    if (adsetIds) url += `&adsetIds=${adsetIds}`;

    const res = await fetch(url);
    const data = await res.json();
    setPerformanceData(data);

    if (isComparing && compareRange) {
      let urlComp = `/api/meta/performance?startDate=${compareRange.start}&endDate=${compareRange.end}&clientId=${selectedClient.id}`;
      if (campaignIds) urlComp += `&campaignIds=${campaignIds}`;
      if (adsetIds) urlComp += `&adsetIds=${adsetIds}`;
      
      const resComp = await fetch(urlComp);
      const dataComp = await resComp.json();
      setPerformanceDataCompare(dataComp);
    }
  };

  const handleMetaConnect = async () => {
    await fetch('/api/auth/meta/reset', { method: 'POST' });
    const res = await fetch('/api/auth/meta/url');
    const { url } = await res.json();
    window.open(url, 'meta_auth', 'width=600,height=700');
  };

  const [syncError, setSyncError] = useState<{ message: string, accounts?: any[], isAuthError?: boolean } | null>(null);

  const handleMetaSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      // Sync current period
      const res = await fetch('/api/meta/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clientId: selectedClient?.id,
          startDate: dateRange.start,
          endDate: dateRange.end
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error === "Multiple Ad Accounts found" && errorData.accounts) {
          setAvailableAdAccounts(errorData.accounts);
          setSyncError({ message: errorData.error, accounts: errorData.accounts });
          setActiveTab('settings');
          return;
        }
        
        if (res.status === 401 || errorData.is_auth_error) {
          setSyncError({ message: errorData.error, isAuthError: true });
          fetchMetaSettings(); // Refresh settings to reflect cleared token
          return;
        }

        throw new Error(errorData.error || 'Sync failed');
      }
      
      // Sync comparison period if enabled
      if (isComparing && compareRange) {
        const resComp = await fetch('/api/meta/sync', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clientId: selectedClient?.id,
            startDate: compareRange.start,
            endDate: compareRange.end
          })
        });

        if (!resComp.ok) {
          const errorData = await resComp.json();
          throw new Error(errorData.error || 'Comparison sync failed');
        }
      }

      fetchPerformance();
    } catch (err: any) {
      console.error("Sync failed:", err);
      setSyncError({ message: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const renderGroupManager = () => (
    <AnimatePresence>
      {isManagingGroups && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
              <h3 className="text-xl font-bold">Manage Copy Groups</h3>
              <button onClick={() => setIsManagingGroups(false)} className="text-[#8E8E8E] hover:text-[#141414]">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-[#8E8E8E]">
                  {editingGroup ? 'Edit Group' : 'Create New Group'}
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-1.5">Group Name</label>
                    <input 
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. Summer Sale 2024"
                      className="w-full px-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-1.5">Description</label>
                    <textarea 
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      placeholder="What is this group for?"
                      className="w-full px-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm h-24 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-1.5">Label Color</label>
                    <div className="flex flex-wrap gap-2">
                      {['#141414', '#E11D48', '#D97706', '#059669', '#2563EB', '#7C3AED', '#DB2777'].map(color => (
                        <button
                          key={color}
                          onClick={() => setNewGroupColor(color)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            newGroupColor === color ? "border-[#141414] scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                      className="flex-1 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all"
                    >
                      {editingGroup ? 'Update Group' : 'Create Group'}
                    </button>
                    {editingGroup && (
                      <button 
                        onClick={() => {
                          setEditingGroup(null);
                          setNewGroupName('');
                          setNewGroupDescription('');
                          setNewGroupColor('#141414');
                        }}
                        className="px-4 py-2 bg-[#F5F5F4] text-[#141414] rounded-xl text-sm font-bold hover:bg-[#E5E5E5] transition-all"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-[#8E8E8E]">Existing Groups</h4>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {copyGroups.length === 0 ? (
                    <p className="text-sm text-[#8E8E8E] italic">No groups created yet.</p>
                  ) : (
                    copyGroups.map((group, idx) => (
                      <div key={group.id} className="p-4 bg-[#F5F5F4] rounded-2xl border border-transparent hover:border-[#E5E5E5] transition-all group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                            <h5 className="font-bold text-sm">{group.name}</h5>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingGroup(group);
                                setNewGroupName(group.name);
                                setNewGroupDescription(group.description || '');
                                setNewGroupColor(group.color || '#141414');
                              }}
                              className="p-1 text-[#8E8E8E] hover:text-[#141414]"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteGroup(group.id)}
                              className="p-1 text-[#8E8E8E] hover:text-rose-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {group.description && (
                          <p className="text-xs text-[#8E8E8E] line-clamp-2">{group.description}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const renderAiPerformanceReport = () => {
    return (
      <div className="space-y-12 pb-20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">AI Performance Intelligence Report</h2>
            <p className="text-[#8E8E8E] mt-1">Advanced multi-layer performance analysis and strategic roadmap</p>
          </div>
          <div className="flex items-center gap-3">
            {renderDateSelector()}
            <button 
              onClick={() => {
                setAiPerformanceReport(null);
                if (selectedClient) fetchReportsHistory(selectedClient.id);
              }}
              className="px-4 py-2 bg-white border border-[#E5E5E5] text-[#141414] rounded-xl text-sm font-bold hover:bg-[#F5F5F4] transition-all flex items-center gap-2"
            >
              <ChevronRight size={18} className="rotate-180" />
              History
            </button>
            <button 
              onClick={generateAiPerformanceReport}
              disabled={isGeneratingReport || performanceData.length === 0}
              className="px-6 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90 shadow-lg shadow-black/10 flex items-center gap-2 disabled:opacity-50"
            >
              {isGeneratingReport ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              {aiPerformanceReport ? 'Regenerate' : 'Generate Report'}
            </button>
            {aiPerformanceReport && !aiPerformanceReport.error && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={exportForManusAI}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-2"
                  title="Export Context for Manus AI Agent"
                >
                  <Download size={14} />
                  Manus AI Bridge
                </button>
                <button 
                  onClick={() => window.print()}
                  className="p-2.5 bg-white border border-[#E5E5E5] rounded-xl hover:bg-[#F5F5F4] transition-all"
                >
                  <Printer size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

        {isGeneratingReport ? (
          <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 shadow-sm">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="#F5F5F4"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="#141414"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * generationProgress) / 100}
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-lg">
                  {Math.round(generationProgress)}%
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold">Generating Executive Report</h3>
                <p className="text-[#8E8E8E] max-w-sm mt-2">
                  Our AI is correlating Creative DNA with performance data. This usually takes about 20-30 seconds.
                </p>
              </div>
            </div>
          </div>
        ) : !aiPerformanceReport ? (
          <div className="space-y-12">
            {reportsHistory.length > 0 && (
              <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-[#F5F5F4] flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest">Report History</h3>
                  <button 
                    onClick={() => setAiPerformanceReport(null)}
                    className="px-4 py-2 bg-[#141414] text-white rounded-xl text-xs font-bold hover:bg-opacity-90 transition-all flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Generate New Report
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#FAFAFA] text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">
                        <th className="px-6 py-4">Generated</th>
                        <th className="px-6 py-4">Date Range</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F5F5F4]">
                      {reportsHistory.map((report, idx) => (
                        <tr key={`report-row-${report.id}`} className="hover:bg-[#FAFAFA] transition-colors group">
                          <td className="px-6 py-4 text-sm font-medium">
                            {new Date(report.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-[#8E8E8E]">
                            {report.date_range_start} to {report.date_range_end}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button 
                              onClick={() => setAiPerformanceReport(JSON.parse(report.report_json))}
                              className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-[#E5E5E5] transition-all flex items-center gap-2 text-xs font-bold ml-auto"
                            >
                              View Report <ChevronRight size={14} />
                            </button>
                            <button 
                              onClick={() => deleteReport(report.id)}
                              className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-20 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-[#F5F5F4] flex items-center justify-center mb-6">
                <FileText className="text-[#8E8E8E]" size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Ready to Generate Your Report</h3>
              <p className="text-[#8E8E8E] max-w-md mb-8">
                Select a date range and click the button above to generate an advanced creative performance report for your team.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-2xl w-full">
                <div className="p-4 bg-[#FAFAFA] rounded-2xl border border-[#E5E5E5]">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-3 shadow-sm">
                    <Target size={16} className="text-[#141414]" />
                  </div>
                  <h4 className="text-xs font-bold mb-1">Multi-Layer Scoring</h4>
                  <p className="text-[10px] text-[#8E8E8E]">Analyzes delivery, engagement, and conversion quality.</p>
                </div>
                <div className="p-4 bg-[#FAFAFA] rounded-2xl border border-[#E5E5E5]">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-3 shadow-sm">
                    <Sparkles size={16} className="text-[#141414]" />
                  </div>
                  <h4 className="text-xs font-bold mb-1">Breakdown Intelligence</h4>
                  <p className="text-[10px] text-[#8E8E8E]">Granular insights by platform, placement, and device.</p>
                </div>
                <div className="p-4 bg-[#FAFAFA] rounded-2xl border border-[#E5E5E5]">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-3 shadow-sm">
                    <Activity size={16} className="text-[#141414]" />
                  </div>
                  <h4 className="text-xs font-bold mb-1">Funnel Diagnostics</h4>
                  <p className="text-[10px] text-[#8E8E8E]">Identifies leakage points and conversion bottlenecks.</p>
                </div>
              </div>
            </div>
          </div>
        ) : aiPerformanceReport?.error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center">
            <p className="text-rose-600 font-medium">{aiPerformanceReport.error}</p>
            <button onClick={generateAiPerformanceReport} className="mt-4 text-sm font-bold underline">Try Again</button>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Executive Summary & KPI Scorecard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                <div className="flex items-center gap-2 text-[#141414] mb-6">
                  <Sparkles size={20} className="text-emerald-500" />
                  <h3 className="text-sm font-bold uppercase tracking-widest">Executive Summary</h3>
                </div>
                <p className="text-lg text-[#141414] leading-relaxed font-medium italic">
                  "{aiPerformanceReport.executive_summary}"
                </p>
              </div>
              <div className="bg-[#141414] rounded-3xl p-8 text-white flex flex-col justify-between shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Target size={120} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Overall KPI Score</p>
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-5xl font-bold">{aiPerformanceReport.kpi_scorecard?.overall_score || '0'}</h4>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${aiPerformanceReport.kpi_scorecard?.trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {aiPerformanceReport.kpi_scorecard?.trend === 'up' ? '↑' : '↓'}
                    </span>
                  </div>
                  <p className="text-xs opacity-60 mt-2">Performance: <span className="text-white font-bold">{aiPerformanceReport.kpi_scorecard?.primary_kpi_performance}</span></p>
                </div>
                <div className="mt-8 pt-8 border-t border-white/10 relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs opacity-60">Peak ROAS</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {Math.max(...(aiPerformanceReport.visual_performance_data?.map((d: any) => d.roas) || [0])).toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs opacity-60">Peak CTR</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {Math.max(...(aiPerformanceReport.visual_performance_data?.map((d: any) => d.ctr) || [0])).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-8">Visual DNA Performance (ROAS)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aiPerformanceReport.visual_performance_data}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                      <XAxis dataKey="attribute" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E8E' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E8E' }} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="roas" fill="#141414" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-8">Copy DNA Performance (CTR)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aiPerformanceReport.copy_performance_data}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                      <XAxis dataKey="attribute" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E8E' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E8E' }} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="ctr" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Breakdown Intelligence & Funnel Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Breakdown Intelligence</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiPerformanceReport.breakdown_intelligence?.map((item: any, idx: number) => (
                    <div key={`breakdown-${item.dimension || idx}`} className="p-4 bg-[#FAFAFA] rounded-2xl border border-[#F5F5F4]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">{item.dimension}</span>
                        <span className="text-xs font-bold text-emerald-600">{item.winner}</span>
                      </div>
                      <p className="text-xs text-[#141414] leading-relaxed">{item.insight}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-emerald-50 rounded-3xl p-8 border border-emerald-100 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-700 mb-6">
                  <Activity size={20} />
                  <h3 className="text-sm font-bold uppercase tracking-widest">Funnel Diagnostics</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60 mb-1">Primary Leakage Point</p>
                    <p className="text-lg font-bold text-emerald-900">{aiPerformanceReport.funnel_diagnostics?.leakage_point}</p>
                  </div>
                  <div className="pt-4 border-t border-emerald-200/50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60 mb-1">Strategic Recommendation</p>
                    <p className="text-sm text-emerald-800 leading-relaxed">{aiPerformanceReport.funnel_diagnostics?.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Featured Ads Gallery */}
            <div className="space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest">Featured Ad Previews</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {aiPerformanceReport.featured_ads?.map((featured: any, idx: number) => {
                  const ad = performanceData.find(p => p.meta_ad_id === featured.meta_ad_id);
                  const image = creatives.images.find(img => img.creative_id === ad?.creative_id);
                  const variant = image?.variants.find(v => v.ratio === '1:1') || image?.variants[0];
                  
                  return (
                    <div key={featured.meta_ad_id || `featured-ad-${idx}`} className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm group">
                      <div className="aspect-square bg-[#F5F5F4] relative overflow-hidden">
                        {variant ? (
                          <img 
                            src={variant.url} 
                            alt={ad?.ad_name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#8E8E8E]">
                            <ImageIcon size={32} />
                          </div>
                        )}
                        <div className="absolute top-4 left-4">
                          <div className="bg-[#141414] text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg">
                            {featured.performance_highlight}
                          </div>
                        </div>
                      </div>
                      <div className="p-6">
                        <h4 className="text-xs font-bold mb-2 truncate">{ad?.ad_name || 'Ad Reference'}</h4>
                        <p className="text-xs text-[#8E8E8E] leading-relaxed italic">
                          "{featured.reason}"
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Expansion Strategies */}
            <div className="bg-[#FAFAFA] rounded-[40px] p-12 border border-[#E5E5E5]">
              <div className="max-w-3xl mx-auto space-y-12">
                <div className="text-center">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">The Future Roadmap</h3>
                  <h4 className="text-4xl font-bold tracking-tight">Strategic Expansion Plans</h4>
                </div>
                
                <div className="space-y-8">
                  {aiPerformanceReport.expansion_strategies?.map((strategy: any, idx: number) => (
                    <div key={`strategy-${strategy.id || idx}`} className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-sm">
                      <div className="flex items-start gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-[#141414] text-white flex items-center justify-center shrink-0 font-bold">
                          0{idx + 1}
                        </div>
                        <div className="space-y-4">
                          <h5 className="text-xl font-bold">{strategy.title}</h5>
                          <p className="text-[#8E8E8E] text-sm leading-relaxed">{strategy.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {strategy.action_steps?.map((step: string, sIdx: number) => (
                              <div key={`strategy-${strategy.id || idx}-step-${sIdx}`} className="flex items-center gap-2 text-xs font-medium text-[#141414]">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {step}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Full Deep Dive */}
            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 shadow-sm">
              <div className="flex items-center gap-2 text-[#141414] mb-8">
                <FileText size={20} />
                <h3 className="text-sm font-bold uppercase tracking-widest">Technical Deep-Dive</h3>
              </div>
              <div className="prose prose-sm max-w-none">
                <div className="markdown-body">
                  <Markdown>{aiPerformanceReport.full_markdown_report}</Markdown>
                </div>
              </div>
            </div>

            <div className="pt-12 border-t border-[#F5F5F4] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#141414] flex items-center justify-center text-white font-bold text-xs">AS</div>
                <div>
                  <p className="text-[10px] text-[#8E8E8E] font-bold uppercase tracking-widest">Ad Studio Intelligence</p>
                  <p className="text-[10px] text-[#8E8E8E] font-medium">Proprietary DNA Correlation Engine v2.4</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] text-[#8E8E8E] font-bold uppercase tracking-widest">Real-time Data Sync Active</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCreativeDNA = () => (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Creative DNA Intelligence</h2>
          <p className="text-[#8E8E8E] mt-1">Analyze visual and copy attributes to identify winning patterns</p>
        </div>
        <div className="flex items-center gap-3">
          {renderDateSelector()}
          <button 
            onClick={generateDNAInsights}
            disabled={isAnalyzingPerformance || performanceData.length === 0}
            className="px-6 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90 shadow-lg shadow-black/10 flex items-center gap-2 disabled:opacity-50"
          >
            {isAnalyzingPerformance ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Generate Intelligence Report
          </button>
        </div>
      </div>

      {renderMetaGuard(
        <div className="space-y-8">
          {dnaInsights && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-xl font-bold">Creative Intelligence Report</h3>
                </div>
                <button onClick={() => setDnaInsights(null)} className="text-[#8E8E8E] hover:text-[#141414]"><X size={20} /></button>
              </div>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-[#141414] leading-relaxed">
                  {dnaInsights}
                </div>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                  <h3 className="font-bold">Ad Creative DNA Profiles</h3>
                  <p className="text-xs text-[#8E8E8E]">{Object.keys(creativeDna).length} Profiles Extracted</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Ad Name</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Visual DNA</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Copy DNA</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5E5]">
                      {performanceData.map((ad, idx) => {
                        const dna = creativeDna[ad.meta_ad_id];
                        return (
                          <tr key={`perf-ad-${ad.id}`} className="hover:bg-[#FAFAFA] transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-[#141414] truncate max-w-[200px]">{ad.ad_name}</p>
                              <p className="text-[10px] text-[#8E8E8E] font-mono">{ad.meta_ad_id}</p>
                            </td>
                            <td className="px-6 py-4">
                              {dna ? (
                                <div className="flex flex-wrap gap-1">
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-bold uppercase">{dna.visual_style}</span>
                                  <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[9px] font-bold uppercase">{dna.primary_subject}</span>
                                  {dna.people_present && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-bold uppercase">People</span>}
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#8E8E8E] italic">No DNA Profile</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {dna ? (
                                <div className="flex flex-wrap gap-1">
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-bold uppercase">{dna.headline_structure}</span>
                                  <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[9px] font-bold uppercase">{dna.emotional_trigger}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#8E8E8E] italic">No DNA Profile</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => analyzeCreativeDNA(ad.meta_ad_id)}
                                disabled={isAnalyzingDNA === ad.meta_ad_id}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all",
                                  dna 
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100" 
                                    : "bg-[#141414] text-white border-transparent hover:bg-opacity-90"
                                )}
                              >
                                {isAnalyzingDNA === ad.meta_ad_id ? (
                                  <Loader2 className="animate-spin" size={12} />
                                ) : dna ? (
                                  "Re-Analyze"
                                ) : (
                                  "Analyze DNA"
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-6 shadow-sm">
                <h3 className="font-bold mb-4">DNA Distribution</h3>
                <div className="space-y-4">
                  {/* Summary stats based on creativeDna */}
                  {(() => {
                    const styles: Record<string, number> = {};
                    (Object.values(creativeDna) as CreativeDNA[]).forEach(dna => {
                      styles[dna.visual_style] = (styles[dna.visual_style] || 0) + 1;
                    });
                    return Object.entries(styles).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([style, count]) => (
                      <div key={style}>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-1">
                          <span>{style}</span>
                          <span>{Math.round((count / Object.keys(creativeDna).length) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-[#F5F5F4] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#141414] rounded-full" 
                            style={{ width: `${(count / Object.keys(creativeDna).length) * 100}%` }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="bg-[#141414] rounded-3xl p-6 text-white shadow-xl shadow-black/20">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <Sparkles size={20} />
                </div>
                <h3 className="font-bold mb-2">Creative DNA Engine</h3>
                <p className="text-xs text-white/60 leading-relaxed mb-4">
                  Our engine uses computer vision and linguistic analysis to extract over 50+ attributes from your ads.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Visual Style Detection
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Copy Structure Analysis
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Psychological Trigger Mapping
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderDateSelector = () => (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex bg-white rounded-xl border border-[#E5E5E5] p-1">
        {[3, 7, 14, 30].map(days => (
          <button 
            key={`quick-date-${days}`}
            onClick={() => applyQuickDate(days)}
            className={cn(
              "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors",
              "hover:bg-[#F5F5F4]"
            )}
          >
            {days}D
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#E5E5E5]">
        <Calendar size={14} className="text-[#8E8E8E]" />
        <input 
          type="date" 
          value={dateRange.start}
          onChange={e => handleDateChange('start', e.target.value)}
          className="text-xs font-medium focus:outline-none"
        />
        <span className="text-[#8E8E8E] text-xs">to</span>
        <input 
          type="date" 
          value={dateRange.end}
          onChange={e => handleDateChange('end', e.target.value)}
          className="text-xs font-medium focus:outline-none"
        />
      </div>
      {activeTab === 'performance' && (
        <>
          <button 
            onClick={toggleComparison}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border",
              isComparing ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-[#E5E5E5] text-[#141414] hover:bg-[#FAFAFA]"
            )}
          >
            <TrendingUp size={16} />
            {isComparing ? "Comparing" : "Compare"}
          </button>
          <button 
            onClick={() => setIsCustomizingColumns(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium hover:bg-[#FAFAFA]"
          >
            <Table size={16} />
            Customize
          </button>
        </>
      )}
      <button 
        onClick={handleMetaSync}
        disabled={isSyncing || !metaSettings.access_token}
        className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-xl text-sm font-medium hover:bg-opacity-90 disabled:opacity-50"
      >
        {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <TrendingUp size={18} />}
        Sync Data
      </button>
    </div>
  );

  const renderMetaGuard = (children: React.ReactNode) => {
    if (!metaSettings.access_token) {
      return (
        <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-[#1877F2]/10 rounded-2xl flex items-center justify-center mb-4">
            <Facebook className="text-[#1877F2]" size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">Meta Ads Not Connected</h3>
          <p className="text-[#8E8E8E] max-w-sm mb-6">Connect your Meta Ads account to sync performance data and generate AI insights.</p>
          <button 
            onClick={handleMetaConnect}
            className="px-8 py-3 bg-[#1877F2] text-white rounded-xl font-bold hover:bg-opacity-90 transition-all flex items-center gap-2"
          >
            <Facebook size={20} />
            Connect Meta Ads
          </button>
        </div>
      );
    }
    return children;
  };

  // Fetch creatives when client changes
  useEffect(() => {
    if (selectedClient) {
      fetchCreatives(selectedClient.id);
      fetchCopyGroups(selectedClient.id);
    }
  }, [selectedClient]);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) {
        console.error('Failed to fetch clients:', await res.text());
        setClients([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setClients(data);
      } else {
        console.error('Expected array of clients, got:', data);
        setClients([]);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      setClients([]);
    }
  };

  const fetchCreatives = async (clientId: number) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/creatives`);
      if (!res.ok) {
        console.error('Failed to fetch creatives:', await res.text());
        setCreatives({ copy: [], images: [] });
        return;
      }
      const data = await res.json();
      setCreatives(data);
    } catch (err) {
      console.error('Error fetching creatives:', err);
      setCreatives({ copy: [], images: [] });
    }
  };

  const fetchCopyGroups = async (clientId: number) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/copy-groups`);
      if (!res.ok) {
        console.error('Failed to fetch copy groups:', await res.text());
        setCopyGroups([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setCopyGroups(data);
      } else {
        console.error('Expected array of copy groups, got:', data);
        setCopyGroups([]);
      }
    } catch (err) {
      console.error('Error fetching copy groups:', err);
      setCopyGroups([]);
    }
  };

  const handleAddCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !isAddingCopy) return;
    
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [{
            text: `Analyze this ad copy for client "${selectedClient.name}": "${newCopy}".
            Extract 'Creative DNA' attributes: emotional_trigger, copy_structure, offer_type, cta_language, copy_complexity (low/medium/high).
            Return as JSON.`
          }]
        }],
        config: { responseMimeType: 'application/json' }
      });
      
      const dna = JSON.parse(response.text || '{}');
      
      const res = await fetch('/api/creatives/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_id: selectedClient.id, 
          type: isAddingCopy, 
          content: newCopy,
          dna_json: JSON.stringify(dna),
          group_id: selectedGroupIdForNewCopy
        }),
      });
      const data = await res.json();
      setCreatives(prev => ({ ...prev, copy: [...prev.copy, data] }));
      setIsAddingCopy(null);
      setSelectedGroupIdForNewCopy(null);
      setNewCopy('');
      setNewCopy('');
    } catch (err) {
      console.error("Copy DNA extraction failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    const variants = [];
    if (newImage.url11) variants.push({ ratio: '1:1', url: newImage.url11 });
    if (newImage.url916) variants.push({ ratio: '9:16', url: newImage.url916 });
    if (newImage.url45) variants.push({ ratio: '4:5', url: newImage.url45 });

    const res = await fetch('/api/creatives/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        client_id: selectedClient.id, 
        name: newImage.name, 
        variants,
        detected_text: newImage.detected_text,
        detected_cta: newImage.detected_cta,
        visual_type: newImage.visual_type,
        creative_id: newImage.creative_id,
        dna_json: newImage.dna_json
      }),
    });
    const data = await res.json();
    // Re-fetch to get full image object with variants
    fetchCreatives(selectedClient.id);
    setIsAddingImage(false);
    setNewImage({ 
      name: '', 
      url11: '', 
      url916: '', 
      url45: '', 
      detected_text: '', 
      detected_cta: '',
      visual_type: '',
      creative_id: '',
      dna_json: ''
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let analysisDone = false;
      const updatedImage = { ...newImage };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = dataUrl;
        });
        
        const ratio = img.width / img.height;
        let detectedRatio = '1:1';
        if (ratio < 0.7) detectedRatio = '9:16';
        else if (ratio < 0.9) detectedRatio = '4:5';
        else if (ratio > 1.2) detectedRatio = '16:9';
        else detectedRatio = '1:1';

        if (detectedRatio === '1:1') updatedImage.url11 = dataUrl;
        if (detectedRatio === '9:16') updatedImage.url916 = dataUrl;
        if (detectedRatio === '4:5') updatedImage.url45 = dataUrl;
        
        if (!updatedImage.name) updatedImage.name = file.name.split('.')[0];

        // Only analyze the first image to get metadata for the whole ad
        if (!analysisDone) {
          const base64Data = dataUrl.split(',')[1];
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{
              parts: [
                {
                  inlineData: { data: base64Data, mimeType: file.type }
                },
                {
                  text: `Analyze this ad graphic. 
                  1. Extract the 'in-graphic text' (all text visible on the image).
                  2. Extract the 'CTA button text' (the text on the call-to-action button, if any).
                  3. Identify the 'visual type' (e.g., vector, lifestyle, young couple, old couple, landscape, product-only, etc.).
                  4. Generate a unique 'creative ID' in the format 'C-XXXX' where XXXX is a random 4-digit number.
                  5. Extract 'Creative DNA' attributes: visual_style, primary_subject, people_present (boolean), primary_color, background_color, layout_type, text_density (low/medium/high).
                  
                  Return as JSON with keys 'text', 'cta', 'visual_type', 'creative_id', and 'dna' (an object containing the DNA attributes).`
                }
              ]
            }],
            config: { responseMimeType: 'application/json' }
          });

          const analysis = JSON.parse(response.text || '{}');
          updatedImage.detected_text = analysis.text || '';
          updatedImage.detected_cta = analysis.cta || '';
          updatedImage.visual_type = analysis.visual_type || '';
          updatedImage.creative_id = analysis.creative_id || `C-${Math.floor(1000 + Math.random() * 9000)}`;
          updatedImage.dna_json = JSON.stringify(analysis.dna || {});
          analysisDone = true;
        }
      }

      setNewImage(updatedImage);

    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateSingleCopyTypeVariations = async (type: CopyType, direction?: string) => {
    if (!selectedClient) return;
    setIsGenerating(true);
    setAiGeneratedVariations([]);
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const approvedCopy = creatives.copy.filter(c => c.status === 'approved' && c.type === type).map(c => c.content).join('\n');
      
      // Get winning patterns from the latest report if available
      const latestReport = reportsHistory.length > 0 ? JSON.parse(reportsHistory[0].report_json) : null;
      const winningPatterns = latestReport ? latestReport.copy_performance_data?.map((p: any) => p.attribute).join(', ') : 'None yet';
      const expansionStrategies = latestReport ? latestReport.expansion_strategies?.map((s: any) => `${s.title}: ${s.description}`).join('\n') : 'None yet';

      const prompt = `You are an expert ad copywriter. Generate 3 new variations of ${type.replace('_', ' ')} for the following client.
      
      ${direction ? `USER DIRECTION/THEME: "${direction}" - Please prioritize this direction while maintaining brand voice.` : ''}

      Client Info:
      - Name: ${selectedClient.name}
      - Industry: ${selectedClient.industry}
      - Campaign Goal: ${selectedClient.campaign_goal || 'Not specified'}
      - Target Audience: ${selectedClient.target_audience || 'Not specified'}
      - Tone of Voice: ${selectedClient.tone_of_voice || 'Not specified'}
      - Unique Selling Propositions: ${selectedClient.usp || 'Not specified'}
      - Main CTA: ${selectedClient.main_cta || 'Not specified'}
      ${selectedClient.landing_page_url ? `- Landing Page: ${selectedClient.landing_page_url}` : ''}
      
      Winning Patterns from Previous Analysis:
      - Effective Copy Attributes: ${winningPatterns}
      - Expansion Strategies: ${expansionStrategies}
      
      Approved/Existing ${type.replace('_', ' ')} Examples (Learn the style and tone from these):
      ${approvedCopy || 'None provided yet. Use the client info to establish the style.'}
      
      Requirements:
      - Stay consistent with the brand's tone of voice.
      - Focus on the unique selling propositions.
      - Align with the campaign goal and winning patterns identified in previous reports.
      - Use the specified main CTA if provided.
      ${selectedClient.landing_page_url ? `- Analyze the provided landing page URL to ensure the ad copy aligns perfectly with the landing page content, style, and offers.` : ''}
      - For each variation, also extract 'Creative DNA' attributes: emotional_trigger, copy_structure, offer_type, cta_language, copy_complexity (low/medium/high).
      
      Return the result as a JSON array of objects with:
      - 'content'
      - 'dna' (an object containing the DNA attributes)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
          responseMimeType: 'application/json',
          tools: selectedClient.landing_page_url ? [{ urlContext: {} }] : undefined
        }
      });
      
      const variations = JSON.parse(response.text || '[]');
      setAiGeneratedVariations(variations);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCopyVariations = async () => {
    if (!selectedClient) return;
    setIsGenerating(true);
    try {
      const approvedCopy = creatives.copy.filter(c => c.status === 'approved').map(c => `${c.type}: ${c.content}`).join('\n');
      const prompt = `You are an expert ad copywriter. Generate 3 new variations of Primary Text, 3 Headlines, and 3 Descriptions for the following client.
      
      Client Info:
      - Name: ${selectedClient.name}
      - Industry: ${selectedClient.industry}
      - Campaign Goal: ${selectedClient.campaign_goal || 'Not specified'}
      - Target Audience: ${selectedClient.target_audience || 'Not specified'}
      - Tone of Voice: ${selectedClient.tone_of_voice || 'Not specified'}
      - Unique Selling Propositions: ${selectedClient.usp || 'Not specified'}
      - Main CTA: ${selectedClient.main_cta || 'Not specified'}
      ${selectedClient.landing_page_url ? `- Landing Page: ${selectedClient.landing_page_url}` : ''}
      
      Approved/Existing Copy Examples (Learn the style and tone from these):
      ${approvedCopy || 'None provided yet. Use the client info to establish the style.'}
      
      Requirements:
      - Stay consistent with the brand's tone of voice.
      - Focus on the unique selling propositions.
      - Align with the campaign goal.
      - Use the specified main CTA if provided.
      ${selectedClient.landing_page_url ? `- Analyze the provided landing page URL to ensure the ad copy aligns perfectly with the landing page content, style, and offers.` : ''}
      - For each variation, also extract 'Creative DNA' attributes: emotional_trigger, copy_structure, offer_type, cta_language, copy_complexity (low/medium/high).
      
      Return the result as a JSON array of objects with:
      - 'type' (one of: primary_text, headline, description)
      - 'content'
      - 'dna' (an object containing the DNA attributes)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
          responseMimeType: 'application/json',
          tools: selectedClient.landing_page_url ? [{ urlContext: {} }] : undefined
        }
      });
      
      const variations = JSON.parse(response.text || '[]');
      for (const v of variations) {
        await fetch('/api/creatives/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            client_id: selectedClient.id, 
            type: v.type, 
            content: v.content,
            dna_json: JSON.stringify(v.dna || {})
          }),
        });
      }
      fetchCreatives(selectedClient.id);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddClientError(null);
    console.log('handleAddClient called', newClient);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      });
      if (!res.ok) {
        const errorData = await res.json();
        console.error('Failed to add client:', errorData);
        setAddClientError(`Failed to add client: ${errorData.error || 'Unknown error'}`);
        return;
      }
      const data = await res.json();
      if (data && data.id) {
        setClients([data, ...clients]);
        setIsAddingClient(false);
        setNewClient({ name: '', industry: '', ad_account_id: '', landing_page_url: '' });
      } else {
        console.error('Invalid data returned from server:', data);
        setAddClientError('Client was created but invalid data was returned. Please refresh the page.');
      }
    } catch (err) {
      console.error('Error adding client:', err);
      setAddClientError('An unexpected error occurred while adding the client.');
    }
  };

  const updateCopyStatus = async (id: number, status: CreativeStatus) => {
    await fetch(`/api/creatives/copy/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setCreatives(prev => ({
      ...prev,
      copy: prev.copy.map(c => c.id === id ? { ...c, status } : c)
    }));
  };

  const updateImageStatus = async (id: number, status: CreativeStatus) => {
    await fetch(`/api/creatives/image/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setCreatives(prev => ({
      ...prev,
      images: prev.images.map(img => img.id === id ? { ...img, status } : img)
    }));
  };

  const handleCreateGroup = async () => {
    if (!selectedClient || !newGroupName) return;
    const res = await fetch(`/api/clients/${selectedClient.id}/copy-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName, description: newGroupDescription, color: newGroupColor })
    });
    const data = await res.json();
    setCopyGroups(prev => [...prev, data]);
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupColor('#141414');
    setIsCreatingGroup(false);
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    await fetch(`/api/copy-groups/${editingGroup.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName, description: newGroupDescription, color: newGroupColor })
    });
    setCopyGroups(prev => prev.map(g => g.id === editingGroup.id ? { ...g, name: newGroupName, description: newGroupDescription, color: newGroupColor } : g));
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupColor('#141414');
    setEditingGroup(null);
  };

  const handleDeleteGroup = async (id: number) => {
    await fetch(`/api/copy-groups/${id}`, { method: 'DELETE' });
    setCopyGroups(prev => prev.filter(g => g.id !== id));
    setCreatives(prev => ({
      ...prev,
      copy: prev.copy.map(c => c.group_id === id ? { ...c, group_id: undefined } : c)
    }));
  };

  const handleAssignGroup = async (copyId: number, groupId: number | null) => {
    await fetch(`/api/creatives/copy/${copyId}/group`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId })
    });
    setCreatives(prev => ({
      ...prev,
      copy: prev.copy.map(c => c.id === copyId ? { ...c, group_id: groupId || undefined } : c)
    }));
  };

  const handleDeleteCopy = async (id: number) => {
    if (!confirm('Are you sure you want to delete this ad copy?')) return;
    await fetch(`/api/creatives/copy/${id}`, { method: 'DELETE' });
    setCreatives(prev => ({
      ...prev,
      copy: prev.copy.filter(c => c.id !== id)
    }));
  };

  const handleUpdateCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCopy) return;
    
    await fetch(`/api/creatives/copy/${editingCopy.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: editCopyContent,
        group_id: editCopyGroupId
      })
    });
    
    setCreatives(prev => ({
      ...prev,
      copy: prev.copy.map(c => c.id === editingCopy.id ? { ...c, content: editCopyContent, group_id: editCopyGroupId || undefined } : c)
    }));
    setEditingCopy(null);
    setEditCopyContent('');
    setEditCopyGroupId(null);
  };

  const exportToCSV = () => {
    if (!selectedClient) return;
    
    const approvedHeadlines = creatives.copy.filter(c => c.type === 'headline' && c.status === 'approved');
    const approvedPrimary = creatives.copy.filter(c => c.type === 'primary_text' && c.status === 'approved');
    const approvedImages = creatives.images.filter(img => img.status === 'approved');

    // Naming Convention: [CreativeID]_[VisualType]_[CTA]_[Ratio]
    const headers = ['Campaign Name', 'Ad Set Name', 'Ad Name', 'Headline 1', 'Headline 2', 'Primary Text 1', 'Primary Text 2', 'Image URL'];
    const rows = approvedImages.flatMap(img => {
      return img.variants.map(v => {
        const creativeId = img.creative_id || 'C-0000';
        const visualType = (img.visual_type || 'unknown').replace(/\s+/g, '-');
        const cta = (img.detected_cta || 'no-cta').replace(/\s+/g, '-');
        const ratio = v.ratio.replace(':', 'x');
        
        const adName = `${creativeId}_${visualType}_${cta}_${ratio}`;

        return [
          `${selectedClient.name} - Campaign`,
          `AdSet - ${v.ratio}`,
          adName,
          approvedHeadlines[0]?.content || '',
          approvedHeadlines[1]?.content || '',
          approvedPrimary[0]?.content || '',
          approvedPrimary[1]?.content || '',
          v.url
        ];
      });
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedClient.name}_meta_ads_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getConversions = (metrics: any) => {
    const primaryEvent = selectedClient?.primary_conversion_event || 'conversions';
    if (primaryEvent === 'conversions') return metrics.conversions || 0;
    const action = metrics.actions?.find((a: any) => a.action_type === primaryEvent);
    return action ? parseInt(action.value) : 0;
  };

  const renderSettingsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1877F2]/10 flex items-center justify-center">
            <Facebook className="text-[#1877F2]" size={20} />
          </div>
          <div>
            <h3 className="font-bold">Meta Ads Integration</h3>
            <p className="text-[#8E8E8E] text-xs">Connect your ad account for performance tracking</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-[#F5F5F4] rounded-xl">
            <div>
              <p className="text-sm font-bold">Connection Status</p>
              <p className={cn("text-xs font-bold", metaSettings.access_token ? (syncError?.isAuthError ? "text-rose-600" : "text-emerald-600") : "text-amber-600")}>
                {metaSettings.access_token ? (syncError?.isAuthError ? "Session Expired" : "Connected") : "Not Connected"}
              </p>
              {metaSettings.access_token && !syncError?.isAuthError && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {metaPermissions.length > 0 ? (
                    metaPermissions.map(p => (
                      <span key={`permission-${p.permission}`} className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full",
                        p.status === 'granted' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}>
                        {p.permission}
                      </span>
                    ))
                  ) : (
                    <button 
                      onClick={checkMetaPermissions}
                      disabled={isCheckingPermissions}
                      className="text-[10px] text-[#1877F2] hover:underline"
                    >
                      {isCheckingPermissions ? "Checking..." : "Check Permissions"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={checkMetaPermissions}
                className="px-3 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs font-bold hover:bg-[#FAFAFA] transition-all"
              >
                Refresh Connection
              </button>
              <button 
                onClick={() => {
                  handleMetaConnect();
                  if (syncError?.isAuthError) setSyncError(null);
                }}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  syncError?.isAuthError 
                    ? "bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-500/20"
                    : metaSettings.access_token 
                      ? "bg-white border border-[#E5E5E5] text-[#141414] hover:bg-[#FAFAFA]" 
                      : "bg-[#1877F2] text-white hover:bg-opacity-90"
                )}
              >
                {syncError?.isAuthError ? "Reconnect Now" : metaSettings.access_token ? "Reconnect" : "Connect Meta"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">OAuth Redirect URI</label>
            <div className="p-3 bg-white border border-[#E5E5E5] rounded-lg flex items-center justify-between group">
              <code className="text-[10px] text-[#141414] break-all">
                {window.location.origin}/api/auth/meta/callback
              </code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/auth/meta/callback`);
                  alert('Copied to clipboard!');
                }}
                className="p-1.5 hover:bg-[#FAFAFA] rounded-md text-[#8E8E8E] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Settings size={14} />
              </button>
            </div>
            <p className="text-[10px] text-[#8E8E8E]">Copy this to "Valid OAuth Redirect URIs" in your Meta App settings.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-wider">Ad Account ID</label>
              <div className="flex items-center gap-3">
                {(metaSettings.ad_account_id === '123456789' || metaSettings.ad_account_id === 'act_123456789') && (
                  <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                    <AlertCircle size={10} />
                    Placeholder ID detected
                  </span>
                )}
                {metaSettings.access_token && (
                  <button 
                    onClick={fetchAdAccounts}
                    disabled={isFetchingAccounts}
                    className="text-[10px] font-bold text-[#1877F2] hover:underline flex items-center gap-1"
                  >
                    {isFetchingAccounts ? <Loader2 className="animate-spin" size={10} /> : <RefreshCw size={10} />}
                    Refresh Accounts
                  </button>
                )}
              </div>
            </div>
            
            {metaSettings.access_token ? (
              <div className="space-y-3">
                {availableAdAccounts.length > 0 ? (
                  <div className="flex gap-2">
                    <select 
                      value={(metaSettings.ad_account_id || '').replace('act_', '')}
                      onChange={(e) => handleSaveMetaSettings(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-lg border border-[#E5E5E5] text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/10"
                    >
                      <option value="">Select an account...</option>
                      {availableAdAccounts.map((acc, idx) => (
                        <option key={`ad-account-${acc.account_id || idx}`} value={acc.account_id}>
                          {acc.name || 'Unnamed Account'} ({acc.account_id || 'No ID'})
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={() => handleMetaSync()}
                      disabled={isSyncing || !metaSettings.ad_account_id}
                      className="px-4 py-2 bg-[#141414] text-white rounded-lg text-xs font-bold hover:bg-opacity-90 disabled:opacity-50"
                    >
                      {isSyncing ? <Loader2 className="animate-spin" size={14} /> : "Test Sync"}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={metaSettings.ad_account_id || ''}
                        onChange={(e) => setMetaSettings(prev => ({ ...prev, ad_account_id: e.target.value }))}
                        onBlur={(e) => handleSaveMetaSettings(e.target.value)}
                        className="flex-1 px-4 py-2 rounded-lg border border-[#E5E5E5] text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                        placeholder="e.g. 1234567890"
                      />
                      <button 
                        onClick={() => handleMetaSync()}
                        disabled={isSyncing || !metaSettings.ad_account_id}
                        className="px-4 py-2 bg-[#141414] text-white rounded-lg text-xs font-bold hover:bg-opacity-90 disabled:opacity-50"
                      >
                        {isSyncing ? <Loader2 className="animate-spin" size={14} /> : "Test Sync"}
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-600">No accounts detected automatically. You can enter the ID manually or try refreshing.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-[#F5F5F4] rounded-xl border border-dashed border-[#E5E5E5] text-center">
                <p className="text-xs text-[#8E8E8E]">Connect to Meta to select an Ad Account</p>
              </div>
            )}
            <p className="text-[10px] text-[#8E8E8E]">Enter your numeric Ad Account ID (without 'act_')</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Sparkles className="text-emerald-600" size={20} />
          </div>
          <div>
            <h3 className="font-bold">AI Studio Configuration</h3>
            <p className="text-[#8E8E8E] text-xs">Link your Gemini API key for AI features</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-2">
              <Settings size={14} />
              How to link your API Key
            </p>
            <ol className="text-[10px] text-amber-700 space-y-2 list-decimal ml-4">
              <li>Open the <strong>Settings</strong> menu in the top-right of the AI Studio interface.</li>
              <li>Find the <strong>Environment Variables</strong> or <strong>Secrets</strong> section.</li>
              <li>Add a new variable named <code>GEMINI_API_KEY</code>.</li>
              <li>Paste your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">Google AI Studio</a>.</li>
              <li>The app will automatically use this key for all AI-powered insights and generation.</li>
            </ol>
          </div>
          
          <div className="p-4 bg-[#F5F5F4] rounded-xl">
            <p className="text-xs font-bold mb-1">Project ID</p>
            <p className="text-[10px] font-mono text-[#8E8E8E]">projects/21385871419</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
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

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'conversion-mapping' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Conversion Event Mapping</h2>
                      <p className="text-[#8E8E8E] mt-1">Guided workflow to map Meta signals to your dashboard KPIs</p>
                    </div>
                    <ConversionEventMapping 
                      settings={kpiSettings} 
                      onSave={saveKPISettings}
                      adAccountId={selectedClient?.ad_account_id || ''}
                      startDate={dateRange.start}
                      endDate={dateRange.end}
                    />
                  </div>
                )}

                {activeTab === 'creative-dna' && renderCreativeDNA()}
                {activeTab === 'ai-performance-report' && renderAiPerformanceReport()}
                {activeTab === 'kpi-settings' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">KPI Control Center</h2>
                      <p className="text-[#8E8E8E] mt-1">Configure how performance is analyzed and scored for this client</p>
                    </div>
                    <KPISettingsPanel 
                      settings={kpiSettings} 
                      onSave={saveKPISettings}
                      isSaving={isSavingKPIs}
                    />
                  </div>
                )}

                {activeTab === 'breakdowns' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Breakdown Analysis</h2>
                      <p className="text-[#8E8E8E] mt-1">Analyze performance across platforms, placements, and demographics</p>
                    </div>
                    <BreakdownAnalysisEngine 
                      data={adBreakdowns} 
                      onSync={syncBreakdowns}
                      isSyncing={isSyncingBreakdowns}
                      performanceData={performanceData}
                    />
                  </div>
                )}

                {activeTab === 'funnel' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Funnel Analysis</h2>
                      <p className="text-[#8E8E8E] mt-1">Track user journey from first impression to final conversion</p>
                    </div>
                    <FunnelAnalysis data={performanceData} />
                  </div>
                )}

                {activeTab === 'column-settings' && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">Reporting Columns</h2>
                      <p className="text-[#8E8E8E] mt-1">Select and organize the metrics you want to see in your reports</p>
                    </div>
                    <ColumnSettingsPanel 
                      selectedColumns={selectedColumns}
                      onUpdate={setSelectedColumns}
                    />
                  </div>
                )}

                {activeTab === 'intelligence' && (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">Creative Intelligence</h2>
                        <p className="text-sm text-[#8E8E8E]">AI-powered correlation between creative traits and performance</p>
                      </div>
                      <button 
                        onClick={handleAnalyzeAllCreatives}
                        disabled={isAnalyzingAll || !performanceData.length}
                        className="px-6 py-3 bg-[#141414] text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:bg-[#2D2D2D] transition-all disabled:opacity-50"
                      >
                        {isAnalyzingAll ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            Analyzing Creatives...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={18} />
                            Run DNA Analysis
                          </>
                        )}
                      </button>
                    </div>

                    {isFetchingIntelligence ? (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#E5E5E5] shadow-sm">
                        <Loader2 className="animate-spin text-[#141414] mb-4" size={32} />
                        <p className="text-sm font-medium text-[#8E8E8E]">Calculating correlations...</p>
                      </div>
                    ) : intelligenceData && intelligenceData.insights.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Winning Patterns */}
                        <div className="lg:col-span-2 space-y-6">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] flex items-center gap-2">
                            <TrendingUp size={14} className="text-emerald-600" />
                            Winning Traits & Patterns
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {intelligenceData.insights.filter(i => i.type === 'winning').map((insight, idx) => (
                              <motion.div 
                                key={`winning-${insight.trait}-${insight.metric}-${idx}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="bg-white p-6 rounded-3xl border border-[#E5E5E5] shadow-sm hover:border-[#141414] transition-all group"
                              >
                                <div className="flex items-start justify-between mb-4">
                                  <div className={cn(
                                    "p-2 rounded-xl",
                                    insight.category === 'visual' ? "bg-blue-50 text-blue-600" : 
                                    insight.category === 'headline' ? "bg-purple-50 text-purple-600" : "bg-orange-50 text-orange-600"
                                  )}>
                                    {insight.category === 'visual' ? <ImageIcon size={20} /> : <Type size={20} />}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-bold text-emerald-600">+{insight.improvement}%</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">{insight.metric}</p>
                                  </div>
                                </div>
                                <h4 className="font-bold text-lg mb-1 capitalize">{insight.trait}</h4>
                                <p className="text-sm text-[#8E8E8E] mb-4">{insight.comparison}</p>
                                <div className="flex items-center justify-between pt-4 border-t border-[#F5F5F4]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#8E8E8E] uppercase">Confidence</span>
                                    <div className="w-12 h-1.5 bg-[#F5F5F4] rounded-full overflow-hidden">
                                      <div className="h-full bg-emerald-500" style={{ width: `${insight.confidence_score * 100}%` }} />
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-[#8E8E8E] uppercase">N={insight.sample_size}</span>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>

                        {/* Losing & Next Tests */}
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] flex items-center gap-2">
                              <XCircle size={14} className="text-rose-600" />
                              Losing Patterns
                            </h3>
                            <div className="space-y-3">
                              {intelligenceData.insights.filter(i => i.type === 'losing').map((insight, idx) => (
                                <div key={`losing-${insight.trait}-${insight.metric}-${idx}`} className="bg-white p-4 rounded-2xl border border-[#E5E5E5] flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-bold capitalize">{insight.trait}</p>
                                    <p className="text-[10px] text-[#8E8E8E]">{insight.comparison}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-rose-600">-{Math.abs(insight.improvement)}%</p>
                                    <p className="text-[10px] text-[#8E8E8E] uppercase">{insight.metric}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] flex items-center gap-2">
                              <Zap size={14} className="text-amber-500" />
                              Suggested Next Tests
                            </h3>
                            <div className="space-y-3">
                              {intelligenceData.insights.filter(i => i.type === 'test').map((insight, idx) => (
                                <div key={`test-${insight.trait}-${idx}`} className="bg-[#141414] p-4 rounded-2xl text-white">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider">Hypothesis</span>
                                    <ArrowUpRight size={14} className="text-emerald-400" />
                                  </div>
                                  <p className="text-sm font-bold mb-1">{insight.trait}</p>
                                  <p className="text-[10px] text-white/60">{insight.comparison}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#E5E5E5] shadow-sm">
                        <div className="w-20 h-20 bg-[#F5F5F4] rounded-full flex items-center justify-center mb-6">
                          <Sparkles className="text-[#8E8E8E]" size={32} />
                        </div>
                        <h3 className="text-xl font-bold mb-2">No Intelligence Data Yet</h3>
                        <p className="text-sm text-[#8E8E8E] max-w-md text-center mb-8">
                          Run a DNA analysis on your active creatives to start uncovering winning patterns and performance correlations.
                        </p>
                        <button 
                          onClick={handleAnalyzeAllCreatives}
                          disabled={isAnalyzingAll || !performanceData.length}
                          className="px-8 py-4 bg-[#141414] text-white rounded-2xl text-sm font-bold hover:bg-[#2D2D2D] transition-all disabled:opacity-50"
                        >
                          {isAnalyzingAll ? "Analyzing..." : "Analyze Active Creatives"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'dashboard' && (
                  <div className="space-y-8">
                    {isFetchingOverview ? (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#E5E5E5] shadow-sm">
                        <Loader2 className="animate-spin text-[#141414] mb-4" size={32} />
                        <p className="text-sm font-medium text-[#8E8E8E]">Loading overview data...</p>
                      </div>
                    ) : overviewData ? (
                      <>
                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {[
                            { label: 'Spend', key: 'spend', format: (v: number) => `$${v.toLocaleString()}` },
                            { label: 'Revenue', key: 'revenue', format: (v: number) => `$${v.toLocaleString()}` },
                            { label: 'Conversions', key: 'conversions', format: (v: number) => v.toLocaleString() },
                            { label: 'ROAS', key: 'roas', format: (v: number) => v.toFixed(2) + 'x' }
                          ].map(kpi => {
                            const currentVal = kpi.key === 'roas' 
                              ? (overviewData.current.revenue / (overviewData.current.spend || 1))
                              : overviewData.current[kpi.key];
                            const prevVal = kpi.key === 'roas'
                              ? (overviewData.previous.revenue / (overviewData.previous.spend || 1))
                              : overviewData.previous[kpi.key];
                            
                            const diff = currentVal - prevVal;
                            const percentChange = prevVal !== 0 ? (diff / prevVal) * 100 : 0;
                            const isPositive = diff >= 0;

                            const isMapped = kpiSettings?.metric_mappings?.[kpi.key as keyof NonNullable<KPISettings['metric_mappings']>]?.length > 0;
                            const showWarning = !isMapped && ['revenue', 'conversions', 'roas'].includes(kpi.key);

                            return (
                              <div key={kpi.key} className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm relative group">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">{kpi.label}</p>
                                  {showWarning && (
                                    <div className="relative">
                                      <AlertCircle size={12} className="text-amber-500 cursor-help" />
                                      <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-[#141414] text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        This metric is using default Meta fields. Go to <strong>Metric Mapping</strong> to configure specific action types.
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-baseline justify-between">
                                  <p className="text-2xl font-bold">{kpi.format(currentVal)}</p>
                                  <div className={cn(
                                    "flex items-center gap-0.5 text-xs font-bold",
                                    isPositive ? "text-emerald-600" : "text-rose-600"
                                  )}>
                                    {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {Math.abs(percentChange).toFixed(1)}%
                                  </div>
                                </div>
                                <p className="text-[10px] text-[#8E8E8E] mt-2">vs. previous period</p>
                              </div>
                            );
                          })}
                        </div>

                        {/* Trendline Chart */}
                        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
                          <div className="flex items-center justify-between mb-8">
                            <div>
                              <h3 className="text-lg font-bold">Performance Trend</h3>
                              <p className="text-xs text-[#8E8E8E]">Daily {overviewData.primaryKpi.toUpperCase()} performance comparison</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#141414]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Current</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-[#E5E5E5]" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Previous</span>
                              </div>
                            </div>
                          </div>
                          <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={Object.keys(overviewData.current.daily).sort().map(date => {
                                const current = overviewData.current.daily[date];
                                // Find corresponding date in previous period (same index)
                                const currentDates = Object.keys(overviewData.current.daily).sort();
                                const prevDates = Object.keys(overviewData.previous.daily).sort();
                                const idx = currentDates.indexOf(date);
                                const prevDate = prevDates[idx];
                                const previous = prevDate ? overviewData.previous.daily[prevDate] : null;

                                const getVal = (d: any) => {
                                  if (!d) return 0;
                                  if (overviewData.primaryKpi === 'roas') return d.revenue / (d.spend || 1);
                                  if (overviewData.primaryKpi === 'cpa') return d.spend / (d.conversions || 1);
                                  return d[overviewData.primaryKpi] || 0;
                                };

                                return {
                                  date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                                  current: getVal(current),
                                  previous: getVal(previous)
                                };
                              })}>
                                <defs>
                                  <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#141414" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#141414" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F5F4" />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 600, fill: '#8E8E8E' }}
                                  dy={10}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fontSize: 10, fontWeight: 600, fill: '#8E8E8E' }}
                                />
                                <RechartsTooltip 
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="previous" 
                                  stroke="#E5E5E5" 
                                  strokeWidth={2}
                                  fill="transparent"
                                  dot={false}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="current" 
                                  stroke="#141414" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorCurrent)"
                                  dot={{ r: 4, fill: '#141414', strokeWidth: 2, stroke: '#fff' }}
                                  activeDot={{ r: 6, strokeWidth: 0 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Top Performers Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Top Campaigns */}
                          <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-[#141414]">Top Performing Campaigns</h3>
                              <span className="text-[10px] font-bold text-[#8E8E8E]">By {overviewData.primaryKpi.toUpperCase()}</span>
                            </div>
                            <div className="divide-y divide-[#E5E5E5]">
                              {Object.values(overviewData.currentEntities.campaigns)
                                .sort((a: any, b: any) => {
                                  const getVal = (d: any) => overviewData.primaryKpi === 'roas' ? d.revenue / (d.spend || 1) : d[overviewData.primaryKpi];
                                  return getVal(b) - getVal(a);
                                })
                                .slice(0, 5)
                                .map((campaign: any) => {
                                  const prev = overviewData.previousEntities.campaigns[campaign.id];
                                  const getVal = (d: any) => {
                                    if (!d) return 0;
                                    return overviewData.primaryKpi === 'roas' ? d.revenue / (d.spend || 1) : d[overviewData.primaryKpi];
                                  };
                                  const currentVal = getVal(campaign);
                                  const prevVal = getVal(prev);
                                  const diff = currentVal - prevVal;
                                  const percentChange = prevVal !== 0 ? (diff / prevVal) * 100 : 0;

                                  return (
                                    <div key={campaign.id} className="px-6 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors">
                                      <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-sm font-bold truncate">{campaign.name}</p>
                                        <p className="text-[10px] text-[#8E8E8E] uppercase tracking-wider">Spend: ${campaign.spend.toLocaleString()}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-bold">
                                          {overviewData.primaryKpi === 'roas' ? currentVal.toFixed(2) + 'x' : currentVal.toLocaleString()}
                                        </p>
                                        <div className={cn(
                                          "flex items-center justify-end gap-0.5 text-[10px] font-bold",
                                          diff >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                          {diff >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                          {Math.abs(percentChange).toFixed(1)}%
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>

                          {/* Top Ads */}
                          <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-[#141414]">Top Performing Ads</h3>
                              <span className="text-[10px] font-bold text-[#8E8E8E]">By {overviewData.primaryKpi.toUpperCase()}</span>
                            </div>
                            <div className="divide-y divide-[#E5E5E5]">
                              {Object.values(overviewData.currentEntities.ads)
                                .sort((a: any, b: any) => {
                                  const getVal = (d: any) => overviewData.primaryKpi === 'roas' ? d.revenue / (d.spend || 1) : d[overviewData.primaryKpi];
                                  return getVal(b) - getVal(a);
                                })
                                .slice(0, 5)
                                .map((ad: any) => {
                                  const prev = overviewData.previousEntities.ads[ad.id];
                                  const getVal = (d: any) => {
                                    if (!d) return 0;
                                    return overviewData.primaryKpi === 'roas' ? d.revenue / (d.spend || 1) : d[overviewData.primaryKpi];
                                  };
                                  const currentVal = getVal(ad);
                                  const prevVal = getVal(prev);
                                  const diff = currentVal - prevVal;
                                  const percentChange = prevVal !== 0 ? (diff / prevVal) * 100 : 0;

                                  return (
                                    <div key={ad.id} className="px-6 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors">
                                      <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-sm font-bold truncate">{ad.name}</p>
                                        <p className="text-[10px] text-[#8E8E8E] uppercase tracking-wider">Spend: ${ad.spend.toLocaleString()}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-bold">
                                          {overviewData.primaryKpi === 'roas' ? currentVal.toFixed(2) + 'x' : currentVal.toLocaleString()}
                                        </p>
                                        <div className={cn(
                                          "flex items-center justify-end gap-0.5 text-[10px] font-bold",
                                          diff >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                          {diff >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                          {Math.abs(percentChange).toFixed(1)}%
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#E5E5E5] shadow-sm">
                        <Activity className="text-[#E5E5E5] mb-4" size={48} />
                        <p className="text-sm font-medium text-[#8E8E8E]">No performance data available for this period.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'copy' && (
                  <div className="space-y-8">
                    {/* Search and Filter Bar */}
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
                      <div className="flex flex-col md:flex-row gap-4 items-center flex-1">
                        <div className="relative w-full md:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E8E]" size={18} />
                          <input 
                            type="text"
                            placeholder="Search copy..."
                            value={copySearchTerm}
                            onChange={(e) => setCopySearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] whitespace-nowrap">Status:</span>
                          <select 
                            value={copyStatusFilter}
                            onChange={(e) => setCopyStatusFilter(e.target.value as CreativeStatus | 'all')}
                            className="px-3 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm font-medium"
                          >
                            <option value="all">All</option>
                            <option value="draft">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] whitespace-nowrap">Group:</span>
                          <select 
                            value={copyGroupFilter}
                            onChange={(e) => setCopyGroupFilter(e.target.value === 'all' ? 'all' : e.target.value === 'none' ? 'none' : parseInt(e.target.value))}
                            className="px-3 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm font-medium"
                          >
                            <option value="all">All Groups</option>
                            <option value="none">Ungrouped</option>
                            {copyGroups.map(group => (
                              <option key={`group-select-${group.id}`} value={group.id}>{group.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {(copySearchTerm || copyStatusFilter !== 'all' || copyGroupFilter !== 'all') && (
                          <button 
                            onClick={() => {
                              setCopySearchTerm('');
                              setCopyStatusFilter('all');
                              setCopyGroupFilter('all');
                            }}
                            className="text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:text-rose-700 whitespace-nowrap"
                          >
                            Reset
                          </button>
                        )}
                        <button 
                          onClick={() => setIsManagingGroups(true)}
                          className="px-4 py-2 bg-[#F5F5F4] text-[#141414] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#E5E5E5] transition-all"
                        >
                          <Folder size={14} />
                          Manage Groups
                        </button>
                      </div>
                    </div>

                    {['primary_text', 'headline', 'description'].map((type) => {
                      const filteredCopy = creatives.copy.filter(c => {
                        const matchesType = c.type === type;
                        const matchesStatus = copyStatusFilter === 'all' || c.status === copyStatusFilter;
                        const matchesSearch = c.content.toLowerCase().includes(copySearchTerm.toLowerCase());
                        const matchesGroup = copyGroupFilter === 'all' 
                          ? true 
                          : copyGroupFilter === 'none' 
                            ? !c.group_id 
                            : c.group_id === copyGroupFilter;
                        return matchesType && matchesStatus && matchesSearch && matchesGroup;
                      });

                      return (
                        <div key={type} className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                          <div className="px-6 py-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold capitalize">{type.replace('_', ' ')}s</h3>
                              <span className="px-2 py-0.5 bg-[#E5E5E5] rounded-full text-[10px] font-bold text-[#141414]">
                                {filteredCopy.length}
                              </span>
                            </div>
                            <button 
                              onClick={() => setIsAddingCopy(type as CopyType)}
                              className="text-xs font-medium text-[#141414] hover:underline flex items-center gap-1"
                            >
                              <Plus size={12} /> Add New
                            </button>
                          </div>
                          <div className="divide-y divide-[#E5E5E5]">
                            {filteredCopy.length === 0 ? (
                              <div className="p-8 text-center text-[#8E8E8E] text-sm italic">
                                {copySearchTerm || copyStatusFilter !== 'all' 
                                  ? `No ${type.replace('_', ' ')}s match your current filters.` 
                                  : `No ${type.replace('_', ' ')}s added yet.`}
                              </div>
                            ) : (
                              filteredCopy.map((item) => (
                                <div key={`copy-item-${item.id}`} className="p-6 flex items-start justify-between group hover:bg-[#FAFAFA] transition-colors">
                                  <div className="flex-1 pr-8">
                                    <div className="flex items-center gap-2 mb-2">
                                      {item.group_id && (
                                        <span 
                                          className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                                          style={{ backgroundColor: copyGroups.find(g => g.id === item.group_id)?.color || '#141414' }}
                                        >
                                          {copyGroups.find(g => g.id === item.group_id)?.name}
                                        </span>
                                      )}
                                      <select 
                                        value={item.group_id || ''}
                                        onChange={(e) => handleAssignGroup(item.id, e.target.value ? parseInt(e.target.value) : null)}
                                        className="text-[10px] font-medium text-[#8E8E8E] bg-transparent border-none focus:ring-0 cursor-pointer hover:text-[#141414]"
                                      >
                                        <option value="">No Group</option>
                                        {copyGroups.map(group => (
                                          <option key={`inline-group-${group.id}`} value={group.id}>{group.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <p className="text-sm leading-relaxed">{item.content}</p>
                                    <DNATags dnaJson={item.dna_json} />
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <StatusBadge status={item.status} />
                                    <div className="flex border border-[#E5E5E5] rounded-lg overflow-hidden bg-white shadow-sm">
                                      <button 
                                        onClick={() => updateCopyStatus(item.id, 'approved')}
                                        title="Approve"
                                        className={cn("p-1.5 hover:bg-emerald-50 text-emerald-600 transition-colors border-r border-[#E5E5E5]", item.status === 'approved' && "bg-emerald-50")}
                                      >
                                        <CheckCircle2 size={16} />
                                      </button>
                                      <button 
                                        onClick={() => updateCopyStatus(item.id, 'rejected')}
                                        title="Reject"
                                        className={cn("p-1.5 hover:bg-rose-50 text-rose-600 transition-colors border-r border-[#E5E5E5]", item.status === 'rejected' && "bg-rose-50")}
                                      >
                                        <XCircle size={16} />
                                      </button>
                                      <button 
                                        onClick={() => {
                                          setEditingCopy(item);
                                          setEditCopyContent(item.content);
                                          setEditCopyGroupId(item.group_id || null);
                                        }}
                                        title="Edit"
                                        className="p-1.5 hover:bg-[#F5F5F4] text-[#8E8E8E] hover:text-[#141414] transition-colors border-r border-[#E5E5E5]"
                                      >
                                        <Edit3 size={16} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteCopy(item.id)}
                                        title="Delete"
                                        className="p-1.5 hover:bg-rose-50 text-[#8E8E8E] hover:text-rose-600 transition-colors"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'images' && (
                  <div className="space-y-6">
                    {/* Search and Filter Bar for Images */}
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
                      <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E8E]" size={18} />
                        <input 
                          type="text"
                          placeholder="Search images by name or text..."
                          value={imageSearchTerm}
                          onChange={(e) => setImageSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E] whitespace-nowrap">Filter by Status:</span>
                        <select 
                          value={imageStatusFilter}
                          onChange={(e) => setImageStatusFilter(e.target.value as CreativeStatus | 'all')}
                          className="px-3 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm font-medium"
                        >
                          <option value="all">All Statuses</option>
                          <option value="draft">Pending / Draft</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                        {(imageSearchTerm || imageStatusFilter !== 'all') && (
                          <button 
                            onClick={() => {
                              setImageSearchTerm('');
                              setImageStatusFilter('all');
                            }}
                            className="text-[10px] font-bold uppercase tracking-widest text-rose-600 hover:text-rose-700 whitespace-nowrap"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {creatives.images
                        .filter(img => {
                          const matchesStatus = imageStatusFilter === 'all' || img.status === imageStatusFilter;
                          const matchesSearch = img.name.toLowerCase().includes(imageSearchTerm.toLowerCase()) || 
                                              (img.detected_text || '').toLowerCase().includes(imageSearchTerm.toLowerCase());
                          return matchesStatus && matchesSearch;
                        })
                        .map((img) => (
                          <div key={`creative-img-${img.id}`} className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm group">
                            <div className="aspect-square bg-[#F5F5F4] relative overflow-hidden">
                              {img.variants[0] ? (
                                <img 
                                  src={img.variants[0].url} 
                                  alt={img.name} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#8E8E8E]">
                                  <ImageIcon size={48} />
                                </div>
                              )}
                              <div className="absolute top-3 right-3">
                                <StatusBadge status={img.status} />
                              </div>
                            </div>
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-sm truncate">{img.name}</h4>
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => updateImageStatus(img.id, 'approved')}
                                    className={cn("p-1 rounded hover:bg-emerald-50 text-emerald-600", img.status === 'approved' && "bg-emerald-50")}
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                  <button 
                                    onClick={() => updateImageStatus(img.id, 'rejected')}
                                    className={cn("p-1 rounded hover:bg-rose-50 text-rose-600", img.status === 'rejected' && "bg-rose-50")}
                                  >
                                    <XCircle size={14} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      if (img.variants[0]) {
                                        openImageEditor(img.variants[0].url, async (newUrl) => {
                                          try {
                                            const res = await fetch(`/api/creatives/image-variant/${img.variants[0].id}`, {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ url: newUrl })
                                            });
                                            if (res.ok) {
                                              setCreatives(prev => ({
                                                ...prev,
                                                images: prev.images.map(i => 
                                                  i.id === img.id 
                                                    ? { ...i, variants: i.variants.map((v, idx) => idx === 0 ? { ...v, url: newUrl } : v) }
                                                    : i
                                                )
                                              }));
                                            }
                                          } catch (err) {
                                            console.error("Failed to save edited image:", err);
                                          }
                                        });
                                      }
                                    }}
                                    className="p-1 rounded hover:bg-[#F5F5F4] text-[#141414]"
                                    title="Edit Image"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {img.variants.map((v) => (
                                  <span key={`variant-${v.id || `${img.id}-${v.ratio}`}`} className="text-[10px] font-bold bg-[#F5F5F4] px-2 py-0.5 rounded uppercase tracking-wider text-[#8E8E8E]">
                                    {v.ratio}
                                  </span>
                                ))}
                              </div>
                              <DNATags dnaJson={img.dna_json} />
                              {(img.detected_text || img.detected_cta || img.visual_type) && (
                                <div className="space-y-2 pt-3 border-t border-[#F5F5F4]">
                                  {img.creative_id && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-[9px] font-bold bg-[#141414] text-white px-1.5 py-0.5 rounded">
                                        {img.creative_id}
                                      </span>
                                    </div>
                                  )}
                                  {img.visual_type && (
                                    <div className="flex items-start gap-1.5">
                                      <ImageIcon size={10} className="text-[#8E8E8E] mt-0.5 shrink-0" />
                                      <p className="text-[10px] text-[#8E8E8E] leading-tight">
                                        <span className="font-bold text-[#141414]">Type:</span> {img.visual_type}
                                      </p>
                                    </div>
                                  )}
                                  {img.detected_text && (
                                    <div className="flex items-start gap-1.5">
                                      <Type size={10} className="text-[#8E8E8E] mt-0.5 shrink-0" />
                                      <p className="text-[10px] text-[#8E8E8E] line-clamp-2 leading-tight">
                                        <span className="font-bold text-[#141414]">Text:</span> {img.detected_text}
                                      </p>
                                    </div>
                                  )}
                                  {img.detected_cta && (
                                    <div className="flex items-start gap-1.5">
                                      <Tag size={10} className="text-[#8E8E8E] mt-0.5 shrink-0" />
                                      <p className="text-[10px] text-[#8E8E8E] leading-tight">
                                        <span className="font-bold text-[#141414]">CTA:</span> {img.detected_cta}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      {creatives.images.filter(img => {
                        const matchesStatus = imageStatusFilter === 'all' || img.status === imageStatusFilter;
                        const matchesSearch = img.name.toLowerCase().includes(imageSearchTerm.toLowerCase()) || 
                                            (img.detected_text || '').toLowerCase().includes(imageSearchTerm.toLowerCase());
                        return matchesStatus && matchesSearch;
                      }).length === 0 && (
                        <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-[#E5E5E5] border-dashed">
                          <ImageIcon size={48} className="mx-auto text-[#E5E5E5] mb-4" />
                          <p className="text-[#8E8E8E] italic">No images match your current filters.</p>
                        </div>
                      )}
                      <button 
                        onClick={() => setIsAddingImage(true)}
                        className="aspect-square rounded-2xl border-2 border-dashed border-[#E5E5E5] flex flex-col items-center justify-center text-[#8E8E8E] hover:border-[#141414] hover:text-[#141414] transition-all gap-2"
                      >
                        <Plus size={24} />
                        <span className="text-sm font-medium">Add Visual Asset</span>
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'ai-insights' && (
                  <div className="space-y-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight">AI Insights</h2>
                        <p className="text-[#8E8E8E] mt-1">Deep analysis of creative performance and correlations</p>
                      </div>
                      {renderDateSelector()}
                    </div>

                    {renderMetaGuard(
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                          <div className="flex justify-end">
                            <button 
                              onClick={analyzePerformanceWithAI}
                              disabled={isAnalyzingPerformance || performanceData.length === 0}
                              className="px-6 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
                            >
                              {isAnalyzingPerformance ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                              Generate AI Report
                            </button>
                          </div>
                          {aiInsights ? (
                            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                              <div className="prose prose-sm max-w-none">
                                <div className="flex items-center gap-2 text-emerald-600 mb-6">
                                  <Sparkles size={20} />
                                  <span className="text-xs font-bold uppercase tracking-widest">AI Analysis Complete</span>
                                </div>
                                <div className="whitespace-pre-wrap text-[#141414] leading-relaxed">
                                  {aiInsights}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center flex flex-col items-center justify-center">
                              <div className="w-16 h-16 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mb-4">
                                <Sparkles className="text-[#8E8E8E]" size={32} />
                              </div>
                              <h3 className="text-xl font-bold mb-2">No AI Report Generated</h3>
                              <p className="text-[#8E8E8E] max-w-sm mb-6">Click the button above to have AI analyze your Meta Ads data and provide optimization recommendations.</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-6">
                          <div className="bg-[#141414] text-white rounded-3xl p-6 shadow-xl">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">What AI Analyzes</h4>
                            <ul className="space-y-4">
                              {[
                                { label: 'Copy Correlation', desc: 'Which hooks drive the highest CTR' },
                                { label: 'Visual Impact', desc: 'How different visual styles affect CPM' },
                                { label: 'Audience Resonance', desc: 'Which creatives perform best for each segment' },
                                { label: 'Optimization Tips', desc: 'Actionable steps to improve ROAS' }
                              ].map((item, i) => (
                                <li key={`dna-insight-${item.label}`} className="flex gap-3">
                                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-[10px] font-bold">
                                    {i + 1}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold">{item.label}</p>
                                    <p className="text-[10px] text-white/50">{item.desc}</p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-800 mb-4">Top Performing Components</h4>
                            <div className="space-y-4">
                              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                                <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-1">Best Headline</p>
                                <p className="text-xs font-medium">"Stop Wasting Money on Ads"</p>
                              </div>
                              <div className="p-3 bg-white rounded-xl border border-emerald-100">
                                <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-1">Best Visual Style</p>
                                <p className="text-xs font-medium">UGC / Testimonial Video</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'winning-ads' && (
                  <div className="space-y-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight">Winning Ads</h2>
                        <p className="text-[#8E8E8E] mt-1">Top performing creative combinations</p>
                      </div>
                      {renderDateSelector()}
                    </div>

                    {renderMetaGuard(
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Criteria Sidebar */}
                        <div className="space-y-6">
                          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6">
                            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                              <Filter size={16} />
                              Winner Criteria
                            </h3>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Min. Spend ($)</label>
                                <input 
                                  type="number" 
                                  value={winningCriteria.minSpend}
                                  onChange={e => setWinningCriteria({ ...winningCriteria, minSpend: parseInt(e.target.value) })}
                                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Min. Conversions</label>
                                <input 
                                  type="number" 
                                  value={winningCriteria.minConversions}
                                  onChange={e => setWinningCriteria({ ...winningCriteria, minConversions: parseInt(e.target.value) })}
                                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Primary Metric</label>
                                <select 
                                  value={winningCriteria.metric}
                                  onChange={e => setWinningCriteria({ ...winningCriteria, metric: e.target.value })}
                                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm bg-white"
                                >
                                  <option value="roas">ROAS</option>
                                  <option value="ctr">CTR</option>
                                  <option value="cpa">CPA (Cost per Conv.)</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-bold flex items-center gap-2">
                                <Layout size={16} />
                                Display Metrics
                              </h3>
                              <button 
                                onClick={() => setIsCustomizingWinningColumns(!isCustomizingWinningColumns)}
                                className="text-[10px] font-bold uppercase text-[#141414] hover:underline"
                              >
                                {isCustomizingWinningColumns ? 'Close' : 'Edit'}
                              </button>
                            </div>
                            
                            {isCustomizingWinningColumns ? (
                              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                                {AVAILABLE_METRICS.map(m => (
                                  <label key={`winning-col-${m.id}`} className="flex items-center gap-2 cursor-pointer hover:bg-[#F5F5F4] p-1 rounded transition-colors">
                                    <input 
                                      type="checkbox"
                                      checked={winningAdsColumns.includes(m.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setWinningAdsColumns(prev => Array.from(new Set([...prev, m.id])));
                                        } else {
                                          setWinningAdsColumns(prev => prev.filter(k => k !== m.id));
                                        }
                                      }}
                                      className="rounded border-[#E5E5E5] text-[#141414] focus:ring-[#141414]/10"
                                    />
                                    <span className="text-xs font-medium">{m.label}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {winningAdsColumns.map(colKey => {
                                  const m = AVAILABLE_METRICS.find(metric => metric.id === colKey);
                                  return (
                                    <span key={colKey} className="px-2 py-1 bg-[#F5F5F4] rounded-lg text-[10px] font-bold text-[#141414]">
                                      {m?.label || colKey}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="bg-[#141414] text-white rounded-2xl p-6">
                            <p className="text-xs text-white/50 leading-relaxed italic">
                              "Winners are determined by filtering for ads that meet your minimum thresholds and then ranking by your primary metric."
                            </p>
                          </div>
                        </div>

                        {/* Winners Grid */}
                        <div className="lg:col-span-3">
                          {performanceData.filter(p => {
                            const m = JSON.parse(p.metrics_json || '{}');
                            const conversions = getConversions(m);
                            return m.spend >= winningCriteria.minSpend && conversions >= winningCriteria.minConversions;
                          }).length === 0 ? (
                            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-12 text-center">
                              <p className="text-[#8E8E8E] italic">No ads meet the current winner criteria.</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {performanceData
                                .filter(p => {
                                  const m = JSON.parse(p.metrics_json || '{}');
                                  const conversions = getConversions(m);
                                  return m.spend >= winningCriteria.minSpend && conversions >= winningCriteria.minConversions;
                                })
                                .sort((a, b) => {
                                  const ma = JSON.parse(a.metrics_json || '{}');
                                  const mb = JSON.parse(b.metrics_json || '{}');
                                  const convA = getConversions(ma);
                                  const convB = getConversions(mb);
                                  
                                  if (winningCriteria.metric === 'roas') return mb.roas - ma.roas;
                                  if (winningCriteria.metric === 'ctr') return mb.ctr - ma.ctr;
                                  if (winningCriteria.metric === 'cpa') {
                                    const cpaA = convA > 0 ? ma.spend / convA : Infinity;
                                    const cpaB = convB > 0 ? mb.spend / convB : Infinity;
                                    return cpaA - cpaB;
                                  }
                                  return 0;
                                })
                                .map((p, idx) => {
                                  const m = JSON.parse(p.metrics_json || '{}');
                                  const score = calculateScore(m);
                                  const matchingImage = creatives.images.find(img => img.creative_id === p.creative_id);
                                  const dna = creativeDna[p.meta_ad_id];
                                  
                                  return (
                                    <div key={p.id} className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
                                      {/* Preview Section */}
                                      <div className="aspect-video bg-[#F5F5F4] relative group overflow-hidden">
                                        {matchingImage?.variants?.[0]?.url ? (
                                          <img 
                                            src={matchingImage.variants[0].url} 
                                            alt={p.ad_name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex flex-col items-center justify-center text-[#8E8E8E] p-6 text-center">
                                            <ImageIcon size={32} className="mb-2 opacity-20" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest">No Visual Preview</p>
                                            <p className="text-[8px] mt-1 opacity-60">Creative ID: {p.creative_id}</p>
                                          </div>
                                        )}
                                        <div className="absolute top-4 left-4">
                                          <div className="w-8 h-8 rounded-full bg-[#141414] text-white flex items-center justify-center text-xs font-bold shadow-lg">
                                            #{idx + 1}
                                          </div>
                                        </div>
                                        <div className="absolute top-4 right-4">
                                          <div className={cn("px-3 py-1 rounded-full text-white text-[10px] font-black shadow-lg", getScoreColor(score))}>
                                            Score: {score}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="p-6 flex-1 flex flex-col">
                                        <div className="mb-4">
                                          <h4 className="text-sm font-bold truncate mb-1">{p.ad_name}</h4>
                                          <p className="text-[10px] text-[#8E8E8E] font-mono">{p.meta_ad_id}</p>
                                        </div>

                                        {/* Metrics Grid */}
                                        <div className="grid grid-cols-2 gap-4 mb-6 bg-[#FAFAFA] p-4 rounded-2xl border border-[#F0F0F0]">
                                          {winningAdsColumns.map(colKey => {
                                            const metric = AVAILABLE_METRICS.find(m => m.id === colKey);
                                            const val = m[colKey];
                                            let displayVal = val;
                                            if (metric?.type === 'currency') displayVal = `$${val?.toLocaleString()}`;
                                            else if (metric?.type === 'percentage') displayVal = `${(val * 100).toFixed(2)}%`;
                                            else if (typeof val === 'number') displayVal = val.toLocaleString();

                                            return (
                                              <div key={colKey}>
                                                <p className="text-[9px] font-bold text-[#8E8E8E] uppercase tracking-wider mb-0.5">{metric?.label || colKey}</p>
                                                <p className={cn(
                                                  "text-sm font-bold",
                                                  colKey === 'roas' && val > 2 ? "text-emerald-600" : "text-[#141414]"
                                                )}>{displayVal || '0'}</p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        
                                        <div className="mt-auto space-y-4">
                                          {/* DNA Details */}
                                          {dna && (
                                            <div>
                                              <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-2">Creative DNA</p>
                                              <div className="flex flex-wrap gap-1.5">
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-bold uppercase border border-blue-100">{dna.visual_style}</span>
                                                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[9px] font-bold uppercase border border-rose-100">{dna.emotional_trigger}</span>
                                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-bold uppercase border border-emerald-100">{dna.offer_type}</span>
                                              </div>
                                            </div>
                                          )}

                                          {/* Copy Details */}
                                          <div>
                                            <p className="text-[10px] font-bold text-[#8E8E8E] uppercase mb-2">Headline</p>
                                            <p className="text-xs italic text-[#141414] line-clamp-2 bg-[#F5F5F4] p-2 rounded-lg border border-dashed border-[#E5E5E5]">
                                              {dna?.headline_text || "No headline data available"}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'performance' && (
                  <div className="space-y-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight">Ad Performance</h2>
                        <p className="text-[#8E8E8E] mt-1">Real-time insights from Meta Ads API</p>
                      </div>
                      {renderDateSelector()}
                    </div>

                    {renderMetaGuard(
                      <div className="grid grid-cols-1 gap-8">
                        <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                              <thead>
                                <tr className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] sticky left-0 bg-[#FAFAFA] z-10">Score</th>
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] sticky left-0 bg-[#FAFAFA] z-10 ml-20">Ad Name / ID</th>
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">Creative DNA</th>
                                  {activeColumns.map(colKey => {
                                    const metric = AVAILABLE_METRICS.find(m => m.id === colKey);
                                    return (
                                      <th key={colKey} className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">
                                        {metric?.label || colKey}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E5E5E5]">
                                {performanceData.length === 0 ? (
                                  <tr>
                                    <td colSpan={activeColumns.length + 2} className="px-6 py-12 text-center text-[#8E8E8E] italic">
                                      No performance data synced yet for this period. Click "Sync Data" to fetch from Meta.
                                    </td>
                                  </tr>
                                ) : (
                                  performanceData.map((p, idx) => {
                                    const rawMetrics = JSON.parse(p.metrics_json || '{}');
                                    const metrics = getMappedMetrics(rawMetrics, kpiSettings);
                                    const score = calculateScore(metrics);
                                    const pCompare = performanceDataCompare.find(pc => pc.meta_ad_id === p.meta_ad_id);
                                    const rawMetricsCompare = pCompare ? JSON.parse(pCompare.metrics_json || '{}') : null;
                                    const metricsCompare = rawMetricsCompare ? getMappedMetrics(rawMetricsCompare, kpiSettings) : null;

                                    return (
                                      <tr key={`perf-data-${p.id}`} className="hover:bg-[#FAFAFA] transition-colors">
                                        <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                            <div className="w-12 h-2 bg-[#F5F5F4] rounded-full overflow-hidden">
                                              <div 
                                                className={cn("h-full transition-all duration-500", getScoreColor(score))}
                                                style={{ width: `${score}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-bold">{score}</span>
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 sticky left-0 bg-white z-10">
                                          <div className="flex flex-col">
                                            <span className="text-xs font-bold truncate max-w-[200px]" title={p.ad_name || p.creative_id}>
                                              {p.ad_name || p.creative_id}
                                            </span>
                                            {p.creative_id && (
                                              <span className="text-[10px] text-[#8E8E8E] font-mono">
                                                {p.creative_id}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-6 py-4">
                                          <div className="flex flex-wrap gap-1 items-center">
                                            {creativeDna[p.meta_ad_id] ? (
                                              <>
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-bold uppercase">{creativeDna[p.meta_ad_id].visual_style}</span>
                                                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[9px] font-bold uppercase">{creativeDna[p.meta_ad_id].emotional_trigger}</span>
                                                <button 
                                                  onClick={() => analyzeCreativeDNA(p.meta_ad_id)}
                                                  disabled={isAnalyzingDNA === p.meta_ad_id}
                                                  className="p-1 hover:bg-[#F5F5F4] rounded text-[#8E8E8E] hover:text-[#141414]"
                                                  title="Re-analyze DNA"
                                                >
                                                  {isAnalyzingDNA === p.meta_ad_id ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
                                                </button>
                                              </>
                                            ) : (
                                              <button 
                                                onClick={() => analyzeCreativeDNA(p.meta_ad_id)}
                                                disabled={isAnalyzingDNA === p.meta_ad_id}
                                                className="px-2 py-1 bg-[#141414] text-white rounded text-[9px] font-bold uppercase tracking-wider hover:bg-opacity-90 flex items-center gap-1"
                                              >
                                                {isAnalyzingDNA === p.meta_ad_id ? <Loader2 className="animate-spin" size={10} /> : <Tag size={10} />}
                                                Analyze DNA
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {activeColumns.map(colKey => {
                                          const metric = AVAILABLE_METRICS.find(m => m.id === colKey);
                                          const val = metrics[colKey] || 0;
                                          const valCompare = metricsCompare ? (metricsCompare[colKey] || 0) : null;
                                          let diff = 0;
                                          if (valCompare !== null && valCompare !== 0) {
                                            diff = ((val - valCompare) / valCompare) * 100;
                                          }
                                          return (
                                            <td key={colKey} className="px-6 py-4">
                                              <div className="flex flex-col">
                                                <span className="text-sm font-medium">
                                                  {metric?.type === 'currency' ? `$${val.toLocaleString()}` : 
                                                   metric?.type === 'percentage' ? `${val.toFixed(2)}%` : 
                                                   val.toLocaleString()}
                                                </span>
                                                {isComparing && valCompare !== null && (
                                                  <div className={cn(
                                                    "flex items-center gap-0.5 text-[10px] font-bold",
                                                    diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-[#8E8E8E]"
                                                  )}>
                                                    {diff > 0 ? <ArrowUpRight size={10} /> : diff < 0 ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                                                    {Math.abs(diff).toFixed(1)}%
                                                  </div>
                                                )}
                                              </div>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="bg-[#141414] text-white rounded-2xl p-6 shadow-xl">
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                <Sparkles className="text-emerald-400" size={20} />
                              </div>
                              <div>
                                <h3 className="font-bold">AI Optimization</h3>
                                <p className="text-white/50 text-xs">Performance-based insights</p>
                              </div>
                            </div>

                            <button 
                              onClick={analyzePerformanceWithAI}
                              disabled={isAnalyzingPerformance || performanceData.length === 0}
                              className="w-full py-3 bg-white text-[#141414] rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {isAnalyzingPerformance ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                              Generate Insights
                            </button>

                            {aiInsights && (
                              <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10 max-h-[400px] overflow-y-auto custom-scrollbar">
                                <div className="prose prose-invert prose-sm">
                                  <div className="text-xs leading-relaxed text-white/80 whitespace-pre-wrap">
                                    {aiInsights}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'ai-ad-builder' && (
                  <div className="space-y-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div>
                        <h2 className="text-3xl font-bold tracking-tight">AI Ad Builder</h2>
                        <p className="text-[#8E8E8E] mt-1">Generate data-driven visual assets for your campaigns</p>
                      </div>
                      <div className="flex bg-[#F5F5F4] p-1 rounded-xl">
                        <button 
                          onClick={() => setBuilderMode('insights')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                            builderMode === 'insights' ? "bg-white text-[#141414] shadow-sm" : "text-[#8E8E8E] hover:text-[#141414]"
                          )}
                        >
                          Insight-Driven
                        </button>
                        <button 
                          onClick={() => setBuilderMode('advanced')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                            builderMode === 'advanced' ? "bg-white text-[#141414] shadow-sm" : "text-[#8E8E8E] hover:text-[#141414]"
                          )}
                        >
                          Advanced Mode
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-2 space-y-8">
                        {builderMode === 'insights' ? (
                          <div className="space-y-6">
                            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
                              <h3 className="text-lg font-bold mb-6">Performance-Based Recommendations</h3>
                              {aiPerformanceReport ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {aiPerformanceReport.expansion_strategies?.map((strategy: any, idx: number) => (
                                    <div key={`builder-strategy-${strategy.id || idx}`} className="p-6 bg-[#FAFAFA] rounded-2xl border border-[#F0F0F0] hover:border-[#141414] transition-all group cursor-pointer" onClick={() => {
                                      setBuilderPrompt(strategy.description);
                                      setBuilderMode('advanced');
                                    }}>
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider">High Potential</span>
                                        <ChevronRight size={16} className="text-[#8E8E8E] group-hover:translate-x-1 transition-transform" />
                                      </div>
                                      <h4 className="font-bold text-sm mb-2">{strategy.title}</h4>
                                      <p className="text-xs text-[#8E8E8E] leading-relaxed line-clamp-3">{strategy.description}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-12 text-center">
                                  <div className="w-16 h-16 bg-[#F5F5F4] rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <BarChart3 className="text-[#8E8E8E]" size={32} />
                                  </div>
                                  <p className="text-[#8E8E8E] text-sm italic">Generate an AI Performance Report first to see data-driven creative ideas.</p>
                                  <button 
                                    onClick={() => setActiveTab('ai-performance-report')}
                                    className="mt-4 text-xs font-bold text-[#141414] underline underline-offset-4"
                                  >
                                    Go to AI Report
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="bg-[#141414] text-white rounded-3xl p-8 shadow-xl">
                              <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                  <Sparkles size={20} />
                                </div>
                                <div>
                                  <h3 className="font-bold">Creative Optimization Engine</h3>
                                  <p className="text-xs text-white/50">AI-suggested changes based on current winning DNA</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                  { label: 'Visual Style', change: 'Switch to high-contrast UGC style', impact: '+15% CTR' },
                                  { label: 'Color Palette', change: 'Use warm earth tones (winning in segment A)', impact: '+8% ROAS' },
                                  { label: 'Composition', change: 'Center subject with 20% text overlay', impact: '+12% Conv.' },
                                  { label: 'Motion', change: 'Add subtle parallax to static assets', impact: '+22% Thumb-stop' }
                                ].map((opt) => (
                                  <div key={`builder-opt-${opt.label}`} className="p-4 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{opt.label}</span>
                                      <span className="text-[10px] font-bold text-emerald-400">{opt.impact}</span>
                                    </div>
                                    <p className="text-xs font-medium">{opt.change}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <label className="block text-sm font-bold mb-4">Landing Page / Product URL</label>
                                <div className="relative">
                                  <input 
                                    type="url"
                                    value={builderUrl}
                                    onChange={(e) => setBuilderUrl(e.target.value)}
                                    className="w-full px-4 py-3 bg-[#F5F5F4] rounded-xl border border-transparent focus:border-[#141414] focus:ring-0 transition-all text-sm"
                                    placeholder="https://example.com/product"
                                  />
                                  <ExternalLink size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8E8E]" />
                                </div>
                                <p className="text-[10px] text-[#8E8E8E] mt-2 italic">We'll analyze this link to extract brand style and product details.</p>
                              </div>

                              <div>
                                <label className="block text-sm font-bold mb-4">Marketing Objective</label>
                                <div className="flex flex-wrap gap-2">
                                  {(['Sales', 'Leads', 'Educate', 'Awareness'] as const).map((obj) => (
                                    <button
                                      key={`builder-obj-${obj}`}
                                      onClick={() => setBuilderObjective(obj)}
                                      className={cn(
                                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                                        builderObjective === obj 
                                          ? "bg-[#141414] text-white border-[#141414]" 
                                          : "bg-white text-[#8E8E8E] border-[#E5E5E5] hover:border-[#141414] hover:text-[#141414]"
                                      )}
                                    >
                                      {obj}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-bold mb-4">What should the AI create?</label>
                              <textarea 
                                value={builderPrompt}
                                onChange={(e) => setBuilderPrompt(e.target.value)}
                                className="w-full h-40 p-6 bg-[#F5F5F4] rounded-2xl border border-transparent focus:border-[#141414] focus:ring-0 transition-all text-sm leading-relaxed"
                                placeholder="Describe your ad creative in detail... e.g. A high-end lifestyle shot of a professional woman using our software in a bright, modern office, soft natural lighting, cinematic feel."
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] mb-3">Asset Type</label>
                                <div className="space-y-2">
                                  {(['static', 'video', 'gif'] as const).map((type) => (
                                    <button 
                                      key={`builder-type-${type}`}
                                      onClick={() => setBuilderAssetType(type)}
                                      className={cn(
                                        "w-full px-4 py-3 rounded-xl border text-sm font-medium transition-all flex items-center justify-between",
                                        builderAssetType === type 
                                          ? "bg-[#141414] text-white border-[#141414] shadow-lg shadow-black/10" 
                                          : "bg-white text-[#141414] border-[#E5E5E5] hover:border-[#141414]"
                                      )}
                                    >
                                      <span className="capitalize">{type}</span>
                                      {builderAssetType === type && <Check size={14} />}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] mb-3">Generation Preview</label>
                                <div className="aspect-video bg-[#F5F5F4] rounded-2xl border border-dashed border-[#E5E5E5] flex flex-col items-center justify-center relative overflow-hidden">
                                  {isGeneratingAsset ? (
                                    <div className="flex flex-col items-center gap-4 p-8 text-center">
                                      <div className="relative">
                                        <Loader2 className="animate-spin text-[#141414]" size={48} />
                                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#141414]/20" size={24} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold">Generating your {builderAssetType}...</p>
                                        <p className="text-xs text-[#8E8E8E] mt-1">This usually takes 30-60 seconds depending on complexity.</p>
                                      </div>
                                    </div>
                                  ) : generatedAsset ? (
                                    <div className="w-full h-full group">
                                      {generatedAsset.type === 'video' ? (
                                        <video 
                                          src={generatedAsset.url} 
                                          className="w-full h-full object-cover" 
                                          controls 
                                          autoPlay 
                                          loop 
                                        />
                                      ) : (
                                        <img 
                                          src={generatedAsset.url} 
                                          alt="Generated" 
                                          className="w-full h-full object-cover" 
                                          referrerPolicy="no-referrer"
                                        />
                                      )}
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                        <button 
                                          onClick={saveGeneratedAssetToVisuals}
                                          className="px-6 py-2 bg-white text-[#141414] rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#F5F5F4] transition-all"
                                        >
                                          <Plus size={18} />
                                          Add to Visuals
                                        </button>
                                        {generatedAsset.type === 'static' && (
                                          <button 
                                            onClick={() => {
                                              openImageEditor(generatedAsset.url, (newUrl) => {
                                                setGeneratedAsset({ ...generatedAsset, url: newUrl });
                                              });
                                            }}
                                            className="px-6 py-2 bg-white text-[#141414] rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#F5F5F4] transition-all"
                                          >
                                            <Edit3 size={18} />
                                            Edit
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => setGeneratedAsset(null)}
                                          className="px-6 py-2 bg-white/10 text-white backdrop-blur-md rounded-xl text-sm font-bold border border-white/20 hover:bg-white/20 transition-all"
                                        >
                                          Discard
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-2 text-[#8E8E8E]">
                                      <ImageIcon size={48} strokeWidth={1} />
                                      <p className="text-xs italic">Your generated asset will appear here</p>
                                    </div>
                                  )}
                                </div>
                                {generationError && (
                                  <p className="mt-4 text-xs font-bold text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100">
                                    Error: {generationError}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="pt-8 border-t border-[#F5F5F4] flex justify-end">
                              <button 
                                onClick={() => generateAIAdAsset()}
                                disabled={isGeneratingAsset || !builderPrompt.trim()}
                                className="px-12 py-4 bg-[#141414] text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-opacity-90 transition-all disabled:opacity-50 shadow-xl shadow-black/10"
                              >
                                {isGeneratingAsset ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                                {isGeneratingAsset ? 'Processing...' : `Generate AI ${builderAssetType.toUpperCase()}`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        <div className="bg-[#F5F5F4] rounded-3xl p-6 border border-[#E5E5E5]">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] mb-4">Builder Tips</h4>
                          <div className="space-y-4">
                            {[
                              { title: 'Be Specific', desc: 'Mention lighting, camera angle, and specific brand colors for better results.' },
                              { title: 'Data-First', desc: 'Use the Insight-Driven mode to port in winning hooks directly into the generator.' },
                              { title: 'Aspect Ratios', desc: 'Currently generating in 1:1 for feed. 9:16 support coming soon.' }
                            ].map((tip, i) => (
                              <div key={`builder-tip-${tip.title}`} className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                                  {i + 1}
                                </div>
                                <div>
                                  <p className="text-xs font-bold">{tip.title}</p>
                                  <p className="text-[10px] text-[#8E8E8E] leading-relaxed">{tip.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {!hasApiKey && (
                          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
                            <div className="flex items-center gap-2 text-amber-800 mb-2">
                              <Settings size={16} />
                              <span className="text-xs font-bold uppercase tracking-widest">Setup Required</span>
                            </div>
                            <p className="text-xs text-amber-900/70 leading-relaxed mb-4">
                              To use Imagen 3.1 and Veo video generation, you must connect your Google Cloud Project with billing enabled.
                            </p>
                            <button 
                              onClick={openApiKeyDialog}
                              className="w-full py-3 bg-amber-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-700 transition-all"
                            >
                              Connect Project
                            </button>
                            <a 
                              href="https://ai.google.dev/gemini-api/docs/billing" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="block text-center mt-3 text-[10px] text-amber-600 underline"
                            >
                              Learn about billing
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
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
                  { id: 'intelligence', label: 'Intelligence', icon: Sparkles },
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

            {/* Data Pipeline Section */}
            <div>
              <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-4 px-2">Data Pipeline</p>
              <div className="space-y-1">
                {[
                  { id: 'conversion-mapping', label: 'Event Mapping', icon: GitMerge },
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
            {clients.map((client, idx) => (
              <div key={`client-${client.id}`} className="flex items-center group">
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
            {/* Reconnect Meta Button */}
            <button
              onClick={handleMetaConnect}
              className="w-full py-2 bg-[#1877F2] text-white rounded-xl text-xs font-bold hover:bg-opacity-90 transition-all"
            >
              Reconnect Meta Ads
            </button>
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
                      key={`quick-date-2-${days}`}
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
                      onChange={e => handleDateChange('start', e.target.value)}
                      className="w-full p-2.5 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-[#8E8E8E] uppercase ml-1">End Date</label>
                    <input 
                      type="date" 
                      value={dateRange.end}
                      onChange={e => handleDateChange('end', e.target.value)}
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
                value={(selectedClient?.ad_account_id || '').replace('act_', '')}
                onChange={(e) => handleSaveMetaSettings(e.target.value)}
                className="w-full p-3 bg-[#F5F5F4] rounded-xl text-xs font-bold border-none focus:ring-2 focus:ring-[#141414]/5 appearance-none cursor-pointer"
              >
                <option value="">Select Ad Account</option>
                {availableAdAccounts.map((acc, idx) => (
                  <option key={`ad-account-2-${acc.account_id || idx}`} value={acc.account_id}>{acc.name} ({acc.account_id})</option>
                ))}
              </select>
            </section>

            {/* Campaigns */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Campaigns</h3>
                  {metaCampaigns.length > 0 && (
                    <button 
                      onClick={() => {
                        if (selectedCampaignIds.length === metaCampaigns.length) {
                          setSelectedCampaignIds([]);
                        } else {
                          setSelectedCampaignIds(metaCampaigns.map(c => c.id));
                        }
                      }}
                      className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 underline"
                    >
                      {selectedCampaignIds.length === metaCampaigns.length ? 'Unselect All' : 'Select All'}
                    </button>
                  )}
                </div>
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
                  metaCampaigns.map((c, idx) => (
                    <label key={`campaign-label-${c.id}`} className="flex items-center gap-2 p-2 hover:bg-white rounded-xl cursor-pointer transition-all group">
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
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E8E8E]">Ad Sets</h3>
                  {metaAdSets.length > 0 && (
                    <button 
                      onClick={() => {
                        if (selectedAdSetIds.length === metaAdSets.length) {
                          setSelectedAdSetIds([]);
                        } else {
                          setSelectedAdSetIds(metaAdSets.map(as => as.id));
                        }
                      }}
                      className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 underline"
                    >
                      {selectedAdSetIds.length === metaAdSets.length ? 'Unselect All' : 'Select All'}
                    </button>
                  )}
                </div>
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
                  metaAdSets.map((as, idx) => (
                    <label key={`adset-label-${as.id}`} className="flex items-center gap-2 p-2 hover:bg-white rounded-xl cursor-pointer transition-all group">
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

      {/* Add Client Modal */}
      <AnimatePresence>
        {isAddingClient && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E5E5]">
                <h3 className="text-xl font-bold">Add New Client</h3>
              </div>
              <form onSubmit={handleAddClient} className="p-6 space-y-4">
                {addClientError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
                    {addClientError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Client Name</label>
                  <input 
                    required
                    type="text" 
                    value={newClient.name}
                    onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Industry</label>
                  <input 
                    type="text" 
                    value={newClient.industry}
                    onChange={e => setNewClient({ ...newClient, industry: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                    placeholder="e.g. E-commerce"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meta Ad Account ID</label>
                  <input 
                    type="text" 
                    value={newClient.ad_account_id}
                    onChange={e => setNewClient({ ...newClient, ad_account_id: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                    placeholder="e.g. 1234567890"
                  />
                  <p className="text-[10px] text-[#8E8E8E] mt-1">Optional. Overrides global ad account ID for this client.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Landing Page URL</label>
                  <input 
                    type="text" 
                    value={newClient.landing_page_url}
                    onChange={e => setNewClient({ ...newClient, landing_page_url: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                    placeholder="e.g. https://..."
                  />
                  <p className="text-[10px] text-[#8E8E8E] mt-1">Optional. Used for AI analysis to align ad copy.</p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddingClient(false)}
                    className="flex-1 py-2 border border-[#E5E5E5] rounded-lg text-sm font-medium hover:bg-[#FAFAFA]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
                  >
                    Create Client
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Copy Modal */}
      <AnimatePresence>
        {isAddingCopy && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                <h3 className="text-xl font-bold capitalize">Add {isAddingCopy.replace('_', ' ')}</h3>
                <button onClick={() => { setIsAddingCopy(null); setCopyInputMethod(null); setIsInputtingAiDirection(false); setAiGenerationDirection(''); setAiGeneratedVariations([]); }} className="text-[#8E8E8E] hover:text-[#141414]">
                  <X size={20} />
                </button>
              </div>

              {!copyInputMethod ? (
                <div className="p-8 space-y-6">
                  <div className="text-center mb-8">
                    <p className="text-[#8E8E8E]">How would you like to add this new copy?</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => {
                        setCopyInputMethod('ai');
                        setIsInputtingAiDirection(true);
                      }}
                      className="p-6 border border-[#E5E5E5] rounded-2xl hover:border-[#141414] hover:bg-[#FAFAFA] transition-all text-left group"
                    >
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                          <Sparkles size={20} />
                        </div>
                        <h4 className="font-bold">Generate with AI</h4>
                      </div>
                      <p className="text-xs text-[#8E8E8E]">Uses client intelligence and winning ad patterns to craft high-performing copy.</p>
                    </button>

                    <button 
                      onClick={() => setCopyInputMethod('manual')}
                      className="p-6 border border-[#E5E5E5] rounded-2xl hover:border-[#141414] hover:bg-[#FAFAFA] transition-all text-left group"
                    >
                      <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-[#F5F5F4] flex items-center justify-center text-[#141414] group-hover:bg-[#E5E5E5] transition-colors">
                          <Type size={20} />
                        </div>
                        <h4 className="font-bold">Input Manually</h4>
                      </div>
                      <p className="text-xs text-[#8E8E8E]">Type your own copy variations directly into the system.</p>
                    </button>
                  </div>
                </div>
              ) : copyInputMethod === 'ai' && isInputtingAiDirection ? (
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold uppercase tracking-widest text-[#8E8E8E]">AI Direction (Optional)</label>
                    <textarea 
                      value={aiGenerationDirection}
                      onChange={e => setAiGenerationDirection(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10 resize-none h-32" 
                      placeholder="e.g. Focus on our 20% off summer sale, or emphasize the eco-friendly materials..."
                    />
                    <p className="text-[10px] text-[#8E8E8E]">Leave blank to let the AI decide based on your brand guidelines and winning patterns.</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        setCopyInputMethod(null);
                        setIsInputtingAiDirection(false);
                      }}
                      className="flex-1 py-3 border border-[#E5E5E5] rounded-xl text-sm font-bold hover:bg-[#FAFAFA]"
                    >
                      Back
                    </button>
                    <button 
                      onClick={() => {
                        setIsInputtingAiDirection(false);
                        generateSingleCopyTypeVariations(isAddingCopy, aiGenerationDirection);
                      }}
                      className="flex-1 py-3 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90 flex items-center justify-center gap-2"
                    >
                      <Sparkles size={16} />
                      Generate Variations
                    </button>
                  </div>
                </div>
              ) : copyInputMethod === 'manual' ? (
                <form onSubmit={handleAddCopy} className="p-6 space-y-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Content</label>
                      <textarea 
                        required
                        rows={4}
                        value={newCopy}
                        onChange={e => setNewCopy(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10 resize-none" 
                        placeholder={`Enter your ${isAddingCopy.replace('_', ' ')} here...`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Assign to Group (Optional)</label>
                      <select 
                        value={selectedGroupIdForNewCopy || ''}
                        onChange={(e) => setSelectedGroupIdForNewCopy(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm"
                      >
                        <option value="">No Group</option>
                        {copyGroups.map(group => (
                          <option key={`group-select-2-${group.id}`} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setCopyInputMethod(null)}
                      className="flex-1 py-2 border border-[#E5E5E5] rounded-lg text-sm font-medium hover:bg-[#FAFAFA]"
                    >
                      Back
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
                    >
                      Save Copy
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-6 space-y-6">
                  {isGenerating ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                      <Loader2 className="animate-spin text-[#141414]" size={32} />
                      <div>
                        <p className="font-bold">AI is Crafting Variations</p>
                        <p className="text-xs text-[#8E8E8E]">Analyzing winning patterns and client context...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E]">AI Generated Variations</p>
                        <button 
                          onClick={() => generateSingleCopyTypeVariations(isAddingCopy, aiGenerationDirection)}
                          className="text-[10px] font-bold uppercase tracking-widest text-[#141414] hover:underline flex items-center gap-1"
                        >
                          <RotateCcw size={10} /> Regenerate
                        </button>
                      </div>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {aiGeneratedVariations.map((v) => (
                          <div key={`ai-var-${v.id || v.content.substring(0, 20)}`} className="p-4 bg-[#FAFAFA] rounded-xl border border-[#E5E5E5] group relative hover:border-[#141414] transition-all">
                            <p className="text-sm leading-relaxed mb-3">{v.content}</p>
                            <div className="flex flex-wrap gap-1 mb-3">
                              {v.dna && Object.entries(v.dna).map(([key, value]) => (
                                <span key={`ai-var-dna-${key}`} className="px-2 py-0.5 bg-white border border-[#E5E5E5] rounded-full text-[8px] font-bold uppercase text-[#8E8E8E]">
                                  {String(value)}
                                </span>
                              ))}
                            </div>
                            <div className="mb-3">
                              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] mb-1">Group</label>
                              <select 
                                value={selectedGroupIdForNewCopy || ''}
                                onChange={(e) => setSelectedGroupIdForNewCopy(e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full px-3 py-1.5 bg-white border border-[#E2E2E2] rounded-lg text-[10px] font-bold"
                              >
                                <option value="">No Group</option>
                                {copyGroups.map(group => (
                                  <option key={`inline-group-2-${group.id}`} value={group.id}>{group.name}</option>
                                ))}
                              </select>
                            </div>
                            <button 
                              onClick={async () => {
                                if (!selectedClient) return;
                                await fetch('/api/creatives/copy', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ 
                                    client_id: selectedClient.id, 
                                    type: isAddingCopy, 
                                    content: v.content,
                                    dna_json: JSON.stringify(v.dna || {}),
                                    group_id: selectedGroupIdForNewCopy
                                  }),
                                });
                                fetchCreatives(selectedClient.id);
                                setIsAddingCopy(null);
                                setCopyInputMethod(null);
                                setAiGeneratedVariations([]);
                                setSelectedGroupIdForNewCopy(null);
                              }}
                              className="w-full py-2 bg-[#141414] text-white rounded-lg text-xs font-bold hover:bg-opacity-90 transition-all"
                            >
                              Approve & Save
                            </button>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => setCopyInputMethod(null)}
                        className="w-full py-2 border border-[#E5E5E5] rounded-lg text-xs font-bold hover:bg-[#FAFAFA]"
                      >
                        Back to Options
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <ImageEditor 
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            initialImageUrl={editingImageUrl}
            onSave={onEditorSaveCallback.fn}
            ai={new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })}
          />
        )}
      </AnimatePresence>

      {/* Edit Copy Modal */}
      <AnimatePresence>
        {editingCopy && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                <h3 className="text-xl font-bold">Edit {editingCopy.type.replace('_', ' ')}</h3>
                <button onClick={() => setEditingCopy(null)} className="text-[#8E8E8E] hover:text-[#141414]">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateCopy} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Content</label>
                  <textarea 
                    required
                    rows={6}
                    value={editCopyContent}
                    onChange={e => setEditCopyContent(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10 resize-none text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Assign to Group</label>
                  <select 
                    value={editCopyGroupId || ''}
                    onChange={(e) => setEditCopyGroupId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-2 bg-[#F5F5F4] border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#141414]/10 transition-all text-sm"
                  >
                    <option value="">No Group (Unassigned)</option>
                    {copyGroups.map(group => (
                      <option key={`group-select-3-${group.id}`} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingCopy(null)}
                    className="flex-1 py-2 border border-[#E5E5E5] rounded-xl text-sm font-bold hover:bg-[#FAFAFA]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90"
                  >
                    Update Copy
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Image Modal */}
      <AnimatePresence>
        {isAddingImage && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-[#E5E5E5]">
                <h3 className="text-xl font-bold">Add Visual Asset</h3>
              </div>
              <form onSubmit={handleAddImage} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Asset Name</label>
                      <input 
                        required
                        type="text" 
                        value={newImage.name}
                        onChange={e => setNewImage({ ...newImage, name: e.target.value })}
                        className="w-full px-4 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#141414]/10" 
                        placeholder="e.g. Summer Lifestyle 01"
                      />
                    </div>

                    <div className="p-6 border-2 border-dashed border-[#E5E5E5] rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-[#141414] transition-colors relative group">
                      {isAnalyzing ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="animate-spin text-[#141414]" size={24} />
                          <p className="text-xs font-medium">Analyzing Graphic...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="text-[#8E8E8E] group-hover:text-[#141414]" size={24} />
                          <div className="text-center">
                            <p className="text-xs font-medium">Click to upload multiple sizes or drag and drop</p>
                            <p className="text-[10px] text-[#8E8E8E]">PNG, JPG up to 10MB each</p>
                          </div>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E]">Detected Metadata</p>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold mb-1">Creative ID</label>
                            <input 
                              type="text" 
                              value={newImage.creative_id}
                              onChange={e => setNewImage({ ...newImage, creative_id: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-xs font-bold bg-[#F5F5F4]" 
                              placeholder="C-XXXX"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold mb-1">Visual Type</label>
                            <input 
                              type="text" 
                              value={newImage.visual_type}
                              onChange={e => setNewImage({ ...newImage, visual_type: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-xs" 
                              placeholder="e.g. Lifestyle"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold mb-1">In-Graphic Text</label>
                          <textarea 
                            value={newImage.detected_text}
                            onChange={e => setNewImage({ ...newImage, detected_text: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-xs h-20 resize-none" 
                            placeholder="Auto-detected text will appear here..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold mb-1">CTA Button Text</label>
                          <input 
                            type="text" 
                            value={newImage.detected_cta}
                            onChange={e => setNewImage({ ...newImage, detected_cta: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-xs" 
                            placeholder="Auto-detected CTA will appear here..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#8E8E8E]">Sizing Ratios (URLs or Uploaded)</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold mb-1">1:1 (Square)</label>
                        <input 
                          type="text" 
                          value={newImage.url11}
                          onChange={e => setNewImage({ ...newImage, url11: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-sm" 
                          placeholder="https://... or uploaded data"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold mb-1">9:16 (Story/Reel)</label>
                        <input 
                          type="text" 
                          value={newImage.url916}
                          onChange={e => setNewImage({ ...newImage, url916: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-sm" 
                          placeholder="https://... or uploaded data"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold mb-1">4:5 (Feed)</label>
                        <input 
                          type="text" 
                          value={newImage.url45}
                          onChange={e => setNewImage({ ...newImage, url45: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-[#E5E5E5] text-sm" 
                          placeholder="https://... or uploaded data"
                        />
                      </div>
                    </div>
                    
                    {/* Preview of uploaded image */}
                    {(newImage.url11 || newImage.url916 || newImage.url45) && (
                      <div className="pt-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Preview</p>
                        <div className="aspect-video bg-[#F5F5F4] rounded-xl overflow-hidden border border-[#E5E5E5]">
                          <img 
                            src={newImage.url11 || newImage.url916 || newImage.url45} 
                            className="w-full h-full object-contain"
                            alt="Preview"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 sticky bottom-0 bg-white pb-2">
                  <button 
                    type="button"
                    onClick={() => setIsAddingImage(false)}
                    className="flex-1 py-2 border border-[#E5E5E5] rounded-lg text-sm font-medium hover:bg-[#FAFAFA]"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
                  >
                    Save Asset
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Column Customization Modal */}
        {isCustomizingColumns && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Customize Table Columns</h3>
                  <p className="text-xs text-[#8E8E8E]">Select metrics to display in your performance table</p>
                </div>
                <button onClick={() => setIsCustomizingColumns(false)} className="p-2 hover:bg-[#F5F5F4] rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Presets */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-4">Saved Presets</h4>
                  <div className="flex flex-wrap gap-2">
                    {columnPresets.map(preset => (
                      <button 
                        key={`preset-${preset.id}`}
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          setActiveColumns(JSON.parse(preset.columns_json));
                        }}
                        className={cn(
                          "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                          selectedPreset === preset.id ? "bg-[#141414] text-white border-[#141414]" : "bg-white border-[#E5E5E5] hover:bg-[#FAFAFA]"
                        )}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Metrics Selection */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-4">Available Metrics</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {AVAILABLE_METRICS.map(metric => (
                      <label 
                        key={`metric-col-${metric.id}`}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          activeColumns.includes(metric.id) ? "bg-emerald-50 border-emerald-200" : "bg-white border-[#E5E5E5] hover:bg-[#FAFAFA]"
                        )}
                      >
                        <input 
                          type="checkbox"
                          checked={activeColumns.includes(metric.id)}
                          onChange={() => {
                            if (activeColumns.includes(metric.id)) {
                              setActiveColumns(prev => prev.filter(c => c !== metric.id));
                            } else {
                              setActiveColumns(prev => Array.from(new Set([...prev, metric.id])));
                            }
                          }}
                          className="hidden"
                        />
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center",
                          activeColumns.includes(metric.id) ? "bg-emerald-500 border-emerald-500" : "border-[#E5E5E5]"
                        )}>
                          {activeColumns.includes(metric.id) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs font-medium">{metric.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    placeholder="Preset Name"
                    id="new-preset-name"
                    className="px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/10"
                  />
                  <button 
                    onClick={() => {
                      const nameInput = document.getElementById('new-preset-name') as HTMLInputElement;
                      if (nameInput.value) {
                        handleSavePreset(nameInput.value);
                        nameInput.value = '';
                      }
                    }}
                    className="px-4 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
                  >
                    Save Preset
                  </button>
                </div>
                <button 
                  onClick={() => setIsCustomizingColumns(false)}
                  className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                >
                  Apply Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Client Settings Modal */}
        {isClientSettingsOpen && selectedClient && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{selectedClient.name} Settings</h3>
                  <p className="text-xs text-[#8E8E8E]">Configure campaign goals, brand guidelines, and AI context</p>
                </div>
                <button onClick={() => setIsClientSettingsOpen(false)} className="p-2 hover:bg-[#F5F5F4] rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="flex border-b border-[#E5E5E5]">
                {[
                  { id: 'campaign', label: 'Campaign & Brand', icon: Target },
                  { id: 'ai', label: 'AI Context', icon: Sparkles },
                  { id: 'conversions', label: 'Conversions', icon: BarChart3 },
                ].map(tab => (
                  <button
                    key={`settings-tab-${tab.id}`}
                    onClick={() => setSettingsTab(tab.id as any)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2",
                      settingsTab === tab.id ? "border-[#141414] text-[#141414]" : "border-transparent text-[#8E8E8E] hover:text-[#141414]"
                    )}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {settingsTab === 'campaign' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Client Name</label>
                        <input 
                          type="text" 
                          value={selectedClient.name}
                          onChange={e => handleUpdateClient(selectedClient.id, { name: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Business Type</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateClient(selectedClient.id, { business_type: 'ecommerce' })}
                            className={cn(
                              "flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
                              selectedClient.business_type === 'ecommerce' 
                                ? "bg-[#141414] text-white border-[#141414]" 
                                : "bg-white text-[#141414] border-[#E5E5E5] hover:border-[#141414]"
                            )}
                          >
                            E-commerce
                          </button>
                          <button
                            onClick={() => handleUpdateClient(selectedClient.id, { business_type: 'lead_gen' })}
                            className={cn(
                              "flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
                              selectedClient.business_type === 'lead_gen' 
                                ? "bg-[#141414] text-white border-[#141414]" 
                                : "bg-white text-[#141414] border-[#E5E5E5] hover:border-[#141414]"
                            )}
                          >
                            Lead Gen
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Landing Page URL</label>
                        <input 
                          type="text" 
                          value={selectedClient.landing_page_url || ''}
                          onChange={e => handleUpdateClient(selectedClient.id, { landing_page_url: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                          placeholder="https://your-landing-page.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Campaign ID</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={selectedClient.campaign_id || ''}
                            onChange={e => handleUpdateClient(selectedClient.id, { campaign_id: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                            placeholder="Import or enter ID"
                          />
                          <button 
                            onClick={fetchMetaCampaigns}
                            disabled={isFetchingCampaigns}
                            className="px-3 py-2 bg-[#F5F5F4] text-[#141414] rounded-lg text-xs font-bold hover:bg-[#E5E5E5] disabled:opacity-50"
                          >
                            {isFetchingCampaigns ? <Loader2 className="animate-spin" size={14} /> : <Facebook size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {metaCampaigns.length > 0 && (
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Select Meta Campaign</h5>
                          <button onClick={() => setMetaCampaigns([])} className="text-blue-700 hover:text-blue-900"><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2">
                          {metaCampaigns.map((campaign, idx) => (
                            <button
                              key={`campaign-${campaign.id}`}
                              onClick={() => {
                                handleUpdateClient(selectedClient.id, { campaign_id: campaign.id });
                                setMetaCampaigns([]);
                              }}
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-left transition-colors"
                            >
                              <div>
                                <p className="text-xs font-bold text-blue-900">{campaign.name}</p>
                                <p className="text-[10px] text-blue-600 uppercase tracking-tighter">{campaign.objective} • {campaign.status}</p>
                              </div>
                              <Plus size={14} className="text-blue-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Campaign Goal</label>
                      <textarea 
                        value={selectedClient.campaign_goal || ''}
                        onChange={e => handleUpdateClient(selectedClient.id, { campaign_goal: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm h-24 resize-none"
                        placeholder="Describe the primary objective of this campaign..."
                      />
                    </div>

                    <div className="pt-4 border-t border-[#E5E5E5]">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-4">Brand Guidelines</h4>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Brand Colors</label>
                          <input 
                            type="text" 
                            value={selectedClient.brand_colors || ''}
                            onChange={e => handleUpdateClient(selectedClient.id, { brand_colors: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                            placeholder="e.g. #FF0000, #000000"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Logo URL</label>
                          <input 
                            type="text" 
                            value={selectedClient.logo_url || ''}
                            onChange={e => handleUpdateClient(selectedClient.id, { logo_url: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Font Style</label>
                          <input 
                            type="text" 
                            value={selectedClient.font_style || ''}
                            onChange={e => handleUpdateClient(selectedClient.id, { font_style: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                            placeholder="e.g. Modern Sans-Serif"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Main CTA</label>
                          <input 
                            type="text" 
                            value={selectedClient.main_cta || ''}
                            onChange={e => handleUpdateClient(selectedClient.id, { main_cta: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                            placeholder="e.g. Shop Now, Learn More"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'ai' && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Target Audience</label>
                      <textarea 
                        value={selectedClient.target_audience || ''}
                        onChange={e => handleUpdateClient(selectedClient.id, { target_audience: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm h-24 resize-none"
                        placeholder="Describe your ideal customer (demographics, interests, pain points)..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Tone of Voice</label>
                      <input 
                        type="text" 
                        value={selectedClient.tone_of_voice || ''}
                        onChange={e => handleUpdateClient(selectedClient.id, { tone_of_voice: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                        placeholder="e.g. Professional yet friendly, Bold and energetic"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Unique Selling Propositions (USP)</label>
                      <textarea 
                        value={selectedClient.usp || ''}
                        onChange={e => handleUpdateClient(selectedClient.id, { usp: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm h-24 resize-none"
                        placeholder="What makes your product/service stand out? List 3-5 key benefits..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Existing Ad Copy (for AI Learning)</label>
                      <textarea 
                        className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm h-32 resize-none font-mono"
                        placeholder="Paste existing high-performing copy here. The AI will use this to learn your brand's style and tone..."
                        onBlur={async (e) => {
                          const content = e.target.value;
                          if (!content) return;
                          
                          // Split by double newline to try and identify separate pieces of copy
                          const pieces = content.split('\n\n').filter(p => p.trim());
                          for (const piece of pieces) {
                            await fetch('/api/creatives/copy', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ 
                                client_id: selectedClient.id, 
                                type: 'primary_text', 
                                content: piece.trim() 
                              }),
                            });
                          }
                          fetchCreatives(selectedClient.id);
                          e.target.value = '';
                        }}
                      />
                      <p className="mt-2 text-[10px] text-[#8E8E8E]">Paste copy above and click away to import it into the "Ad Copy" section as approved examples.</p>
                    </div>
                  </div>
                )}

                {settingsTab === 'conversions' && (
                  <div className="space-y-8">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-4">Conversion Event Mapping</h4>
                      <div className="space-y-4">
                        {conversionSettings.map(setting => (
                          <div key={`conv-setting-${setting.id}`} className="p-4 rounded-2xl border border-[#E5E5E5] space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                  <Target size={16} />
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{setting.display_name}</p>
                                  <p className="text-[10px] text-[#8E8E8E] font-mono">{setting.meta_event_key}</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleUpdateConversionSetting(setting.id, { is_active: !setting.is_active })}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                  setting.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-[#F5F5F4] text-[#8E8E8E] border-[#E5E5E5]"
                                )}
                              >
                                {setting.is_active ? "Active" : "Inactive"}
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Display Name</label>
                                <input 
                                  type="text" 
                                  value={setting.display_name}
                                  onChange={e => handleUpdateConversionSetting(setting.id, { display_name: e.target.value })}
                                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-2">Importance (1-10)</label>
                                <input 
                                  type="number" 
                                  min="1" 
                                  max="10"
                                  value={setting.importance}
                                  onChange={e => handleUpdateConversionSetting(setting.id, { importance: parseInt(e.target.value) })}
                                  className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#FAFAFA] border border-dashed border-[#E5E5E5]">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E] mb-4">Add New Conversion Mapping</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="text" id="new-event-key" placeholder="Meta Event Key (e.g. purchase)" className="px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm" />
                        <input type="text" id="new-event-name" placeholder="Display Name" className="px-3 py-2 rounded-lg border border-[#E5E5E5] text-sm" />
                        <button 
                          onClick={() => {
                            const key = (document.getElementById('new-event-key') as HTMLInputElement).value;
                            const name = (document.getElementById('new-event-name') as HTMLInputElement).value;
                            if (key && name) {
                              handleAddConversionSetting(key, name);
                              (document.getElementById('new-event-key') as HTMLInputElement).value = '';
                              (document.getElementById('new-event-name') as HTMLInputElement).value = '';
                            }
                          }}
                          className="px-4 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
                        >
                          Add Mapping
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#E5E5E5] bg-[#FAFAFA] flex justify-end">
                <button 
                  onClick={() => setIsClientSettingsOpen(false)}
                  className="px-6 py-2 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90"
                >
                  Close Settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {renderGroupManager()}
      </AnimatePresence>
      <AIChat 
        selectedClient={selectedClient}
        selectedCampaignIds={selectedCampaignIds}
        dateRange={dateRange}
        performanceData={performanceData}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: CreativeStatus }) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
          <CheckCircle2 size={10} /> Approved
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wider border border-rose-100">
          <XCircle size={10} /> Rejected
        </span>
      );
    case 'draft':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
          <Clock size={10} /> Pending
        </span>
      );
  }
}

function DNATags({ dnaJson }: { dnaJson?: string }) {
  if (!dnaJson) return null;
  try {
    const dna = JSON.parse(dnaJson);
    const tags = Object.entries(dna)
      .filter(([_, value]) => value && value !== 'none' && value !== 'unknown')
      .map(([key, value]) => ({
        label: key.replace(/_/g, ' '),
        value: String(value)
      }));

    if (tags.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 mt-3">
        {tags.map((tag) => (
          <div 
            key={`tag-${tag.label}`} 
            className="group relative flex items-center gap-1 px-2 py-0.5 bg-[#F5F5F4] border border-[#E5E5E5] rounded-md transition-all hover:bg-white hover:border-[#141414]/20"
          >
            <span className="text-[8px] font-bold text-[#8E8E8E] uppercase tracking-tighter">{tag.label}:</span>
            <span className="text-[9px] font-medium text-[#141414]">{tag.value}</span>
          </div>
        ))}
      </div>
    );
  } catch (e) {
    return null;
  }
}

const KPISettingsPanel = ({ 
  settings, 
  onSave,
  isSaving
}: { 
  settings: KPISettings | null, 
  onSave: (settings: KPISettings) => void,
  isSaving: boolean
}) => {
  const [localSettings, setLocalSettings] = useState<KPISettings>(settings || {
    primary_kpi: 'roas',
    secondary_kpi: 'cost_per_conversion',
    guardrail_kpis: ['cpm', 'ctr'],
    conversion_events: ['purchase'],
    attribution_window: '7d_click_1d_view',
    reporting_level: 'ad',
    confidence_threshold: 90,
    min_sample_size: 1000,
    weights: {
      delivery: 15,
      engagement: 20,
      conversion: 40,
      quality: 10,
      creative: 15
    }
  });

  const handleWeightChange = (key: keyof KPISettings['weights'], value: number) => {
    setLocalSettings(prev => ({
      ...prev,
      weights: {
        ...prev.weights,
        [key]: value
      }
    }));
  };

  const totalWeight = Object.values(localSettings.weights).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8 bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Primary & Secondary KPI */}
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Primary KPI</label>
            <select 
              value={localSettings.primary_kpi}
              onChange={(e) => setLocalSettings({...localSettings, primary_kpi: e.target.value})}
              className="w-full bg-[#F5F5F4] border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-[#141414]"
            >
              {AVAILABLE_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[10px] text-[#8E8E8E] mt-1 italic">The main metric used to determine ad success and ROI.</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Secondary KPI</label>
            <select 
              value={localSettings.secondary_kpi}
              onChange={(e) => setLocalSettings({...localSettings, secondary_kpi: e.target.value})}
              className="w-full bg-[#F5F5F4] border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-[#141414]"
            >
              {AVAILABLE_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[10px] text-[#8E8E8E] mt-1 italic">Used as a tie-breaker or supporting performance indicator.</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Conversion Events to Track</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-[#F5F5F4] rounded-xl">
              {AVAILABLE_METRICS.filter(m => m.category === 'Conversion').map(m => (
                <label key={`conv-event-${m.id}`} className="flex items-center gap-2 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
                  <input 
                    type="checkbox"
                    checked={localSettings.conversion_events.includes(m.id)}
                    onChange={(e) => {
                      const newEvents = e.target.checked 
                        ? [...localSettings.conversion_events, m.id]
                        : localSettings.conversion_events.filter(id => id !== m.id);
                      setLocalSettings({...localSettings, conversion_events: newEvents});
                    }}
                    className="rounded border-gray-300 text-[#141414] focus:ring-[#141414]"
                  />
                  <span className="text-xs font-medium">{m.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-[#8E8E8E] mt-1 italic">Select all events that represent value for this client.</p>
          </div>
        </div>

        {/* Guardrails & Attribution */}
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Attribution Window</label>
            <select 
              value={localSettings.attribution_window}
              onChange={(e) => setLocalSettings({...localSettings, attribution_window: e.target.value})}
              className="w-full bg-[#F5F5F4] border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-[#141414]"
            >
              {ATTRIBUTION_WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#8E8E8E] mb-2">Reporting Level</label>
            <select 
              value={localSettings.reporting_level}
              onChange={(e) => setLocalSettings({...localSettings, reporting_level: e.target.value as any})}
              className="w-full bg-[#F5F5F4] border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-[#141414]"
            >
              {REPORTING_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="border-t border-[#F5F5F4] pt-8">
        <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
          <Sliders size={16} />
          Analysis Scoring Weights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {Object.entries(localSettings.weights).map(([key, value]) => (
            <div key={`weight-${key}`} className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8E8E8E]">{key}</label>
              <input 
                type="number" 
                value={value}
                onChange={(e) => handleWeightChange(key as any, parseInt(e.target.value) || 0)}
                className="w-full bg-[#F5F5F4] border-none rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-[#141414]"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className={cn("text-xs font-bold", totalWeight === 100 ? "text-emerald-600" : "text-rose-600")}>
            Total Weight: {totalWeight}% {totalWeight !== 100 && "(Must equal 100%)"}
          </p>
          <button 
            onClick={() => onSave(localSettings)}
            disabled={isSaving || totalWeight !== 100}
            className="px-8 py-3 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Save KPI Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

const BreakdownAnalysisEngine = ({ 
  data, 
  onSync, 
  isSyncing,
  performanceData
}: { 
  data: AdBreakdown[], 
  onSync: () => void, 
  isSyncing: boolean,
  performanceData: any[]
}) => {
  const [selectedType, setSelectedType] = useState<string>('publisher_platform');
  const [topAdsLimit, setTopAdsLimit] = useState<number>(10);

  const processedData = useMemo(() => {
    const filtered = data.filter(b => b.breakdown_type === selectedType);
    const grouped: Record<string, any> = {};

    filtered.forEach(b => {
      const val = b.breakdown_value;
      const metrics = typeof b.metrics === 'string' ? JSON.parse(b.metrics) : b.metrics;
      if (!grouped[val]) {
        grouped[val] = { name: val, spend: 0, impressions: 0, clicks: 0, unique_clicks: 0, conversions: 0 };
      }
      grouped[val].spend += parseFloat(metrics.spend || '0');
      grouped[val].impressions += parseInt(metrics.impressions || '0');
      grouped[val].clicks += parseInt(metrics.clicks || '0');
      grouped[val].unique_clicks += parseInt(metrics.inline_link_clicks || metrics.clicks || '0');
      grouped[val].conversions += parseInt(metrics.conversions || '0');
    });

    return Object.values(grouped).sort((a, b) => b.spend - a.spend);
  }, [data, selectedType]);

  const topAdsData = useMemo(() => {
    const grouped: Record<string, any> = {};
    data.forEach(b => {
      const metrics = typeof b.metrics === 'string' ? JSON.parse(b.metrics) : b.metrics;
      if (!grouped[b.meta_ad_id]) {
        const ad = performanceData.find(p => p.meta_ad_id === b.meta_ad_id);
        grouped[b.meta_ad_id] = { 
          id: b.meta_ad_id, 
          name: ad ? ad.ad_name : 'Unknown Ad',
          spend: 0, 
          conversions: 0, 
          impressions: 0 
        };
      }
      grouped[b.meta_ad_id].spend += parseFloat(metrics.spend || '0');
      grouped[b.meta_ad_id].conversions += parseInt(metrics.conversions || '0');
      grouped[b.meta_ad_id].impressions += parseInt(metrics.impressions || '0');
    });
    return Object.values(grouped).sort((a, b) => b.spend - a.spend).slice(0, topAdsLimit === -1 ? undefined : topAdsLimit);
  }, [data, performanceData, topAdsLimit]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {BREAKDOWN_DIMENSIONS.map(d => (
            <button
              key={`breakdown-dim-${d.id}`}
              onClick={() => setSelectedType(d.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                selectedType === d.id ? "bg-[#141414] text-white" : "bg-white border border-[#E5E5E5] text-[#8E8E8E] hover:border-[#141414]"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button 
          onClick={onSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-[#F5F5F4] text-[#141414] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#E5E5E5] transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
          Sync Breakdowns
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
          <h3 className="text-sm font-bold mb-6">Spend Distribution</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={processedData}
                  dataKey="spend"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {processedData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={['#141414', '#404040', '#737373', '#A3A3A3', '#D4D4D4'][index % 5]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
          <h3 className="text-sm font-bold mb-6">Efficiency by {BREAKDOWN_DIMENSIONS.find(d => d.id === selectedType)?.label}</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedData}>
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={10} />
                <RechartsTooltip />
                <Bar dataKey="spend" fill="#141414" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[#E5E5E5]">
          <h3 className="text-sm font-bold">Breakdown Analysis</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
            <tr>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">{BREAKDOWN_DIMENSIONS.find(d => d.id === selectedType)?.label}</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Spend</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Impressions</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Unique Clicks</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">LP CVR</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Conversions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F4]">
            {processedData.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-6 py-4 font-bold">{row.name}</td>
                <td className="px-6 py-4">${row.spend.toFixed(2)}</td>
                <td className="px-6 py-4">{row.impressions.toLocaleString()}</td>
                <td className="px-6 py-4">{row.unique_clicks.toLocaleString()}</td>
                <td className="px-6 py-4">{((row.conversions / Math.max(1, row.unique_clicks)) * 100).toFixed(2)}%</td>
                <td className="px-6 py-4">{row.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[#E5E5E5] flex justify-between items-center">
          <h3 className="text-sm font-bold">Top Ads Breakdown</h3>
          <select 
            value={topAdsLimit} 
            onChange={(e) => setTopAdsLimit(parseInt(e.target.value))}
            className="px-2 py-1 rounded-lg border border-[#E5E5E5] text-xs"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={-1}>All Ads</option>
          </select>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5]">
            <tr>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Ad Name</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Spend</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Conversions</th>
              <th className="px-6 py-4 font-bold text-[10px] uppercase tracking-widest text-[#8E8E8E]">Impressions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F4]">
            {topAdsData.map((row) => (
              <tr key={`top-ad-${row.id}`} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-6 py-4 font-bold">{row.name}</td>
                <td className="px-6 py-4">${row.spend.toFixed(2)}</td>
                <td className="px-6 py-4">{row.conversions.toLocaleString()}</td>
                <td className="px-6 py-4">{row.impressions.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FunnelAnalysis = ({ data }: { data: any[] }) => {
  const funnelData = useMemo(() => {
    const totals = {
      impressions: 0,
      clicks: 0,
      unique_clicks: 0,
      view_content: 0,
      add_to_cart: 0,
      initiate_checkout: 0,
      subscribe: 0,
      purchase: 0
    };

    data.forEach(ad => {
      const metrics = typeof ad.metrics_json === 'string' ? JSON.parse(ad.metrics_json || '{}') : (ad.metrics || {});
      totals.impressions += parseInt(metrics.impressions || 0);
      totals.clicks += parseInt(metrics.clicks || 0);
      totals.unique_clicks += parseInt(metrics.inline_link_clicks || metrics.clicks || 0);
      
      const actions = metrics.actions || [];
      actions.forEach((a: any) => {
        if (a.action_type === 'offsite_conversion.fb_pixel_view_content') totals.view_content += parseInt(a.value || 0);
        if (a.action_type === 'offsite_conversion.fb_pixel_add_to_cart') totals.add_to_cart += parseInt(a.value || 0);
        if (a.action_type === 'offsite_conversion.fb_pixel_initiate_checkout') totals.initiate_checkout += parseInt(a.value || 0);
        if (a.action_type === 'offsite_conversion.fb_pixel_subscribe') totals.subscribe += parseInt(a.value || 0);
        if (a.action_type === 'offsite_conversion.fb_pixel_purchase') totals.purchase += parseInt(a.value || 0);
      });
    });

    return [
      { name: 'Awareness', label: 'Impressions', value: totals.impressions, color: '#141414' },
      { name: 'Interest', label: 'Unique Clicks', value: totals.unique_clicks, color: '#404040' },
      { name: 'Consideration', label: 'View Content', value: totals.view_content, color: '#525252' },
      { name: 'Intent', label: 'Add to Cart', value: totals.add_to_cart, color: '#737373' },
      { name: 'Qualified', label: 'Subscribe', value: totals.subscribe, color: '#8A8A8A' },
      { name: 'Conversion', label: 'Purchase', value: totals.purchase, color: '#D4D4D4' },
    ].filter(step => step.value > 0 || step.name === 'Awareness' || step.name === 'Interest');
  }, [data]);

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-sm">
        <h3 className="text-sm font-bold mb-8">Conversion Funnel</h3>
        <div className="space-y-6">
          {funnelData.map((step, i) => {
            const prevStep = funnelData[i - 1];
            const dropoff = prevStep && prevStep.value > 0 ? ((step.value / prevStep.value) * 100).toFixed(1) : null;
            
            return (
              <div key={step.name || i} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: step.color, color: 'white' }}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E]">{step.name}</p>
                      <p className="text-sm font-bold">{step.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{step.value.toLocaleString()}</p>
                    {dropoff && <p className="text-[10px] font-bold text-emerald-600">{dropoff}% Conversion</p>}
                  </div>
                </div>
                <div className="h-3 bg-[#F5F5F4] rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${funnelData[0].value > 0 ? (step.value / funnelData[0].value) * 100 : 0}%` }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: step.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ConversionEventMapping = ({ 
  settings, 
  onSave,
  adAccountId,
  startDate,
  endDate
}: { 
  settings: KPISettings | null, 
  onSave: (settings: KPISettings) => void,
  adAccountId: string,
  startDate: string,
  endDate: string
}) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [rawData, setRawData] = useState<any>(null);
  const [detectedEvents, setDetectedEvents] = useState<any[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [localSettings, setLocalSettings] = useState<KPISettings>(settings || {
    primary_kpi: 'roas',
    secondary_kpi: 'cost_per_conversion',
    guardrail_kpis: ['cpm', 'ctr'],
    conversion_events: ['purchase'],
    attribution_window: '7d_click_1d_view',
    reporting_level: 'ad',
    confidence_threshold: 90,
    min_sample_size: 1000,
    weights: { delivery: 15, engagement: 20, conversion: 40, quality: 10, creative: 15 },
    metric_mappings: {
      conversions: [], purchases: [], revenue: [], roas: [], primary_kpi: [], secondary_kpi: []
    }
  });

  const steps = [
    { id: 1, title: 'Scan Data', desc: 'Fetch live Meta sample' },
    { id: 2, title: 'Review Events', desc: 'Analyze detected signals' },
    { id: 3, title: 'Map KPIs', desc: 'Assign events to metrics' },
    { id: 4, title: 'Validate', desc: 'Check for inconsistencies' },
    { id: 5, title: 'Preview', desc: 'See dashboard impact' },
    { id: 6, title: 'Save', desc: 'Apply configuration' }
  ];

  const fetchLiveSample = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        ad_account_id: adAccountId,
        startDate,
        endDate,
        level: 'ad'
      });
      const res = await fetch(`/api/meta/raw-insights?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRawData(data);
        processEvents(data);
        setStep(2);
      }
    } catch (err) {
      console.error("Error fetching raw data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const processEvents = (data: any) => {
    const eventMap = new Map<string, any>();
    
    data.raw.data.forEach((item: any) => {
      // Process Actions
      item.actions?.forEach((a: any) => {
        if (!eventMap.has(a.action_type)) {
          eventMap.set(a.action_type, { 
            type: a.action_type, 
            count: 0, 
            value: 0, 
            roas: 0,
            sources: new Set(['actions'])
          });
        }
        const e = eventMap.get(a.action_type);
        e.count += parseInt(a.value) || 0;
        e.sources.add('actions');
      });

      // Process Values
      item.action_values?.forEach((a: any) => {
        if (!eventMap.has(a.action_type)) {
          eventMap.set(a.action_type, { 
            type: a.action_type, 
            count: 0, 
            value: 0, 
            roas: 0,
            sources: new Set(['action_values'])
          });
        }
        const e = eventMap.get(a.action_type);
        e.value += parseFloat(a.value) || 0;
        e.sources.add('action_values');
      });

      // Process ROAS
      item.purchase_roas?.forEach((a: any) => {
        if (!eventMap.has(a.action_type)) {
          eventMap.set(a.action_type, { 
            type: a.action_type, 
            count: 0, 
            value: 0, 
            roas: 0,
            sources: new Set(['purchase_roas'])
          });
        }
        const e = eventMap.get(a.action_type);
        e.roas = Math.max(e.roas, parseFloat(a.value) || 0);
        e.sources.add('purchase_roas');
      });
    });

    const events = Array.from(eventMap.values()).map(e => {
      const type = e.type.toLowerCase();
      let suggestion = 'Other';
      let confidence: 'High' | 'Medium' | 'Low' = 'Low';

      if (type.includes('purchase') || type.includes('checkout')) {
        suggestion = 'Purchases';
        confidence = 'High';
      } else if (type.includes('lead') || type.includes('complete_registration')) {
        suggestion = 'Leads';
        confidence = 'High';
      } else if (type.includes('add_to_cart')) {
        suggestion = 'Add to Cart';
        confidence = 'Medium';
      } else if (type.includes('view_content')) {
        suggestion = 'View Content';
        confidence = 'Medium';
      } else if (type.includes('initiate_checkout')) {
        suggestion = 'Initiate Checkout';
        confidence = 'Medium';
      }

      return { ...e, suggestion, confidence, sources: Array.from(e.sources) };
    });

    setDetectedEvents(events.sort((a, b) => b.count - a.count));
  };

  const toggleMapping = (key: keyof NonNullable<KPISettings['metric_mappings']>, action: string) => {
    const current = localSettings.metric_mappings?.[key] || [];
    const updated = current.includes(action) 
      ? current.filter(a => a !== action)
      : [...current, action];
    
    setLocalSettings({
      ...localSettings,
      metric_mappings: {
        ...(localSettings.metric_mappings || {
          conversions: [], purchases: [], revenue: [], roas: [], primary_kpi: [], secondary_kpi: []
        }),
        [key]: updated
      }
    });
  };

  const getValidation = () => {
    const checks: { type: 'error' | 'warning' | 'success', msg: string }[] = [];
    const mappings = localSettings.metric_mappings;

    if (!mappings?.conversions.length) checks.push({ type: 'error', msg: 'No conversion events mapped. Dashboard will show 0 conversions.' });
    else checks.push({ type: 'success', msg: `${mappings.conversions.length} conversion events mapped.` });

    if (!mappings?.revenue.length) checks.push({ type: 'warning', msg: 'No revenue source mapped. ROAS and Revenue will be 0.' });
    else checks.push({ type: 'success', msg: 'Revenue source configured.' });

    if (mappings?.purchases.length && !mappings?.revenue.length) {
      checks.push({ type: 'warning', msg: 'Purchases mapped but no corresponding Revenue source selected.' });
    }

    const hasZeroValue = mappings?.conversions.some(type => {
      const event = detectedEvents.find(e => e.type === type);
      return !event || event.count === 0;
    });
    if (hasZeroValue) checks.push({ type: 'warning', msg: 'Some mapped events have zero conversions in this sample.' });

    return checks;
  };

  const getPreview = () => {
    const previewMetrics = getMappedMetrics({
      spend: rawData?.summary?.spend || 0,
      conversions_by_type: detectedEvents.reduce((acc, e) => ({ ...acc, [e.type]: e.count }), {}),
      values_by_type: detectedEvents.reduce((acc, e) => ({ ...acc, [e.type]: e.value }), {}),
      roas_by_type: detectedEvents.reduce((acc, e) => ({ ...acc, [e.type]: e.roas }), {}),
    }, localSettings);

    return {
      conversions: previewMetrics.conversions,
      revenue: previewMetrics.revenue,
      purchases: previewMetrics.purchases,
      roas: previewMetrics.roas
    };
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-12">
      {steps.map((s, idx) => (
        <React.Fragment key={`step-${s.id}`}>
          <div className="flex flex-col items-center relative">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all border-2",
              step === s.id ? "bg-[#141414] text-white border-[#141414] scale-110 shadow-lg" : 
              step > s.id ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-[#8E8E8E] border-[#E5E5E5]"
            )}>
              {step > s.id ? <Check size={18} /> : s.id}
            </div>
            <div className="absolute top-12 whitespace-nowrap text-center">
              <p className={cn("text-[10px] font-bold uppercase tracking-widest", step === s.id ? "text-[#141414]" : "text-[#8E8E8E]")}>{s.title}</p>
            </div>
          </div>
          {idx < steps.length - 1 && (
            <div className={cn("flex-1 h-0.5 mx-4", step > s.id + 1 ? "bg-emerald-500" : "bg-[#E5E5E5]")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Progress Header */}
      <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
        {renderStepIndicator()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm min-h-[600px] flex flex-col">
            {step === 1 && (
              <div className="flex flex-col items-center justify-center flex-1 py-20 text-center space-y-6">
                <div className="w-24 h-24 bg-[#F5F5F4] rounded-full flex items-center justify-center">
                  <RefreshCw size={40} className={cn("text-[#141414]", isLoading && "animate-spin")} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight">Scan Live Campaign Data</h3>
                  <p className="text-[#8E8E8E] max-w-sm mx-auto mt-2">We'll fetch a sample of your recent Meta insights to detect which conversion events and values are currently active.</p>
                </div>
                <button 
                  onClick={fetchLiveSample}
                  disabled={isLoading}
                  className="px-12 py-4 bg-[#141414] text-white rounded-2xl text-sm font-bold hover:bg-opacity-90 transition-all shadow-xl shadow-[#141414]/10"
                >
                  {isLoading ? "Scanning Meta API..." : "Start Live Scan"}
                </button>
              </div>
            )}

            {step >= 2 && (
              <div className="space-y-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Detected Meta Events</h3>
                    <p className="text-xs text-[#8E8E8E]">Based on a sample of {rawData?.raw?.data?.length || 0} ads from your account.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={fetchLiveSample}
                      disabled={isLoading}
                      className="flex items-center gap-2 text-[10px] font-bold text-[#8E8E8E] hover:text-[#141414] transition-colors"
                    >
                      <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                      Rescan
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[500px] -mx-8 px-8">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-[#F5F5F4]">
                        <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Event Type</th>
                        <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Sample Data</th>
                        <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Confidence</th>
                        <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Mapped To</th>
                        <th className="py-4 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E] text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedEvents.map((e, idx) => {
                        const isMapped = Object.values(localSettings.metric_mappings || {}).some(m => m.includes(e.type));
                        
                        // Check if AI would smart-map this
                        const isSmartMappedConversions = !localSettings.metric_mappings?.conversions?.length && 
                          ['purchase', 'lead', 'complete_registration', 'conversion'].some(kw => e.type.toLowerCase().includes(kw)) && e.count > 0;
                        const isSmartMappedRevenue = !localSettings.metric_mappings?.revenue?.length && 
                          ['purchase', 'revenue', 'value'].some(kw => e.type.toLowerCase().includes(kw)) && e.value > 0;
                        const isAiSuggested = isSmartMappedConversions || isSmartMappedRevenue;

                        return (
                          <tr key={`event-${e.type}-${idx}`} className={cn(
                            "border-b border-[#F5F5F4] group hover:bg-[#FAFAFA] transition-colors cursor-pointer",
                            selectedEvent?.type === e.type && "bg-[#F5F5F4]"
                          )} onClick={() => setSelectedEvent(e)}>
                            <td className="py-4">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#141414] truncate max-w-[200px]" title={e.type}>{e.type}</span>
                                  {isAiSuggested && !isMapped && (
                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-bold uppercase tracking-tighter border border-emerald-100">
                                      <Sparkles size={8} />
                                      AI Suggested
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[#8E8E8E] mt-0.5">{e.suggestion}</span>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono font-bold text-[#141414]">{e.count.toLocaleString()} conv.</span>
                                {e.value > 0 && <span className="text-[10px] font-mono text-emerald-600">${e.value.toLocaleString()}</span>}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider",
                                e.confidence === 'High' ? "bg-emerald-100 text-emerald-700" :
                                e.confidence === 'Medium' ? "bg-amber-100 text-amber-700" :
                                "bg-[#F5F5F4] text-[#8E8E8E]"
                              )}>
                                {e.confidence}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(localSettings.metric_mappings || {}).map(([key, list]) => {
                                  if (list.includes(e.type)) {
                                    return (
                                      <span key={key} className="text-[8px] bg-[#141414] text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">
                                        {key.replace('_', ' ')}
                                      </span>
                                    );
                                  }
                                  return null;
                                })}
                                {!isMapped && <span className="text-[8px] text-[#D1D1D1] italic">Unmapped</span>}
                              </div>
                            </td>
                            <td className="py-4 text-right">
                              <button className={cn(
                                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                                selectedEvent?.type === e.type ? "bg-[#141414] text-white" : "bg-[#F5F5F4] text-[#141414] hover:bg-[#E5E5E5]"
                              )}>
                                Map
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between pt-6 border-t border-[#F5F5F4] mt-auto">
                  <button 
                    onClick={() => setStep(1)}
                    className="px-6 py-2 text-xs font-bold text-[#8E8E8E] hover:text-[#141414]"
                  >
                    Back to Scan
                  </button>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="px-6 py-2 text-xs font-bold text-[#8E8E8E] hover:text-[#141414]"
                    >
                      {showAdvanced ? "Hide Advanced" : "Show Raw JSON"}
                    </button>
                    <button 
                      onClick={() => setStep(step === 6 ? 6 : step + 1)}
                      className="px-10 py-3 bg-[#141414] text-white rounded-xl text-xs font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-[#141414]/10"
                    >
                      {step === 6 ? "Finish" : `Continue to ${steps[step]?.title || 'Next'}`}
                    </button>
                  </div>
                </div>

                {showAdvanced && (
                  <div className="mt-8 bg-[#141414] rounded-2xl p-6 overflow-x-auto">
                    <pre className="text-[10px] font-mono text-emerald-400 leading-relaxed">
                      {JSON.stringify(rawData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side Panel / Mapping Controls */}
        <div className="space-y-8">
          {/* Mapping Panel */}
          <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm sticky top-8">
            {selectedEvent ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-[#8E8E8E]">Mapping Event</h4>
                  <button onClick={() => setSelectedEvent(null)} className="text-[#8E8E8E] hover:text-[#141414]">
                    <X size={16} />
                  </button>
                </div>
                
                <div className="p-4 bg-[#F5F5F4] rounded-2xl border border-[#E5E5E5]">
                  <p className="text-xs font-bold text-[#141414] truncate mb-1">{selectedEvent.type}</p>
                  <div className="flex gap-4 text-[10px] text-[#8E8E8E]">
                    <span className="flex items-center gap-1"><Target size={10} /> {selectedEvent.count} Conv.</span>
                    {selectedEvent.value > 0 && <span className="flex items-center gap-1 text-emerald-600 font-bold"><TrendingUp size={10} /> ${selectedEvent.value}</span>}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Map to Dashboard KPI</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'conversions', label: 'Conversions', icon: Target, desc: 'Primary volume metric' },
                      { id: 'purchases', label: 'Purchases', icon: CheckCircle2, desc: 'Transaction count' },
                      { id: 'revenue', label: 'Revenue', icon: TrendingUp, desc: 'Value from action_values' },
                      { id: 'roas', label: 'ROAS', icon: BarChart3, desc: 'Return on Ad Spend' },
                      { id: 'primary_kpi', label: 'Primary KPI', icon: Sparkles, desc: 'Main dashboard card' },
                      { id: 'secondary_kpi', label: 'Secondary KPI', icon: LayoutList, desc: 'Secondary dashboard card' },
                    ].map(kpi => (
                      <button
                        key={`kpi-map-${kpi.id}`}
                        onClick={() => toggleMapping(kpi.id as any, selectedEvent.type)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left group",
                          localSettings.metric_mappings?.[kpi.id as keyof NonNullable<KPISettings['metric_mappings']>]?.includes(selectedEvent.type)
                            ? "bg-[#141414] border-[#141414] text-white"
                            : "bg-white border-[#F5F5F4] text-[#141414] hover:border-[#141414]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                            localSettings.metric_mappings?.[kpi.id as keyof NonNullable<KPISettings['metric_mappings']>]?.includes(selectedEvent.type) ? "bg-white/10" : "bg-[#F5F5F4] group-hover:bg-[#E5E5E5]"
                          )}>
                            <kpi.icon size={14} className={localSettings.metric_mappings?.[kpi.id as keyof NonNullable<KPISettings['metric_mappings']>]?.includes(selectedEvent.type) ? "text-emerald-400" : "text-[#8E8E8E]"} />
                          </div>
                          <div>
                            <p className="text-xs font-bold">{kpi.label}</p>
                            <p className={cn("text-[8px]", localSettings.metric_mappings?.[kpi.id as keyof NonNullable<KPISettings['metric_mappings']>]?.includes(selectedEvent.type) ? "text-white/60" : "text-[#8E8E8E]")}>{kpi.desc}</p>
                          </div>
                        </div>
                        {localSettings.metric_mappings?.[kpi.id as keyof NonNullable<KPISettings['metric_mappings']>]?.includes(selectedEvent.type) && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-4">
                <div className="w-16 h-16 bg-[#F5F5F4] rounded-full flex items-center justify-center mx-auto mb-4">
                  <GitMerge size={24} className="text-[#D1D1D1]" />
                </div>
                <h5 className="text-sm font-bold">No Event Selected</h5>
                <p className="text-xs text-[#8E8E8E] leading-relaxed max-w-[200px] mx-auto">Select an event from the table to assign it to your dashboard KPIs.</p>
              </div>
            )}
          </div>

          {/* Validation & Preview Summary */}
          {step >= 4 && (
            <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm space-y-6">
              <h4 className="text-sm font-bold uppercase tracking-widest text-[#8E8E8E]">Validation & Preview</h4>
              
              <div className="space-y-3">
                {getValidation().map((v, idx) => (
                  <div key={`validation-${idx}`} className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border",
                    v.type === 'error' ? "bg-rose-50 border-rose-100 text-rose-700" :
                    v.type === 'warning' ? "bg-amber-50 border-amber-100 text-amber-700" :
                    "bg-emerald-50 border-emerald-100 text-emerald-700"
                  )}>
                    {v.type === 'error' ? <XCircle size={14} className="mt-0.5" /> : 
                     v.type === 'warning' ? <AlertCircle size={14} className="mt-0.5" /> : 
                     <CheckCircle2 size={14} className="mt-0.5" />}
                    <p className="text-[10px] font-bold leading-tight">{v.msg}</p>
                  </div>
                ))}
              </div>

              {step >= 5 && (
                <div className="pt-6 border-t border-[#F5F5F4] space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8E]">Dashboard Preview</p>
                    <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Live Sample</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-[#F5F5F4] rounded-xl border border-[#E5E5E5]">
                      <p className="text-[8px] font-bold text-[#8E8E8E] uppercase mb-1">Conversions</p>
                      <p className="text-lg font-bold">{getPreview().conversions.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-[#F5F5F4] rounded-xl border border-[#E5E5E5]">
                      <p className="text-[8px] font-bold text-[#8E8E8E] uppercase mb-1">Revenue</p>
                      <p className="text-lg font-bold text-emerald-600">${getPreview().revenue.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-[#F5F5F4] rounded-xl border border-[#E5E5E5]">
                      <p className="text-[8px] font-bold text-[#8E8E8E] uppercase mb-1">Purchases</p>
                      <p className="text-lg font-bold">{getPreview().purchases.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-[#F5F5F4] rounded-xl border border-[#E5E5E5]">
                      <p className="text-[8px] font-bold text-[#8E8E8E] uppercase mb-1">ROAS</p>
                      <p className="text-lg font-bold text-indigo-600">{getPreview().roas.toFixed(2)}x</p>
                    </div>
                  </div>
                </div>
              )}

              {step === 6 && (
                <button 
                  onClick={() => onSave(localSettings)}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  Save & Apply Configuration
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ColumnSettingsPanel = ({
  selectedColumns,
  onUpdate
}: {
  selectedColumns: string[],
  onUpdate: (columns: string[]) => void
}) => {
  const toggleColumn = (id: string) => {
    if (selectedColumns.includes(id)) {
      onUpdate(selectedColumns.filter(c => c !== id));
    } else {
      onUpdate([...selectedColumns, id]);
    }
  };

  const categories = Array.from(new Set(AVAILABLE_METRICS.map(m => m.category)));

  return (
    <div className="space-y-8 bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {categories.map(cat => (
          <div key={`cat-${cat}`} className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#8E8E8E] border-b border-[#F5F5F4] pb-2">{cat}</h4>
            <div className="space-y-2">
              {AVAILABLE_METRICS.filter(m => m.category === cat).map(m => (
                <label key={`col-sel-${m.id}`} className="flex items-center gap-3 cursor-pointer group">
                  <div 
                    onClick={() => toggleColumn(m.id)}
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                      selectedColumns.includes(m.id) ? "bg-[#141414] border-[#141414]" : "border-[#E5E5E5] group-hover:border-[#141414]"
                    )}
                  >
                    {selectedColumns.includes(m.id) && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-medium text-[#141414]">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
