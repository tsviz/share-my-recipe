import { LocalAIClient } from './localai-client';
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
  private llmClient: LocalAIClient;
  private pool: Pool;
  private glossaryService: GlossaryService;
  private aiAvailable: boolean = true; // Optimistic initial setting
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES = 3;
  
  // Search result caching
  private cache: Map<string, CacheItem> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
  private readonly CACHE_ENABLED = true;
  
  constructor(pool: Pool, llmClient?: LocalAIClient) {
    this.pool = pool;
    this.llmClient = llmClient || new LocalAIClient();
    this.glossaryService = new GlossaryService(pool);
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 10 * 60 * 1000); // Run every 10 minutes
  }

  /**
   * Select the appropriate model based on query complexity
   * Uses more capable models for structured JSON generation that fit within memory constraints
   */
  private selectModelForQuery(query: string): string {
    // Use the model specified in environment variables, or fall back to a default
    const envModel = process.env.LLM_MODEL;
    
    // If environment variable is set, prioritize it
    if (envModel) {
      console.log(`Using model ${envModel} for structured JSON generation (from environment)`);
      return envModel;
    }
    
    // List models in order of preference (prioritizing memory efficiency)
    const preferredModels = [
      'tinyllama',                      // Meta tinyllama, efficient with low memory requirements
      'Phi-3-mini-4k-instruct-q4',      // Microsoft Phi-3-mini, excellent performance at low size (~2GB)
      'mistral-7b-instruct-v0.2-q4',    // Highly optimized instruction model (~3GB)
      'llama-2-7b-chat-q4',             // Meta LLaMA2 with quantization
      'gemma-7b-it-q4',                 // Google Gemma instruction model
    ];
    
    // Use first preferred model as default
    const defaultModel = preferredModels[0];
    
    console.log(`Using model ${defaultModel} for structured JSON generation (from defaults)`);
    return defaultModel;
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
      
      // Skip AI if we've had too many consecutive failures
      if (!this.aiAvailable) {
        console.log('AI service marked as unavailable due to previous failures, using fallback search');
        const results = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, results);
        return results;
      }
      
      // Check if AI service is available and try to prepare the model
      try {
        const isHealthy = await this.llmClient.healthCheck().catch(() => false);
        if (!isHealthy) {
          this.incrementFailureCount();
          console.log('AI service health check failed, using fallback search');
          const results = await this.fallbackSearch(userQuery);
          this.saveToCache(normalizedQuery, results);
          return results;
        }
        
        // If health check passed, assume model is available
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
      
      // Select the appropriate model for this query and ensure it's set in the client
      const modelToUse = this.selectModelForQuery(userQuery);
      
      // Generate prompt for the LLM to analyze the user's query
      // This is where we ask the LLM to translate the natural language query into structured search parameters
      const prompt = `You are a cooking assistant analyzing a recipe search query to extract structured information.

TASK: Analyze this query and extract search parameters in JSON format:
"${userQuery}"

INSTRUCTIONS:
1. Think step by step about what the user is looking for in a recipe.
2. Consider the cuisine type (American, Italian, etc.), ingredients they want to include or exclude, and any dietary preferences.
3. Format your response ONLY as a valid JSON object with these exact fields:

{
  "mainDish": [],      // Main dish types mentioned (e.g., "pasta", "soup", "pizza")
  "cuisines": [],      // Cuisine types (e.g., "American", "Italian", "Mexican")
  "includeIngredients": [], // Ingredients the user wants to include
  "excludeIngredients": [], // Ingredients the user wants to exclude or doesn't like
  "dietaryPreferences": [], // Dietary requirements (e.g., "vegetarian", "kosher")
  "cookingMethods": [], // Cooking methods (e.g., "bake", "grill", "fry")
  "explanation": ""    // Brief explanation of what was understood from the query
}

IMPORTANT:
- Respond with ONLY the JSON object above, nothing else.
- Use empty arrays ([]) when nothing is mentioned for a category.
- For queries like "I like X but not Y", put X in includeIngredients and Y in excludeIngredients.
- If a cuisine is mentioned (e.g., American, Italian), be sure to include it in the cuisines array.
- Check specifically for dietary preferences like vegetarian, vegan, kosher, gluten-free, etc.

EXAMPLES:

Query: "I want vegetarian pasta without mushrooms"
{
  "mainDish": ["pasta"],
  "cuisines": ["Italian"],
  "includeIngredients": [],
  "excludeIngredients": ["mushrooms"],
  "dietaryPreferences": ["vegetarian"],
  "cookingMethods": [],
  "explanation": "Vegetarian pasta dishes without mushrooms"
}

Query: "Show me American cheese recipes"
{
  "mainDish": [],
  "cuisines": ["American"],
  "includeIngredients": ["cheese"],
  "excludeIngredients": [],
  "dietaryPreferences": [],
  "cookingMethods": [],
  "explanation": "American cuisine recipes with cheese"
}

Query: "I love spicy Mexican food but I'm allergic to cilantro"
{
  "mainDish": [],
  "cuisines": ["Mexican"],
  "includeIngredients": ["spicy"],
  "excludeIngredients": ["cilantro"],
  "dietaryPreferences": [],
  "cookingMethods": [],
  "explanation": "Spicy Mexican dishes without cilantro"
}

Remember to output ONLY the JSON object.`;

      // Get AI analysis of the user query
      const aiAnalysisResponse = await this.llmClient.generateCompletion(prompt, { model: modelToUse });
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
      
      // Expand 'dairy products' into specific ingredients
      const dairyProducts = ['milk', 'cheese', 'butter', 'sour cream', 'yogurt', 'cream', 'ice cream', 'whey', 'casein', 'ghee'];
      if (aiAnalysis.excludeIngredients.includes('dairy products')) {
        aiAnalysis.excludeIngredients = (aiAnalysis.excludeIngredients as string[]).filter((ingredient: string) => ingredient !== 'dairy products');
        aiAnalysis.excludeIngredients.push(...dairyProducts);
      }

      // Expand 'milk products' into specific terms
      const milkProducts = ['cheese', 'butter', 'cream', 'milk', 'yogurt', 'sour cream', 'ice cream', 'whey', 'casein', 'ghee'];
      if (aiAnalysis.excludeIngredients.includes('milk products')) {
        aiAnalysis.excludeIngredients = (aiAnalysis.excludeIngredients as string[]).filter((ingredient: string) => ingredient !== 'milk products');
        aiAnalysis.excludeIngredients.push(...milkProducts);
      }

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
        // Instead of defaulting to Jewish food, try to extract cuisine from query
        // or leave it open if no cuisine is specified
        const extractedCuisines = this.extractCuisinesFromQuery(userQuery);
        
        if (extractedCuisines.length > 0) {
          console.log('No cuisines specified in AI analysis, using extracted cuisines:', extractedCuisines);
          const cuisineParams: string[] = [];
          extractedCuisines.forEach((cuisine: string) => {
            sqlParams.push(`%${cuisine}%`);
            cuisineParams.push(`r.cuisine ILIKE $${paramIndex++}`);
          });
          sqlQuery += ` AND (${cuisineParams.join(' OR ')})`;
        } else {
          console.log('No cuisines detected, not applying cuisine filter');
          // Don't add any cuisine filter to allow all cuisines
        }
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
        // Ensure expanded excludeIngredients are applied in the SQL query
        const excludeConditions: string = aiAnalysis.excludeIngredients.map((ingredient: string, index: number) => `i.name ILIKE $${index + paramIndex}`).join(' OR ');
        sqlQuery += ` AND r.id NOT IN (
          SELECT ri.recipe_id 
          FROM recipe_ingredients ri 
          JOIN ingredients i ON ri.ingredient_id = i.id 
          WHERE ${excludeConditions}
        )`;
        sqlParams.push(...(aiAnalysis.excludeIngredients as string[]).map((ingredient: string) => `%${ingredient}%`));
        paramIndex += aiAnalysis.excludeIngredients.length;
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
   * Enhanced fallback search for protein-based dishes and combined queries
   */
  private async fallbackSearch(query: string): Promise<any[]> {
    const lowerQuery = query.toLowerCase();

    // Detect combined protein queries like "meat and chicken dishes"
    if (lowerQuery.includes('meat') && lowerQuery.includes('chicken')) {
      console.log('Detected combined meat and chicken query, using specialized protein search');
      const results = await this.specializedCombinedProteinSearch(['meat', 'chicken']);
      this.saveToCache(query, results); // Cache the results
      return results;
    }

    // Detect individual protein queries
    if (lowerQuery.includes('meat')) {
      console.log('Detected meat dish query, using specialized meat search');
      const results = await this.specializedProteinSearch('meat');
      this.saveToCache(query, results); // Cache the results
      return results;
    }

    if (lowerQuery.includes('chicken')) {
      console.log('Detected chicken dish query, using specialized chicken search');
      const results = await this.specializedProteinSearch('chicken');
      this.saveToCache(query, results); // Cache the results
      return results;
    }

    // Handle empty queries by returning popular recipes
    if (!query.trim()) {
      console.log('Empty query detected, returning default recommendations');
      const popularRecipes = await this.getPopularRecipes();
      this.saveToCache(query, popularRecipes); // Cache the results
      return popularRecipes;
    }

    // Default fallback behavior
    console.log('Fallback search executed for query:', query);
    const results = await this.defaultFallbackSearch(query); // Use default fallback method
    this.saveToCache(query, results); // Cache the results
    return results;
  }

  /**
   * Default fallback search logic to handle queries without recursion
   */
  private async defaultFallbackSearch(query: string): Promise<any[]> {
    console.log('Executing default fallback search for query:', query);

    // Example logic: Return popular recipes as a fallback
    const sqlQuery = `
      SELECT r.id, r.title, r.description, r.cuisine, r.category_id
      FROM recipes r
      ORDER BY r.popularity DESC
      LIMIT 20
    `;
    const result = await this.pool.query(sqlQuery);
    return result.rows;
  }

  /**
   * Fetch popular recipes for default recommendations
   */
  private async getPopularRecipes(): Promise<any[]> {
    const sqlQuery = `
      SELECT r.id, r.title, r.description, r.cuisine, r.category_id
      FROM recipes r
      ORDER BY r.popularity DESC
      LIMIT 20
    `;
    const result = await this.pool.query(sqlQuery);
    return result.rows;
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
   * Parse the AI response with robust error handling for incomplete JSON
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
        // Clean up the JSON text before parsing
        jsonText = this.sanitizeJsonString(jsonText);
        
        const aiAnalysis = JSON.parse(jsonText);
        
        // Create default arrays for any missing fields to avoid null pointer exceptions
        aiAnalysis.mainDish = aiAnalysis.mainDish || [];
        aiAnalysis.cuisines = aiAnalysis.cuisines || [];
        aiAnalysis.includeIngredients = aiAnalysis.includeIngredients || [];
        aiAnalysis.excludeIngredients = aiAnalysis.excludeIngredients || [];
        aiAnalysis.dietaryPreferences = aiAnalysis.dietaryPreferences || [];
        aiAnalysis.cookingMethods = aiAnalysis.cookingMethods || [];
        aiAnalysis.explanation = aiAnalysis.explanation || "Recipe search based on your preferences";

        // Apply special post-processing for dietary requirements
        this.processDietaryRequirements(aiAnalysis, userQuery);
        
        // Process the original query to identify cuisine information that might have been missed
        this.extractMissedCuisineInformation(aiAnalysis, userQuery);

        // Expand 'dairy products' into specific ingredients
        const dairyProducts = ['milk', 'cheese', 'butter', 'sour cream', 'yogurt', 'cream', 'ice cream', 'whey', 'casein', 'ghee'];
        if (aiAnalysis.excludeIngredients.includes('dairy products')) {
            aiAnalysis.excludeIngredients = (aiAnalysis.excludeIngredients as string[]).filter((ingredient: string) => ingredient !== 'dairy products');
          aiAnalysis.excludeIngredients.push(...dairyProducts);
        }
        
        return aiAnalysis;
      } catch (parseError) {
        console.log('Standard JSON parse attempt failed, trying advanced parsing:', parseError);
        
        // Try more advanced recovery techniques
        const recoveredJson = this.attemptJsonRecovery(jsonText);
        if (recoveredJson) {
          console.log('Successfully recovered JSON structure');
          return recoveredJson;
        }
        
        console.log('Advanced parsing failed, using fallback analysis');
        return this.createFallbackAnalysis(userQuery);
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.createFallbackAnalysis(userQuery);
    }
  }
  
  /**
   * Clean up and sanitize JSON string for parsing
   */
  private sanitizeJsonString(jsonStr: string): string {
    // Replace common issues that cause parsing errors
    let cleaned = jsonStr
      .replace(/\\n/g, ' ')                 // Replace newlines with spaces
      .replace(/,\s*}/g, '}')               // Remove trailing commas
      .replace(/,\s*]/g, ']')               // Remove trailing commas in arrays
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2": ')  // Ensure property names are quoted
      .replace(/\t/g, ' ')                  // Replace tabs with spaces
      .replace(/\n/g, ' ');                 // Replace literal newlines
    
    // Fix unbalanced braces/brackets
    const openBraces = (cleaned.match(/\{/g) || []).length;
    const closeBraces = (cleaned.match(/\}/g) || []).length;
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;
    
    // Add missing closing braces
    if (openBraces > closeBraces) {
      cleaned += '}'.repeat(openBraces - closeBraces);
    }
    
    // Add missing closing brackets
    if (openBrackets > closeBrackets) {
      cleaned += ']'.repeat(openBrackets - closeBrackets);
    }
    
    return cleaned;
  }
  
  /**
   * Try to recover JSON from incomplete or malformed response
   */
  private attemptJsonRecovery(jsonStr: string): any | null {
    try {
      // Strategy 1: Try to extract partial JSON properties
      const analysis: any = {
        mainDish: [],
        cuisines: [],
        includeIngredients: [],
        excludeIngredients: [],
        dietaryPreferences: [],
        cookingMethods: [],
        explanation: "Recipe search based on extracted preferences"
      };
      
      // Look for array values with regex
      const arrayProps = [
        { name: 'mainDish', regex: /"mainDish"\s*:\s*\[([\s\S]*?)\]/ },
        { name: 'cuisines', regex: /"cuisines"\s*:\s*\[([\s\S]*?)\]/ },
        { name: 'includeIngredients', regex: /"includeIngredients"\s*:\s*\[([\s\S]*?)\]/ },
        { name: 'excludeIngredients', regex: /"excludeIngredients"\s*:\s*\[([\s\S]*?)\]/ },
        { name: 'dietaryPreferences', regex: /"dietaryPreferences"\s*:\s*\[([\s\S]*?)\]/ },
        { name: 'cookingMethods', regex: /"cookingMethods"\s*:\s*\[([\s\S]*?)\]/ },
      ];
      
      // Extract arrays for each property
      for (const prop of arrayProps) {
        const match = jsonStr.match(prop.regex);
        if (match && match[1]) {
          try {
            // Try to parse as JSON array
            const itemsStr = `[${match[1]}]`;
            const items = JSON.parse(this.sanitizeJsonString(itemsStr));
            if (Array.isArray(items)) {
              analysis[prop.name] = items;
            }
          } catch (e) {
            // If that fails, try to extract quoted strings manually
            const itemMatches = match[1].match(/"([^"]*)"/g) || [];
            analysis[prop.name] = itemMatches.map(m => m.replace(/"/g, ''));
          }
        }
      }
      
      // Extract explanation
      const explanationMatch = jsonStr.match(/"explanation"\s*:\s*"([^"]*)"/);
      if (explanationMatch && explanationMatch[1]) {
        analysis.explanation = explanationMatch[1];
      }
      
      // Check if we extracted anything useful
      const extractedSomething = arrayProps.some(prop => 
        Array.isArray(analysis[prop.name]) && analysis[prop.name].length > 0
      );
      
      return extractedSomething ? analysis : null;
    } catch (error) {
      console.error('Error in JSON recovery attempt:', error);
      return null;
    }
  }
  
  /**
   * Process dietary requirements that might have been missed by the LLM
   */
  private processDietaryRequirements(aiAnalysis: any, userQuery: string): void {
    const query = userQuery.toLowerCase();

    // If no dietary preferences were identified, check for common dietary keywords
    if (!aiAnalysis.dietaryPreferences || aiAnalysis.dietaryPreferences.length === 0) {
      const dietaryKeywords: {[key: string]: string} = {
        'vegan': 'vegan',
        'vegetarian': 'vegetarian',
        'kosher': 'kosher',
        'halal': 'halal',
        'gluten-free': 'gluten-free',
        'dairy-free': 'dairy-free',
        'lactose-free': 'dairy-free',
        'nut-free': 'nut-free',
        'low carb': 'low-carb',
        'keto': 'keto'
      };

      // Check if query mentions any dietary preference
      for (const [keyword, preference] of Object.entries(dietaryKeywords)) {
        if (query.includes(keyword)) {
          console.log(`Identified missed dietary preference: ${preference} from query`);
          aiAnalysis.dietaryPreferences.push(preference);
        }
      }
    }

    // Check for patterns like "without dairy" or "no meat"
    const exclusionPatterns = [
      { regex: /without\s+([a-zA-Z\s]+)/i, type: 'excludeIngredients' },
      { regex: /no\s+([a-zA-Z\s]+)/i, type: 'excludeIngredients' },
      { regex: /don'?t\s+(?:like|want|eat)\s+([a-zA-Z\s]+)/i, type: 'excludeIngredients' }
    ];

    for (const pattern of exclusionPatterns) {
      const match = query.match(pattern.regex);
      if (match && match[1]) {
        const excluded = match[1].trim().toLowerCase();
        
        // Check if the exclusion is a dietary category
        if (excluded === 'meat' || excluded === 'animal products') {
          if (!aiAnalysis.dietaryPreferences.includes('vegetarian')) {
            console.log('Detected vegetarian preference from exclusion pattern');
            aiAnalysis.dietaryPreferences.push('vegetarian');
          }
        } else if (excluded === 'dairy' || excluded === 'milk') {
          if (!aiAnalysis.dietaryPreferences.includes('dairy-free')) {
            console.log('Detected dairy-free preference from exclusion pattern');
            aiAnalysis.dietaryPreferences.push('dairy-free');
          }
        } else if (excluded === 'gluten') {
          if (!aiAnalysis.dietaryPreferences.includes('gluten-free')) {
            console.log('Detected gluten-free preference from exclusion pattern');
            aiAnalysis.dietaryPreferences.push('gluten-free');
          }
        } else {
          // Add to excluded ingredients if not already there
          if (!aiAnalysis.excludeIngredients.some((item: string) => item.toLowerCase() === excluded)) {
            console.log(`Adding excluded ingredient from pattern: ${excluded}`);
            aiAnalysis.excludeIngredients.push(excluded);
          }
        }
      }
    }
  }

  /**
   * Extract cuisine information that might have been missed by the LLM
   */
  private extractMissedCuisineInformation(aiAnalysis: any, userQuery: string): void {
    const query = userQuery.toLowerCase();
    
    // If the LLM didn't identify cuisines but the query contains cuisine keywords, add them
    if ((!aiAnalysis.cuisines || aiAnalysis.cuisines.length === 0)) {
      // Common cuisine keywords
      const cuisineKeywords: {[key: string]: string} = {
        'american': 'American',
        'italian': 'Italian', 
        'mexican': 'Mexican', 
        'chinese': 'Chinese',
        'japanese': 'Japanese', 
        'thai': 'Thai', 
        'indian': 'Indian',
        'french': 'French', 
        'mediterranean': 'Mediterranean',
        'greek': 'Greek',
        'spanish': 'Spanish',
        'middle eastern': 'Middle Eastern',
        'korean': 'Korean',
        'vietnamese': 'Vietnamese'
      };
      
      // Check if the query mentions any cuisine
      for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
        if (query.includes(keyword)) {
          console.log(`Identified missed cuisine: ${cuisine} from query`);
          aiAnalysis.cuisines.push(cuisine);
        }
      }
    }
    
    // Also check for phrases like "from X cuisine" or "X style"
    const cuisinePatterns = [
      /from\s+([a-zA-Z\s]+)\s+cuisine/i,
      /([a-zA-Z]+)\s+style\s+recipes/i,
      /([a-zA-Z]+)\s+dishes/i
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const potentialCuisine = match[1].trim();
        
        // Avoid adding very short terms or duplicates
        if (potentialCuisine.length > 3 && 
            !aiAnalysis.cuisines.some((c: string) => 
              c.toLowerCase() === potentialCuisine.toLowerCase())) {
          // Capitalize first letter
          const formattedCuisine = potentialCuisine.charAt(0).toUpperCase() + 
                                  potentialCuisine.slice(1).toLowerCase();
          console.log(`Extracted cuisine from pattern: ${formattedCuisine}`);
          aiAnalysis.cuisines.push(formattedCuisine);
        }
      }
    }
  }

  /**
   * Extract cuisines from user query text
   * Used when the LLM doesn't identify a cuisine
   */
  private extractCuisinesFromQuery(query: string): string[] {
    const cuisines: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Common cuisine keywords to check for
    const cuisineKeywords: {[key: string]: string} = {
      'american': 'American',
      'italian': 'Italian', 
      'mexican': 'Mexican', 
      'chinese': 'Chinese',
      'japanese': 'Japanese', 
      'thai': 'Thai', 
      'indian': 'Indian',
      'french': 'French', 
      'mediterranean': 'Mediterranean',
      'greek': 'Greek',
      'spanish': 'Spanish',
      'middle eastern': 'Middle Eastern',
      'korean': 'Korean',
      'vietnamese': 'Vietnamese',
      'jewish': 'Jewish',
      'german': 'German',
      'ethiopian': 'Ethiopian',
      'african': 'African',
      'brazilian': 'Brazilian',
      'caribbean': 'Caribbean'
    };
    
    // Check for direct mentions of cuisines
    for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
      if (lowerQuery.includes(keyword)) {
        console.log(`Extracted cuisine from query: ${cuisine}`);
        cuisines.push(cuisine);
      }
    }
    
    // Check for phrases like "from X cuisine" or "X style"
    const cuisinePatterns = [
      /from\s+([a-zA-Z\s]+)\s+cuisine/i,
      /([a-zA-Z]+)\s+style\s+food/i,
      /([a-zA-Z]+)\s+style\s+recipe/i,
      /([a-zA-Z]+)\s+dishes/i
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = lowerQuery.match(pattern);
      if (match && match[1]) {
        const potentialCuisine = match[1].trim();
        
        // Skip if very short
        if (potentialCuisine.length > 3) {
          // Capitalize first letter
          const formattedCuisine = potentialCuisine.charAt(0).toUpperCase() + 
                                  potentialCuisine.slice(1);
          
          // Avoid duplicates
          if (!cuisines.includes(formattedCuisine)) {
            console.log(`Extracted cuisine from pattern: ${formattedCuisine}`);
            cuisines.push(formattedCuisine);
          }
        }
      }
    }
    
    // Check for cuisine-specific dishes that imply a cuisine
    const dishCuisineMap: Record<string, string> = {
      'pizza': 'Italian',
      'pasta': 'Italian',
      'sushi': 'Japanese',
      'curry': 'Indian',
      'taco': 'Mexican',
      'burrito': 'Mexican',
      'pad thai': 'Thai',
      'stir fry': 'Chinese',
      'paella': 'Spanish',
      'goulash': 'Hungarian',
      'gyro': 'Greek',
      'falafel': 'Middle Eastern',
      'schnitzel': 'German',
      'crepe': 'French'
    };
    
    for (const [dish, cuisine] of Object.entries(dishCuisineMap)) {
      if (lowerQuery.includes(dish) && !cuisines.includes(cuisine)) {
        console.log(`Inferred cuisine ${cuisine} from dish ${dish}`);
        cuisines.push(cuisine);
      }
    }
    
    return cuisines;
  }

  /**
   * Create a fallback analysis when parsing fails
   */
  private createFallbackAnalysis(userQuery: string): any {
    console.log('Creating fallback analysis from query');
    const query = userQuery.toLowerCase();
    
    // Extract dietary preferences
    const dietaryPreferences = [];
    
    // Detect dietary requirements
    const dietaryKeywords = {
      'kosher': 'kosher',
      'vegan': 'vegan',
      'vegetarian': 'vegetarian',
      'gluten-free': 'gluten-free',
      'gluten free': 'gluten-free',
      'dairy-free': 'dairy-free',
      'dairy free': 'dairy-free',
      'keto': 'keto',
      'low carb': 'low-carb',
      'paleo': 'paleo'
    };
    
    // Check for dietary preferences
    for (const [keyword, value] of Object.entries(dietaryKeywords)) {
      if (query.includes(keyword)) {
        dietaryPreferences.push(value);
      }
    }
    
    // Extract cuisines mentioned in the query
    const cuisines = [];
    const cuisineKeywords = {
      'american': 'American',
      'italian': 'Italian', 
      'mexican': 'Mexican', 
      'chinese': 'Chinese',
      'japanese': 'Japanese', 
      'thai': 'Thai', 
      'indian': 'Indian',
      'french': 'French', 
      'mediterranean': 'Mediterranean',
      'greek': 'Greek',
      'spanish': 'Spanish',
      'middle eastern': 'Middle Eastern',
      'korean': 'Korean',
      'vietnamese': 'Vietnamese',
      'jewish': 'Jewish',
      'german': 'German',
      'ethiopian': 'Ethiopian',
      'african': 'African',
      'brazilian': 'Brazilian',
      'caribbean': 'Caribbean'
    };
    
    // Check if the query mentions any cuisine
    for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
      if (query.includes(keyword)) {
        console.log(`Identified cuisine in fallback: ${cuisine}`);
        cuisines.push(cuisine);
      }
    }
    
    // Check for cuisine patterns like "from X cuisine"
    const cuisinePatterns = [
      /from\s+([a-zA-Z\s]+)\s+cuisine/i,
      /([a-zA-Z]+)\s+style\s+food/i,
      /([a-zA-Z]+)\s+dishes/i
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const potentialCuisine = match[1].trim();
        
        // Skip if very short
        if (potentialCuisine.length > 3) {
          // Capitalize first letter
          const formattedCuisine = potentialCuisine.charAt(0).toUpperCase() + 
                                  potentialCuisine.slice(1).toLowerCase();
          
          // Avoid duplicates
          if (!cuisines.includes(formattedCuisine)) {
            console.log(`Extracted cuisine from pattern: ${formattedCuisine}`);
            cuisines.push(formattedCuisine);
          }
        }
      }
    }
    
    // Extract likes and dislikes
    const includeIngredients: string[] = [];
    const excludeIngredients: string[] = [];
    const mainDish = [];
    
    // Extract ingredients the user wants
    const positivePatterns = [
      /(?:i like|i want|i love|with|include|add|using|made with|containing)(?:\s+\w+)?\s+(\w+)/gi,
      /(?:i'm looking for)(?:\s+\w+)?\s+(\w+)(?:\s+recipes)/gi
    ];
    
    for (const pattern of positivePatterns) {
      const matches = [...query.matchAll(pattern)];
      if (matches.length > 0) {
        matches.forEach(match => {
          if (match[1] && match[1].length > 2) {
            const ingredient = match[1].toLowerCase();
            if (!includeIngredients.includes(ingredient)) {
              includeIngredients.push(ingredient);
            }
          }
        });
      }
    }
    
    // Extract ingredients the user doesn't want
    const negativePatterns = [
      /(?:i (?:don't|dont|do not) (?:like|want)|without|no|not|exclude)(?:\s+\w+)?\s+(\w+)/gi,
      /(?:no)(?:\s+\w+)?\s+(\w+)(?:\s+(?:please|thanks))?/gi
    ];
    
    for (const pattern of negativePatterns) {
      const matches = [...query.matchAll(pattern)];
      if (matches.length > 0) {
        matches.forEach(match => {
          if (match[1] && match[1].length > 2) {
            const ingredient = match[1].toLowerCase();
            if (!excludeIngredients.includes(ingredient)) {
              excludeIngredients.push(ingredient);
            }
          }
        });
      }
    }
    
    // Extract dish types
    const dishPatterns = [
      /(?:i want|looking for|need)(?:\s+\w+)?\s+(\w+)(?:\s+recipe)/i,
      /(?:how to make|make)(?:\s+\w+)?\s+(\w+)/i
    ];
    
    for (const pattern of dishPatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const dish = match[1].toLowerCase();
        if (dish.length > 2) {
          mainDish.push(dish);
        }
      }
    }
    
    // Common foods that might be specified directly
    const commonFoods = ['pasta', 'pizza', 'soup', 'salad', 'sandwich', 'bread', 'cake', 'pie', 'cookie', 
                        'stew', 'curry', 'burger', 'taco', 'burrito', 'sushi', 'rice', 'noodle'];
    
    for (const food of commonFoods) {
      if (query.includes(food) && !mainDish.includes(food)) {
        mainDish.push(food);
      }
    }
    
    // Common ingredients
    const commonIngredients = ['cheese', 'chicken', 'beef', 'pork', 'fish', 'shrimp', 'tomato',
                             'garlic', 'onion', 'potato', 'carrot', 'broccoli', 'spinach', 'mushroom'];
    
    for (const ingredient of commonIngredients) {
      if (query.includes(ingredient) && 
          !includeIngredients.includes(ingredient) && 
          !excludeIngredients.includes(ingredient)) {
        includeIngredients.push(ingredient);
      }
    }
    
    // If no specific cuisines were identified but dish types suggest a cuisine, add it
    if (cuisines.length === 0) {
      const dishCuisineMap: Record<string, string> = {
        'pizza': 'Italian',
        'pasta': 'Italian',
        'sushi': 'Japanese',
        'curry': 'Indian',
        'taco': 'Mexican',
        'burrito': 'Mexican',
        'stir fry': 'Chinese'
      };
      
      for (const dish of mainDish) {
        if (dishCuisineMap[dish]) {
          cuisines.push(dishCuisineMap[dish]);
          break;
        }
      }
    }
    
    // Create basic analysis object
    const result = {
      mainDish: mainDish,
      cuisines: cuisines,
      includeIngredients: includeIngredients,
      excludeIngredients: excludeIngredients,
      dietaryPreferences: dietaryPreferences,
      cookingMethods: [],
      explanation: "Found recipes based on your preferences"
    };
    
    console.log('Created fallback analysis from query:', result);
    return result;
  }
}

