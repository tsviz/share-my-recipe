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
    this.modelName = process.env.LLM_MODEL || options.modelName || 'tinyllama';
    this.containerized = options.containerized || 
      process.env.LLM_CONTAINERIZED === 'true';
    
    console.log(`Initializing LocalAI client with URL: ${this.apiUrl} and model: ${this.modelName}`);
  }

  /**
   * Set the model name to use for completions
   * This allows switching models at runtime, but only if not overridden by environment variable
   */
  public setModel(modelName: string): void {
    // Check if environment variable is set - if so, don't allow overriding
    const envModel = process.env.LLM_MODEL;
    if (envModel) {
      if (modelName !== envModel) {
        console.log(`Ignoring request to change model to ${modelName}. Using environment-specified model: ${envModel}`);
        this.modelName = envModel;  // Ensure we're using the environment model
      }
      return;
    }
    
    // If no environment variable, allow model change
    if (modelName && modelName !== this.modelName) {
      console.log(`Changed LocalAI model to: ${modelName}`);
      this.modelName = modelName;
    }
  }

  /**
   * Get the current model name
   */
  public getModel(): string {
    return this.modelName;
  }

  /**
   * Performs a health check on the LLM service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // Check if the server is running
      let response;
      try {
        response = await axios.get(`${this.apiUrl}/health`, { 
          timeout: 2000 
        });
      } catch {
        response = null;
      }
      
      if (response && response.status === 200) {
        console.log('LocalAI service is healthy');
        return true;
      }
      
      console.log('LocalAI service health check failed');
      
      if (this.containerized) {
        console.log('Using containerized LLM. Please ensure docker-compose is running.');
        return false;
      }
      
      // For non-containerized setup, try checking Docker
      return this.checkDockerService();
    } catch (error) {
      console.error('Failed to check health of LocalAI service:', error);
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
    let modelToUse: string = process.env.LLM_MODEL || this.modelName || 'tinyllama';
    let result: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // If options contain a different model, warn about it
        if (options.model && options.model !== modelToUse) {
          console.log(`Request to use model ${options.model} ignored. Using environment model ${modelToUse} instead.`);
        }
        console.log(`Using model ${modelToUse} for AI generation (enforced by environment)`);
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          return 'LLM service is not available. Please ensure docker-compose is running the llm_service.';
        }
        const cleanOptions = { ...options };
        delete cleanOptions.model;
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
      return `Error generating AI response: ${lastError.message || 'Unknown error'}`;
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
      const envModel = process.env.LLM_MODEL;
      const modelToUse = options.model || envModel || this.modelName || 'tinyllama';
      console.log(`Sending prompt to LocalAI (model: ${modelToUse}): ${prompt.slice(0, 50)}...`);
      try {
        console.log('Request to /v1/models started at', new Date().toISOString());
        await axios.get(`${this.apiUrl}/v1/models`, { timeout: 5000 });
        console.log('Request to /v1/models completed successfully');
      } catch (err) {
        console.log('Model checking failed, proceeding anyway');
      }
      
      console.log('Starting LLM request at', new Date().toISOString());
      console.log('Request to /v1/completions started at', new Date().toISOString());
      const startTime = Date.now();
      const response = await axios.post<LocalAICompletionResponse>(`${this.apiUrl}/v1/completions`, {
        model: modelToUse,
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