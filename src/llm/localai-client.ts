import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Client for interacting with locally running LLM models
 * Optimized to work with both containerized and local LLM services
 */
export class LocalAIClient {
  private apiUrl: string;
  private modelName: string;
  private port: number;
  private containerized: boolean;
  
  constructor(options: {
    apiUrl?: string;
    modelName?: string;
    port?: number;
    containerized?: boolean;
  } = {}) {
    this.port = options.port || 11434;
    this.apiUrl = options.apiUrl || `http://localhost:${this.port}`;
    // Prioritize environment variable for model name
    this.modelName = process.env.LLM_MODEL || options.modelName || 'mistral';
    this.containerized = options.containerized || 
      process.env.LLM_CONTAINERIZED === 'true';
    
    console.log(`Initializing LocalAI client with URL: ${this.apiUrl} and model: ${this.modelName}`);
  }

  /**
   * Set the model name to use for completions
   * This allows switching models at runtime, but only if not overridden by environment variable
   */
  public setModel(modelName: string): void {
    const envModel = process.env.LLM_MODEL;
    if (envModel) {
      if (modelName !== envModel) {
        console.log(`Ignoring request to change model to ${modelName}. Using environment-specified model: ${envModel}`);
        // Print a stack trace for debugging
        console.trace('setModel called with', modelName);
      }
      this.modelName = envModel;
      return;
    }
    if (modelName && modelName !== this.modelName) {
      console.log(`Changed LocalAI model to: ${modelName}`);
      this.modelName = modelName;
    }
  }

  /**
   * Get the current model name
   */
  public getModel(): string {
    // Always prioritize environment model
    return process.env.LLM_MODEL || this.modelName;
  }

