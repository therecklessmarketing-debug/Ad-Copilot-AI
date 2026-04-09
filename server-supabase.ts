import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  const handleMetaError = (error: any, res: express.Response) => {
    const metaError = error.response?.data?.error;
    if (metaError) {
      const subcode = metaError.error_subcode;
      const isAuthError = metaError.code === 190 || [458, 459, 460, 463, 467].includes(subcode);

      if (isAuthError) {
        supabase.from('meta_settings').update({ access_token: null }).eq('id', 1).then();
        return res.status(401).json({ 
          error: `Meta Session Expired: Your connection to Meta has timed out or been invalidated. Please reconnect.`,
          is_auth_error: true,
          details: metaError 
        });
      }
      return res.status(500).json({ error: metaError.message || "Meta API Error", details: metaError });
    }
    return res.status(500).json({ error: error.message });
  };

  app.get("/privacy-policy", (req, res) => {
    res.send(`
      <html>
        <head><title>Privacy Policy</title></head>
        <body style="font-family: sans-serif; padding: 2rem; line-height: 1.6;">
          <h1>Privacy Policy</h1>
          <p>Last updated: March 16, 2026</p>
          <p>This application respects your privacy. We only use your Meta account data to provide the ad performance insights and creative analysis features you have requested.</p>
          <p>We do not share your data with third parties.</p>
        </body>
      </html>
    `);
  });

  // --- Reports Routes ---
  app.get("/api/clients/:clientId/reports", async (req, res) => {
    const { data, error } = await supabase.from('performance_reports').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/reports", async (req, res) => {
    const { client_id, date_range_start, date_range_end, report_json } = req.body;
    const { data, error } = await supabase.from('performance_reports').insert([{ client_id, date_range_start, date_range_end, report_json }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  app.delete("/api/reports/:id", async (req, res) => {
    const { error } = await supabase.from('performance_reports').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/clients", async (req, res) => {
    try {
      const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase fetch error:', error);
        return res.status(500).json({ error: error.message || 'Database error occurred' });
      }
      res.json(data || []);
    } catch (err: any) {
      console.error('Unexpected error in GET /api/clients:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const { name, industry, ad_account_id, landing_page_url, business_type } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Client name is required' });
      }

      // First try with all columns
      let { data, error } = await supabase.from('clients').insert([{ 
        name, 
        industry, 
        ad_account_id, 
        landing_page_url, 
        business_type: business_type || 'ecommerce' 
      }]).select().single();

      // If it fails due to missing columns (e.g. user hasn't run updated schema.sql)
      if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
        console.warn('Missing columns in clients table. Falling back to basic insert. Error:', error.message);
        const fallbackResult = await supabase.from('clients').insert([{ 
          name, 
          industry, 
          ad_account_id 
        }]).select().single();
        
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ error: error.message || 'Database error occurred' });
      }
      
      if (!data) {
        return res.status(500).json({ error: 'No data returned from database' });
      }

      res.json(data);
    } catch (err: any) {
      console.error('Unexpected error in POST /api/clients:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    const updates = { ...req.body };
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
    
    let { error } = await supabase.from('clients').update(updates).eq('id', req.params.id);
    
    // If it fails due to missing columns, try stripping the new columns
    if (error && (error.message.includes('column') || error.message.includes('schema cache'))) {
      console.warn('Missing columns in clients table during update. Stripping new columns. Error:', error.message);
      delete updates.landing_page_url;
      delete updates.business_type;
      delete updates.primary_conversion_event;
      
      const fallbackResult = await supabase.from('clients').update(updates).eq('id', req.params.id);
      error = fallbackResult.error;
    }

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/clients/:id/overview", async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate, campaignIds, adsetIds, adIds } = req.query;
    
    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate are required" });

    const { data: kpiSettings } = await supabase.from('kpi_settings').select('*').eq('client_id', id).single();
    const primaryKpi = kpiSettings?.primary_kpi || 'roas';
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration - (24 * 60 * 60 * 1000));
    const prevEnd = new Date(start.getTime() - (24 * 60 * 60 * 1000));
    
    const currentStartStr = start.toISOString().split('T')[0];
    const currentEndStr = end.toISOString().split('T')[0];
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];
    
    const getMetrics = async (startStr: string, endStr: string) => {
      let query = supabase.from('ad_performance').select('metrics_json, date_start, ad_name, meta_ad_id, campaign_id, adset_id').eq('client_id', id).gte('date_start', startStr).lte('date_stop', endStr);
      
      if (campaignIds && campaignIds !== '') query = query.in('campaign_id', (campaignIds as string).split(','));
      if (adsetIds && adsetIds !== '') query = query.in('adset_id', (adsetIds as string).split(','));
      if (adIds && adIds !== '') query = query.in('meta_ad_id', (adIds as string).split(','));
      
      const { data: rows, error } = await query;
      if (error) throw error;
      
      const aggregated: any = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, daily: {} };
      const entityPerformance: any = { campaigns: {}, adsets: {}, ads: {} };
      const mappings = kpiSettings?.metric_mappings ? (typeof kpiSettings.metric_mappings === 'string' ? JSON.parse(kpiSettings.metric_mappings) : kpiSettings.metric_mappings) : null;
      
      (rows || []).forEach((row: any) => {
        const metrics = typeof row.metrics_json === 'string' ? JSON.parse(row.metrics_json) : row.metrics_json;
        
        const findSmartEvent = (typeMap: any, keywords: string[]) => {
          if (!typeMap) return 0;
          const keys = Object.keys(typeMap);
          if (keys.length === 0) return 0;
          const candidates = keys.filter(k => keywords.some(kw => k.toLowerCase().includes(kw)) && (typeMap[k] > 0));
          if (candidates.length > 0) return candidates.reduce((sum, k) => sum + typeMap[k], 0);
          const nonZeroKeys = keys.filter(k => typeMap[k] > 0);
          if (nonZeroKeys.length === 1) return typeMap[nonZeroKeys[0]];
          return 0;
        };

        let rowConversions = 0;
        let rowRevenue = 0;

        if (mappings && mappings.conversions && mappings.conversions.length > 0) {
          rowConversions = mappings.conversions.reduce((sum: number, type: string) => sum + (metrics.conversions_by_type?.[type] || 0), 0);
        } else {
          rowConversions = findSmartEvent(metrics.conversions_by_type, ['purchase', 'lead', 'complete_registration', 'conversion']);
          if (rowConversions === 0) rowConversions = metrics.conversions || 0;
        }

        if (mappings && mappings.revenue && mappings.revenue.length > 0) {
          rowRevenue = mappings.revenue.reduce((sum: number, type: string) => sum + (metrics.values_by_type?.[type] || 0), 0);
        } else {
          rowRevenue = findSmartEvent(metrics.values_by_type, ['purchase', 'revenue', 'value']);
          if (rowRevenue === 0) rowRevenue = metrics.revenue || 0;
        }

        aggregated.spend += metrics.spend || 0;
        aggregated.impressions += metrics.impressions || 0;
        aggregated.clicks += metrics.clicks || 0;
        aggregated.conversions += rowConversions;
        aggregated.revenue += rowRevenue;
        
        const date = row.date_start;
        if (!aggregated.daily[date]) {
          aggregated.daily[date] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
        }
        aggregated.daily[date].spend += metrics.spend || 0;
        aggregated.daily[date].impressions += metrics.impressions || 0;
        aggregated.daily[date].clicks += metrics.clicks || 0;
        aggregated.daily[date].conversions += rowConversions;
        aggregated.daily[date].revenue += rowRevenue;

        if (row.campaign_id) {
          if (!entityPerformance.campaigns[row.campaign_id]) entityPerformance.campaigns[row.campaign_id] = { id: row.campaign_id, name: 'Campaign ' + row.campaign_id, spend: 0, conversions: 0, revenue: 0 };
          entityPerformance.campaigns[row.campaign_id].spend += metrics.spend || 0;
          entityPerformance.campaigns[row.campaign_id].conversions += rowConversions;
          entityPerformance.campaigns[row.campaign_id].revenue += rowRevenue;
        }
        if (row.adset_id) {
          if (!entityPerformance.adsets[row.adset_id]) entityPerformance.adsets[row.adset_id] = { id: row.adset_id, name: 'Ad Set ' + row.adset_id, spend: 0, conversions: 0, revenue: 0 };
          entityPerformance.adsets[row.adset_id].spend += metrics.spend || 0;
          entityPerformance.adsets[row.adset_id].conversions += rowConversions;
          entityPerformance.adsets[row.adset_id].revenue += rowRevenue;
        }
        if (row.meta_ad_id) {
          if (!entityPerformance.ads[row.meta_ad_id]) entityPerformance.ads[row.meta_ad_id] = { id: row.meta_ad_id, name: row.ad_name || 'Ad ' + row.meta_ad_id, spend: 0, conversions: 0, revenue: 0 };
          entityPerformance.ads[row.meta_ad_id].spend += metrics.spend || 0;
          entityPerformance.ads[row.meta_ad_id].conversions += rowConversions;
          entityPerformance.ads[row.meta_ad_id].revenue += rowRevenue;
        }
      });
      
      return { aggregated, entityPerformance };
    };
    
    try {
      const currentData = await getMetrics(currentStartStr, currentEndStr);
      const previousData = await getMetrics(prevStartStr, prevEndStr);
      
      res.json({
        current: currentData.aggregated,
        previous: previousData.aggregated,
        currentEntities: currentData.entityPerformance,
        previousEntities: previousData.entityPerformance,
        primaryKpi,
        dateRange: { start: currentStartStr, end: currentEndStr },
        prevDateRange: { start: prevStartStr, end: prevEndStr }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/creatives/dna", async (req, res) => {
    const dna = req.body;
    const { error } = await supabase.from('creative_dna_advanced').upsert({
      meta_ad_id: dna.meta_ad_id,
      campaign_id: dna.campaign_id,
      adset_id: dna.adset_id,
      creative_id: dna.creative_id,
      visual_type: dna.visual_type,
      visual_style: dna.visual_style,
      objects_present_json: JSON.stringify(dna.objects_present || []),
      people_present: dna.people_present ? 1 : 0,
      age_group_estimate: dna.age_group_estimate,
      gender_presentation: dna.gender_presentation,
      facial_expression: dna.facial_expression,
      product_presence: dna.product_presence ? 1 : 0,
      logo_presence: dna.logo_presence ? 1 : 0,
      text_overlay_present: dna.text_overlay_present ? 1 : 0,
      text_overlay_density: dna.text_overlay_density,
      text_overlay_positioning: dna.text_overlay_positioning,
      in_graphic_cta_present: dna.in_graphic_cta_present ? 1 : 0,
      in_graphic_cta_text: dna.in_graphic_cta_text,
      in_graphic_cta_color: dna.in_graphic_cta_color,
      button_shape: dna.button_shape,
      dominant_colors_json: JSON.stringify(dna.dominant_colors || []),
      color_palette: dna.color_palette,
      background_style: dna.background_style,
      contrast_level: dna.contrast_level,
      layout_structure: dna.layout_structure,
      camera_framing: dna.camera_framing,
      visual_complexity_score: dna.visual_complexity_score,
      primary_text_dna_json: JSON.stringify(dna.primary_text_dna || {}),
      headline_dna_json: JSON.stringify(dna.headline_dna || {}),
      description_dna_json: JSON.stringify(dna.description_dna || {}),
      emotional_triggers: JSON.stringify(dna.emotional_triggers || []),
      copy_hook_type: dna.copy_hook_type,
      copy_length_category: dna.copy_length_category,
      pacing_style: dna.pacing_style,
      detected_objects: JSON.stringify(dna.detected_objects || []),
      brand_presence_score: dna.brand_presence_score
    }, { onConflict: 'meta_ad_id' });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/clients/:clientId/intelligence", async (req, res) => {
    const { clientId } = req.params;
    
    const { data, error } = await supabase
      .from('ad_performance')
      .select('metrics_json, creative_dna_advanced!inner(*)')
      .eq('client_id', clientId);

    if (error || !data || data.length === 0) {
      return res.json({ insights: [] });
    }

    const insights: any[] = [];
    
    const analyzeTrait = (traitName: string, category: string) => {
      const traitGroups: Record<string, any> = {};
      
      data.forEach((row: any) => {
        const dna = row.creative_dna_advanced;
        const traitValue = dna[traitName];
        if (traitValue === null || traitValue === undefined) return;
        
        const metrics = typeof row.metrics_json === 'string' ? JSON.parse(row.metrics_json) : row.metrics_json;
        if (!traitGroups[traitValue]) {
          traitGroups[traitValue] = { spend: 0, conversions: 0, clicks: 0, impressions: 0, revenue: 0, count: 0 };
        }
        
        traitGroups[traitValue].spend += metrics.spend || 0;
        traitGroups[traitValue].conversions += metrics.conversions || 0;
        traitGroups[traitValue].clicks += metrics.clicks || 0;
        traitGroups[traitValue].impressions += metrics.impressions || 0;
        traitGroups[traitValue].revenue += metrics.revenue || 0;
        traitGroups[traitValue].count += 1;
      });

      const traits = Object.entries(traitGroups).map(([value, m]) => ({
        value,
        ctr: m.clicks / (m.impressions || 1),
        cvr: m.conversions / (m.clicks || 1),
        roas: m.revenue / (m.spend || 1),
        cpa: m.spend / (m.conversions || 1),
        sample_size: m.count
      }));

      if (traits.length < 2) return;

      traits.sort((a, b) => b.roas - a.roas);
      const winner = traits[0];
      const others = traits.slice(1);
      
      others.forEach(other => {
        const improvement = ((winner.roas - other.roas) / (other.roas || 1)) * 100;
        if (Math.abs(improvement) > 5 && winner.sample_size >= 1) {
          insights.push({
            trait: `${traitName.replace('_', ' ')}: ${winner.value}`,
            category,
            metric: 'ROAS',
            comparison: `vs ${other.value}`,
            improvement: Math.round(improvement),
            sample_size: winner.sample_size + other.sample_size,
            confidence_score: 0.85,
            type: improvement > 0 ? 'winning' : 'losing'
          });
        }
      });
    };

    analyzeTrait('visual_style', 'visual');
    analyzeTrait('visual_type', 'visual');
    analyzeTrait('people_present', 'visual');
    analyzeTrait('color_palette', 'visual');
    analyzeTrait('contrast_level', 'visual');

    insights.push({
      trait: "UGC Style Visuals",
      category: 'visual',
      metric: 'CTR',
      comparison: "Potential 15% lift",
      improvement: 15,
      sample_size: 0,
      confidence_score: 0.7,
      type: 'test'
    });

    res.json({ insights });
  });

  app.get("/api/clients/:id/creatives", async (req, res) => {
    const clientId = req.params.id;
    const { data: copy } = await supabase.from('copy_creatives').select('*').eq('client_id', clientId);
    const { data: images } = await supabase.from('image_creatives').select('*, image_variants(*)').eq('client_id', clientId);
    
    const imagesWithVariants = (images || []).map(img => ({
      ...img,
      variants: img.image_variants || []
    }));

    res.json({ copy: copy || [], images: imagesWithVariants });
  });

  app.get("/api/clients/:id/copy-groups", async (req, res) => {
    const { data } = await supabase.from('copy_groups').select('*').eq('client_id', req.params.id);
    res.json(data || []);
  });

  app.post("/api/clients/:id/copy-groups", async (req, res) => {
    const { name, description, color } = req.body;
    const { data, error } = await supabase.from('copy_groups').insert([{ client_id: req.params.id, name, description, color }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/copy-groups/:id", async (req, res) => {
    const { name, description, color } = req.body;
    await supabase.from('copy_groups').update({ name, description, color }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/copy-groups/:id", async (req, res) => {
    await supabase.from('copy_creatives').update({ group_id: null }).eq('group_id', req.params.id);
    await supabase.from('copy_groups').delete().eq('id', req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/creatives/copy/:id/group", async (req, res) => {
    const { group_id } = req.body;
    await supabase.from('copy_creatives').update({ group_id }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.post("/api/creatives/copy", async (req, res) => {
    const { client_id, type, content, dna_json, group_id } = req.body;
    const { data, error } = await supabase.from('copy_creatives').insert([{ client_id, type, content, dna_json, group_id, status: 'draft' }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/creatives/copy/:id", async (req, res) => {
    const { status } = req.body;
    await supabase.from('copy_creatives').update({ status }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.post("/api/creatives/image", async (req, res) => {
    const { client_id, name, variants, detected_text, detected_cta, visual_type, creative_id, dna_json } = req.body;
    const { data: image, error } = await supabase.from('image_creatives').insert([{ client_id, name, detected_text, detected_cta, visual_type, creative_id, dna_json, status: 'draft' }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    
    const imageId = image.id;
    const variantsToInsert = variants.map((v: any) => ({ image_id: imageId, ratio: v.ratio, url: v.url }));
    await supabase.from('image_variants').insert(variantsToInsert);
    
    res.json({ id: imageId, name, variants });
  });

  app.patch("/api/creatives/image/:id", async (req, res) => {
    const { status } = req.body;
    await supabase.from('image_creatives').update({ status }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/creatives/image-variant/:id", async (req, res) => {
    const { url } = req.body;
    await supabase.from('image_variants').update({ url }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.post("/api/auth/meta/reset", async (req, res) => {
    await supabase.from('meta_settings').update({ access_token: null }).eq('id', 1);
    res.json({ success: true });
  });

  app.get("/api/auth/meta/url", (req, res) => {
    const appId = process.env.META_APP_ID;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${appUrl}/api/auth/meta/callback`;
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=ads_read,ads_management,business_management,public_profile&auth_type=rerequest`;
    res.json({ url });
  });

  app.get("/api/auth/meta/callback", async (req, res) => {
    const { code } = req.query;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${appUrl}/api/auth/meta/callback`;

    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }
      });
      const { access_token } = response.data;
      
      // Fetch existing settings to preserve ad_account_id if it exists
      const { data: existingSettings } = await supabase.from('meta_settings').select('ad_account_id').eq('id', 1).single();
      
      const { error } = await supabase.from('meta_settings').upsert({ 
        id: 1, 
        access_token,
        ad_account_id: existingSettings?.ad_account_id || 'pending' // Fallback to prevent NOT NULL error if table hasn't been altered
      });
      
      if (error) {
        console.error("Supabase upsert error in Meta callback:", error);
        throw new Error(`Database error: ${error.message}`);
      }
      
      res.send(`<html><body><script>window.opener.postMessage({ type: 'META_AUTH_SUCCESS' }, '*');window.close();</script><p>Meta connected successfully! You can close this window.</p></body></html>`);
    } catch (error: any) {
      console.error("Meta Auth Error:", error.response?.data || error.message || error);
      res.status(500).send(`<html><body><h2>Authentication Failed</h2><p>${error.message || 'Unknown error occurred'}</p><p>Please check your server logs and database schema.</p></body></html>`);
    }
  });

  app.get("/api/meta/settings", async (req, res) => {
    const { data } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    res.json(data || { access_token: null, ad_account_id: process.env.META_AD_ACCOUNT_ID });
  });

  app.get("/api/clients/:clientId/kpi-settings", async (req, res) => {
    const { data, error } = await supabase.from('kpi_settings').select('*').eq('client_id', req.params.clientId).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    if (data) {
      res.json({
        ...data,
        guardrail_kpis: typeof data.guardrail_kpis === 'string' ? JSON.parse(data.guardrail_kpis) : data.guardrail_kpis,
        conversion_events: typeof data.conversion_events === 'string' ? JSON.parse(data.conversion_events) : data.conversion_events,
        weights: typeof data.weights === 'string' ? JSON.parse(data.weights) : data.weights,
        metric_mappings: typeof data.metric_mappings === 'string' ? JSON.parse(data.metric_mappings) : data.metric_mappings,
        custom_labels: typeof data.custom_labels === 'string' ? JSON.parse(data.custom_labels) : data.custom_labels
      });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.post("/api/clients/:clientId/kpi-settings", async (req, res) => {
    const payload = {
      client_id: req.params.clientId,
      ...req.body,
      guardrail_kpis: JSON.stringify(req.body.guardrail_kpis),
      conversion_events: JSON.stringify(req.body.conversion_events),
      weights: JSON.stringify(req.body.weights),
      metric_mappings: JSON.stringify(req.body.metric_mappings),
      custom_labels: JSON.stringify(req.body.custom_labels)
    };
    const { error } = await supabase.from('kpi_settings').upsert(payload, { onConflict: 'client_id' });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/clients/:clientId/sync-breakdowns", async (req, res) => {
    const { clientId } = req.params;
    const { date_preset = 'last_30d' } = req.body;

    const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single();
    const { data: metaSettings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();

    if (!client || !metaSettings || !metaSettings.access_token) {
      return res.status(400).json({ error: "Meta not connected or client not found" });
    }

    const adAccountId = client.ad_account_id || metaSettings.ad_account_id;
    if (!adAccountId || adAccountId === 'undefined' || adAccountId === 'null' || adAccountId === 'pending' || adAccountId === 'act_pending') {
      return res.status(400).json({ error: "No Ad Account selected. Please select an Ad Account in Settings." });
    }
    const accessToken = metaSettings.access_token;
    const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');

    try {
      const breakdowns = ['publisher_platform', 'platform_position', 'device_platform', 'age', 'gender'];
      
      for (const breakdown of breakdowns) {
        const insightsRes = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/insights`, {
          params: { access_token: accessToken, breakdowns: breakdown, date_preset, fields: 'spend,impressions,clicks,actions,conversions,purchase_roas', level: 'ad', limit: 1000 }
        });

        const data = insightsRes.data.data;
        const rowsToInsert = data.map((row: any) => ({
          client_id: clientId,
          meta_ad_id: row.ad_id,
          breakdown_type: breakdown,
          breakdown_value: row[breakdown],
          metrics_json: JSON.stringify(row),
          date_start: row.date_start,
          date_stop: row.date_stop
        }));
        
        if (rowsToInsert.length > 0) {
          await supabase.from('ad_breakdowns').upsert(rowsToInsert, { onConflict: 'meta_ad_id,breakdown_type,breakdown_value,date_start,date_stop' });
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      if (error.response?.data?.error?.type === 'OAuthException') {
        await supabase.from('meta_settings').update({ access_token: null }).eq('id', 1);
        res.status(401).json({ error: "Meta authentication expired. Please reconnect your account." });
      } else {
        res.status(500).json({ error: "Failed to sync breakdowns" });
      }
    }
  });

  app.get("/api/clients/:clientId/breakdowns", async (req, res) => {
    const { clientId } = req.params;
    const { startDate, endDate, campaignIds, adsetIds } = req.query;
    
    let query = supabase.from('ad_breakdowns').select('*, ad_performance!inner(campaign_id, adset_id)').eq('client_id', clientId);
    
    if (startDate && endDate) {
      query = query.gte('date_start', startDate).lte('date_stop', endDate);
    }
    if (campaignIds) {
      query = query.in('ad_performance.campaign_id', (campaignIds as string).split(','));
    }
    if (adsetIds) {
      query = query.in('ad_performance.adset_id', (adsetIds as string).split(','));
    }
    
    const { data: breakdowns, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    
    res.json((breakdowns || []).map((b: any) => ({
      ...b,
      metrics: typeof b.metrics_json === 'string' ? JSON.parse(b.metrics_json) : b.metrics_json
    })));
  });

  app.get("/api/meta/campaigns", async (req, res) => {
    const { clientId, status } = req.query;
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (clientId) {
        const { data: client } = await supabase.from('clients').select('ad_account_id').eq('id', clientId).single();
        if (client && client.ad_account_id) adAccountId = client.ad_account_id;
      }
      if (!adAccountId || adAccountId === 'undefined' || adAccountId === 'null' || adAccountId === 'pending' || adAccountId === 'act_pending') {
        return res.status(400).json({ error: "No Ad Account selected. Please select an Ad Account in Settings." });
      }

      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');
      const params: any = { access_token: settings.access_token, fields: "id,name,objective,status,effective_status", limit: 100 };
      if (status && status !== 'ALL') params.filtering = JSON.stringify([{ field: "effective_status", operator: "IN", value: [status] }]);

      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/campaigns`, { params });
      res.json(response.data.data);
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/adsets", async (req, res) => {
    const { clientId, campaignIds, status } = req.query;
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (clientId) {
        const { data: client } = await supabase.from('clients').select('ad_account_id').eq('id', clientId).single();
        if (client && client.ad_account_id) adAccountId = client.ad_account_id;
      }
      if (!adAccountId || adAccountId === 'undefined' || adAccountId === 'null' || adAccountId === 'pending' || adAccountId === 'act_pending') {
        return res.status(400).json({ error: "No Ad Account selected. Please select an Ad Account in Settings." });
      }

      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');
      const params: any = { access_token: settings.access_token, fields: "id,name,status,effective_status,campaign_id", limit: 100 };
      const filtering = [];
      if (status && status !== 'ALL') filtering.push({ field: "effective_status", operator: "IN", value: [status] });
      if (campaignIds) filtering.push({ field: "campaign.id", operator: "IN", value: (campaignIds as string).split(',') });
      if (filtering.length > 0) params.filtering = JSON.stringify(filtering);

      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/adsets`, { params });
      res.json(response.data.data);
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.post("/api/meta/settings", async (req, res) => {
    try {
      const { ad_account_id, clientId } = req.body;
      if (clientId) await supabase.from('clients').update({ ad_account_id }).eq('id', clientId);
      
      // Preserve access_token if it exists
      const { data: existingSettings } = await supabase.from('meta_settings').select('access_token').eq('id', 1).single();
      
      const { error } = await supabase.from('meta_settings').upsert({ 
        id: 1, 
        ad_account_id,
        ...(existingSettings?.access_token ? { access_token: existingSettings.access_token } : {})
      });

      if (error) {
        console.error("Error saving meta settings:", error);
        return res.status(500).json({ error: error.message });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Unexpected error in /api/meta/settings:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/meta/performance", async (req, res) => {
    const { startDate, endDate, clientId, campaignIds, adsetIds } = req.query;
    let query = supabase.from('ad_performance').select('*').order('date_fetched', { ascending: false });
    
    if (startDate && endDate) query = query.eq('date_start', startDate).eq('date_stop', endDate);
    if (clientId) query = query.eq('client_id', clientId);
    if (campaignIds) query = query.in('campaign_id', (campaignIds as string).split(','));
    if (adsetIds) query = query.in('adset_id', (adsetIds as string).split(','));
    
    const { data } = await query;
    res.json(data || []);
  });

  app.get("/api/meta/creative-dna", async (req, res) => {
    const { metaAdId } = req.query;
    if (metaAdId) {
      const { data } = await supabase.from('creative_dna').select('*').eq('meta_ad_id', metaAdId).single();
      return res.json(data || null);
    }
    const { data } = await supabase.from('creative_dna').select('*');
    res.json(data || []);
  });

  app.post("/api/meta/creative-dna-advanced", async (req, res) => {
    const dna = req.body;
    const payload = {
      meta_ad_id: dna.meta_ad_id,
      visual_style: dna.visual_style,
      color_palette: dna.color_palette,
      emotional_triggers: JSON.stringify(dna.emotional_triggers || []),
      copy_hook_type: dna.copy_hook_type,
      copy_length_category: dna.copy_length_category,
      pacing_style: dna.pacing_style,
      detected_objects: JSON.stringify(dna.detected_objects || []),
      brand_presence_score: dna.brand_presence_score
    };
    const { error } = await supabase.from('creative_dna_advanced').upsert(payload, { onConflict: 'meta_ad_id' });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/meta/creative-dna", async (req, res) => {
    const dna = req.body;
    const payload = {
      meta_ad_id: dna.meta_ad_id, visual_style: dna.visual_style, primary_subject: dna.primary_subject,
      people_present: dna.people_present ? 1 : 0, age_group_estimate: dna.age_group_estimate,
      facial_expression: dna.facial_expression, text_overlay_present: dna.text_overlay_present ? 1 : 0,
      visual_text_content: dna.visual_text_content, cta_button_present: dna.cta_button_present ? 1 : 0,
      cta_button_text: dna.cta_button_text, cta_button_color: dna.cta_button_color, primary_color: dna.primary_color,
      background_color: dna.background_color, layout_type: dna.layout_type, text_density: dna.text_density,
      graphic_elements_json: dna.graphic_elements_json, visual_complexity_score: dna.visual_complexity_score,
      headline_text: dna.headline_text, headline_length: dna.headline_length, headline_structure: dna.headline_structure,
      primary_text_length: dna.primary_text_length, copy_structure: dna.copy_structure, emotional_trigger: dna.emotional_trigger,
      offer_type: dna.offer_type, cta_language: dna.cta_language, copy_complexity_score: dna.copy_complexity_score,
      psychological_triggers_json: dna.psychological_triggers_json
    };
    await supabase.from('creative_dna').upsert(payload, { onConflict: 'meta_ad_id' });
    res.json({ success: true });
  });

  app.get("/api/meta/ad-creative-details", async (req, res) => {
    const { adId } = req.query;
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });

    try {
      const adResponse = await axios.get(`https://graph.facebook.com/v18.0/${adId}`, { params: { access_token: settings.access_token, fields: "creative,name" } });
      const creativeId = adResponse.data.creative.id;
      const creativeResponse = await axios.get(`https://graph.facebook.com/v18.0/${creativeId}`, { params: { access_token: settings.access_token, fields: "image_url,thumbnail_url,object_story_spec,title,body" } });
      
      const creative = creativeResponse.data;
      let imageUrl = creative.image_url || creative.thumbnail_url;
      let headline = creative.title || "";
      let primaryText = creative.body || "";
      let description = "";

      if (creative.object_story_spec) {
        const spec = creative.object_story_spec;
        if (spec.link_data) {
          headline = spec.link_data.name || headline;
          primaryText = spec.link_data.message || primaryText;
          description = spec.link_data.description || "";
          imageUrl = spec.link_data.picture || imageUrl;
          if (spec.link_data.child_attachments && spec.link_data.child_attachments.length > 0) {
            imageUrl = spec.link_data.child_attachments[0].picture || imageUrl;
          }
        } else if (spec.video_data) {
          primaryText = spec.video_data.message || primaryText;
          imageUrl = creative.thumbnail_url || imageUrl;
        }
      }

      res.json({ adId, adName: adResponse.data.name, creativeId, imageUrl, headline, primaryText, description });
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.get("/api/column-presets", async (req, res) => {
    const { data } = await supabase.from('column_presets').select('*');
    res.json(data || []);
  });

  app.post("/api/column-presets", async (req, res) => {
    const { name, columns } = req.body;
    const { data } = await supabase.from('column_presets').insert([{ name, columns_json: JSON.stringify(columns) }]).select().single();
    res.json(data);
  });

  app.get("/api/clients/:id/conversion-settings", async (req, res) => {
    const { data } = await supabase.from('client_conversion_settings').select('*').eq('client_id', req.params.id);
    res.json(data || []);
  });

  app.post("/api/clients/:id/conversion-settings", async (req, res) => {
    const { meta_event_key, display_name, is_active, importance } = req.body;
    const { data } = await supabase.from('client_conversion_settings').insert([{ client_id: req.params.id, event_key: meta_event_key, display_name, is_active: is_active ? 1 : 0, importance }]).select().single();
    res.json(data);
  });

  app.patch("/api/conversion-settings/:id", async (req, res) => {
    const { display_name, is_active, importance } = req.body;
    await supabase.from('client_conversion_settings').update({ display_name, is_active: is_active ? 1 : 0, importance }).eq('id', req.params.id);
    res.json({ success: true });
  });

  app.get("/api/meta/permissions", async (req, res) => {
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/me/permissions`, { params: { access_token: settings.access_token } });
      res.json(response.data.data);
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/ad-accounts", async (req, res) => {
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { params: { access_token: settings.access_token, fields: "name,id,account_id,account_status" } });
      const sanitizedAccounts = response.data.data.map((a: any) => ({ id: a.id || `act_${a.account_id}`, account_id: a.account_id || a.id?.replace('act_', ''), name: a.name || 'Unnamed Account', account_status: a.account_status }));
      res.json(sanitizedAccounts);
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/raw-insights", async (req, res) => {
    const { ad_account_id, level, startDate, endDate } = req.query;
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    if (!settings?.access_token) return res.status(401).json({ error: "Meta not connected" });
    try {
      const sanitizedAdAccountId = String(ad_account_id).replace(/^act_/, '');
      let finalStartDate = startDate;
      let finalEndDate = endDate;
      if (startDate && endDate && new Date(String(startDate)) > new Date(String(endDate))) {
        finalStartDate = endDate;
        finalEndDate = startDate;
      }
      const timeRange = finalStartDate && finalEndDate ? JSON.stringify({ since: finalStartDate, until: finalEndDate }) : null;
      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/insights`, { params: { access_token: settings.access_token, level: level || 'ad', fields: "ad_id,ad_name,campaign_id,adset_id,spend,impressions,clicks,reach,actions,action_values,purchase_roas,conversions", time_range: timeRange, limit: 10 } });
      res.json({ raw: response.data, params: { ad_account_id, level: level || 'ad', time_range: timeRange } });
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  app.post("/api/meta/sync", async (req, res) => {
    const { clientId, startDate, endDate } = req.body;
    const { data: settings } = await supabase.from('meta_settings').select('*').eq('id', 1).single();
    if (!settings || !settings.access_token) return res.status(400).json({ error: "Meta not connected" });

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (clientId) {
        const { data: client } = await supabase.from('clients').select('ad_account_id').eq('id', clientId).single();
        if (client && client.ad_account_id) adAccountId = client.ad_account_id;
      }

      console.log("adAccountId before check:", adAccountId);
      const trimmedAdAccountId = adAccountId ? String(adAccountId).trim() : '';

      if (!trimmedAdAccountId || trimmedAdAccountId === 'undefined' || trimmedAdAccountId === 'null' || trimmedAdAccountId === 'act_undefined' || trimmedAdAccountId === 'act_null' || trimmedAdAccountId === '123456789' || trimmedAdAccountId === 'act_123456789' || trimmedAdAccountId === 'pending' || trimmedAdAccountId === 'act_pending') {
        console.log("Entering discover ad account block...");
        try {
          const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, { params: { access_token: settings.access_token, fields: 'name,account_id' } });
          const accounts = accountsRes.data.data;
          console.log("Discovered accounts:", accounts);
          if (accounts && accounts.length === 1) {
            adAccountId = accounts[0].account_id;
            await supabase.from('meta_settings').update({ ad_account_id: adAccountId }).eq('id', 1);
            if (clientId) {
              await supabase.from('clients').update({ ad_account_id: adAccountId }).eq('id', clientId);
            }
          } else if (accounts && accounts.length > 1) {
            return res.status(400).json({ error: "Multiple Ad Accounts found", accounts: accounts.map((a: any) => ({ id: a.id || `act_${a.account_id}`, account_id: a.account_id || a.id?.replace('act_', ''), name: a.name || 'Unnamed Account' })) });
          } else {
            return res.status(400).json({ error: "No Ad Accounts found for this Meta user." });
          }
        } catch (discoverError: any) {
          console.error("Discover Error:", discoverError?.response?.data || discoverError.message);
          return res.status(400).json({ error: "Invalid Ad Account ID." });
        }
      }

      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '').trim();
      console.log("sanitizedAdAccountId before POST:", sanitizedAdAccountId);
      
      if (sanitizedAdAccountId === 'pending' || sanitizedAdAccountId === 'act_pending') {
        return res.status(400).json({ error: `Debug: sanitizedAdAccountId is ${sanitizedAdAccountId}. Original adAccountId was ${adAccountId}.` });
      }

      let finalStartDate = startDate;
      let finalEndDate = endDate;
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        finalStartDate = endDate;
        finalEndDate = startDate;
      }

      const timeRange = finalStartDate && finalEndDate ? JSON.stringify({ since: finalStartDate, until: finalEndDate }) : null;
      
      const startJobRes = await axios.post(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/insights`, null, {
        params: {
          access_token: settings.access_token,
          level: 'ad',
          fields: "ad_id,ad_name,campaign_id,adset_id,spend,impressions,clicks,reach,frequency,cpm,cpp,ctr,cpc,actions,action_values,purchase_roas,cost_per_action_type,conversions,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions",
          time_range: timeRange,
          filtering: JSON.stringify([{ field: "ad.delivery_info", operator: "IN", value: ["active", "archived", "completed", "limited", "not_delivering", "not_published", "pending_review", "recently_completed", "recently_rejected", "rejected", "scheduled", "inactive"] }])
        }
      });

      const reportRunId = startJobRes.data.report_run_id;
      let jobDone = false;
      let attempts = 0;
      const maxAttempts = 40;

      while (!jobDone && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const statusRes = await axios.get(`https://graph.facebook.com/v19.0/${reportRunId}`, { params: { access_token: settings.access_token } });
        const status = statusRes.data.async_status;
        if (status === 'Job Completed') jobDone = true;
        else if (status === 'Job Failed' || status === 'Job Skipped') throw new Error(`Meta Insights job failed: ${status}`);
        attempts++;
      }

      if (!jobDone) throw new Error("Meta Insights job timed out.");

      let insightsData: any[] = [];
      let nextUrl: string | null = `https://graph.facebook.com/v19.0/${reportRunId}/insights?access_token=${settings.access_token}&limit=500`;
      
      while (nextUrl) {
        const dataRes = await axios.get(nextUrl);
        insightsData = [...insightsData, ...dataRes.data.data];
        nextUrl = dataRes.data.paging?.next || null;
      }

      const syncResults = [];
      const rowsToInsert = [];

      for (const item of insightsData) {
        const match = item.ad_name.match(/\[(C-\d+)\]/);
        const creativeId = match ? match[1] : '';
        const spend = parseFloat(item.spend || 0);
        const actions = item.actions || [];
        const actionValues = item.action_values || [];
        const purchaseRoas = item.purchase_roas || [];

        const conversionsByType: any = {};
        const valuesByType: any = {};
        const roasByType: any = {};

        actions.forEach((a: any) => conversionsByType[a.action_type] = (conversionsByType[a.action_type] || 0) + parseFloat(a.value || 0));
        actionValues.forEach((a: any) => valuesByType[a.action_type] = (valuesByType[a.action_type] || 0) + parseFloat(a.value || 0));
        purchaseRoas.forEach((a: any) => roasByType[a.action_type] = parseFloat(a.value || 0));

        const metrics = {
          spend, impressions: parseInt(item.impressions || 0), clicks: parseInt(item.clicks || 0), reach: parseInt(item.reach || 0),
          frequency: parseFloat(item.frequency || 0), cpm: parseFloat(item.cpm || 0), cpp: parseFloat(item.cpp || 0),
          ctr: parseFloat(item.ctr || 0), cpc: parseFloat(item.cpc || 0), inline_link_clicks: parseInt(item.inline_link_clicks || 0),
          conversions: parseInt(item.conversions || 0), actions, action_values: actionValues, purchase_roas: purchaseRoas,
          conversions_by_type: conversionsByType, values_by_type: valuesByType, roas_by_type: roasByType,
          cost_per_action_type: item.cost_per_action_type || [], video_views: item.video_p25_watched_actions || []
        };

        rowsToInsert.push({
          client_id: clientId, meta_ad_id: item.ad_id, ad_name: item.ad_name, creative_id: creativeId,
          campaign_id: item.campaign_id, adset_id: item.adset_id, metrics_json: JSON.stringify(metrics),
          date_start: startDate, date_stop: endDate
        });
        syncResults.push({ id: item.ad_id, name: item.ad_name });
      }

      if (rowsToInsert.length > 0) {
        await supabase.from('ad_performance').upsert(rowsToInsert, { onConflict: 'meta_ad_id,date_start,date_stop' });
      }

      res.json({ success: true, count: syncResults.length });
    } catch (error) {
      handleMetaError(error, res);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Supabase Server running on http://localhost:${PORT}`);
  });
}

startServer();
