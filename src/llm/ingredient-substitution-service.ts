import { Pool } from 'pg';
import { LocalAIClient } from './localai-client';

export interface IngredientSubstitution {
  id?: string;
  originalIngredient: string;
  substituteIngredient: string;
  conversionRatio: string;
  substitutionContext: 'baking' | 'cooking' | 'dessert' | 'garnish' | 'general';
  dietaryTags: string[];
  confidenceScore: number;
  usageCount?: number;
  successRate?: number;
  createdBy?: string;
}

export interface SubstitutionRequest {
  ingredient: string;
  quantity?: string;
  recipeContext?: string;
  dietaryRestrictions?: string[];
  cookingMethod?: string;
}

export interface SubstitutionResponse {
  originalIngredient: string;
  suggestions: IngredientSubstitution[];
  explanation?: string;
}

/**
 * Service for intelligent ingredient substitutions using AI and learned patterns
 */
export class IngredientSubstitutionService {
  private pool: Pool;
  private aiClient: LocalAIClient;
  private cache: Map<string, SubstitutionResponse> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(pool: Pool) {
    this.pool = pool;
    this.aiClient = new LocalAIClient();
  }

  /**
   * Get substitution suggestions for an ingredient
   */
  public async getSubstitutions(request: SubstitutionRequest): Promise<SubstitutionResponse> {
    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // First, get existing substitutions from database
      const dbSubstitutions = await this.getDatabaseSubstitutions(request);
      
      // If we have good database suggestions, use them
      if (dbSubstitutions.length >= 2 && dbSubstitutions.some(s => s.confidenceScore >= 0.8)) {
        const response: SubstitutionResponse = {
          originalIngredient: request.ingredient,
          suggestions: dbSubstitutions,
          explanation: "Found reliable substitution patterns from our database"
        };
        this.cache.set(cacheKey, response);
        return response;
      }

      // Otherwise, enhance with AI suggestions
      const aiSubstitutions = await this.getAISubstitutions(request);
      
      // Combine and rank suggestions
      const combinedSuggestions = this.combineAndRankSuggestions(
        dbSubstitutions, 
        aiSubstitutions, 
        request
      );

      const response: SubstitutionResponse = {
        originalIngredient: request.ingredient,
        suggestions: combinedSuggestions,
        explanation: aiSubstitutions.length > 0 
          ? "AI-enhanced substitution suggestions with learned patterns"
          : "Substitution suggestions from learned patterns"
      };

      this.cache.set(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Error getting substitutions:', error);
      
      // Fallback to basic database lookup
      const basicSuggestions = await this.getBasicSubstitutions(request.ingredient);
      return {
        originalIngredient: request.ingredient,
        suggestions: basicSuggestions,
        explanation: "Basic substitution suggestions (limited due to service issues)"
      };
    }
  }

  /**
   * Get substitutions from database
   */
  private async getDatabaseSubstitutions(request: SubstitutionRequest): Promise<IngredientSubstitution[]> {
    try {
      let query = `
        SELECT id, original_ingredient, substitute_ingredient, conversion_ratio,
               substitution_context, dietary_tags, confidence_score, usage_count, success_rate
        FROM ingredient_substitutions 
        WHERE LOWER(original_ingredient) = LOWER($1)
      `;
      let params: any[] = [request.ingredient];

      // Filter by context if provided
      if (request.recipeContext) {
        query += ` AND (substitution_context = $2 OR substitution_context = 'general')`;
        params.push(this.mapContextToDatabase(request.recipeContext));
      }

      // Filter by dietary restrictions if provided
      if (request.dietaryRestrictions && request.dietaryRestrictions.length > 0) {
        const dietaryConditions = request.dietaryRestrictions.map((_, index) => 
          `dietary_tags::jsonb ? $${params.length + index + 1}`
        ).join(' OR ');
        query += ` AND (${dietaryConditions})`;
        params.push(...request.dietaryRestrictions);
      }

      query += ` ORDER BY confidence_score DESC, success_rate DESC, usage_count DESC LIMIT 10`;

      const result = await this.pool.query(query, params);
      return result.rows.map(this.mapDatabaseRowToSubstitution);
    } catch (error) {
      console.error('Error getting database substitutions:', error);
      return [];
    }
  }

