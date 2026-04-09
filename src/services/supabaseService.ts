import { supabase } from '../lib/supabase';
import { Client, CopyCreative, ImageCreative, CopyGroup, KPISettings, AdBreakdown, CreativeDNAAdvanced } from '../types';

export const supabaseService = {
  // Clients
  async getClients() {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createClient(client: Partial<Client>) {
    const { data, error } = await supabase.from('clients').insert([client]).select().single();
    if (error) throw error;
    return data;
  },

  async updateClient(id: number, updates: Partial<Client>) {
    const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // KPI Settings
  async getKpiSettings(clientId: number) {
    const { data, error } = await supabase.from('kpi_settings').select('*').eq('client_id', clientId).single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
    return data;
  },

  async saveKpiSettings(clientId: number, settings: any) {
    const { data, error } = await supabase.from('kpi_settings').upsert({ client_id: clientId, ...settings }).select().single();
    if (error) throw error;
    return data;
  },

  // Performance Data
  async getAdPerformance(clientId: number, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('ad_performance')
      .select('*')
      .eq('client_id', clientId)
      .gte('date_start', startDate)
      .lte('date_stop', endDate);
    if (error) throw error;
    return data;
  },

  async saveAdPerformance(performanceData: any[]) {
    const { data, error } = await supabase.from('ad_performance').upsert(performanceData);
    if (error) throw error;
    return data;
  },

  // Creative DNA
  async getCreativeDna(metaAdId: string) {
    const { data, error } = await supabase.from('creative_dna_advanced').select('*').eq('meta_ad_id', metaAdId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async saveCreativeDna(dnaData: any) {
    const { data, error } = await supabase.from('creative_dna_advanced').upsert(dnaData).select().single();
    if (error) throw error;
    return data;
  }
};
