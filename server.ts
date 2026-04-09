import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("creatives.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    industry TEXT,
    ad_account_id TEXT,
    landing_page_url TEXT,
    primary_conversion_event TEXT DEFAULT 'conversions',
    business_type TEXT DEFAULT 'ecommerce',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS copy_creatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    type TEXT CHECK(type IN ('headline', 'description', 'primary_text')),
    content TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    dna_json TEXT,
    group_id INTEGER,
    FOREIGN KEY(client_id) REFERENCES clients(id),
    FOREIGN KEY(group_id) REFERENCES copy_groups(id)
  );

  CREATE TABLE IF NOT EXISTS copy_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS image_creatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    detected_text TEXT,
    detected_cta TEXT,
    visual_type TEXT,
    creative_id TEXT,
    dna_json TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS image_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER,
    ratio TEXT NOT NULL,
    url TEXT NOT NULL,
    FOREIGN KEY(image_id) REFERENCES image_creatives(id)
  );

  CREATE TABLE IF NOT EXISTS meta_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    ad_account_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ad_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    meta_ad_id TEXT,
    ad_name TEXT,
    creative_id TEXT,
    campaign_id TEXT,
    adset_id TEXT,
    metrics_json TEXT,
    date_start TEXT,
    date_stop TEXT,
    date_fetched DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meta_ad_id, date_start, date_stop),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS column_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    columns_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS client_conversion_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    event_key TEXT NOT NULL,
    display_name TEXT,
    is_active INTEGER DEFAULT 1,
    importance INTEGER DEFAULT 5,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS creative_dna (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_ad_id TEXT UNIQUE,
    visual_style TEXT,
    primary_subject TEXT,
    people_present INTEGER,
    age_group_estimate TEXT,
    facial_expression TEXT,
    text_overlay_present INTEGER,
    visual_text_content TEXT,
    cta_button_present INTEGER,
    cta_button_text TEXT,
    cta_button_color TEXT,
    primary_color TEXT,
    background_color TEXT,
    layout_type TEXT,
    text_density TEXT,
    graphic_elements_json TEXT,
    visual_complexity_score INTEGER,
    headline_text TEXT,
    headline_length INTEGER,
    headline_structure TEXT,
    primary_text_length INTEGER,
    copy_structure TEXT,
    emotional_trigger TEXT,
    offer_type TEXT,
    cta_language TEXT,
    copy_complexity_score INTEGER,
    psychological_triggers_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kpi_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER UNIQUE,
    primary_kpi TEXT NOT NULL,
    secondary_kpi TEXT,
    guardrail_kpis TEXT, -- JSON array
    conversion_events TEXT, -- JSON array
    attribution_window TEXT,
    reporting_level TEXT DEFAULT 'ad',
    confidence_threshold REAL DEFAULT 90,
    min_sample_size INTEGER DEFAULT 1000,
    weights TEXT, -- JSON object
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS ad_breakdowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    meta_ad_id TEXT,
    breakdown_type TEXT, -- 'platform', 'placement', 'device', 'age', 'gender', 'region'
    breakdown_value TEXT,
    metrics_json TEXT,
    date_start TEXT,
    date_stop TEXT,
    UNIQUE(meta_ad_id, breakdown_type, breakdown_value, date_start, date_stop),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  -- Expand creative_dna with more granular fields
  -- We'll use a migration-style check later, but for now, let's ensure the table has these if possible.
  -- Since we can't easily ALTER in a single block without knowing existing state perfectly, 
  -- I'll add a new table for the expanded DNA to avoid conflicts if the user already has data.
  CREATE TABLE IF NOT EXISTS creative_dna_advanced (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_ad_id TEXT UNIQUE,
    campaign_id TEXT,
    adset_id TEXT,
    creative_id TEXT,
    
    -- Visual DNA
    visual_type TEXT, -- image, video, carousel
    visual_style TEXT, -- lifestyle, product, vector, infographic, testimonial, UGC
    objects_present_json TEXT,
    people_present INTEGER,
    age_group_estimate TEXT,
    gender_presentation TEXT,
    facial_expression TEXT,
    product_presence INTEGER,
    logo_presence INTEGER,
    text_overlay_present INTEGER,
    text_overlay_density TEXT,
    text_overlay_positioning TEXT,
    in_graphic_cta_present INTEGER,
    in_graphic_cta_text TEXT,
    in_graphic_cta_color TEXT,
    button_shape TEXT,
    dominant_colors_json TEXT,
    color_palette TEXT,
    background_style TEXT,
    contrast_level TEXT,
    layout_structure TEXT,
    camera_framing TEXT,
    visual_complexity_score INTEGER,

    -- Copy DNA (JSON blobs for Primary, Headline, Description)
    primary_text_dna_json TEXT,
    headline_dna_json TEXT,
    description_dna_json TEXT,

    -- AI Analysis Additions
    emotional_triggers TEXT, -- JSON array
    copy_hook_type TEXT,
    copy_length_category TEXT,
    pacing_style TEXT,
    detected_objects TEXT, -- JSON array
    brand_presence_score INTEGER,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS performance_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    date_range_start TEXT,
    date_range_end TEXT,
    report_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );
`);

// --- Reports Routes ---

// Migration: Add missing columns if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(image_creatives)").all();
const columns = tableInfo.map((col: any) => col.name);

const clientTableInfo = db.prepare("PRAGMA table_info(clients)").all();
const clientColumns = clientTableInfo.map((col: any) => col.name);

if (!clientColumns.includes('ad_account_id')) {
  db.exec("ALTER TABLE clients ADD COLUMN ad_account_id TEXT");
}
if (!clientColumns.includes('campaign_id')) {
  db.exec("ALTER TABLE clients ADD COLUMN campaign_id TEXT");
}
if (!clientColumns.includes('campaign_goal')) {
  db.exec("ALTER TABLE clients ADD COLUMN campaign_goal TEXT");
}
if (!clientColumns.includes('brand_colors')) {
  db.exec("ALTER TABLE clients ADD COLUMN brand_colors TEXT");
}
if (!clientColumns.includes('logo_url')) {
  db.exec("ALTER TABLE clients ADD COLUMN logo_url TEXT");
}
if (!clientColumns.includes('font_style')) {
  db.exec("ALTER TABLE clients ADD COLUMN font_style TEXT");
}
if (!clientColumns.includes('main_cta')) {
  db.exec("ALTER TABLE clients ADD COLUMN main_cta TEXT");
}
if (!clientColumns.includes('target_audience')) {
  db.exec("ALTER TABLE clients ADD COLUMN target_audience TEXT");
}
if (!clientColumns.includes('tone_of_voice')) {
  db.exec("ALTER TABLE clients ADD COLUMN tone_of_voice TEXT");
}
if (!clientColumns.includes('usp')) {
  db.exec("ALTER TABLE clients ADD COLUMN usp TEXT");
}
if (!clientColumns.includes('landing_page_url')) {
  db.exec("ALTER TABLE clients ADD COLUMN landing_page_url TEXT");
}
if (!clientColumns.includes('business_type')) {
  db.exec("ALTER TABLE clients ADD COLUMN business_type TEXT DEFAULT 'ecommerce'");
}
if (!clientColumns.includes('primary_conversion_event')) {
  db.exec("ALTER TABLE clients ADD COLUMN primary_conversion_event TEXT DEFAULT 'conversions'");
}

const kpiTableInfo = db.prepare("PRAGMA table_info(kpi_settings)").all();
const kpiColumns = kpiTableInfo.map((col: any) => col.name);
if (!kpiColumns.includes('metric_mappings')) {
  db.exec("ALTER TABLE kpi_settings ADD COLUMN metric_mappings TEXT");
}
if (!kpiColumns.includes('custom_labels')) {
  db.exec("ALTER TABLE kpi_settings ADD COLUMN custom_labels TEXT");
}

if (!columns.includes('detected_text')) {
  db.exec("ALTER TABLE image_creatives ADD COLUMN detected_text TEXT");
}
if (!columns.includes('detected_cta')) {
  db.exec("ALTER TABLE image_creatives ADD COLUMN detected_cta TEXT");
}
if (!columns.includes('visual_type')) {
  db.exec("ALTER TABLE image_creatives ADD COLUMN visual_type TEXT");
}
if (!columns.includes('creative_id')) {
  db.exec("ALTER TABLE image_creatives ADD COLUMN creative_id TEXT");
}
if (!columns.includes('dna_json')) {
  db.exec("ALTER TABLE image_creatives ADD COLUMN dna_json TEXT");
}

// Migration for creative_dna_advanced
const dnaAdvancedInfo = db.prepare("PRAGMA table_info(creative_dna_advanced)").all();
const dnaAdvancedColumns = dnaAdvancedInfo.map((col: any) => col.name);

const requiredDnaColumns = [
  'campaign_id', 'adset_id', 'creative_id', 'visual_type', 'visual_style', 
  'objects_present_json', 'people_present', 'age_group_estimate', 
  'gender_presentation', 'facial_expression', 'product_presence', 
  'logo_presence', 'text_overlay_present', 'text_overlay_density', 
  'text_overlay_positioning', 'in_graphic_cta_present', 'in_graphic_cta_text', 
  'in_graphic_cta_color', 'button_shape', 'dominant_colors_json', 
  'color_palette', 'background_style', 'contrast_level', 'layout_structure', 
  'camera_framing', 'visual_complexity_score', 'primary_text_dna_json', 
  'headline_dna_json', 'description_dna_json',
  'emotional_triggers', 'copy_hook_type', 'copy_length_category', 
  'pacing_style', 'detected_objects', 'brand_presence_score'
];

requiredDnaColumns.forEach(col => {
  if (!dnaAdvancedColumns.includes(col)) {
    try {
      console.log(`Migrating creative_dna_advanced: Adding column ${col}`);
      db.exec(`ALTER TABLE creative_dna_advanced ADD COLUMN ${col} TEXT`);
    } catch (e) {
      console.error(`Error adding ${col} to creative_dna_advanced:`, e);
    }
  }
});

// Ensure emotional_triggers is present specifically if previous migration failed
if (!dnaAdvancedColumns.includes('emotional_triggers')) {
  try {
    db.exec("ALTER TABLE creative_dna_advanced ADD COLUMN emotional_triggers TEXT");
  } catch (e) {}
}

const copyTableInfo = db.prepare("PRAGMA table_info(copy_creatives)").all();
const copyColumns = copyTableInfo.map((col: any) => col.name);
if (!copyColumns.includes('dna_json')) {
  db.exec("ALTER TABLE copy_creatives ADD COLUMN dna_json TEXT");
}
if (!copyColumns.includes('group_id')) {
  db.exec("ALTER TABLE copy_creatives ADD COLUMN group_id INTEGER");
}

const perfTableInfo = db.prepare("PRAGMA table_info(ad_performance)").all();
const perfColumns = perfTableInfo.map((col: any) => col.name);

if (!perfColumns.includes('client_id')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN client_id INTEGER");
}

if (!perfColumns.includes('meta_ad_id')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN meta_ad_id TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_performance_meta_id ON ad_performance(meta_ad_id)");

if (!perfColumns.includes('ad_name')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN ad_name TEXT");
}

if (!perfColumns.includes('creative_id')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN creative_id TEXT");
}

if (!perfColumns.includes('campaign_id')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN campaign_id TEXT");
}

if (!perfColumns.includes('adset_id')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN adset_id TEXT");
}

if (!perfColumns.includes('metrics_json')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN metrics_json TEXT");
}

if (!perfColumns.includes('date_start')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN date_start TEXT");
}

if (!perfColumns.includes('date_stop')) {
  db.exec("ALTER TABLE ad_performance ADD COLUMN date_stop TEXT");
}

const breakdownTableInfo = db.prepare("PRAGMA table_info(ad_breakdowns)").all();
const breakdownColumns = breakdownTableInfo.map((col: any) => col.name);
if (!breakdownColumns.includes('client_id')) {
  db.exec("ALTER TABLE ad_breakdowns ADD COLUMN client_id INTEGER");
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Helper for Meta API errors
  const handleMetaError = (error: any, res: express.Response) => {
    const metaError = error.response?.data?.error;
    if (metaError) {
      const subcode = metaError.error_subcode;
      // Handle expired or invalidated sessions specifically
      const isAuthError = 
        metaError.code === 190 || 
        [458, 459, 460, 463, 467].includes(subcode);

      if (isAuthError) {
        // Clear the invalid token from the database
        db.prepare("UPDATE meta_settings SET access_token = NULL WHERE id = 1").run();
        
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

  // API Routes
  app.get("/api/clients/:clientId/reports", (req, res) => {
    const reports = db.prepare("SELECT * FROM performance_reports WHERE client_id = ? ORDER BY created_at DESC").all(req.params.clientId);
    res.json(reports);
  });

  app.post("/api/reports", (req, res) => {
    const { client_id, date_range_start, date_range_end, report_json } = req.body;
    const info = db.prepare(`
      INSERT INTO performance_reports (client_id, date_range_start, date_range_end, report_json)
      VALUES (?, ?, ?, ?)
    `).run(client_id, date_range_start, date_range_end, report_json);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/reports/:id", (req, res) => {
    db.prepare("DELETE FROM performance_reports WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/clients", (req, res) => {
    const clients = db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
    res.json(clients);
  });

  app.post("/api/clients", (req, res) => {
    const { name, industry, ad_account_id, landing_page_url, business_type } = req.body;
    const result = db.prepare("INSERT INTO clients (name, industry, ad_account_id, landing_page_url, business_type) VALUES (?, ?, ?, ?, ?)").run(name, industry, ad_account_id, landing_page_url, business_type || 'ecommerce');
    res.json({ id: result.lastInsertRowid, name, industry, ad_account_id, landing_page_url, business_type: business_type || 'ecommerce' });
  });

  app.patch("/api/clients/:id", (req, res) => {
    const { 
      name, industry, ad_account_id, campaign_id, campaign_goal, 
      brand_colors, logo_url, font_style, main_cta, 
      target_audience, tone_of_voice, usp, landing_page_url,
      business_type
    } = req.body;
    
    db.prepare(`
      UPDATE clients SET 
        name = COALESCE(?, name),
        industry = COALESCE(?, industry),
        ad_account_id = COALESCE(?, ad_account_id),
        campaign_id = COALESCE(?, campaign_id),
        campaign_goal = COALESCE(?, campaign_goal),
        brand_colors = COALESCE(?, brand_colors),
        logo_url = COALESCE(?, logo_url),
        font_style = COALESCE(?, font_style),
        main_cta = COALESCE(?, main_cta),
        target_audience = COALESCE(?, target_audience),
        tone_of_voice = COALESCE(?, tone_of_voice),
        usp = COALESCE(?, usp),
        landing_page_url = COALESCE(?, landing_page_url),
        business_type = COALESCE(?, business_type)
      WHERE id = ?
    `).run(
      name, industry, ad_account_id, campaign_id, campaign_goal, 
      brand_colors, logo_url, font_style, main_cta, 
      target_audience, tone_of_voice, usp, landing_page_url,
      business_type,
      req.params.id
    );
    
    res.json({ success: true });
  });

  app.get("/api/clients/:id/overview", (req, res) => {
    const { id } = req.params;
    const { startDate, endDate, campaignIds, adsetIds, adIds } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }

    const kpiSettings = db.prepare("SELECT * FROM kpi_settings WHERE client_id = ?").get(id) as any;
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
    
    const getMetrics = (startStr: string, endStr: string) => {
      let query = `
        SELECT metrics_json, date_start, ad_name, meta_ad_id, campaign_id, adset_id
        FROM ad_performance 
        WHERE client_id = ? AND date_start >= ? AND date_stop <= ?
      `;
      const params: any[] = [id, startStr, endStr];
      
      if (campaignIds && campaignIds !== '') {
        const ids = (campaignIds as string).split(',');
        query += ` AND campaign_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
      if (adsetIds && adsetIds !== '') {
        const ids = (adsetIds as string).split(',');
        query += ` AND adset_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
      if (adIds && adIds !== '') {
        const ids = (adIds as string).split(',');
        query += ` AND meta_ad_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
      
      const rows = db.prepare(query).all(...params);
      
      const aggregated: any = {
        spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0,
        daily: {}
      };
      
      const entityPerformance: any = {
        campaigns: {},
        adsets: {},
        ads: {}
      };

      const mappings = kpiSettings?.metric_mappings ? JSON.parse(kpiSettings.metric_mappings) : null;
      
      rows.forEach((row: any) => {
        const metrics = JSON.parse(row.metrics_json);
        
        if (metrics.conversions > 0 || metrics.revenue > 0) {
          console.log(`Debug Metrics for ad ${row.meta_ad_id}:`, {
            conversions: metrics.conversions,
            revenue: metrics.revenue,
            conversions_by_type: metrics.conversions_by_type ? Object.keys(metrics.conversions_by_type) : 'none',
            values_by_type: metrics.values_by_type ? Object.keys(metrics.values_by_type) : 'none'
          });
        }

        // Smart Mapping Logic: If explicit mapping is missing, try to find the "best" event
        const findSmartEvent = (typeMap: any, keywords: string[]) => {
          if (!typeMap) return 0;
          const keys = Object.keys(typeMap);
          if (keys.length === 0) return 0;

          // 1. Try to find keys that match keywords and have non-zero values
          const candidates = keys.filter(k => 
            keywords.some(kw => k.toLowerCase().includes(kw)) && (typeMap[k] > 0)
          );

          if (candidates.length > 0) {
            // If we found candidates, sum them up (or pick the best one, but summing is safer for "total")
            return candidates.reduce((sum, k) => sum + typeMap[k], 0);
          }

          // 2. If no keyword matches, but there's only one event with data, pick it
          const nonZeroKeys = keys.filter(k => typeMap[k] > 0);
          if (nonZeroKeys.length === 1) {
            return typeMap[nonZeroKeys[0]];
          }

          return 0;
        };

        let rowConversions = 0;
        let rowRevenue = 0;

        if (mappings && mappings.conversions && mappings.conversions.length > 0) {
          rowConversions = mappings.conversions.reduce((sum: number, type: string) => 
            sum + (metrics.conversions_by_type?.[type] || 0), 0);
        } else {
          // Smart fallback for conversions
          rowConversions = findSmartEvent(metrics.conversions_by_type, ['purchase', 'lead', 'complete_registration', 'conversion']);
          if (rowConversions === 0) rowConversions = metrics.conversions || 0;
        }

        if (mappings && mappings.revenue && mappings.revenue.length > 0) {
          rowRevenue = mappings.revenue.reduce((sum: number, type: string) => 
            sum + (metrics.values_by_type?.[type] || 0), 0);
        } else {
          // Smart fallback for revenue
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

        // Entity tracking
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
    
    const currentData = getMetrics(currentStartStr, currentEndStr);
    const previousData = getMetrics(prevStartStr, prevEndStr);
    
    res.json({
      current: currentData.aggregated,
      previous: previousData.aggregated,
      currentEntities: currentData.entityPerformance,
      previousEntities: previousData.entityPerformance,
      primaryKpi,
      dateRange: { start: currentStartStr, end: currentEndStr },
      prevDateRange: { start: prevStartStr, end: prevEndStr }
    });
  });

  app.post("/api/creatives/dna", (req, res) => {
    const dna = req.body;
    const {
      meta_ad_id, campaign_id, adset_id, creative_id,
      visual_type, visual_style, objects_present, people_present,
      age_group_estimate, gender_presentation, facial_expression,
      product_presence, logo_presence, text_overlay_present,
      text_overlay_density, text_overlay_positioning,
      in_graphic_cta_present, in_graphic_cta_text, in_graphic_cta_color,
      button_shape, dominant_colors, color_palette, background_style,
      contrast_level, layout_structure, camera_framing, visual_complexity_score,
      primary_text_dna, headline_dna, description_dna
    } = dna;

    db.prepare(`
      INSERT OR REPLACE INTO creative_dna_advanced (
        meta_ad_id, campaign_id, adset_id, creative_id,
        visual_type, visual_style, objects_present_json, people_present,
        age_group_estimate, gender_presentation, facial_expression,
        product_presence, logo_presence, text_overlay_present,
        text_overlay_density, text_overlay_positioning,
        in_graphic_cta_present, in_graphic_cta_text, in_graphic_cta_color,
        button_shape, dominant_colors_json, color_palette, background_style,
        contrast_level, layout_structure, camera_framing, visual_complexity_score,
        primary_text_dna_json, headline_dna_json, description_dna_json,
        emotional_triggers, copy_hook_type, copy_length_category, 
        pacing_style, detected_objects, brand_presence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta_ad_id, campaign_id, adset_id, creative_id,
      visual_type, visual_style, JSON.stringify(objects_present || []), people_present ? 1 : 0,
      age_group_estimate, gender_presentation, facial_expression,
      product_presence ? 1 : 0, logo_presence ? 1 : 0, text_overlay_present ? 1 : 0,
      text_overlay_density, text_overlay_positioning,
      in_graphic_cta_present ? 1 : 0, in_graphic_cta_text, in_graphic_cta_color,
      button_shape, JSON.stringify(dominant_colors || []), color_palette, background_style,
      contrast_level, layout_structure, camera_framing, visual_complexity_score,
      JSON.stringify(primary_text_dna || {}), JSON.stringify(headline_dna || {}), JSON.stringify(description_dna || {}),
      JSON.stringify(dna.emotional_triggers || []), dna.copy_hook_type, dna.copy_length_category,
      dna.pacing_style, JSON.stringify(dna.detected_objects || []), dna.brand_presence_score
    );

    res.json({ success: true });
  });

  app.get("/api/clients/:clientId/intelligence", (req, res) => {
    const { clientId } = req.params;
    
    const data = db.prepare(`
      SELECT 
        ap.metrics_json, 
        dna.*
      FROM ad_performance ap
      JOIN creative_dna_advanced dna ON ap.meta_ad_id = dna.meta_ad_id
      WHERE ap.client_id = ?
    `).all(clientId) as any[];

    if (data.length === 0) {
      return res.json({ insights: [] });
    }

    const insights: any[] = [];
    
    const analyzeTrait = (traitName: string, category: 'visual' | 'headline' | 'primary_text') => {
      const traitGroups: Record<string, { spend: number, conversions: number, clicks: number, impressions: number, revenue: number, count: number }> = {};
      
      data.forEach(row => {
        const traitValue = row[traitName];
        if (traitValue === null || traitValue === undefined) return;
        
        const metrics = JSON.parse(row.metrics_json);
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

  app.get("/api/clients/:id/creatives", (req, res) => {
    const clientId = req.params.id;
    const copy = db.prepare("SELECT * FROM copy_creatives WHERE client_id = ?").all(clientId);
    const images = db.prepare("SELECT * FROM image_creatives WHERE client_id = ?").all(clientId);
    
    const imagesWithVariants = images.map((img: any) => {
      const variants = db.prepare("SELECT * FROM image_variants WHERE image_id = ?").all(img.id);
      return { ...img, variants };
    });

    res.json({ copy, images: imagesWithVariants });
  });

  app.get("/api/clients/:id/copy-groups", (req, res) => {
    const groups = db.prepare("SELECT * FROM copy_groups WHERE client_id = ?").all(req.params.id);
    res.json(groups);
  });

  app.post("/api/clients/:id/copy-groups", (req, res) => {
    const { name, description, color } = req.body;
    const result = db.prepare("INSERT INTO copy_groups (client_id, name, description, color) VALUES (?, ?, ?, ?)").run(req.params.id, name, description, color);
    res.json({ id: result.lastInsertRowid, client_id: req.params.id, name, description, color });
  });

  app.patch("/api/copy-groups/:id", (req, res) => {
    const { name, description, color } = req.body;
    db.prepare("UPDATE copy_groups SET name = ?, description = ?, color = ? WHERE id = ?").run(name, description, color, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/copy-groups/:id", (req, res) => {
    db.prepare("UPDATE copy_creatives SET group_id = NULL WHERE group_id = ?").run(req.params.id);
    db.prepare("DELETE FROM copy_groups WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/creatives/copy/:id/group", (req, res) => {
    const { group_id } = req.body;
    db.prepare("UPDATE copy_creatives SET group_id = ? WHERE id = ?").run(group_id, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/creatives/copy", (req, res) => {
    const { client_id, type, content, dna_json, group_id } = req.body;
    const result = db.prepare("INSERT INTO copy_creatives (client_id, type, content, dna_json, group_id) VALUES (?, ?, ?, ?, ?)").run(client_id, type, content, dna_json, group_id);
    res.json({ id: result.lastInsertRowid, client_id, type, content, status: 'draft', dna_json, group_id });
  });

  app.patch("/api/creatives/copy/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE copy_creatives SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/creatives/image", (req, res) => {
    const { client_id, name, variants, detected_text, detected_cta, visual_type, creative_id, dna_json } = req.body; // variants: [{ratio, url}]
    const result = db.prepare("INSERT INTO image_creatives (client_id, name, detected_text, detected_cta, visual_type, creative_id, dna_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(client_id, name, detected_text, detected_cta, visual_type, creative_id, dna_json);
    const imageId = result.lastInsertRowid;

    const stmt = db.prepare("INSERT INTO image_variants (image_id, ratio, url) VALUES (?, ?, ?)");
    for (const v of variants) {
      stmt.run(imageId, v.ratio, v.url);
    }

    res.json({ id: imageId, name, variants });
  });

  app.patch("/api/creatives/image/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE image_creatives SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/creatives/image-variant/:id", (req, res) => {
    const { url } = req.body;
    db.prepare("UPDATE image_variants SET url = ? WHERE id = ?").run(url, req.params.id);
    res.json({ success: true });
  });

  // Meta Ads API Integration
  app.post("/api/auth/meta/reset", (req, res) => {
    db.prepare("UPDATE meta_settings SET access_token = NULL WHERE id = 1").run();
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
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code
        }
      });

      const { access_token } = response.data;
      db.prepare("INSERT INTO meta_settings (id, access_token) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token").run(access_token);
      
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'META_AUTH_SUCCESS' }, '*');
              window.close();
            </script>
            <p>Meta connected successfully! You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Meta Auth Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/meta/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    res.json(settings || { access_token: null, ad_account_id: process.env.META_AD_ACCOUNT_ID });
  });

  // KPI Settings Routes
  app.get("/api/clients/:clientId/kpi-settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM kpi_settings WHERE client_id = ?").get(req.params.clientId) as any;
      if (settings) {
        res.json({
          ...settings,
          guardrail_kpis: JSON.parse(settings.guardrail_kpis || '[]'),
          conversion_events: JSON.parse(settings.conversion_events || '[]'),
          weights: JSON.parse(settings.weights || '{}'),
          metric_mappings: JSON.parse(settings.metric_mappings || 'null'),
          custom_labels: JSON.parse(settings.custom_labels || 'null')
        });
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch KPI settings" });
    }
  });

  app.post("/api/clients/:clientId/kpi-settings", (req, res) => {
    const { 
      primary_kpi, 
      secondary_kpi, 
      guardrail_kpis, 
      conversion_events, 
      attribution_window, 
      reporting_level, 
      confidence_threshold, 
      min_sample_size, 
      weights,
      metric_mappings,
      custom_labels
    } = req.body;

    try {
      db.prepare(`
        INSERT OR REPLACE INTO kpi_settings 
        (client_id, primary_kpi, secondary_kpi, guardrail_kpis, conversion_events, attribution_window, reporting_level, confidence_threshold, min_sample_size, weights, metric_mappings, custom_labels) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.params.clientId,
        primary_kpi,
        secondary_kpi,
        JSON.stringify(guardrail_kpis),
        JSON.stringify(conversion_events),
        attribution_window,
        reporting_level,
        confidence_threshold,
        min_sample_size,
        JSON.stringify(weights),
        JSON.stringify(metric_mappings),
        JSON.stringify(custom_labels)
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Save KPI Error:", err);
      res.status(500).json({ error: "Failed to save KPI settings" });
    }
  });

  // Breakdown Sync Route
  app.post("/api/clients/:clientId/sync-breakdowns", async (req, res) => {
    const { clientId } = req.params;
    const { date_preset = 'last_30d' } = req.body;

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId) as any;
    const metaSettings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;

    if (!client || !metaSettings || !metaSettings.access_token) {
      return res.status(400).json({ error: "Meta not connected or client not found" });
    }

    const adAccountId = client.ad_account_id || metaSettings.ad_account_id;
    const accessToken = metaSettings.access_token;

    // Sanitize adAccountId: remove 'act_' prefix if it exists to avoid act_act_...
    const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');

    try {
      // 1. Fetch insights for the ad account with breakdowns
      const breakdowns = ['publisher_platform', 'platform_position', 'device_platform', 'age', 'gender'];
      
      for (const breakdown of breakdowns) {
        const insightsRes = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/insights`, {
          params: {
            access_token: accessToken,
            breakdowns: breakdown,
            date_preset,
            fields: 'spend,impressions,clicks,actions,conversions,purchase_roas',
            level: 'ad',
            limit: 1000
          }
        });

        const data = insightsRes.data.data;
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO ad_breakdowns 
          (client_id, meta_ad_id, breakdown_type, breakdown_value, metrics_json, date_start, date_stop) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of data) {
          stmt.run(
            clientId,
            row.ad_id,
            breakdown,
            row[breakdown],
            JSON.stringify(row),
            row.date_start,
            row.date_stop
          );
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Breakdown Sync Error:", error.response?.data || error.message);
      if (error.response?.data?.error?.type === 'OAuthException') {
        db.prepare("UPDATE meta_settings SET access_token = NULL WHERE id = 1").run();
        res.status(401).json({ error: "Meta authentication expired. Please reconnect your account." });
      } else {
        res.status(500).json({ error: "Failed to sync breakdowns" });
      }
    }
  });

  app.get("/api/clients/:clientId/breakdowns", (req, res) => {
    const { clientId } = req.params;
    const { startDate, endDate, campaignIds, adsetIds } = req.query;
    
    try {
      let query = `
        SELECT b.* 
        FROM ad_breakdowns b
        JOIN ad_performance p ON b.meta_ad_id = p.meta_ad_id AND b.date_start = p.date_start AND b.date_stop = p.date_stop
        WHERE b.client_id = ?
      `;
      const params: any[] = [clientId];
      
      if (startDate && endDate) {
        query += " AND b.date_start >= ? AND b.date_stop <= ?";
        params.push(startDate, endDate);
      }
      
      if (campaignIds) {
        const ids = (campaignIds as string).split(',');
        query += ` AND p.campaign_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
      
      if (adsetIds) {
        const ids = (adsetIds as string).split(',');
        query += ` AND p.adset_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
      
      const breakdowns = db.prepare(query).all(...params);
      
      res.json(breakdowns.map((b: any) => ({
        ...b,
        metrics: JSON.parse(b.metrics_json || '{}')
      })));
    } catch (err) {
      console.error("Fetch Breakdowns Error:", err);
      res.status(500).json({ error: "Failed to fetch breakdowns" });
    }
  });

  app.get("/api/meta/campaigns", async (req, res) => {
    const { clientId, status } = req.query;
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (clientId) {
        const client = db.prepare("SELECT ad_account_id FROM clients WHERE id = ?").get(clientId) as any;
        if (client && client.ad_account_id) {
          adAccountId = client.ad_account_id;
        }
      }

      if (!adAccountId || adAccountId === 'undefined' || adAccountId === 'null') {
        return res.status(400).json({ error: "No Ad Account ID found" });
      }

      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');

      const params: any = {
        access_token: settings.access_token,
        fields: "id,name,objective,status,effective_status",
        limit: 100
      };

      if (status && status !== 'ALL') {
        params.filtering = JSON.stringify([{ field: "effective_status", operator: "IN", value: [status] }]);
      }

      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/campaigns`, {
        params
      });

      res.json(response.data.data);
    } catch (error: any) {
      console.error("Meta Campaigns Error:", error.response?.data || error.message);
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/adsets", async (req, res) => {
    const { clientId, campaignIds, status } = req.query;
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      if (clientId) {
        const client = db.prepare("SELECT ad_account_id FROM clients WHERE id = ?").get(clientId) as any;
        if (client && client.ad_account_id) {
          adAccountId = client.ad_account_id;
        }
      }

      if (!adAccountId || adAccountId === 'undefined' || adAccountId === 'null') {
        return res.status(400).json({ error: "No Ad Account ID found" });
      }

      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');

      const params: any = {
        access_token: settings.access_token,
        fields: "id,name,status,effective_status,campaign_id",
        limit: 100
      };

      const filtering = [];
      if (status && status !== 'ALL') {
        filtering.push({ field: "effective_status", operator: "IN", value: [status] });
      }
      if (campaignIds) {
        const ids = (campaignIds as string).split(',');
        filtering.push({ field: "campaign.id", operator: "IN", value: ids });
      }

      if (filtering.length > 0) {
        params.filtering = JSON.stringify(filtering);
      }

      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/adsets`, {
        params
      });

      res.json(response.data.data);
    } catch (error: any) {
      console.error("Meta Adsets Error:", error.response?.data || error.message);
      handleMetaError(error, res);
    }
  });

  app.post("/api/meta/settings", (req, res) => {
    const { ad_account_id, clientId } = req.body;
    if (clientId) {
      db.prepare("UPDATE clients SET ad_account_id = ? WHERE id = ?").run(ad_account_id, clientId);
    }
    db.prepare("INSERT INTO meta_settings (id, ad_account_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET ad_account_id = excluded.ad_account_id").run(ad_account_id);
    res.json({ success: true });
  });

  app.get("/api/meta/performance", (req, res) => {
    const { startDate, endDate, clientId, campaignIds, adsetIds } = req.query;
    let query = "SELECT * FROM ad_performance";
    const params = [];
    const conditions = [];
    if (startDate && endDate) {
      conditions.push("date_start = ? AND date_stop = ?");
      params.push(startDate, endDate);
    }
    if (clientId) {
      conditions.push("client_id = ?");
      params.push(clientId);
    }
    if (campaignIds) {
      const ids = (campaignIds as string).split(',');
      conditions.push(`campaign_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    if (adsetIds) {
      const ids = (adsetIds as string).split(',');
      conditions.push(`adset_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += " ORDER BY date_fetched DESC";
    const performance = db.prepare(query).all(...params);
    res.json(performance);
  });

  app.get("/api/meta/creative-dna", (req, res) => {
    const { metaAdId } = req.query;
    if (metaAdId) {
      const dna = db.prepare("SELECT * FROM creative_dna WHERE meta_ad_id = ?").get(metaAdId);
      return res.json(dna || null);
    }
    const allDna = db.prepare("SELECT * FROM creative_dna").all();
    res.json(allDna);
  });

  app.post("/api/meta/creative-dna-advanced", (req, res) => {
    const { meta_ad_id, visual_style, color_palette, emotional_triggers, copy_hook_type, copy_length_category, pacing_style, detected_objects, brand_presence_score } = req.body;
    try {
      db.prepare(`
        INSERT INTO creative_dna_advanced (
          meta_ad_id, visual_style, color_palette, emotional_triggers, 
          copy_hook_type, copy_length_category, pacing_style, 
          detected_objects, brand_presence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(meta_ad_id) DO UPDATE SET
          visual_style = excluded.visual_style,
          color_palette = excluded.color_palette,
          emotional_triggers = excluded.emotional_triggers,
          copy_hook_type = excluded.copy_hook_type,
          copy_length_category = excluded.copy_length_category,
          pacing_style = excluded.pacing_style,
          detected_objects = excluded.detected_objects,
          brand_presence_score = excluded.brand_presence_score
      `).run(
        meta_ad_id, visual_style, color_palette, 
        JSON.stringify(emotional_triggers), copy_hook_type, 
        copy_length_category, pacing_style, 
        JSON.stringify(detected_objects), brand_presence_score
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Save Advanced DNA Error:", err);
      res.status(500).json({ error: "Failed to save advanced DNA" });
    }
  });

  app.post("/api/meta/creative-dna", (req, res) => {
    const dna = req.body;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO creative_dna (
        meta_ad_id, visual_style, primary_subject, people_present, age_group_estimate,
        facial_expression, text_overlay_present, visual_text_content, cta_button_present,
        cta_button_text, cta_button_color, primary_color, background_color, layout_type,
        text_density, graphic_elements_json, visual_complexity_score, headline_text,
        headline_length, headline_structure, primary_text_length, copy_structure,
        emotional_trigger, offer_type, cta_language, copy_complexity_score,
        psychological_triggers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      dna.meta_ad_id, dna.visual_style, dna.primary_subject, dna.people_present ? 1 : 0, dna.age_group_estimate,
      dna.facial_expression, dna.text_overlay_present ? 1 : 0, dna.visual_text_content, dna.cta_button_present ? 1 : 0,
      dna.cta_button_text, dna.cta_button_color, dna.primary_color, dna.background_color, dna.layout_type,
      dna.text_density, dna.graphic_elements_json, dna.visual_complexity_score, dna.headline_text,
      dna.headline_length, dna.headline_structure, dna.primary_text_length, dna.copy_structure,
      dna.emotional_trigger, dna.offer_type, dna.cta_language, dna.copy_complexity_score,
      dna.psychological_triggers_json
    );
    
    res.json({ success: true });
  });

  app.get("/api/meta/ad-creative-details", async (req, res) => {
    const { adId } = req.query;
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }

    try {
      // 1. Get ad details to find creative ID
      const adResponse = await axios.get(`https://graph.facebook.com/v18.0/${adId}`, {
        params: {
          access_token: settings.access_token,
          fields: "creative,name"
        }
      });
      
      const creativeId = adResponse.data.creative.id;
      
      // 2. Get creative details (image/video/copy)
      const creativeResponse = await axios.get(`https://graph.facebook.com/v18.0/${creativeId}`, {
        params: {
          access_token: settings.access_token,
          fields: "image_url,thumbnail_url,object_story_spec,title,body"
        }
      });
      
      const creative = creativeResponse.data;
      let imageUrl = creative.image_url || creative.thumbnail_url;
      let headline = creative.title || "";
      let primaryText = creative.body || "";
      let description = "";

      // Handle object_story_spec for more complex ads (carousels, etc.)
      if (creative.object_story_spec) {
        const spec = creative.object_story_spec;
        if (spec.link_data) {
          headline = spec.link_data.name || headline;
          primaryText = spec.link_data.message || primaryText;
          description = spec.link_data.description || "";
          imageUrl = spec.link_data.picture || imageUrl;
          
          // For carousels
          if (spec.link_data.child_attachments && spec.link_data.child_attachments.length > 0) {
            imageUrl = spec.link_data.child_attachments[0].picture || imageUrl;
          }
        } else if (spec.video_data) {
          primaryText = spec.video_data.message || primaryText;
          imageUrl = creative.thumbnail_url || imageUrl;
        }
      }

      res.json({
        adId,
        adName: adResponse.data.name,
        creativeId,
        imageUrl,
        headline,
        primaryText,
        description
      });
    } catch (error: any) {
      console.error("Meta Creative Details Error:", error.response?.data || error.message);
      handleMetaError(error, res);
    }
  });

  app.get("/api/column-presets", (req, res) => {
    const presets = db.prepare("SELECT * FROM column_presets").all();
    res.json(presets);
  });

  app.post("/api/column-presets", (req, res) => {
    const { name, columns } = req.body;
    const result = db.prepare("INSERT INTO column_presets (name, columns_json) VALUES (?, ?)").run(name, JSON.stringify(columns));
    res.json({ id: result.lastInsertRowid, name, columns });
  });

  app.get("/api/clients/:id/conversion-settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM client_conversion_settings WHERE client_id = ?").all(req.params.id);
    res.json(settings);
  });

  app.post("/api/clients/:id/conversion-settings", (req, res) => {
    const { meta_event_key, display_name, is_active, importance } = req.body;
    const result = db.prepare(`
      INSERT INTO client_conversion_settings (client_id, event_key, display_name, is_active, importance)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, meta_event_key, display_name, is_active ? 1 : 0, importance);
    res.json({ id: result.lastInsertRowid, event_key: meta_event_key, display_name, is_active, importance });
  });

  app.patch("/api/conversion-settings/:id", (req, res) => {
    const { display_name, is_active, importance } = req.body;
    db.prepare(`
      UPDATE client_conversion_settings 
      SET display_name = ?, is_active = ?, importance = ?
      WHERE id = ?
    `).run(display_name, is_active ? 1 : 0, importance, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/meta/permissions", async (req, res) => {
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/me/permissions`, {
        params: {
          access_token: settings.access_token
        }
      });
      res.json(response.data.data);
    } catch (error: any) {
      console.error("Meta Fetch Permissions Error:", error.response?.data || error.message);
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/ad-accounts", async (req, res) => {
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }

    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
        params: {
          access_token: settings.access_token,
          fields: "name,id,account_id,account_status"
        }
      });
      const sanitizedAccounts = response.data.data.map((a: any) => ({
        id: a.id || `act_${a.account_id}`,
        account_id: a.account_id || a.id?.replace('act_', ''),
        name: a.name || 'Unnamed Account',
        account_status: a.account_status
      }));
      res.json(sanitizedAccounts);
    } catch (error: any) {
      console.error("Meta Fetch Accounts Error:", error.response?.data || error.message);
      handleMetaError(error, res);
    }
  });

  app.get("/api/meta/raw-insights", async (req, res) => {
    const { ad_account_id, level, startDate, endDate } = req.query;
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;

    if (!settings?.access_token) {
      return res.status(401).json({ error: "Meta not connected" });
    }

    try {
      const sanitizedAdAccountId = String(ad_account_id).replace(/^act_/, '');
      let finalStartDate = startDate;
      let finalEndDate = endDate;
      if (startDate && endDate && new Date(String(startDate)) > new Date(String(endDate))) {
        finalStartDate = endDate;
        finalEndDate = startDate;
      }
      const timeRange = finalStartDate && finalEndDate ? JSON.stringify({ since: finalStartDate, until: finalEndDate }) : null;

      const response = await axios.get(`https://graph.facebook.com/v19.0/act_${sanitizedAdAccountId}/insights`, {
        params: {
          access_token: settings.access_token,
          level: level || 'ad',
          fields: "ad_id,ad_name,campaign_id,adset_id,spend,impressions,clicks,reach,actions,action_values,purchase_roas,conversions",
          time_range: timeRange,
          limit: 10
        }
      });

      res.json({
        raw: response.data,
        params: {
          ad_account_id,
          level: level || 'ad',
          time_range: timeRange
        }
      });
    } catch (error: any) {
      handleMetaError(error, res);
    }
  });

  app.post("/api/meta/sync", async (req, res) => {
    const { clientId, startDate, endDate } = req.body;
    const settings = db.prepare("SELECT * FROM meta_settings WHERE id = 1").get() as any;
    
    if (!settings || !settings.access_token) {
      return res.status(400).json({ error: "Meta not connected" });
    }

    try {
      let adAccountId = settings.ad_account_id || process.env.META_AD_ACCOUNT_ID;
      
      // If clientId is provided, use that client's ad account ID
      if (clientId) {
        const client = db.prepare("SELECT ad_account_id FROM clients WHERE id = ?").get(clientId) as any;
        if (client && client.ad_account_id) {
          adAccountId = client.ad_account_id;
        }
      }

      if (!adAccountId || adAccountId === '123456789' || adAccountId === 'act_123456789') {
        // Try to auto-discover ad account ID if it's a placeholder
        try {
          const accountsRes = await axios.get(`https://graph.facebook.com/v19.0/me/adaccounts`, {
            params: {
              access_token: settings.access_token,
              fields: 'name,account_id'
            }
          });
          const accounts = accountsRes.data.data;
          if (accounts && accounts.length === 1) {
            adAccountId = accounts[0].account_id;
            // Update settings so we don't have to do this again
            db.prepare("UPDATE meta_settings SET ad_account_id = ? WHERE id = 1").run(adAccountId);
            console.log(`Auto-discovered and saved Ad Account ID: ${adAccountId}`);
          } else if (accounts && accounts.length > 1) {
            return res.status(400).json({ 
              error: "Multiple Ad Accounts found",
              accounts: accounts.map((a: any) => ({ 
                id: a.id || `act_${a.account_id}`, 
                account_id: a.account_id || a.id?.replace('act_', ''), 
                name: a.name || 'Unnamed Account' 
              }))
            });
          } else {
            return res.status(400).json({ 
              error: "No Ad Accounts found for this Meta user. Please ensure your Meta account has access to at least one Ad Account." 
            });
          }
        } catch (discoverError: any) {
          console.error("Auto-discovery failed:", discoverError.response?.data || discoverError.message);
          return res.status(400).json({ 
            error: "Invalid Ad Account ID. Please go to Settings and enter your actual Meta Ad Account ID (e.g. 1234567890)." 
          });
        }
      }

      console.log(`Syncing Meta performance for Ad Account: ${adAccountId}`);

      // Sanitize adAccountId: remove 'act_' prefix if it exists to avoid act_act_...
      const sanitizedAdAccountId = String(adAccountId).replace(/^act_/, '');

      console.log(`Syncing Meta performance for Ad Account: ${adAccountId} (Async)`);

      let finalStartDate = startDate;
      let finalEndDate = endDate;
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        finalStartDate = endDate;
        finalEndDate = startDate;
      }

      // Use the insights edge for better date range support
      const timeRange = finalStartDate && finalEndDate ? JSON.stringify({ since: finalStartDate, until: finalEndDate }) : null;
      
      // 1. Start Asynchronous Insights Job
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
      console.log(`Insights job started: ${reportRunId}`);

      // 2. Poll for completion
      let jobDone = false;
      let attempts = 0;
      const maxAttempts = 40; // ~200 seconds max

      while (!jobDone && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const statusRes = await axios.get(`https://graph.facebook.com/v19.0/${reportRunId}`, {
          params: { access_token: settings.access_token }
        });
        
        const status = statusRes.data.async_status;
        const percent = statusRes.data.async_percent_completion;
        console.log(`Job ${reportRunId} status: ${status} (${percent}%)`);

        if (status === 'Job Completed') {
          jobDone = true;
        } else if (status === 'Job Failed' || status === 'Job Skipped') {
          throw new Error(`Meta Insights job failed: ${status}`);
        }
        attempts++;
      }

      if (!jobDone) {
        throw new Error("Meta Insights job timed out. The account may have too much data for synchronous processing.");
      }

      // 3. Fetch results (with pagination)
      let insightsData: any[] = [];
      let nextUrl: string | null = `https://graph.facebook.com/v19.0/${reportRunId}/insights?access_token=${settings.access_token}&limit=500`;
      
      while (nextUrl) {
        const dataRes = await axios.get(nextUrl);
        insightsData = [...insightsData, ...dataRes.data.data];
        nextUrl = dataRes.data.paging?.next || null;
      }

      console.log(`Fetched ${insightsData.length} rows of insights data.`);
      const syncResults = [];

      for (const item of insightsData) {
        // Extract creative_id from ad name (e.g., "Summer Sale [C-1234]")
        const match = item.ad_name.match(/\[(C-\d+)\]/);
        const creativeId = match ? match[1] : '';
        
        // Normalize Meta metrics
        const spend = parseFloat(item.spend || 0);
        const actions = item.actions || [];
        const actionValues = item.action_values || [];
        const purchaseRoas = item.purchase_roas || [];

        // Helper to sum values by type
        const sumByType = (arr: any[], type: string) => {
          return arr.filter(a => a.action_type === type).reduce((sum, a) => sum + parseFloat(a.value || 0), 0);
        };

        // Helper to get roas by type
        const getRoasByType = (arr: any[], type: string) => {
          const found = arr.find(a => a.action_type === type);
          return found ? parseFloat(found.value || 0) : 0;
        };

        // Extract common conversion types for quick access
        const conversionsByType: Record<string, number> = {};
        const valuesByType: Record<string, number> = {};
        const roasByType: Record<string, number> = {};

        actions.forEach((a: any) => {
          conversionsByType[a.action_type] = (conversionsByType[a.action_type] || 0) + parseFloat(a.value || 0);
        });

        actionValues.forEach((a: any) => {
          valuesByType[a.action_type] = (valuesByType[a.action_type] || 0) + parseFloat(a.value || 0);
        });

        purchaseRoas.forEach((a: any) => {
          roasByType[a.action_type] = parseFloat(a.value || 0);
        });

        const metrics = {
          spend,
          impressions: parseInt(item.impressions || 0),
          clicks: parseInt(item.clicks || 0),
          reach: parseInt(item.reach || 0),
          frequency: parseFloat(item.frequency || 0),
          cpm: parseFloat(item.cpm || 0),
          cpp: parseFloat(item.cpp || 0),
          ctr: parseFloat(item.ctr || 0),
          cpc: parseFloat(item.cpc || 0),
          inline_link_clicks: parseInt(item.inline_link_clicks || 0),
          conversions: parseInt(item.conversions || 0),
          actions,
          action_values: actionValues,
          purchase_roas: purchaseRoas,
          conversions_by_type: conversionsByType,
          values_by_type: valuesByType,
          roas_by_type: roasByType,
          cost_per_action_type: item.cost_per_action_type || [],
          video_views: item.video_p25_watched_actions || []
        };

        db.prepare(`
          INSERT OR REPLACE INTO ad_performance (client_id, meta_ad_id, ad_name, creative_id, campaign_id, adset_id, metrics_json, date_start, date_stop)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(clientId, item.ad_id, item.ad_name, creativeId, item.campaign_id, item.adset_id, JSON.stringify(metrics), startDate, endDate);

        syncResults.push({ id: item.ad_id, name: item.ad_name });
      }

      res.json({ success: true, count: syncResults.length });
    } catch (error: any) {
      console.error("Meta Sync Error Details:", error.response?.data?.error || error.message);
      handleMetaError(error, res);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;

  // Seed data if empty
  const clientCount = db.prepare("SELECT COUNT(*) as count FROM clients").get() as any;
  if (clientCount.count === 0) {
    db.prepare("INSERT INTO clients (name, industry, ad_account_id) VALUES (?, ?, ?)").run('Acme Corp', 'E-commerce', 'act_123456789');
  }

  const perfCount = db.prepare("SELECT COUNT(*) as count FROM ad_performance").get() as any;
  if (perfCount.count === 0) {
    const today = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const mockAds = [
      { id: '2385012345678', name: 'Summer Sale - Lifestyle [C-101]', spend: 450.25, conv: 12, ctr: 0.024, roas: 3.2 },
      { id: '2385012345679', name: 'Brand Awareness - Product [C-102]', spend: 120.50, conv: 2, ctr: 0.011, roas: 1.5 },
      { id: '2385012345680', name: 'Retargeting - Testimonial [C-103]', spend: 850.00, conv: 45, ctr: 0.042, roas: 5.8 },
      { id: '2385012345681', name: 'Flash Sale - Urgency [C-104]', spend: 320.00, conv: 18, ctr: 0.031, roas: 4.1 }
    ];

    mockAds.forEach(ad => {
      const creativeId = ad.name.match(/\[(C-\d+)\]/)?.[1] || '';
      const metrics = {
        spend: ad.spend,
        impressions: ad.spend * 100,
        clicks: ad.spend * 2,
        reach: ad.spend * 80,
        frequency: 1.2,
        ctr: ad.ctr,
        conversions: ad.conv,
        roas: ad.roas
      };
      db.prepare(`
        INSERT INTO ad_performance (client_id, meta_ad_id, ad_name, creative_id, metrics_json, date_start, date_stop)
        VALUES (1, ?, ?, ?, ?, ?, ?)
      `).run(ad.id, ad.name, creativeId, JSON.stringify(metrics), threeDaysAgo, today);

      // Seed mock image creative for this ad
      const imgName = ad.name.split(' - ')[1].split(' [')[0];
      const imgResult = db.prepare(`
        INSERT INTO image_creatives (client_id, name, status, creative_id, visual_type)
        VALUES (1, ?, 'approved', ?, ?)
      `).run(imgName, creativeId, ad.name.includes('Lifestyle') ? 'Lifestyle' : 'Product');
      
      const imageId = imgResult.lastInsertRowid;
      const mockImgUrl = `https://picsum.photos/seed/${creativeId}/800/600`;
      db.prepare(`
        INSERT INTO image_variants (image_id, ratio, url)
        VALUES (?, '1:1', ?)
      `).run(imageId, mockImgUrl);

      // Seed DNA for these mock ads
      db.prepare(`
        INSERT OR IGNORE INTO creative_dna (
          meta_ad_id, visual_style, emotional_trigger, offer_type, headline_text, copy_structure
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        ad.id, 
        ad.name.includes('Lifestyle') ? 'Lifestyle Photography' : 'Studio Product',
        ad.name.includes('Urgency') ? 'Fear of Missing Out' : 'Desire/Aspiration',
        ad.name.includes('Sale') ? 'Discount' : 'Value Proposition',
        ad.name.includes('Summer') ? 'Get Ready for Summer: 20% Off Everything!' : 'The Quality You Deserve, The Price You Want.',
        'Hook-Body-CTA'
      );
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