  /**
   * Get AI-enhanced substitutions
   */
  private async getAISubstitutions(request: SubstitutionRequest): Promise<IngredientSubstitution[]> {
    try {
      const dietaryInfo = request.dietaryRestrictions?.length 
        ? `Dietary restrictions: ${request.dietaryRestrictions.join(', ')}` 
        : '';
      
      const contextInfo = request.recipeContext 
        ? `Recipe context: ${request.recipeContext}` 
        : '';

      const prompt = `Suggest ingredient substitutions for cooking/baking.

Original ingredient: ${request.ingredient}
${request.quantity ? `Quantity: ${request.quantity}` : ''}
${contextInfo}
${dietaryInfo}

Please provide 3-5 substitution options in this JSON format:
{
  "substitutions": [
    {
      "substitute": "substitute ingredient name",
      "ratio": "conversion ratio (e.g., '1:1' or '1 cup butter = 3/4 cup oil')",
      "context": "baking|cooking|dessert|garnish|general",
      "dietaryTags": ["tag1", "tag2"],
      "confidence": 0.85,
      "notes": "brief explanation"
    }
  ]
}

Focus on practical, reliable substitutions. Consider the cooking method and dietary needs.`;

      const response = await this.aiClient.generateCompletion(prompt, {
        temperature: 0.4,
        max_tokens: 600
      });

      if (response) {
        return this.parseAISubstitutionResponse(response, request);
      }

      return [];
    } catch (error) {
      console.error('Error getting AI substitutions:', error);
      return [];
    }
  }

