import { Pool } from 'pg';

/**
 * Service for working with glossary terms to improve search functionality
 */
export class GlossaryService {
  private pool: Pool;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }
  
  /**
   * Standardize a search term using the glossary
   * Returns the standard term for a given variant/synonym/misspelling
   */
  public async standardizeTerm(term: string): Promise<string | null> {
    try {
      const result = await this.pool.query(`
        SELECT gt.standard_term
        FROM glossary_variants gv
        JOIN glossary_terms gt ON gv.glossary_term_id = gt.id
        WHERE LOWER(gv.variant_term) = LOWER($1)
        LIMIT 1
      `, [term]);
      
      return result.rows.length > 0 ? result.rows[0].standard_term : null;
    } catch (error) {
      console.error('Error standardizing term:', error);
      return null;
    }
  }
  
  /**
   * Get all variants of a standard term (useful for expanding searches)
   */
  public async getTermVariants(standardTerm: string): Promise<string[]> {
    try {
      const result = await this.pool.query(`
        SELECT gv.variant_term
        FROM glossary_terms gt
        JOIN glossary_variants gv ON gt.id = gv.glossary_term_id
        WHERE LOWER(gt.standard_term) = LOWER($1)
      `, [standardTerm]);
      
      return result.rows.map(row => row.variant_term);
    } catch (error) {
      console.error('Error getting term variants:', error);
      return [];
    }
  }
  
  /**
   * Find related dishes for a cuisine
   * For example, find all dishes related to "Jewish" cuisine
   */
  public async getRelatedDishes(cuisineTerm: string): Promise<string[]> {
    try {
      const result = await this.pool.query(`
        SELECT rt.standard_term
        FROM glossary_terms st
        JOIN glossary_related_terms grt ON st.id = grt.source_term_id
        JOIN glossary_terms rt ON grt.related_term_id = rt.id
        WHERE LOWER(st.standard_term) = LOWER($1)
        AND grt.relation_type = 'includes_dish'
        ORDER BY grt.strength DESC
      `, [cuisineTerm]);
      
      return result.rows.map(row => row.standard_term);
    } catch (error) {
      console.error('Error getting related dishes:', error);
      return [];
    }
  }
  
  /**
   * Process user query to identify and standardize terms
   * This extracts and standardizes ingredients, cuisines, and dishes
   */
  public async processQueryTerms(query: string): Promise<{
    ingredients: string[];
    cuisines: string[];
    dishes: string[];
  }> {
    const result = {
      ingredients: [] as string[],
      cuisines: [] as string[],
      dishes: [] as string[]
    };

    try {
      const terms = this.extractSearchTerms(query);

      for (const term of terms) {
        if (term.toLowerCase() === 'jewish food') {
          result.cuisines.push('Jewish');
          const relatedDishes = await this.getRelatedDishes('Jewish');
          result.dishes = [...result.dishes, ...relatedDishes];
          continue;
        }

        const sql = `
          SELECT gt.standard_term, gt.term_type
          FROM glossary_variants gv
          JOIN glossary_terms gt ON gv.glossary_term_id = gt.id
          WHERE LOWER(gv.variant_term) = LOWER($1)
          UNION
          SELECT standard_term, term_type
          FROM glossary_terms
          WHERE LOWER(standard_term) = LOWER($1)
          LIMIT 1
        `;

        const termResult = await this.pool.query(sql, [term]);

        if (termResult.rows.length > 0) {
          const { standard_term, term_type } = termResult.rows[0];

          if (term_type === 'ingredient') {
            if (result.cuisines.includes('Jewish') && standard_term.toLowerCase() === 'pork') {
              continue;
            }
            result.ingredients.push(standard_term);
          } else if (term_type === 'cuisine') {
            result.cuisines.push(standard_term);
            const relatedDishes = await this.getRelatedDishes(standard_term);
            result.dishes = [...result.dishes, ...relatedDishes];
          } else if (term_type === 'dish') {
            result.dishes.push(standard_term);
          }
        }
      }

      result.ingredients = [...new Set(result.ingredients)];
      result.cuisines = [...new Set(result.cuisines)];
      result.dishes = [...new Set(result.dishes)];

      return result;
    } catch (error) {
      console.error('Error processing query terms:', error);
      return result;
    }
  }
  
  /**
   * Extract potential search terms from a user query
   * This helps identify multi-word terms like "challah bread" or "bell pepper"
   */
  private extractSearchTerms(query: string): string[] {
    const terms: string[] = [];
    const normalizedQuery = query.toLowerCase().trim();
    
    // First, add the entire query as one term (helps with phrases)
    terms.push(normalizedQuery);
    
    // Split by common separators to get individual words and short phrases
    const words = normalizedQuery
      .split(/[,.;!?]|\s+and\s+|\s+or\s+|\s+with\s+|\s+without\s+|\s+not\s+|\s+but\s+/)
      .map(word => word.trim())
      .filter(word => word.length > 2);
    
    // Add individual words
    terms.push(...words);
    
    // Generate common n-grams (2-gram and 3-gram phrases)
    const queryWords = normalizedQuery.split(/\s+/);
    for (let i = 0; i < queryWords.length; i++) {
      // Add 2-word phrases (e.g., "bell pepper")
      if (i < queryWords.length - 1) {
        const twoGram = `${queryWords[i]} ${queryWords[i+1]}`;
        terms.push(twoGram);
      }
      
      // Add 3-word phrases (e.g., "matzah ball soup")
      if (i < queryWords.length - 2) {
        const threeGram = `${queryWords[i]} ${queryWords[i+1]} ${queryWords[i+2]}`;
        terms.push(threeGram);
      }
    }
    
    return [...new Set(terms)]; // Remove duplicates
  }
  
  /**
   * Expand a search term to include all its variants
   * Useful for building inclusive SQL WHERE clauses
   */
  public async expandSearchTerm(term: string): Promise<string[]> {
    try {
      // First, try to standardize the term
      const standardTerm = await this.standardizeTerm(term) || term;
      
      // Get all variants of the standard term
      const variants = await this.getTermVariants(standardTerm);
      
      // Return both the standard term and all variants
      return [standardTerm, ...variants];
    } catch (error) {
      console.error('Error expanding search term:', error);
      return [term]; // Return original term if error occurs
    }
  }

  /**
   * Resolve a category into specific items (e.g., "vegetables" -> ["carrot", "broccoli", "spinach"]).
   */
  public async resolveCategory(category: string): Promise<string[]> {
    try {
      const query = `
        SELECT item_name 
        FROM glossary 
        WHERE category_name ILIKE $1
      `;
      const result = await this.pool.query(query, [category]);
      return result.rows.map(row => row.item_name);
    } catch (error) {
      console.error(`Error resolving category "${category}":`, error);
      return [];
    }
  }
}