interface AIResponseAssumptions {
  mainDish: string[];
  cuisines: string[];
  includeIngredients: string[];
  excludeIngredients: string[];
  dietaryPreferences: string[];
  cookingMethods: string[];
  [key: string]: any; // For any additional fields
}

function humanizeAIResponse(rawResponse: string): string {
  const assumptions = rawResponse.match(/\{[^\}]*\}/);
  if (!assumptions) {
    return "Sorry, I couldn't extract assumptions from the AI response.";
  }

  const parsedAssumptions: AIResponseAssumptions = JSON.parse(assumptions[0]);
  const humanizedResponse = [
    "Here are the AI's assumptions based on your query:",
    parsedAssumptions.mainDish.length ? `Main Dish: ${parsedAssumptions.mainDish.join(', ')}` : null,
    parsedAssumptions.cuisines.length ? `Cuisine: ${parsedAssumptions.cuisines.join(', ')}` : null,
    parsedAssumptions.includeIngredients.length ? `Included Ingredients: ${parsedAssumptions.includeIngredients.join(', ')}` : null,
    parsedAssumptions.excludeIngredients.length ? `Excluded Ingredients: ${parsedAssumptions.excludeIngredients.join(', ')}` : null,
    parsedAssumptions.dietaryPreferences.length ? `Dietary Preferences: ${parsedAssumptions.dietaryPreferences.join(', ')}` : null,
    parsedAssumptions.cookingMethods.length ? `Cooking Methods: ${parsedAssumptions.cookingMethods.join(', ')}` : null
  ].filter(Boolean).join('\n');

  return humanizedResponse;
}

module.exports = { humanizeAIResponse };