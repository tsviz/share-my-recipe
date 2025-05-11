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

    // Add indexes to improve query performance
    this.pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes (title)`);
    this.pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_description ON recipes (description)`);
    this.pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes (cuisine)`);
  }

  /**
   * Retrieve cached data for a given query if it exists and is not expired.
   */
  private getFromCache(query: string): any[] | null {
    if (!this.CACHE_ENABLED) return null;

    const cacheItem = this.cache.get(query);
    if (cacheItem) {
      const now = Date.now();
      if (now - cacheItem.timestamp < this.CACHE_TTL) {
        return cacheItem.data;
      } else {
        // Remove expired cache entry
        this.cache.delete(query);
      }
    }
    return null;
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
    
    // Default to mistral if no environment variable is set
    return 'mistral';
  }

  /**
   * Reset the failure count and mark AI as available.
   */
  private resetFailureCount(): void {
    this.consecutiveFailures = 0;
    this.aiAvailable = true;
  }

  /**
   * Increment the failure count and mark AI as unavailable if the maximum is reached.
   */
  private incrementFailureCount(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      this.aiAvailable = false;
      console.log('AI service marked as unavailable due to consecutive failures');
    }
  }

  /**
   * Optimize the prompt to reduce LLM processing time.
   */
  private generateOptimizedPrompt(userQuery: string): string {
    return `Extract the following fields as a JSON object from the user query:
    {
      "mainDish": [],
      "cuisines": [],
      "includeIngredients": [],
      "excludeIngredients": [],
      "dietaryPreferences": [],
      "cookingMethods": []
    }
    User query: "${userQuery}"
    Only return the JSON object.`;
  }

  /**
   * Analyze the user query using the LLM to extract structured search parameters.
   */
  private async analyzeQueryWithAI(userQuery: string): Promise<any> {
    try {
      // Always use environment model, never try to set a different model
      const model = process.env.LLM_MODEL || 'mistral';
      console.log(`Using model ${model} for structured JSON generation (enforced by environment)`);
      
      const prompt = this.generateOptimizedPrompt(userQuery);
      
      // Pass the model name but don't allow any internal override
      const aiResponse = await this.llmClient.generateCompletion(prompt, {});
      const aiAnalysis = await this.parseAIResponse(aiResponse, userQuery);
      
      // Post-process the AI analysis to enhance it with pattern matching
      const enhancedAnalysis = aiAnalysis; // Directly use aiAnalysis if enhancement is not required
      
      this.resetFailureCount();
      return enhancedAnalysis;
    } catch (error) {
          this.incrementFailureCount();
          throw error; // Ensure the method ends properly
        }
      }
  
  /**
   * If no parameters are returned from the user query, use the LLM to generate parameters.
   * @param userQuery The user's input query.
   * @returns Generated parameters for the database search.
   */
  private async generateParametersWithLLM(userQuery: string): Promise<any> {
    try {
      const prompt = `The user query is: "${userQuery}". Generate structured parameters for a recipe search, including mainDish, cuisines, includeIngredients, excludeIngredients, dietaryPreferences, and cookingMethods.`;
      const aiResponse = await this.llmClient.generateCompletion(prompt, {});
      const generatedParameters = JSON.parse(aiResponse);
      return generatedParameters;
    } catch (error) {
      console.error('Error generating parameters with LLM:', error);
      return {
        mainDish: [],
        cuisines: [],
        includeIngredients: [],
        excludeIngredients: [],
        dietaryPreferences: [],
        cookingMethods: []
      };
    }
  }

  /**
   * Enhance fallback mechanism to use LLM for generating meaningful parameters.
   * Handles non-JSON responses gracefully.
   * @param userQuery The user's input query.
   * @returns Enhanced parameters for the database search.
   */
  private async enhanceFallbackWithLLM(userQuery: string): Promise<any> {
    try {
      const prompt = `The user query is: "${userQuery}". Generate detailed and meaningful parameters for a recipe search, including mainDish, cuisines, includeIngredients, excludeIngredients, dietaryPreferences, and cookingMethods. Return the result as a JSON object.`;
      const aiResponse = await this.llmClient.generateCompletion(prompt, {});

      // Attempt to parse the response as JSON
      try {
        const enhancedParameters = JSON.parse(aiResponse);
        return enhancedParameters;
      } catch (parseError) {
        console.error('Error parsing AI response as JSON:', parseError);

        // Attempt to extract JSON-like content from the response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const extractedParameters = JSON.parse(jsonMatch[0]);
            return extractedParameters;
          } catch (extractionError) {
            console.error('Error extracting JSON-like content:', extractionError);
          }
        }

        // Fallback to default structure if parsing fails
        console.warn('Falling back to default parameters due to invalid AI response.');
        return {
          mainDish: [],
          cuisines: [],
          includeIngredients: [],
          excludeIngredients: [],
          dietaryPreferences: [],
          cookingMethods: []
        };
      }
    } catch (error) {
      console.error('Error enhancing fallback with LLM:', error);
      return {
        mainDish: [],
        cuisines: [],
        includeIngredients: [],
        excludeIngredients: [],
        dietaryPreferences: [],
        cookingMethods: []
      };
    }
  }

  /**
   * Ensure Jewish cuisine is always considered in the recommendations
   */
  private ensureJewishCuisineInclusion(aiAnalysis: any): void {
    if (!aiAnalysis.cuisines.includes('Jewish')) {
      console.log('Adding Jewish cuisine to the analysis');
      aiAnalysis.cuisines.push('Jewish');
    }
  }

  /**
   * Ensure all recognized cuisines are included in the recommendations
   */
  private ensureAllCuisinesInclusion(aiAnalysis: any): void {
    const recognizedCuisines = [
      'American', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian',
      'French', 'Mediterranean', 'Greek', 'Spanish', 'Middle Eastern', 'Korean',
      'Vietnamese', 'Jewish', 'German', 'Ethiopian', 'African', 'Brazilian', 'Caribbean'
    ];

    recognizedCuisines.forEach(cuisine => {
      if (!aiAnalysis.cuisines.includes(cuisine)) {
        console.log(`Adding ${cuisine} cuisine to the analysis`);
        aiAnalysis.cuisines.push(cuisine);
      }
    });
  }

  /**
   * Adjust SQL query to prioritize user-specified cuisines
   */
  private prioritizeUserCuisine(sqlQuery: string, sqlParams: any[], userCuisine: string): string {
    // Add user-specified cuisine as the first condition
    sqlQuery += ` AND (r.cuisine ILIKE $${sqlParams.length + 1}`;
    sqlParams.push(`%${userCuisine}%`);

    // Add other cuisines as secondary conditions
    for (let i = 0; i < sqlParams.length - 1; i++) {
      sqlQuery += ` OR r.cuisine ILIKE $${i + 1}`;
    }

    sqlQuery += ')';
    return sqlQuery;
  }

  /**
   * Extract a specific cuisine requested by the user from query text
   * Focuses on finding explicit cuisine requests
   */
  private extractSpecificCuisineFromQuery(query: string): string | null {
    const lowerQuery = query.toLowerCase();
    
    // Check for specific cuisine requests like "Mexican food" or "Italian recipes"
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
    
    // Check for direct mentions of cuisines with food/recipe/cuisine
    for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
      // Look for more specific requests like "X food" or "X cuisine" rather than just the cuisine name
      const specificRequests = [
        new RegExp(`${keyword}\\s+food`, 'i'),
        new RegExp(`${keyword}\\s+recipe`, 'i'),
        new RegExp(`${keyword}\\s+cuisine`, 'i'),
        new RegExp(`${keyword}\\s+dish`, 'i'),
        // Also handle "I like X food" patterns
        new RegExp(`(?:like|want|love)\\s+${keyword}`, 'i')
      ];
      
      for (const pattern of specificRequests) {
        if (pattern.test(lowerQuery)) {
          console.log(`Found specific request for ${cuisine} cuisine`);
          return cuisine;
        }
      }
    }
    
    // Check for phrases that more explicitly ask for a cuisine
    const cuisinePatterns = [
      /(?:want|looking for|need|find me)(?:\s+\w+)?\s+([a-zA-Z]+)(?:\s+food)/i,
      /(?:want|looking for|need|find me)(?:\s+\w+)?\s+([a-zA-Z]+)(?:\s+recipes)/i,
      /(?:want|looking for|need|find me)(?:\s+\w+)?\s+([a-zA-Z]+)(?:\s+cuisine)/i,
      /(?:i like|i love|i prefer)(?:\s+\w+)?\s+([a-zA-Z]+)(?:\s+food)/i
    ];
    
    for (const pattern of cuisinePatterns) {
      const match = lowerQuery.match(pattern);
      if (match && match[1]) {
        const potentialCuisine = match[1].trim().toLowerCase();
        
        // Check if it matches one of our known cuisines
        for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
          if (potentialCuisine === keyword.toLowerCase()) {
            console.log(`Extracted explicit cuisine request: ${cuisine}`);
            return cuisine;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Extract cuisines from user query text
   * Used when the LLM doesn't identify a cuisine
   */
  private extractCuisinesFromQuery(query: string): string | null {
    const lowerQuery = query.toLowerCase();
    
    // Check for direct mention of Indian cuisine specifically (highest priority)
    if (lowerQuery.includes('india cuisine') || 
        lowerQuery.includes('indian cuisine') || 
        lowerQuery.includes('india food') ||
        lowerQuery.includes('indian food') ||
        lowerQuery.includes('from india') ||
        lowerQuery.includes('from indian')) {
      console.log('Found explicit mention of Indian cuisine');
      return 'Indian';
    }
    
    // Direct check for India vs Indian
    if (lowerQuery.includes('india')) {
      console.log('Found mention of India, returning Indian cuisine');
      return 'Indian';
    }
    
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
      if (lowerQuery.includes(keyword) && lowerQuery.includes('only from')) {
        console.log(`Found cuisine with "only from" specification: ${cuisine}`);
        return cuisine;
      }
      
      if (lowerQuery.includes(keyword)) {
        console.log(`Extracted cuisine from query: ${cuisine}`);
        return cuisine;
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
          // Try to map to a standard cuisine name
          for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
            if (potentialCuisine.toLowerCase().includes(keyword)) {
              console.log(`Matched pattern cuisine to standard name: ${cuisine}`);
              return cuisine;
            }
          }
          
          // If no standard match, capitalize first letter
          const formattedCuisine = potentialCuisine.charAt(0).toUpperCase() + 
                                  potentialCuisine.slice(1);
          console.log(`Extracted cuisine from pattern: ${formattedCuisine}`);
          return formattedCuisine;
        }
      }
    }
    
    return null;
  }

  /**
   * Search recipes with AI-enhanced understanding of user's preferences
   * The main function is to evaluate user statements and convert them into appropriate database search parameters
   */
  public async searchRecipes(userQuery: string): Promise<any[]> {
    try {
      console.log('=== USER PREFERENCE DETECTION ===');
      console.log('User input:', userQuery);

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

      // AI analysis and SQL query generation
      const aiAnalysis = await this.analyzeQueryWithAI(userQuery);
      console.log('AI analysis of query:', aiAnalysis);

      // Ensure Jewish cuisine is included in the analysis
      this.ensureJewishCuisineInclusion(aiAnalysis);

      // Ensure all recognized cuisines are included in the analysis
      this.ensureAllCuisinesInclusion(aiAnalysis);

      // Filter out generic or 'Not specified' values from AI analysis
      aiAnalysis.mainDish = aiAnalysis.mainDish.filter((dish: string) => dish !== 'Not specified');
      aiAnalysis.cuisines = aiAnalysis.cuisines.filter((cuisine: string) => cuisine !== 'Not specified');
      aiAnalysis.includeIngredients = aiAnalysis.includeIngredients.filter((ingredient: string) => ingredient !== 'Not specified');
      aiAnalysis.excludeIngredients = aiAnalysis.excludeIngredients.filter((ingredient: string): boolean => ingredient !== 'Not specified');
      aiAnalysis.dietaryPreferences = aiAnalysis.dietaryPreferences.filter((preference: string): boolean => preference !== 'Not specified');
      aiAnalysis.cookingMethods = aiAnalysis.cookingMethods.filter((method: string): boolean => method !== 'Not specified');

      // Filter out invalid cuisines before executing the SQL query
      aiAnalysis.cuisines = aiAnalysis.cuisines.filter((cuisine: string): boolean => {
        const validCuisines: string[] = [
          'American', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian',
          'French', 'Mediterranean', 'Greek', 'Spanish', 'Middle Eastern', 'Korean',
          'Vietnamese', 'Jewish', 'German', 'Ethiopian', 'African', 'Brazilian', 'Caribbean'
        ];
        return validCuisines.includes(cuisine);
      });

      // Remove the unused block that initializes paramIndex since it's declared again later
      if (aiAnalysis.cuisines.length > 0) {
        console.log(`Filtering search by cuisines: ${aiAnalysis.cuisines.join(', ')}`);
        // This block appears to be incomplete/unused code
      }

      // If all fields are empty after filtering, enhance with LLM
      if (
        aiAnalysis.mainDish.length === 0 &&
        aiAnalysis.cuisines.length === 0 &&
        aiAnalysis.includeIngredients.length === 0 &&
        aiAnalysis.excludeIngredients.length === 0 &&
        aiAnalysis.dietaryPreferences.length === 0 &&
        aiAnalysis.cookingMethods.length === 0
      ) {
        console.log('All AI analysis fields are empty after filtering. Enhancing with LLM.');
        const enhancedParameters = await this.enhanceFallbackWithLLM(userQuery);
        aiAnalysis.mainDish = enhancedParameters.mainDish;
        aiAnalysis.cuisines = enhancedParameters.cuisines;
        aiAnalysis.includeIngredients = enhancedParameters.includeIngredients;
        aiAnalysis.excludeIngredients = enhancedParameters.excludeIngredients;
        aiAnalysis.dietaryPreferences = enhancedParameters.dietaryPreferences;
        aiAnalysis.cookingMethods = enhancedParameters.cookingMethods;
      }

      // Dynamically resolve category terms like "vegetables" into their specific items
      const expandedExclusions: string[][] = await Promise.all(
        aiAnalysis.excludeIngredients.map(async (ingredient: string): Promise<string[]> => {
          const resolvedItems: string[] = await this.glossaryService.resolveCategory(ingredient);
          return resolvedItems.length > 0 ? resolvedItems : [ingredient];
        })
      );
      
      // Expand included ingredients similarly
      const expandedInclusions: string[][] = await Promise.all(
        aiAnalysis.includeIngredients.map(async (ingredient: string): Promise<string[]> => {
          const resolvedItems: string[] = await this.glossaryService.resolveCategory(ingredient);
          return resolvedItems.length > 0 ? resolvedItems : [ingredient];
        })
      );

      // Flatten the arrays of resolved ingredients
      const flattenedExclusions = expandedExclusions.flat();
      const flattenedInclusions = expandedInclusions.flat();
      
      console.log('Expanded included ingredients:', flattenedInclusions);

      // Check if the user explicitly requested a specific cuisine
      const requestedCuisine = this.extractCuisinesFromQuery(userQuery);
      
      // Build a SQL query that prioritizes the requested cuisine
      let sqlQuery = `
        SELECT r.id, r.title, r.description, r.cuisine, r.category_id
        FROM recipes r
        WHERE 1=1
      `;

      const sqlParams: any[] = [];
      let paramIndex = 1;

      // Update the logic to prioritize only explicitly requested cuisines when specified
      if (requestedCuisine) {
        console.log(`User specifically requested ${requestedCuisine} cuisine, restricting results.`);
        sqlQuery += ` AND r.cuisine ILIKE $${paramIndex}`;
        sqlParams.push(`%${requestedCuisine}%`);
        paramIndex++;
      } else if (aiAnalysis.cuisines.length > 0) {
        console.log(`Prioritizing user-specified cuisines: ${aiAnalysis.cuisines.join(', ')}`);
        const cuisineConditions: string[] = aiAnalysis.cuisines.map((cuisine: string, index: number): string => `r.cuisine ILIKE $${paramIndex + index}`);
        sqlQuery += ` AND (${cuisineConditions.join(' OR ')})`;
        sqlParams.push(...(aiAnalysis.cuisines as string[]).map((cuisine: string) => `%${cuisine}%`));
        paramIndex += aiAnalysis.cuisines.length;
      }

      // Add filters for main dish if specified
      if (aiAnalysis.mainDish && aiAnalysis.mainDish.length > 0) {
        const dishConditions: string[] = [];
        
        for (const dish of aiAnalysis.mainDish) {
          dishConditions.push(`(r.title ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`);
          sqlParams.push(`%${dish}%`);
          paramIndex++;
        }
        
        if (dishConditions.length > 0) {
          sqlQuery += ` AND (${dishConditions.join(' OR ')})`;
        }
      }

      // Adjusting SQL query to prioritize user-specified cuisines dynamically
      if (aiAnalysis.cuisines.length > 0) {
        console.log(`Prioritizing user-specified cuisines: ${aiAnalysis.cuisines.join(', ')}`);
        sqlQuery += ` ORDER BY 
          CASE
            ${aiAnalysis.cuisines.map((cuisine: string, index: number) => `WHEN r.cuisine ILIKE $${paramIndex + index} THEN ${index + 1}`).join(' ')}
            ELSE ${aiAnalysis.cuisines.length + 1}
          END, 
          r.popularity DESC LIMIT 20`;
        sqlParams.push(...(aiAnalysis.cuisines as string[]).map((cuisine: string) => `%${cuisine}%`));
        paramIndex += aiAnalysis.cuisines.length;
      } else {
        sqlQuery += ` ORDER BY r.popularity DESC LIMIT 20`;
      }

      console.log('Executing AI-enhanced SQL query:', sqlQuery);
      console.log('With parameters:', sqlParams);

      const result = await this.pool.query(sqlQuery, sqlParams);

      // Post-process results to filter out any remaining recipes that mention excluded ingredients
      let filteredResults = result.rows;
      if (flattenedExclusions.length > 0) {
        // List of common implicit dairy terms
        const implicitDairyTerms = [
          ...flattenedExclusions.map(e => e.toLowerCase()),
          'creamy', 'cheesy', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'gouda', 'swiss', 'provolone', 'brie', 'camembert', 'mascarpone', 'gruyere', 'blue cheese', 'cream cheese', 'custard', 'yoghurt', 'yogurt', 'icecream', 'ice cream', 'buttermilk', 'evaporated milk', 'condensed milk', 'whipped cream', 'half and half', 'sourcream', 'sour cream', 'milk chocolate', 'white chocolate'
        ];
        filteredResults = result.rows.filter(recipe => {
          const lowerTitle = recipe.title.toLowerCase();
          const lowerDesc = recipe.description.toLowerCase();
          // Exclude if any explicit or implicit dairy term is found
          return !implicitDairyTerms.some(term => lowerTitle.includes(term) || lowerDesc.includes(term));
        });
        
        console.log(`Post-filtering removed ${result.rows.length - filteredResults.length} recipes containing excluded or implicit dairy terms in title/description`);
      }
      
      if (filteredResults.length === 0) {
        console.log('Filtered search returned no results, trying fallback search');
        const fallbackResults = await this.fallbackSearch(userQuery);
        this.saveToCache(normalizedQuery, fallbackResults);
        return fallbackResults;
      }

      this.saveToCache(normalizedQuery, filteredResults);
      return filteredResults;
    } catch (error) {
      console.error('Error in recipe search:', error);
      const fallbackResults = await this.fallbackSearch(userQuery);
      this.saveToCache(userQuery, fallbackResults);
      return fallbackResults;
    }
  }

  private async fallbackSearch(query: string): Promise<any[]> {
    console.log('Fallback search executed for query:', query);

    // Respect user preferences in fallback search
    const aiAnalysis = this.createFallbackAnalysis(query);

    // Build a more specific fallback query if mainDish is identified
    let sqlQuery = `
      SELECT r.id, r.title, r.description, r.cuisine, r.category_id
      FROM recipes r
      WHERE 1=1
    `;

    const sqlParams: any[] = [];
    let paramIndex = 1;

    // Update fallback search logic to prioritize explicitly requested cuisines
    const requestedCuisine = this.extractSpecificCuisineFromQuery(query);
    if (requestedCuisine) {
      console.log(`User specifically requested ${requestedCuisine} cuisine, restricting fallback results.`);
      sqlQuery += ` AND r.cuisine ILIKE $${paramIndex}`;
      sqlParams.push(`%${requestedCuisine}%`);
      paramIndex++;
    } else if (aiAnalysis.cuisines.length > 0) {
      console.log(`Filtering fallback search by cuisines: ${aiAnalysis.cuisines.join(', ')}`);
      const cuisineConditions: string[] = aiAnalysis.cuisines.map((cuisine: string, index: number): string => `r.cuisine ILIKE $${paramIndex + index}`);
      sqlQuery += ` AND (${cuisineConditions.join(' OR ')})`;
      sqlParams.push(...(aiAnalysis.cuisines as string[]).map((cuisine: string) => `%${cuisine}%`));
      paramIndex += aiAnalysis.cuisines.length;
    }

    // Also check if query explicitly mentions Jewish food
    if (query.toLowerCase().includes('jewish food') || 
        query.toLowerCase().includes('jewish recipe') || 
        query.toLowerCase().includes('jewish cuisine')) {
      // If we haven't already added Jewish cuisine condition
      if (!aiAnalysis.cuisines.includes('Jewish')) {
        sqlQuery += ` AND r.cuisine ILIKE $${paramIndex}`;
        sqlParams.push('%Jewish%');
        paramIndex++;
        console.log('Added explicit Jewish cuisine filter based on query text');
      }
    }

    // Prioritize mainDish if specified
    if (aiAnalysis.mainDish && aiAnalysis.mainDish.length > 0) {
      const dishConditions: string[] = [];
      for (const dish of aiAnalysis.mainDish) {
        dishConditions.push(`(r.title ILIKE $${paramIndex} OR r.description ILIKE $${paramIndex})`);
        sqlParams.push(`%${dish}%`);
        paramIndex++;
      }
      if (dishConditions.length > 0) {
        sqlQuery += ` AND (${dishConditions.join(' OR ')})`;
      }
    }

    // Add ordering logic to prioritize relevant results
    sqlQuery += `
      ORDER BY 
        CASE
          WHEN r.title ILIKE $${paramIndex} THEN 1
          WHEN r.description ILIKE $${paramIndex} THEN 2
          ELSE 3
        END,
        r.popularity DESC LIMIT 20
    `;

    // Add the full query string as the last parameter for the ORDER BY clause
    sqlParams.push(`%${query}%`);

    console.log('Executing fallback SQL query:', sqlQuery);
    console.log('With parameters:', sqlParams);

    const result = await this.pool.query(sqlQuery, sqlParams);
    return result.rows;
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
      result.rows.slice(0, 12).forEach(recipe => {
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
   * Save data to the cache with a timestamp.
   */
  private saveToCache(query: string, data: any[]): void {
    if (!this.CACHE_ENABLED) return;

    this.cache.set(query, {
      timestamp: Date.now(),
      data: data
    });
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
      let jsonText = aiAnalysisResponse;

      const jsonMatch = aiAnalysisResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      console.log('Attempting to parse JSON from AI response');

      try {
        jsonText = this.sanitizeJsonString(jsonText);

        const aiAnalysis = JSON.parse(jsonText);

        aiAnalysis.mainDish = aiAnalysis.mainDish || [];
        aiAnalysis.cuisines = aiAnalysis.cuisines || [];
        aiAnalysis.includeIngredients = aiAnalysis.includeIngredients || [];
        aiAnalysis.excludeIngredients = aiAnalysis.excludeIngredients || [];
        aiAnalysis.dietaryPreferences = aiAnalysis.dietaryPreferences || [];
        aiAnalysis.cookingMethods = aiAnalysis.cookingMethods || [];
        aiAnalysis.explanation = aiAnalysis.explanation || "Recipe search based on your preferences";

        // Correcting cuisine extraction for "India" to "Indian"
        aiAnalysis.cuisines = aiAnalysis.cuisines.map((cuisine: string): string => {
          if (cuisine.toLowerCase().includes('india')) {
            return 'Indian';
          }
          return cuisine;
        });

        return aiAnalysis;
      } catch (parseError) {
        console.log('Standard JSON parse attempt failed, trying advanced parsing:', parseError);

        const recoveredJson = this.attemptJsonRecovery(jsonText);
        if (recoveredJson) {
          console.log('Successfully recovered JSON structure');
          return recoveredJson;
        }

        throw new Error('Failed to parse AI response as JSON');
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

    // Refine fallback analysis to focus on user-specified cuisine
    const refinedCuisines = cuisines.filter(cuisine => cuisine === 'Jewish');
    
    // Create basic analysis object
    const result = {
      mainDish: mainDish,
      cuisines: refinedCuisines,
      includeIngredients: includeIngredients,
      excludeIngredients: excludeIngredients,
      dietaryPreferences: dietaryPreferences,
      cookingMethods: [],
      explanation: "Found recipes based on your preferences"
    };
    
    console.log('Created fallback analysis from query:', result);
    return result;
  }

  /**
   * Generate a positive vibe response using the LLM, tailored to the search results.
   * @param userQuery The user's input query.
   * @param searchResults The recipes returned from the search.
   * @returns A positive, human-like response from the LLM.
   */
  public async generatePositiveVibe(userQuery: string, searchResults: any[]): Promise<string> {
    try {
      const recipeTitles = searchResults.map(recipe => recipe.title).slice(0, 3).join(', ');
      const prompt = `Generate a positive and engaging response for the following user query: "${userQuery}". Include references to these recipes: ${recipeTitles}. The response should be friendly and enthusiastic.`;
      const aiResponse = await this.llmClient.generateCompletion(prompt, {});
      return aiResponse.trim();
    } catch (error) {
      console.error('Error generating positive vibe with LLM:', error);
      return 'Yummy! Here are some recipes you might enjoy!';
    }
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

export { humanizeAIResponse };