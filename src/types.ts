export interface Client {
  id: number;
  name: string;
  industry: string;
  ad_account_id?: string;
  campaign_id?: string;
  campaign_goal?: string;
  brand_colors?: string;
  logo_url?: string;
  font_style?: string;
  main_cta?: string;
  target_audience?: string;
  tone_of_voice?: string;
  usp?: string;
  primary_conversion_event?: string;
  landing_page_url?: string;
  business_type?: 'lead_gen' | 'ecommerce';
  created_at: string;
}

export type CreativeStatus = 'draft' | 'approved' | 'rejected';
export type CopyType = 'headline' | 'description' | 'primary_text';

export interface CopyGroup {
  id: number;
  client_id: number;
  name: string;
  description?: string;
  color?: string;
}

export interface CopyCreative {
  id: number;
  client_id: number;
  type: CopyType;
  content: string;
  status: CreativeStatus;
  dna_json?: string;
  group_id?: number;
}

export interface ImageVariant {
  id: number;
  image_id: number;
  ratio: string;
  url: string;
}

export interface ImageCreative {
  id: number;
  client_id: number;
  name: string;
  status: CreativeStatus;
  detected_text?: string;
  detected_cta?: string;
  visual_type?: string;
  creative_id?: string;
  dna_json?: string;
  variants: ImageVariant[];
}

export interface MetaAdCombination {
  headline: string;
  primaryText: string;
  description: string;
  imageUrl: string;
  ratio: string;
}

export interface KPISettings {
  primary_kpi: string;
  secondary_kpi: string;
  guardrail_kpis: string[];
  conversion_events: string[];
  attribution_window: string;
  reporting_level: 'campaign' | 'adset' | 'ad';
  confidence_threshold: number;
  min_sample_size: number;
  weights: {
    delivery: number;
    engagement: number;
    conversion: number;
    quality: number;
    creative: number;
  };
  // Metric Mapping
  metric_mappings?: {
    conversions: string[]; // action_type values
    purchases: string[];   // action_type values
    revenue: string[];     // action_type values for action_values
    roas: string[];        // action_type values for purchase_roas
    primary_kpi: string[];
    secondary_kpi: string[];
  };
  custom_labels?: Record<string, string>;
}

export interface AdBreakdown {
  meta_ad_id: string;
  breakdown_type: string;
  breakdown_value: string;
  metrics: {
    spend: string;
    impressions: string;
    clicks: string;
    conversions: string;
    roas?: string;
    cpa?: string;
  };
}

export interface CreativeDNA {
  meta_ad_id: string;
  visual_style: string;
  color_palette: string[];
  emotional_triggers: string[];
  emotional_trigger?: string;
  copy_hook_type: string;
  key_benefit_highlighted: string;
  call_to_action_type: string;
  primary_subject?: string;
  people_present?: boolean;
  headline_structure?: string;
  offer_type?: string;
  headline_text?: string;
}

export interface CopyDNAAttributes {
  character_count: number;
  word_count: number;
  sentence_count: number;
  tone: string;
  emotional_trigger: string;
  persuasion_trigger: string;
  hook_type: string;
  offer_structure: string;
  cta_wording: string;
  is_question: boolean;
  is_curiosity_based: boolean;
  has_urgency: boolean;
}

export interface CreativeDNAAdvanced {
  id?: number;
  meta_ad_id: string;
  campaign_id?: string;
  adset_id?: string;
  creative_id?: string;
  
  // Visual DNA
  visual_type: 'image' | 'video' | 'carousel';
  visual_style: 'lifestyle' | 'product' | 'vector' | 'infographic' | 'testimonial' | 'UGC';
  objects_present: string[];
  people_present: boolean;
  age_group_estimate: string;
  gender_presentation: string;
  facial_expression: string;
  product_presence: boolean;
  logo_presence: boolean;
  text_overlay_present: boolean;
  text_overlay_density: 'low' | 'medium' | 'high';
  text_overlay_positioning: string;
  in_graphic_cta_present: boolean;
  in_graphic_cta_text: string;
  in_graphic_cta_color: string;
  button_shape: string;
  dominant_colors: string[];
  color_palette: string;
  background_style: string;
  contrast_level: 'low' | 'medium' | 'high';
  layout_structure: string;
  camera_framing: string;
  visual_complexity_score: number;

  // Copy DNA
  primary_text_dna: CopyDNAAttributes;
  headline_dna: CopyDNAAttributes;
  description_dna: CopyDNAAttributes;
  
  updated_at?: string;
}

export interface CreativeInsight {
  trait: string;
  category: 'visual' | 'headline' | 'primary_text';
  metric: string;
  comparison: string;
  improvement: number;
  sample_size: number;
  confidence_score: number;
  type: 'winning' | 'losing' | 'test';
}

export interface IntelligenceData {
  insights: CreativeInsight[];
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
}

export interface EditorState {
  imageUrl: string;
  adjustments: ImageAdjustments;
}
