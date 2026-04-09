import { GoogleGenAI, Type } from "@google/genai";
import { CreativeDNAAdvanced, CopyDNAAttributes } from "../types";

export class CreativeAnalysisService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeVisual(imageUrl: string): Promise<Partial<CreativeDNAAdvanced>> {
    const prompt = `
      Analyze this ad creative image and extract the following attributes in JSON format:
      - visual_type: 'image', 'video', or 'carousel'
      - visual_style: 'lifestyle', 'product', 'vector', 'infographic', 'testimonial', or 'UGC'
      - objects_present: array of strings
      - people_present: boolean
      - age_group_estimate: string (e.g., '20-30', '40-50', 'mixed')
      - gender_presentation: string (e.g., 'male', 'female', 'mixed', 'neutral')
      - facial_expression: string (e.g., 'happy', 'serious', 'surprised', 'none')
      - product_presence: boolean
      - logo_presence: boolean
      - text_overlay_present: boolean
      - text_overlay_density: 'low', 'medium', or 'high'
      - text_overlay_positioning: string
      - in_graphic_cta_present: boolean
      - in_graphic_cta_text: string
      - in_graphic_cta_color: string
      - button_shape: string
      - dominant_colors: array of hex codes
      - color_palette: string (e.g., 'vibrant', 'pastel', 'monochrome', 'dark')
      - background_style: string
      - contrast_level: 'low', 'medium', or 'high'
      - layout_structure: string
      - camera_framing: string (e.g., 'close-up', 'medium-shot', 'wide-shot')
      - visual_complexity_score: number (1-10)
    `;

    try {
      // Fetch image and convert to base64
      const imageRes = await fetch(imageUrl);
      const blob = await imageRes.blob();
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: blob.type,
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visual_type: { type: Type.STRING },
              visual_style: { type: Type.STRING },
              objects_present: { type: Type.ARRAY, items: { type: Type.STRING } },
              people_present: { type: Type.BOOLEAN },
              age_group_estimate: { type: Type.STRING },
              gender_presentation: { type: Type.STRING },
              facial_expression: { type: Type.STRING },
              product_presence: { type: Type.BOOLEAN },
              logo_presence: { type: Type.BOOLEAN },
              text_overlay_present: { type: Type.BOOLEAN },
              text_overlay_density: { type: Type.STRING },
              text_overlay_positioning: { type: Type.STRING },
              in_graphic_cta_present: { type: Type.BOOLEAN },
              in_graphic_cta_text: { type: Type.STRING },
              in_graphic_cta_color: { type: Type.STRING },
              button_shape: { type: Type.STRING },
              dominant_colors: { type: Type.ARRAY, items: { type: Type.STRING } },
              color_palette: { type: Type.STRING },
              background_style: { type: Type.STRING },
              contrast_level: { type: Type.STRING },
              layout_structure: { type: Type.STRING },
              camera_framing: { type: Type.STRING },
              visual_complexity_score: { type: Type.NUMBER }
            }
          }
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error("Error analyzing visual:", error);
      throw error;
    }
  }

  async analyzeCopy(text: string): Promise<CopyDNAAttributes> {
    const prompt = `
      Analyze this ad copy and extract the following attributes in JSON format:
      - character_count: number
      - word_count: number
      - sentence_count: number
      - tone: string
      - emotional_trigger: string
      - persuasion_trigger: string
      - hook_type: string
      - offer_structure: string
      - cta_wording: string
      - is_question: boolean
      - is_curiosity_based: boolean
      - has_urgency: boolean
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: text,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              character_count: { type: Type.NUMBER },
              word_count: { type: Type.NUMBER },
              sentence_count: { type: Type.NUMBER },
              tone: { type: Type.STRING },
              emotional_trigger: { type: Type.STRING },
              persuasion_trigger: { type: Type.STRING },
              hook_type: { type: Type.STRING },
              offer_structure: { type: Type.STRING },
              cta_wording: { type: Type.STRING },
              is_question: { type: Type.BOOLEAN },
              is_curiosity_based: { type: Type.BOOLEAN },
              has_urgency: { type: Type.BOOLEAN }
            }
          }
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error("Error analyzing copy:", error);
      throw error;
    }
  }
}