  /**
   * Performs a health check on the LLM service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // For Ollama running locally or in Docker, we should check the models endpoint
      // instead of the health endpoint which doesn't exist in Ollama
      try {
        const response = await axios.get(`${this.apiUrl}/api/tags`, { 
          timeout: 2000 
        });
        
        if (response && response.status === 200) {
          // Check if our model exists in the list
          const models = response.data && response.data.models ? response.data.models : [];
          
          if (models.length > 0) {
            console.log('Ollama service is healthy. Available models:', 
              models.map((m: any) => m.name).join(', '));
            return true;
          }
          
          console.log('Ollama service is responding but no models found');
          return true; // Still return true as the service is running
        }
      } catch (e) {
        // Try alternative Ollama endpoint
        try {
          const response = await axios.get(`${this.apiUrl}/api/version`, { 
            timeout: 2000 
          });
          
          if (response && response.status === 200) {
            console.log('Ollama service is healthy');
            return true;
          }
        } catch (e2) {
          // Both endpoints failed
          console.log('Failed to connect to Ollama API endpoints');
        }
      }
      
      console.log('LocalAI/Ollama service health check failed');
      
      // If we specified we're using containerized, check Docker
      if (this.containerized) {
        console.log('Using containerized LLM. Please ensure docker-compose is running.');
        return await this.checkDockerService();
      }
      
      // For non-containerized setup, provide helpful message for local Ollama
      console.log('Check if Ollama is running locally with: ollama list');
      console.log('If not, start it with: ollama serve');
      
      return false;
    } catch (error) {
      console.error('Failed to check health of LocalAI/Ollama service:', error);
      return false;
    }
  }

  /**
   * Check if Docker is running and if our LLM service is up
   */
  private async checkDockerService(): Promise<boolean> {
    try {
      const result = await execAsync('docker ps --filter "name=llm_service" --format "{{.Status}}"').catch(() => null);
      
      if (result && result.stdout.includes('Up')) {
        console.log('LLM service container is running');
        // Give it a moment to initialize if just started
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
      
      console.log('LLM service container not found or not running');
      console.log('Please start the service with: docker-compose up -d llm_service');
      return false;
    } catch (error) {
      console.error('Error checking Docker service:', error);
      console.log('Please ensure Docker is running and start services with: docker-compose up -d');
      return false;
    }
  }

  /**
   * Generate text completion using the LLM
   */
  public async generateCompletion(prompt: string, options: any = {}): Promise<string> {
    let triedSmallerModel = false;
    let lastError: any = null;
    
    // Always prioritize environment variable for model
    const envModel = process.env.LLM_MODEL;
    let modelToUse = envModel || options.model || this.modelName || 'mistral';
    
    let result: string | null = null;
    
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Using model ${modelToUse} for structured JSON generation`);
        
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          // Return a properly formatted JSON response instead of an error message
          // This will prevent JSON parsing errors in the recipe-search-service
          return JSON.stringify({
            mainDish: [],
            cuisines: [],
            includeIngredients: [],
            excludeIngredients: [],
            dietaryPreferences: [],
            cookingMethods: [],
            explanation: "LLM service unavailable. Using fallback search."
          });
        }
        
        const cleanOptions = { ...options };
        delete cleanOptions.model; // Remove the model option so we can explicitly set it
        
        // Call generateWithLocalAI with our chosen model
        result = await this.generateWithLocalAI(prompt, { ...cleanOptions, model: modelToUse });
        
        // If we get a memory error, try a smaller model
        if (typeof result === 'string' && result.includes('model requires more system memory')) {
          if (!triedSmallerModel && modelToUse !== 'tinyllama') {
            console.warn('Model too large for available memory. Retrying with smaller model: tinyllama');
            modelToUse = 'tinyllama';
            triedSmallerModel = true;
            continue;
          }
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // If error message is about memory, try smaller model
        if (error?.message?.includes('model requires more system memory') && !triedSmallerModel && modelToUse !== 'tinyllama') {
          console.warn('Model too large for available memory. Retrying with smaller model: tinyllama');
          modelToUse = 'tinyllama';
          triedSmallerModel = true;
          continue;
        }
        
        break;
      }
    }
    
    if (result && typeof result === 'string' && result.includes('model requires more system memory')) {
      return result + ' Please try a smaller model such as "tinyllama".';
    }
    
    if (lastError) {
      return `Error generating AI response: ${lastError.message || 'Unknown error'}. Consider using a different model.`;
    }
    
    return 'Unknown error generating AI response.';
  }

  /**
   * Generate text using LocalAI API
   */
  private async generateWithLocalAI(prompt: string, options: any = {}): Promise<string> {
    interface LocalAICompletionResponse {
      choices: { text: string }[];
      [key: string]: any;
    }
    
    try {
      // Always prioritize environment variable for model
      const envModel = process.env.LLM_MODEL;
      const modelToUse = envModel || options.model || this.modelName || 'mistral';
      
      console.log(`Sending prompt to LocalAI (model: ${modelToUse}): ${prompt.slice(0, 50)}...`);
      
      console.log('Starting LLM request at', new Date().toISOString());
      console.log('Request to /v1/completions started at', new Date().toISOString());
      
      const startTime = Date.now();
      const response = await axios.post<LocalAICompletionResponse>(`${this.apiUrl}/v1/completions`, {
        model: modelToUse, // Use the model we've determined
        prompt: prompt,
        max_tokens: options.max_tokens || 800,
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        presence_penalty: options.presence_penalty || 0.1,
        frequency_penalty: options.frequency_penalty || 0.2
      }, {
        timeout: process.env.REQUEST_TIMEOUT ? parseInt(process.env.REQUEST_TIMEOUT) : 30000
      });
      
      const endTime = Date.now();
      console.log('Request to /v1/completions completed in', (endTime - startTime), 'ms');
      
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        // Validate the response format
        const rawText = response.data.choices[0].text || '';
        if (rawText) {
          console.log('Raw AI response:', rawText.substring(0, 50) + '...');
          return rawText.trim();
        } else {
          throw new Error('Empty response text from model');
        }
      } else {
        throw new Error('Invalid response format from LocalAI');
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.response?.data || error.message;
      console.error('LocalAI API Error:', error.response?.status, '-', errorMsg);
      
      if (error.code === 'ECONNREFUSED') {
        return `Connection refused to LLM service. Please ensure docker-compose is running the ollama service.`;
      }
      
      // Detect timeout issues
      if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        return `The LLM request timed out. Try using a smaller model or increasing the request timeout.`;
      }
      
      // Detect memory error and return recognizable string
      if (typeof errorMsg === 'string' && errorMsg.includes('model requires more system memory')) {
        return `Error generating AI response: model requires more system memory. Please try a smaller model such as "tinyllama".`;
      }
      
      if (error.response?.data) {
        return `Error generating AI response: Invalid response from LocalAI: ${error.response.status} ${JSON.stringify(error.response.data)}`;
      }
      
      return `Error generating AI response: ${error.message || 'Unknown error'}`;
    }
  }
}