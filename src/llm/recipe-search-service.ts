import { OllamaClient } from './ollama-client';
import { Pool } from 'pg';
import { GlossaryService } from './glossary-service';

// Simple in-memory cache interface
interface CacheItem {
  timestamp: number;
  data: any[];
  aiAnalysis?: any;
}

/**
 * Service for enhanced recipe search using the LLM
 */
export class RecipeSearchService {
  private ollamaClient: OllamaClient;
  private pool: Pool;
  private glossaryService: GlossaryService;
  private aiAvailable: boolean = true; // Optimistic initial setting
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES = 3;
  
  // Search result caching
  private cache: Map<string, CacheItem> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
  private readonly CACHE_ENABLED = true;
  
  constructor(pool: Pool, ollamaClient?: OllamaClient) {
    this.pool = pool;
    this.ollamaClient = ollamaClient || new OllamaClient();
    this.glossaryService = new GlossaryService(pool);
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 10 * 60 * 1000); // Run every 10 minutes
  }

  /**
   * Select the appropriate model based on query complexity
   * Uses lighter models for simple queries to improve performance
   */
  private selectModelForQuery(query: string): string {
    // Default model from environment variables
    const defaultModel = process.env.OLLAMA_MODEL || 'mistral';
    
    // If query is very simple, use tinyllama which is faster
    if (this.isSimpleQuery(query)) {
      console.log('Query is simple, using lightweight tinyllama model');
      return 'tinyllama';
    }
    
    // For more complex queries, use a more capable model if available
    if (defaultModel !== 'tinyllama') {
      console.log(`Query is complex, using more capable ${defaultModel} model`);
      return defaultModel;
    }
    
    // Fallback to tinyllama if that's all we have
    return 'tinyllama';
  }
  
  /**
   * Search recipes with AI-enhanced understanding of user's preferences
   * The main function is to evaluate user statements and convert them into appropriate database search parameters
   */
  public async searchRecipes(userQuery: string): Promise<any[]> {
    try {
      console.log('=== USER PREFERENCE DETECTION ===');
      console.log('User input:', userQuery);
      
      // If user query is empty, return popular recipes
      if (!userQuery || userQuery.trim() === '') {
        console.log('Empty query, returning default recommendations');
        return this.fallbackSearch('');
      }
      
      // Normalize query for caching
      const normalizedQuery = userQuery.toLowerCase().trim();
      
      // Check cache first
      if (this.CACHE_ENABLED) {
        const cachedResult = this.getFromCache(normalizedQuery);
        if (cachedResult) {
          console.log('Cache hit! Using cached results for:', normalizedQuery);
          return cachedResult;
        }
      }

      console.log('Starting AI-enhanced recipe search for query:', userQuery);
      
      // Select the appropriate model based on query complexity
      const selectedModel = this.selectModelForQuery(userQuery);
      this.ollamaClient.setModel(selectedModel);
      
      // Skip AI if we've had too many consecutive failures
      if (!this.aiAvailable) {
        console.log('AI service marked as unavailable due to previous failures, using fallback search');
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      // Check if AI service is available and try to prepare the model
      try {
        const isHealthy = await this.ollamaClient.healthCheck().catch(() => false);
        if (!isHealthy) {
          this.incrementFailureCount();
          console.log('AI service health check failed, using fallback search');
          const results = await this.fallbackSearch(userQuery);
          this.saveToCache(normalizedQuery, results);
          return results;
        }
        
        // Try to ensure the model is available
        const modelReady = await this.ollamaClient.ensureModelAvailable().catch(() => false);
        if (!modelReady) {
          console.log('Model is not available and could not be loaded, using fallback search');
          const results = await this.fallbackSearch(userQuery);
          this.saveToCache(normalizedQuery, results);
          return results;
        }
      } catch (error) {
        this.incrementFailureCount();
        console.log('Error checking AI service health:', error);
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      // If query is simple (just a few words), use direct search for better performance
      // This bypasses the LLM for very basic queries like "pasta" or "chicken soup"
      if (this.isSimpleQuery(normalizedQuery)) {
        console.log('Simple query detected, using optimized search');
        const results = await this.optimizedSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      // Generate prompt for the LLM to analyze the user's query
      // This is where we ask the LLM to translate the natural language query into structured search parameters
      const prompt = `You are a cooking assistant helping users find recipes.
Analyze this food query: "${userQuery}"

Extract these parameters and respond in this exact JSON format:
{
  "mainDish": [],
  "cuisines": [],
  "includeIngredients": [],
  "excludeIngredients": [],
  "dietaryPreferences": [],
  "cookingMethods": [],
  "explanation": ""
}

Put ingredients the user wants in "includeIngredients". 
Put ingredients the user doesn't want in "excludeIngredients".
For "I like X but not Y" queries, put X in includeIngredients and Y in excludeIngredients.
Be very concise. Keep arrays empty if not mentioned.`;

      // Get AI analysis of the user query
      const aiAnalysisResponse = await this.ollamaClient.generateCompletion(prompt);
      console.log('Raw AI response:', aiAnalysisResponse);
      
      // Check if the response contains an error message
      if (aiAnalysisResponse.startsWith('Error generating AI response:')) {
        this.incrementFailureCount();
        console.log('AI service returned an error response, using fallback search');
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }

      // Reset the failure counter since we got a successful response
      this.resetFailureCount();
      
      // Parse the AI response
      let aiAnalysis;
      try {
        aiAnalysis = await this.parseAIResponse(aiAnalysisResponse, userQuery);
      } catch (error) {
        console.error('Error parsing AI response:', error);
        // Fall back to standard search on parsing error
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      console.log('AI analysis of query:', aiAnalysis);
      
      // This is where we translate the structured AI analysis into an efficient SQL query
      // with appropriate parameters for the database search
      let sqlQuery = `
        SELECT r.id, r.title, r.description, r.cuisine, r.category_id 
        FROM recipes r
        WHERE 1=1
      `;
      
      const sqlParams: any[] = [];
      let paramIndex = 1;

      // Filter by cuisine if specified
      if (aiAnalysis.cuisines && aiAnalysis.cuisines.length > 0) {
        console.log('Adding cuisine filters to SQL query:', aiAnalysis.cuisines);
        const cuisineParams: string[] = [];
        aiAnalysis.cuisines.forEach((cuisine: string) => {
          sqlParams.push(`%${cuisine}%`);
          cuisineParams.push(`r.cuisine ILIKE $${paramIndex++}`);
        });
        if (cuisineParams.length) {
          sqlQuery += ` AND (${cuisineParams.join(' OR ')})`;
        }
      } else {
        console.log('No cuisines detected, adding fallback for Jewish Food');
        sqlParams.push('%Jewish%');
        sqlQuery += ` AND r.cuisine ILIKE $${paramIndex++}`;
      }
      
      // Filter for ingredients to include (using recipe_ingredients join)
      if (aiAnalysis.includeIngredients && aiAnalysis.includeIngredients.length) {
        sqlQuery += ` AND r.id IN (
          SELECT ri.recipe_id 
          FROM recipe_ingredients ri 
          JOIN ingredients i ON ri.ingredient_id = i.id 
          WHERE `;
          
        const includeIngredientConditions: string[] = [];
        aiAnalysis.includeIngredients.forEach((ingredient: string) => {
          includeIngredientConditions.push(`i.name ILIKE $${paramIndex++}`);
          sqlParams.push(`%${ingredient}%`);
        });
        
        sqlQuery += includeIngredientConditions.join(' OR ');
        sqlQuery += ')';
      }
      
      // Filter out ingredients to exclude
      if (aiAnalysis.excludeIngredients && aiAnalysis.excludeIngredients.length) {
        // For each excluded ingredient, add a separate NOT IN clause
        // This ensures that recipes with ANY of these ingredients are excluded
        aiAnalysis.excludeIngredients.forEach((ingredient: string) => {
          sqlQuery += ` AND r.id NOT IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE i.name ILIKE $${paramIndex++}
          )`;
          sqlParams.push(`%${ingredient}%`);
        });
      }
      
      // Handle dietary preferences
      if (aiAnalysis.dietaryPreferences && aiAnalysis.dietaryPreferences.length) {
        // Check for common dietary restrictions
        const dietaryTerms = aiAnalysis.dietaryPreferences.map((pref: string) => pref.toLowerCase());
        
        // Vegetarian/Vegan checks
        if (dietaryTerms.some((term: string) => term.includes('vegan'))) {
          sqlQuery += ` AND r.id NOT IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} 
              OR i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++}
          )`;
          sqlParams.push('%meat%', '%chicken%', '%beef%', '%pork%', '%fish%');
        }
        else if (dietaryTerms.some((term: string) => term.includes('vegetarian'))) {
          sqlQuery += ` AND r.id NOT IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++}
          )`;
          sqlParams.push('%meat%', '%chicken%', '%beef%');
        }
        
        // Gluten-free check
        if (dietaryTerms.some((term: string) => term.includes('gluten') && term.includes('free'))) {
          sqlQuery += ` AND r.id NOT IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++}
          )`;
          sqlParams.push('%wheat%', '%flour%', '%bread%');
        }
        
        // Dairy-free check
        if (dietaryTerms.some((term: string) => (term.includes('dairy') && term.includes('free')) || term.includes('lactose'))) {
          sqlQuery += ` AND r.id NOT IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} OR i.name ILIKE $${paramIndex++} 
              OR i.name ILIKE $${paramIndex++}
          )`;
          sqlParams.push('%milk%', '%cheese%', '%cream%', '%butter%');
        }
      }
      
      // Additional full-text search for title and description matching
      const fullTextTerms = [
        ...(aiAnalysis.mainDish || []), 
        ...(aiAnalysis.cookingMethods || []),
        // Include single-word key ingredients as they might appear in titles
        ...aiAnalysis.includeIngredients.filter((ing: string) => !ing.includes(' '))
      ].filter(Boolean);
      
      if (fullTextTerms.length) {
        const textConditions: string[] = [];
        fullTextTerms.forEach((term: string) => {
          textConditions.push(`r.title ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex}`);
          sqlParams.push(`%${term}%`);
          paramIndex++;
        });
        
        if (textConditions.length) {
          sqlQuery += ` AND (${textConditions.join(' OR ')})`;
        }
      }
      
      // Add intelligent ordering based on how closely the recipe matches search criteria
      sqlQuery += `
        ORDER BY 
          CASE
            WHEN r.title ILIKE $${paramIndex} THEN 1  
            WHEN r.description ILIKE $${paramIndex} THEN 2
            ELSE 3
          END,
          r.id DESC LIMIT 20
      `;
      sqlParams.push(`%${userQuery}%`);
      
      console.log('Executing AI-enhanced SQL query:', sqlQuery);
      console.log('With parameters:', sqlParams);
      
      const result = await this.pool.query(sqlQuery, sqlParams);
      console.log(`AI search returned ${result.rows.length} matching recipes`);
      
      // If AI search returned no results, try fallback search
      if (result.rows.length === 0) {
        console.log('AI search returned no results, trying fallback search');
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      // Print final recommendations
      console.log('=== FINAL RECOMMENDATIONS ===');
      result.rows.slice(0, 6).forEach(recipe => {
        console.log(`- ${recipe.title} (${recipe.description})`);
      });
      
      // Tag the results with the AI's explanation of what it understood
      const enhancedResults = result.rows.map(row => ({
        ...row,
        ai_analysis: aiAnalysis.explanation || 'AI-enhanced search results'
      }));
      
      // Cache the results
      this.saveToCache(normalizedQuery, enhancedResults, aiAnalysis);
      
      return enhancedResults;
    } catch (error) {
      console.error('Error in recipe search:', error);
      const results = await this.fallbackSearch(userQuery);
      return results;
    }
  }
  
  /**
   * Determine if the glossary service found meaningful search terms
   */
  private hasGlossaryResults(glossaryTerms: {
    ingredients: string[];
    cuisines: string[];
    dishes: string[];
  }): boolean {
    return (
      glossaryTerms.ingredients.length > 0 || 
      glossaryTerms.cuisines.length > 0 || 
      glossaryTerms.dishes.length > 0
    );
  }
  
  /**
   * Perform search based on glossary terms without using the LLM
   * This can be faster and more accurate for common queries
   */
  private async glossaryBasedSearch(glossaryTerms: {
    ingredients: string[];
    cuisines: string[];
    dishes: string[];
  }, originalQuery: string): Promise<any[]> {
    try {
      console.log('Executing glossary-based search with terms:', glossaryTerms);
      
      let sqlQuery = `
        SELECT r.id, r.title, r.description, r.cuisine, r.category_id 
        FROM recipes r
        WHERE 1=1
      `;
      
      const sqlParams: any[] = [];
      let paramIndex = 1;
      
      // Add cuisine filters
      if (glossaryTerms.cuisines.length > 0) {
        console.log('Adding cuisine filters from glossary:', glossaryTerms.cuisines);
        const cuisineParams: string[] = [];
        
        for (const cuisine of glossaryTerms.cuisines) {
          // Expand search term to include all variants
          const expandedTerms = await this.glossaryService.expandSearchTerm(cuisine);
          for (const term of expandedTerms) {
            sqlParams.push(`%${term}%`);
            cuisineParams.push(`r.cuisine ILIKE $${paramIndex++}`);
          }
        }
        
        if (cuisineParams.length) {
          sqlQuery += ` AND (${cuisineParams.join(' OR ')})`;
        }
      }
      
      // Add dish name filters
      if (glossaryTerms.dishes.length > 0) {
        console.log('Adding dish filters from glossary:', glossaryTerms.dishes);
        const dishParams: string[] = [];
        
        for (const dish of glossaryTerms.dishes) {
          // Search for dish name in title or description
          sqlParams.push(`%${dish}%`);
          dishParams.push(`r.title ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex}`);
          paramIndex++;
        }
        
        if (dishParams.length) {
          sqlQuery += ` AND (${dishParams.join(' OR ')})`;
        }
      }
      
      // Add ingredient filters
      if (glossaryTerms.ingredients.length > 0) {
        console.log('Adding ingredient filters from glossary:', glossaryTerms.ingredients);
        
        // Handle each ingredient
        for (const ingredient of glossaryTerms.ingredients) {
          // Expand the term to include variants
          const expandedTerms = await this.glossaryService.expandSearchTerm(ingredient);
          
          sqlQuery += ` AND r.id IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE `;
            
          const ingredientConditions: string[] = [];
          for (const term of expandedTerms) {
            ingredientConditions.push(`i.name ILIKE $${paramIndex++}`);
            sqlParams.push(`%${term}%`);
          }
          
          sqlQuery += ingredientConditions.join(' OR ');
          sqlQuery += ')';
        }
      }
      
      // Add ranking and limit
      sqlQuery += `
        ORDER BY 
          CASE
            WHEN r.title ILIKE $${paramIndex} THEN 1  
            WHEN r.description ILIKE $${paramIndex} THEN 2
            ELSE 3
          END,
          r.id DESC LIMIT 20
      `;
      sqlParams.push(`%${originalQuery}%`);
      
      console.log('Executing glossary-based SQL query:', sqlQuery);
      console.log('With parameters:', sqlParams);
      
      const result = await this.pool.query(sqlQuery, sqlParams);
      console.log(`Glossary-based search returned ${result.rows.length} matching recipes`);
      
      // If no results, fall back to standard search
      if (result.rows.length === 0) {
        console.log('Glossary search returned no results, trying fallback search');
        return await this.fallbackSearch(originalQuery);
      }
      
      // Print final recommendations
      console.log('=== FINAL RECOMMENDATIONS (GLOSSARY-BASED) ===');
      result.rows.slice(0, 6).forEach(recipe => {
        console.log(`- ${recipe.title} (${recipe.description})`);
      });
      
      // Tag the results with a glossary explanation
      return result.rows.map(row => ({
        ...row,
        search_method: 'glossary',
        glossary_terms: {
          cuisines: glossaryTerms.cuisines,
          dishes: glossaryTerms.dishes,
          ingredients: glossaryTerms.ingredients
        }
      }));
    } catch (error) {
      console.error('Error in glossary-based search:', error);
      return this.fallbackSearch(originalQuery);
    }
  }
  
  /**
   * Check if a query is simple enough to bypass AI processing
   */
  private isSimpleQuery(query: string): boolean {
    // Query is complex if it contains contrasting or conditional terms
    const complexPatterns = [
      /but\s/i,                  // "but" indicates contrast
      /don'?t|not|no\s|without/i, // Negative expressions
      /except|exclude/i,          // Exclusions
      /\bor\b/i,                  // Options
      /\band\b/i,                 // Multiple requirements
      /if\s/i,                    // Conditional statements
      /instead\s?of/i             // Replacements
    ];
    
    // Check if query matches any complex pattern
    const isComplex = complexPatterns.some(pattern => pattern.test(query));
    
    // If query contains complex patterns, it's not simple
    if (isComplex) {
      return false;
    }
    
    // Otherwise, use the word count rule (1-3 words is simple)
    const words = query.split(' ').filter(w => w.length > 1);
    return words.length <= 3;
  }
  
  /**
   * Optimized direct search for simple queries
   */
  private async optimizedSearch(query: string): Promise<any[]> {
    try {
      console.log('Using optimized search for simple query:', query);
      
      // Check for negative preferences (don't like, hate, etc.)
      const negativeTermsRegex = /(don't|dont|do not|doesn't|doesnt|does not|no|not|hate|dislike|without|exclude)\s+(?:like\s+|have\s+|want\s+|)(\w+)/gi;
      const negativeMatches = [...query.matchAll(negativeTermsRegex)];
      const excludedTerms: string[] = [];
      
      if (negativeMatches.length > 0) {
        negativeMatches.forEach(match => {
          if (match[2] && match[2].length > 2) {
            excludedTerms.push(match[2].toLowerCase());
          }
        });
        console.log('Detected negative preferences:', excludedTerms);
      }
      
      // Extract positive ingredient terms from the query
      const positiveRegex = /(?:i like|i want|i love|with|include|add)(?:\s+\w+)?\s+(\w+)/gi;
      let positiveMatches = [...query.matchAll(positiveRegex)];
      
      // Also look for simple terms separated by spaces, avoiding negative terms and common stop words
      const stopWords = ['but', 'and', 'the', 'with', 'for', 'that', 'can', 'have', 'has'];
      const queryTerms = query.toLowerCase()
        .replace(/i like/gi, '')
        .replace(/i want/gi, '')
        .replace(/recipes with/gi, '')
        .replace(/i (don't|dont|do not) like/gi, '')
        .replace(/i hate/gi, '')
        .replace(/no|not|without/gi, '')
        .trim()
        .split(/\s+/)
        .filter(term => term.length > 2 && 
                        !excludedTerms.includes(term) && 
                        !stopWords.includes(term));
                        
      // Combine explicit positive terms with query terms
      let includeTerms = queryTerms;
      if (positiveMatches.length > 0) {
        positiveMatches.forEach(match => {
          if (match[1] && match[1].length > 2) {
            includeTerms.push(match[1].toLowerCase());
          }
        });
      }
      
      // Remove duplicates
      includeTerms = [...new Set(includeTerms)];
      
      console.log('Extracted positive search terms:', includeTerms);
      
      // Build a more comprehensive search
      let sqlQuery = `
        SELECT DISTINCT r.id, r.title, r.description, r.cuisine, r.category_id,
          CASE 
            WHEN r.title ILIKE $1 THEN 1
            WHEN EXISTS (
              SELECT 1 FROM recipe_ingredients ri 
              JOIN ingredients i ON ri.ingredient_id = i.id 
              WHERE ri.recipe_id = r.id AND i.name ILIKE $1
            ) THEN 2
            WHEN r.description ILIKE $1 THEN 3
            ELSE 4
          END AS match_rank
        FROM recipes r
        WHERE 1=1
      `;
      
      // Exclude recipes with unwanted ingredients if specified
      if (excludedTerms.length > 0) {
        sqlQuery += ` AND r.id NOT IN (
          SELECT ri.recipe_id 
          FROM recipe_ingredients ri 
          JOIN ingredients i ON ri.ingredient_id = i.id 
          WHERE 
        `;
        
        const excludeConditions = excludedTerms.map((term, idx) => `i.name ILIKE $${idx + 2}`);
        sqlQuery += excludeConditions.join(' OR ');
        sqlQuery += ')';
      }
      
      // Add positive search criteria - at least one match in either ingredients OR title/description
      if (includeTerms.length > 0) {
        // Start parameter index after the excluded terms
        const startParamIdx = excludedTerms.length + 2;
        
        // Check for ingredients matches
        sqlQuery += ` AND (
          EXISTS (
            SELECT 1 FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE ri.recipe_id = r.id AND (
        `;
        
        const ingredientConditions = includeTerms.map((term, idx) => 
          `i.name ILIKE $${idx + startParamIdx}`
        );
        sqlQuery += ingredientConditions.join(' OR ');
        sqlQuery += ')) ';
        
        // Also check title and description
        sqlQuery += ' OR ';
        const titleDescConditions = includeTerms.map((term, idx) => 
          `r.title ILIKE $${idx + startParamIdx} OR r.description ILIKE $${idx + startParamIdx}`
        );
        sqlQuery += titleDescConditions.join(' OR ');
        sqlQuery += ')';
      } else {
        // If no positive terms, use the original query
        sqlQuery += ` AND (
          r.title ILIKE $1 
          OR r.description ILIKE $1
          OR r.cuisine ILIKE $1
          OR EXISTS (
            SELECT 1 FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE ri.recipe_id = r.id AND i.name ILIKE $1
          )
        )`;
      }
      
      // Add ordering and limit
      sqlQuery += ' ORDER BY match_rank, r.id DESC LIMIT 20';
      
      // Build params array with the original query, excluded terms, and individual positive terms
      const params = [`%${query}%`, ...excludedTerms.map(term => `%${term}%`), ...includeTerms.map(term => `%${term}%`)];
      
      console.log('Executing optimized SQL query:', sqlQuery);
      console.log('With parameters:', params);
      
      const result = await this.pool.query(sqlQuery, params);
      console.log(`Optimized search returned ${result.rows.length} matching recipes`);
      
      // If optimized search returned no results, try fallback search
      if (result.rows.length === 0) {
        console.log('Optimized search returned no results, trying fallback search');
        return this.fallbackSearch(query);
      }
      
      // Remove the match_rank field from the results before returning
      const cleanedResults = result.rows.map(row => {
        const { match_rank, ...cleanedRow } = row;
        return cleanedRow;
      });
      
      // Print final recommendations
      console.log('=== FINAL RECOMMENDATIONS ===');
      cleanedResults.slice(0, 6).forEach(recipe => {
        console.log(`- ${recipe.title} (${recipe.description})`);
      });
      
      return cleanedResults;
    } catch (error) {
      console.error('Error in optimized search:', error);
      return this.fallbackSearch(query);
    }
  }

  /**
   * Fallback search method when AI is unavailable
   * Enhanced to handle queries with both positive and negative preferences
   */
  private async fallbackSearch(query: string): Promise<any[]> {
    try {
      console.log('Using fallback search for:', query);
      
      if (!query || query.trim() === '') {
        // Return popular recipes if query is empty
        const result = await this.pool.query(
          'SELECT id, title, description, cuisine, category_id FROM recipes ORDER BY id DESC LIMIT 20'
        );
        return result.rows;
      }
      
      // Special handling for certain types of searches
      const lowerQuery = query.toLowerCase();
      
      // Detect queries about meat dishes
      if ((lowerQuery.includes('meat') || lowerQuery.includes('beef') || lowerQuery.includes('steak')) && 
          (lowerQuery.includes('dish') || lowerQuery.includes('recipe') || lowerQuery.includes('only'))) {
        console.log('Detected meat dish query, using specialized meat search');
        return this.searchRecipesByProtein('meat');
      }
      
      // Detect queries about chicken dishes
      if (lowerQuery.includes('chicken') && 
          (lowerQuery.includes('dish') || lowerQuery.includes('recipe') || lowerQuery.includes('only'))) {
        console.log('Detected chicken dish query, using specialized chicken search');
        return this.specializedProteinSearch('chicken');  
      }
      
      // Detect combined meat and chicken request
      if ((lowerQuery.includes('meat') && lowerQuery.includes('chicken')) &&
          (lowerQuery.includes('dish') || lowerQuery.includes('recipe') || lowerQuery.includes('only'))) {
        console.log('Detected combined meat and chicken query, using specialized protein search');
        return this.specializedCombinedProteinSearch(['meat', 'chicken']);
      }
      
      // Parse the query to extract positive and negative terms
      const positiveTerms: string[] = [];
      const negativeTerms: string[] = [];
      
      // Extract negative terms (don't like X, without X, no X)
      const negativePattern = /(don't|dont|do not|doesn't|doesnt|does not|no|not|hate|dislike|without|exclude)\s+(?:like\s+|have\s+|want\s+|)(\w+)/gi;
      const negativeMatches = [...query.matchAll(negativePattern)];
      
      if (negativeMatches.length > 0) {
        negativeMatches.forEach(match => {
          if (match[2] && match[2].length > 2) {
            negativeTerms.push(match[2].toLowerCase());
          }
        });
        console.log('Fallback search: detected negative terms:', negativeTerms);
      }
      
      // First, remove the negative patterns from the query
      let cleanedQuery = query.toLowerCase();
      negativeMatches.forEach(match => {
        cleanedQuery = cleanedQuery.replace(match[0], '');
      });
      
      // Remove common phrases and split by spaces or conjunctions
      const stopWords = ['but', 'and', 'the', 'with', 'for', 'that', 'can', 'have', 'has', 'like', 'want', 'i', 'recipes'];
      cleanedQuery.replace(/i like/gi, '')
                .replace(/i want/gi, '')
                .replace(/recipes with/gi, '')
                .split(/\s+|but|and/)
                .filter(term => term.trim().length > 2 && !stopWords.includes(term.trim()))
                .forEach(term => positiveTerms.push(term.trim()));
      
      // Also check for specific positive patterns
      const positivePattern = /(?:i like|i want|i love|with|include|add)(?:\s+\w+)?\s+(\w+)/gi;
      const positiveMatches = [...query.matchAll(positivePattern)];
      
      if (positiveMatches.length > 0) {
        positiveMatches.forEach(match => {
          if (match[1] && match[1].length > 2 && !negativeTerms.includes(match[1].toLowerCase())) {
            positiveTerms.push(match[1].toLowerCase());
          }
        });
      }
      
      // Deduplicate terms
      const uniquePositiveTerms = [...new Set(positiveTerms)];
      console.log('Fallback search: detected positive terms:', uniquePositiveTerms);
      
      // Build SQL query based on positive and negative terms
      let sqlQuery = `
        SELECT DISTINCT r.id, r.title, r.description, r.cuisine, r.category_id 
        FROM recipes r
      `;
      
      const sqlParams: any[] = [];
      let paramIndex = 1;
      
      // If we have negative terms, exclude recipes with those ingredients
      if (negativeTerms.length > 0) {
        sqlQuery += `
          LEFT JOIN recipe_ingredients ri_exclude ON r.id = ri_exclude.recipe_id
          LEFT JOIN ingredients i_exclude ON ri_exclude.ingredient_id = i_exclude.id
          WHERE r.id NOT IN (
            SELECT ri_neg.recipe_id 
            FROM recipe_ingredients ri_neg
            JOIN ingredients i_neg ON ri_neg.ingredient_id = i_neg.id
            WHERE 
        `;
        
        const negativeConditions = negativeTerms.map(term => {
          sqlParams.push(`%${term}%`);
          return `i_neg.name ILIKE $${paramIndex++}`;
        });
        
        sqlQuery += negativeConditions.join(' OR ');
        sqlQuery += ')';
      } else {
        sqlQuery += ' WHERE 1=1';
      }
      
      // If we have positive terms, add conditions to match those
      if (uniquePositiveTerms.length > 0) {
        sqlQuery += ' AND (';

        // Check for matches in the cuisine field
        const cuisineConditions = uniquePositiveTerms.map(term => {
          sqlParams.push(`%${term}%`);
          return `r.cuisine ILIKE $${paramIndex++}`;
        });

        // Combine cuisine conditions with existing ingredient and title/description matches
        sqlQuery += cuisineConditions.join(' OR ');
        sqlQuery += ' OR ';

        // Check for matches in ingredients
        const ingredientConditions = uniquePositiveTerms.map(term => {
          sqlParams.push(`%${term}%`);
          return `EXISTS (
            SELECT 1 FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE ri.recipe_id = r.id AND i.name ILIKE $${paramIndex++}
          )`;
        });
        sqlQuery += ingredientConditions.join(' OR ');

        // Also check title and description
        const titleDescConditions = uniquePositiveTerms.map(term => {
          sqlParams.push(`%${term}%`);
          return `r.title ILIKE $${paramIndex++} OR r.description ILIKE $${paramIndex - 1}`;
        });
        sqlQuery += ' OR ' + titleDescConditions.join(' OR ');

        sqlQuery += ')';
      } else {
        // If no positive terms identified, use the original query as a fallback
        sqlParams.push(`%${query}%`);
        sqlQuery += `
          AND (
            r.cuisine ILIKE $${paramIndex} 
            OR r.title ILIKE $${paramIndex} 
            OR r.description ILIKE $${paramIndex}
          )`;
      }
      
      // Add ordering and limit
      sqlQuery += ' ORDER BY r.id DESC LIMIT 20';
      
      console.log('Executing fallback SQL query:', sqlQuery);
      console.log('With parameters:', sqlParams);
      
      const result = await this.pool.query(sqlQuery, sqlParams);
      console.log(`Fallback search returned ${result.rows.length} matching recipes`);
      
      // Print final recommendations
      console.log('=== FINAL RECOMMENDATIONS ===');
      result.rows.slice(0, 6).forEach(recipe => {
        console.log(`- ${recipe.title} (${recipe.description})`);
      });
      
      return result.rows;
    } catch (error) {
      console.error('Error in fallback search:', error);
      return [];
    }
  }
  
  /**
   * Track consecutive failures to disable AI temporarily after too many failures
   */
  private incrementFailureCount(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      console.log(`AI service has failed ${this.consecutiveFailures} times in a row. Disabling AI for now.`);
      this.aiAvailable = false;
    }
  }
  
  /**
   * Reset failure counter on successful AI response
   */
  private resetFailureCount(): void {
    if (this.consecutiveFailures > 0) {
      console.log('AI service is working again, resetting failure counter');
      this.consecutiveFailures = 0;
      this.aiAvailable = true;
    }
  }
  
  /**
   * Save search results to the cache
   */
  private saveToCache(query: string, results: any[], aiAnalysis?: any): void {
    if (!this.CACHE_ENABLED) return;
    
    this.cache.set(query, {
      timestamp: Date.now(),
      data: results,
      aiAnalysis
    });
    
    console.log(`Saved results for query "${query}" to cache`);
  }
  
  /**
   * Get search results from cache if available and not expired
   */
  private getFromCache(query: string): any[] | null {
    if (!this.CACHE_ENABLED) return null;
    
    const cached = this.cache.get(query);
    if (!cached) return null;
    
    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      console.log(`Cache entry for "${query}" has expired`);
      this.cache.delete(query);
      return null;
    }
    
    return cached.data;
  }
  
  /**
   * Search recipes by a specific protein type
   */
  private async searchRecipesByProtein(protein: string): Promise<any[]> {
    console.log(`Searching recipes for protein: ${protein}`);
    const sqlQuery = `
      SELECT r.id, r.title, r.description, r.cuisine, r.category_id
      FROM recipes r
      JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE i.name ILIKE $1
      ORDER BY r.id DESC LIMIT 20
    `;
    const result = await this.pool.query(sqlQuery, [`%${protein}%`]);
    return result.rows;
  }

  /**
   * Specialized search for protein-based dishes (meat, chicken, fish)
   * This provides better results for queries like "meat dishes" or "chicken recipes"
   */
  private async specializedProteinSearch(proteinType: string): Promise<any[]> {
    try {
      console.log(`Running specialized search for ${proteinType} dishes`);
      
      // Different protein types need different search patterns
      const proteinPatterns: Record<string, string[]> = {
        'meat': ['%meat%', '%beef%', '%steak%', '%pork%', '%lamb%'],
        'chicken': ['%chicken%', '%poultry%'],
        'fish': ['%fish%', '%salmon%', '%tuna%', '%seafood%']
      };
      
      // Get the search patterns for the requested protein
      const patterns = proteinPatterns[proteinType] || [`%${proteinType}%`];
      
      // Build parameter placeholders
      const placeholders = patterns.map((_, idx) => `$${idx + 1}`).join(' OR ');
      
      // Query recipes that contain the protein in ingredients AND title/description
      const sqlQuery = `
        SELECT DISTINCT r.id, r.title, r.description, r.cuisine, r.category_id
        FROM recipes r
        WHERE r.id IN (
          -- Find recipes with the protein in ingredients
          SELECT ri.recipe_id 
          FROM recipe_ingredients ri 
          JOIN ingredients i ON ri.ingredient_id = i.id 
          WHERE ${patterns.map((_, idx) => `i.name ILIKE $${idx + 1}`).join(' OR ')}
        )
        -- Also require mention in title or description for better relevance
        AND (${patterns.map((_, idx) => `r.title ILIKE $${idx + 1} OR r.description ILIKE $${idx + 1}`).join(' OR ')})
        ORDER BY 
          CASE
            WHEN ${patterns.map((_, idx) => `r.title ILIKE $${idx + 1}`).join(' OR ')} THEN 1
            ELSE 2
          END,
          r.id DESC
        LIMIT 20
      `;
      
      console.log(`Executing specialized ${proteinType} search with patterns:`, patterns);
      const result = await this.pool.query(sqlQuery, patterns);
      console.log(`Found ${result.rows.length} ${proteinType} dishes`);
      
      // If too few results, try a more relaxed search
      if (result.rows.length < 5) {
        console.log(`Few results found, trying relaxed ${proteinType} search`);
        return this.relaxedProteinSearch(proteinType);
      }
      
      return result.rows;
    } catch (error) {
      console.error(`Error in specialized ${proteinType} search:`, error);
      // Fallback to a more basic search
      return this.relaxedProteinSearch(proteinType);
    }
  }
  
  /**
   * A more relaxed search for protein dishes when the specialized search returns too few results
   */
  private async relaxedProteinSearch(proteinType: string): Promise<any[]> {
    try {
      console.log(`Running relaxed search for ${proteinType} dishes`);
      
      // Only search in ingredients without requiring title/description match
      const sqlQuery = `
        SELECT DISTINCT r.id, r.title, r.description, r.cuisine, r.category_id
        FROM recipes r
        INNER JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        INNER JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE i.name ILIKE $1
        ORDER BY r.id DESC
        LIMIT 20
      `;
      
      const result = await this.pool.query(sqlQuery, [`%${proteinType}%`]);
      console.log(`Relaxed search found ${result.rows.length} ${proteinType} dishes`);
      
      return result.rows;
    } catch (error) {
      console.error(`Error in relaxed ${proteinType} search:`, error);
      return [];
    }
  }
  
  /**
   * Specialized search for multiple protein types (e.g., "meat and chicken dishes")
   */
  private async specializedCombinedProteinSearch(proteinTypes: string[]): Promise<any[]> {
    try {
      console.log(`Running specialized search for combined ${proteinTypes.join(' and ')} dishes`);
      
      // Create parameters for the SQL query
      const params = proteinTypes.map(type => `%${type}%`);
      
      // Query that finds recipes matching ANY of the protein types in either:
      // 1. Ingredients
      // 2. Title and description
      const sqlQuery = `
        SELECT DISTINCT r.id, r.title, r.description, r.cuisine, r.category_id
        FROM recipes r
        WHERE 
          -- Find recipes with any of the proteins in ingredients
          r.id IN (
            SELECT ri.recipe_id 
            FROM recipe_ingredients ri 
            JOIN ingredients i ON ri.ingredient_id = i.id 
            WHERE ${proteinTypes.map((_, idx) => `i.name ILIKE $${idx + 1}`).join(' OR ')}
          )
          -- Also require mention of at least one protein in title or description for better relevance
          AND (${proteinTypes.map((_, idx) => `r.title ILIKE $${idx + 1} OR r.description ILIKE $${idx + 1}`).join(' OR ')})
        ORDER BY r.id DESC
        LIMIT 20
      `;
      
      console.log(`Executing combined protein search for: ${proteinTypes.join(', ')}`);
      const result = await this.pool.query(sqlQuery, params);
      console.log(`Found ${result.rows.length} combined protein dishes`);
      
      return result.rows;
    } catch (error) {
      console.error(`Error in combined protein search:`, error);
      
      // If the combined search fails, try searching for each protein type separately
      // and combine the results
      try {
        let combinedResults: any[] = [];
        
        for (const proteinType of proteinTypes) {
          const results = await this.relaxedProteinSearch(proteinType);
          combinedResults = [...combinedResults, ...results];
        }
        
        // Remove duplicates (based on recipe id)
        const uniqueResults = Array.from(
          new Map(combinedResults.map(recipe => [recipe.id, recipe])).values()
        );
        
        // Limit to 20 results
        return uniqueResults.slice(0, 20);
      } catch (innerError) {
        console.error('Error in fallback combined protein search:', innerError);
        return [];
      }
    }
  }
  
  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    if (!this.CACHE_ENABLED) return;
    
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [query, item] of this.cache.entries()) {
      if (now - item.timestamp > this.CACHE_TTL) {
        this.cache.delete(query);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Parse the AI response
   */
  private async parseAIResponse(aiAnalysisResponse: string, userQuery: string): Promise<any> {
    try {
      // Extract JSON from the response (in case the model returns additional text)
      let jsonText = aiAnalysisResponse;
      
      // Find JSON object in the response if it's embedded in other text
      const jsonMatch = aiAnalysisResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      
      // Try to parse the JSON
      try {
        const aiAnalysis = JSON.parse(jsonText.replace(/\\n/g, ' '));
        
        // Create default arrays for any missing fields to avoid null pointer exceptions
        aiAnalysis.mainDish = aiAnalysis.mainDish || [];
        aiAnalysis.cuisines = aiAnalysis.cuisines || [];
        aiAnalysis.includeIngredients = aiAnalysis.includeIngredients || [];
        aiAnalysis.excludeIngredients = aiAnalysis.excludeIngredients || [];
        aiAnalysis.dietaryPreferences = aiAnalysis.dietaryPreferences || [];
        aiAnalysis.cookingMethods = aiAnalysis.cookingMethods || [];

        // Apply special post-processing for dietary requirements
        this.processDietaryRequirements(aiAnalysis, userQuery);
        
        return aiAnalysis;
      } catch (parseError) {
        console.log('JSON parse attempt failed, trying fallback parsing');
        return this.createFallbackAnalysis(userQuery);
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.createFallbackAnalysis(userQuery);
    }
  }

  /**
   * Create a fallback analysis when parsing fails
   */
  private createFallbackAnalysis(userQuery: string): any {
    console.log('Creating fallback analysis from query');
    const query = userQuery.toLowerCase();
    
    // Extract dietary preferences
    const dietaryPreferences = [];
    
    // Detect kosher requirement
    if (query.includes('kosher')) {
      dietaryPreferences.push({
        name: 'kosher',
        value: true
      });
    }
    
    // Extract likes and dislikes
    const includeIngredients = [];
    const excludeIngredients = [];
    const mainDish = [];
    
    // Check for specific foods mentioned in the query
    if (query.includes('challah') || query.includes('chalah') || query.includes('hallah')) {
      includeIngredients.push('bread');
      mainDish.push('challah');
    }
    
    // Process kosher requirements
    if (query.includes('kosher')) {
      // Exclude non-kosher combinations
      excludeIngredients.push('pork');
      excludeIngredients.push('shellfish');
      excludeIngredients.push('seafood');
    }
    
    // Process traditional Jewish food preferences
    if (query.includes('matzo') || query.includes('matzah') || query.includes('matza')) {
      includeIngredients.push('matzo');
    }
    
    if (query.includes('brisket')) {
      includeIngredients.push('brisket');
    }
    
    // If no specific ingredients were identified, add some defaults
    if (includeIngredients.length === 0 && !query.includes('kosher')) {
      includeIngredients.push('chicken');
    }
    
    // Create basic analysis object
    const result = {
      mainDish: mainDish,
      cuisines: [],
      includeIngredients: includeIngredients,
      excludeIngredients: excludeIngredients,
      dietaryPreferences: dietaryPreferences,
      cookingMethods: [],
      explanation: "Found recipes based on your dietary preferences"
    };
    
    console.log('Created fallback analysis from query:', result);
    return result;
  }

  /**
   * Process dietary requirements in the AI analysis
   */
  private processDietaryRequirements(aiAnalysis: any, userQuery: string): void {
    const query = userQuery.toLowerCase();
    
    // Handle kosher requirements
    if (query.includes('kosher')) {
      console.log('Detected kosher dietary requirement');
      
      // Add kosher as a dietary preference if not already present
      const hasKosherPreference = aiAnalysis.dietaryPreferences.some((pref: any) => 
        typeof pref === 'string' 
          ? pref.toLowerCase() === 'kosher' 
          : (pref.name && pref.name.toLowerCase() === 'kosher')
      );
      
      if (!hasKosherPreference) {
        aiAnalysis.dietaryPreferences.push({
          name: 'kosher',
          value: true
        });
      }
      
      // Add non-kosher foods to exclude
      const nonKosherFoods = ['pork', 'shellfish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster', 'mussel'];
      nonKosherFoods.forEach(food => {
        if (!aiAnalysis.excludeIngredients.includes(food)) {
          aiAnalysis.excludeIngredients.push(food);
        }
      });
      
      // For strict kosher, we need to avoid mixing meat and dairy in the same recipe
      const hasMeat = this.containsAnyTerms(aiAnalysis.includeIngredients, ['meat', 'beef', 'chicken', 'lamb', 'veal']);
      const hasDairy = this.containsAnyTerms(aiAnalysis.includeIngredients, ['milk', 'cheese', 'butter', 'cream', 'dairy']);
      
      // If both meat and dairy are requested, prioritize meat and remove dairy
      if (hasMeat && hasDairy) {
        console.log('Kosher conflict detected: both meat and dairy requested. Prioritizing meat.');
        const dairyTerms = ['milk', 'cheese', 'butter', 'cream', 'dairy'];
        aiAnalysis.includeIngredients = aiAnalysis.includeIngredients.filter((ing: string) => 
          !dairyTerms.some(dairy => ing.includes(dairy)));
        dairyTerms.forEach(dairy => {
          if (!aiAnalysis.excludeIngredients.includes(dairy)) {
            aiAnalysis.excludeIngredients.push(dairy);
          }
        });
      }
      
      // Update explanation if kosher is added
      if (aiAnalysis.explanation && !aiAnalysis.explanation.toLowerCase().includes('kosher')) {
        aiAnalysis.explanation = `Kosher recipes based on your preferences: ${aiAnalysis.explanation}`;
      } else {
        aiAnalysis.explanation = 'Kosher recipes based on your preferences';
      }
    }
    
    // Handle challah bread
    if (query.includes('challah') || query.includes('chalah') || query.includes('hallah')) {
      console.log('Detected challah bread requirement');
      if (!this.containsAnyTerms(aiAnalysis.mainDish, ['challah', 'bread']) && 
          !this.containsAnyTerms(aiAnalysis.includeIngredients, ['challah', 'bread'])) {
        aiAnalysis.mainDish.push('challah');
        aiAnalysis.includeIngredients.push('bread');
      }
    }
  }

  /**
   * Check if any of the terms in sourceArray contain any of the terms in targetTerms
   */
  private containsAnyTerms(sourceArray: string[], targetTerms: string[]): boolean {
    if (!Array.isArray(sourceArray)) return false;
    
    return sourceArray.some((source: string) => 
      targetTerms.some(target => 
        source.toLowerCase().includes(target.toLowerCase())
      )
    );
  }
}