  /**
   * Parse AI response into substitution objects
   */
  private parseAISubstitutionResponse(response: string, request: SubstitutionRequest): IngredientSubstitution[] {
    try {
      // Try to find and extract JSON from the response
      let jsonText = response;
      
      // First try to extract JSON between braces
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      } else {
        console.error('No JSON found in AI substitution response');
        return [];
      }

      const data = JSON.parse(jsonText);
      
      if (!data.substitutions || !Array.isArray(data.substitutions)) {
        console.error('Invalid substitutions format in AI response');
        return [];
      }

      return data.substitutions.map((sub: any): IngredientSubstitution => ({
        originalIngredient: request.ingredient,
        substituteIngredient: sub.substitute || '',
        conversionRatio: sub.ratio || '1:1',
        substitutionContext: this.validateContext(sub.context) || 'general',
        dietaryTags: Array.isArray(sub.dietaryTags) ? sub.dietaryTags : [],
        confidenceScore: this.parseNumber(sub.confidence) || 0.7,
        createdBy: 'AI_SYSTEM'
      })).filter((sub: IngredientSubstitution) => sub.substituteIngredient.length > 0);
    } catch (error) {
      console.error('Error parsing AI substitution response:', error);
      return [];
    }
  }

  /**
   * Combine and rank substitutions from different sources
   */
  private combineAndRankSuggestions(
    dbSuggestions: IngredientSubstitution[],
    aiSuggestions: IngredientSubstitution[],
    request: SubstitutionRequest
  ): IngredientSubstitution[] {
    const allSuggestions = [...dbSuggestions];
    
    // Add AI suggestions that aren't already in database suggestions
    for (const aiSub of aiSuggestions) {
      const exists = dbSuggestions.some(dbSub => 
        dbSub.substituteIngredient.toLowerCase() === aiSub.substituteIngredient.toLowerCase()
      );
      
      if (!exists) {
        allSuggestions.push(aiSub);
      }
    }

    // Rank by relevance score
    return allSuggestions
      .map(sub => ({
        ...sub,
        relevanceScore: this.calculateRelevanceScore(sub, request)
      }))
      .sort((a, b) => (b as any).relevanceScore - (a as any).relevanceScore)
      .slice(0, 8); // Limit to top 8 suggestions
  }

  /**
   * Calculate relevance score for ranking
   */
  private calculateRelevanceScore(substitution: IngredientSubstitution, request: SubstitutionRequest): number {
    let score = substitution.confidenceScore;

    // Boost score for matching context
    if (request.recipeContext && 
        substitution.substitutionContext === this.mapContextToDatabase(request.recipeContext)) {
      score += 0.2;
    }

    // Boost score for matching dietary restrictions
    if (request.dietaryRestrictions) {
      const matchingTags = substitution.dietaryTags.filter(tag =>
        request.dietaryRestrictions!.some(restriction => 
          restriction.toLowerCase() === tag.toLowerCase()
        )
      );
      score += matchingTags.length * 0.15;
    }

    // Boost score for usage history (database entries)
    if (substitution.usageCount && substitution.usageCount > 0) {
      score += Math.min(substitution.usageCount * 0.01, 0.1);
    }

    // Boost score for success rate
    if (substitution.successRate && substitution.successRate > 0.8) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Get basic substitutions as fallback
   */
  private async getBasicSubstitutions(ingredient: string): Promise<IngredientSubstitution[]> {
    try {
      const result = await this.pool.query(`
        SELECT id, original_ingredient, substitute_ingredient, conversion_ratio,
               substitution_context, dietary_tags, confidence_score
        FROM ingredient_substitutions 
        WHERE LOWER(original_ingredient) = LOWER($1)
        ORDER BY confidence_score DESC
        LIMIT 5
      `, [ingredient]);

      return result.rows.map(this.mapDatabaseRowToSubstitution);
    } catch (error) {
      console.error('Error getting basic substitutions:', error);
      return [];
    }
  }

  /**
   * Save successful substitution pattern for learning
   */
  public async saveFeedback(
    originalIngredient: string,
    substituteIngredient: string,
    success: boolean,
    context?: string
  ): Promise<void> {
    try {
      // Check if this substitution already exists
      const existing = await this.pool.query(`
        SELECT id, usage_count, success_rate 
        FROM ingredient_substitutions 
        WHERE LOWER(original_ingredient) = LOWER($1) 
        AND LOWER(substitute_ingredient) = LOWER($2)
        AND substitution_context = $3
      `, [originalIngredient, substituteIngredient, context || 'general']);

      if (existing.rows.length > 0) {
        // Update existing record
        const row = existing.rows[0];
        const newUsageCount = row.usage_count + 1;
        const currentSuccesses = Math.round(row.success_rate * row.usage_count);
        const newSuccesses = currentSuccesses + (success ? 1 : 0);
        const newSuccessRate = newSuccesses / newUsageCount;

        await this.pool.query(`
          UPDATE ingredient_substitutions 
          SET usage_count = $1, success_rate = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [newUsageCount, newSuccessRate, row.id]);
      } else if (success) {
        // Create new record only for successful substitutions
        await this.pool.query(`
          INSERT INTO ingredient_substitutions 
          (original_ingredient, substitute_ingredient, substitution_context, usage_count, success_rate, created_by)
          VALUES ($1, $2, $3, 1, 1.0, 'USER_FEEDBACK')
        `, [originalIngredient, substituteIngredient, context || 'general']);
      }
    } catch (error) {
      console.error('Error saving substitution feedback:', error);
    }
  }

  /**
   * Helper methods
   */
  private generateCacheKey(request: SubstitutionRequest): string {
    return `${request.ingredient}_${request.recipeContext || ''}_${request.dietaryRestrictions?.sort().join(',') || ''}`;
  }

  private mapContextToDatabase(context: string): string {
    const contextMap: {[key: string]: string} = {
      'baking': 'baking',
      'cooking': 'cooking',
      'dessert': 'dessert',
      'garnish': 'garnish',
      'sauce': 'cooking',
      'soup': 'cooking',
      'cake': 'baking',
      'bread': 'baking'
    };
    return contextMap[context.toLowerCase()] || 'general';
  }

  private validateContext(context: string): 'baking' | 'cooking' | 'dessert' | 'garnish' | 'general' | null {
    const validContexts = ['baking', 'cooking', 'dessert', 'garnish', 'general'];
    return validContexts.includes(context) ? context as any : null;
  }

  private parseNumber(value: any): number | undefined {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : Math.max(0, Math.min(1, num));
  }

  private mapDatabaseRowToSubstitution(row: any): IngredientSubstitution {
    return {
      id: row.id,
      originalIngredient: row.original_ingredient,
      substituteIngredient: row.substitute_ingredient,
      conversionRatio: row.conversion_ratio,
      substitutionContext: row.substitution_context,
      dietaryTags: row.dietary_tags ? JSON.parse(row.dietary_tags) : [],
      confidenceScore: parseFloat(row.confidence_score) || 0.5,
      usageCount: row.usage_count || 0,
      successRate: parseFloat(row.success_rate) || 0.8,
      createdBy: row.created_by || 'SYSTEM'
    };
  }
}