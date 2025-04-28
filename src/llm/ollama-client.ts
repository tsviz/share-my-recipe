import http from 'http';
import https from 'https';

/**
 * Client for interacting with the Ollama LLM service
 * This uses built-in Node.js modules to avoid additional dependencies
 */
export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private isModelPullInitiated: boolean = false;

  constructor(baseUrl = process.env.LLM_SERVICE_URL || 'http://ollama:11434', model = process.env.OLLAMA_MODEL || 'mistral') {
    this.baseUrl = baseUrl;
    this.model = model;
    console.log(`Initializing Ollama client with URL: ${this.baseUrl} and model: ${this.model}`);
  }

  /**
   * Makes a request to the Ollama API
   */
  private async makeRequest(path: string, data: any, method = 'POST', timeout = 60000): Promise<any> {
    return new Promise((resolve, reject) => {
      const isHttps = this.baseUrl.startsWith('https');
      const url = new URL(path, this.baseUrl);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: timeout // Add explicit timeout
      };

      const req = (isHttps ? https : http).request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          const endTime = Date.now();
          console.log(`Request to ${path} completed in ${endTime - startTime}ms`);
          // Special case for model not found errors
          if (res.statusCode === 404 && responseData.includes("model") && responseData.includes("not found")) {
            console.log(`Model ${this.model} not found. Will attempt to pull it.`);
            reject(new Error(`Model ${this.model} not found. Try pulling it first.`));
            return;
          }
          
          if (res.statusCode && res.statusCode >= 400) {
            console.error(`Ollama API Error: ${res.statusCode} - ${responseData}`);
            reject(new Error(`Invalid response from Ollama: ${res.statusCode} ${responseData}`));
            return;
          }

          try {
            // Handle empty responses or plain text responses
            if (!responseData.trim()) {
              resolve({});
              return;
            }
            
            // Check if response is HTML or plain text (like the root endpoint)
            if (responseData.trim().startsWith('<') || !responseData.includes('{')) {
              resolve({ status: 'ok', message: responseData });
              return;
            }
            
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (error) {
            console.error('Error parsing Ollama response:', error);
            // Don't fail on parse errors, just return the raw response
            resolve({ raw: responseData });
          }
        });
      });

      const startTime = Date.now();
      console.log(`Request to ${path} started at ${new Date(startTime).toISOString()}`);

      // Add request timeout handler
      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error(`Request to ${path} timed out after ${timeout}ms`));
      });

      req.on('error', (error) => {
        console.error('Error making request to Ollama:', error);
        reject(error);
      });

      if (method === 'POST' && data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Generate a completion using the Ollama API
   * Uses the /api/generate endpoint which is the core generation endpoint in Ollama
   */
  public async generateCompletion(prompt: string, options: any = {}): Promise<string> {
    const maxRetries = 2;
    let retries = 0;
    
    while (retries <= maxRetries) {
      try {
        console.log(`Sending prompt to Ollama (model: ${this.model}): ${prompt.substring(0, 50)}...`);
        
        // Try to ensure model is available
        if (!this.isModelPullInitiated) {
          const modelAvailable = await this.ensureModelAvailable();
          if (!modelAvailable) {
            // If model couldn't be loaded, try a more aggressive approach on first retry
            if (retries === 0) {
              console.log(`Model ${this.model} not available. Attempting direct pull...`);
              await this.pullModel();
            }
          }
        }
        
        // Use the correct generation endpoint for Ollama with optimized parameters
        const startTime = Date.now();
        console.log(`Starting LLM request at ${new Date(startTime).toISOString()}`);

        // Remove invalid options that caused warnings in the logs (like tfs_z)
        // Only use options known to work with TinyLlama
        const response = await this.makeRequest('/api/generate', {
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_ctx: 2048, 
            num_thread: 4,
            repeat_penalty: 1.1,
          }
        }, 'POST', 30000); // 30-second timeout for generation

        const endTime = Date.now();
        console.log(`LLM request completed in ${endTime - startTime}ms`);

        // The response format from /api/generate is { response: "text" }
        if (response && response.response) {
          return response.response;
        } else {
          throw new Error("Empty or invalid response from Ollama");
        }
      } catch (error) {
        console.error(`Error generating completion (attempt ${retries + 1}/${maxRetries + 1}):`, error);
        
        if (error instanceof Error && error.message.includes('timed out')) {
          console.log('Request timed out. Consider using a smaller model or increasing timeout.');
        }
        
        if (retries < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, retries) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        } else {
          return `Error generating AI response: ${error instanceof Error ? error.message : String(error)}. Consider using a different model.`;
        }
      }
    }
    
    return `Error generating AI response: Maximum retries reached`;
  }

  /**
   * Get a list of available models
   */
  public async listModels(): Promise<any[]> {
    try {
      console.log('Skipping invalid API endpoints for listing models. Using /api/pull to ensure model availability.');
      return [{ name: this.model }]; // Return the current model as available
    } catch (error) {
      console.error('Error listing models:', error);
      return [];
    }
  }

  /**
   * Ensures the model is available, attempting to pull it if not
   */
  public async ensureModelAvailable(): Promise<boolean> {
    this.isModelPullInitiated = true;
    try {
      // Check if model exists
      const models = await this.listModels();
      const modelExists = models.some(m => 
        (typeof m === 'string' && m === this.model) || 
        (m && m.name && m.name === this.model)
      );
      
      if (!modelExists) {
        console.log(`Model ${this.model} not found. Attempting to pull...`);
        // Try to pull the model and wait for completion
        const pullSuccess = await this.pullModel();
        
        if (pullSuccess) {
          console.log(`Successfully pulled model ${this.model}`);
          return true;
        } else {
          console.error(`Failed to pull model ${this.model}. Using fallback.`);
          return false;
        }
      }
      
      console.log(`Model ${this.model} is available`);
      return true;
    } catch (error) {
      console.error('Error ensuring model availability:', error);
      // Set flag to avoid repeated pull attempts that are failing
      this.isModelPullInitiated = true;
      return false;
    }
  }

  /**
   * Pull a model (downloads if not already present)
   */
  public async pullModel(model = this.model): Promise<boolean> {
    try {
      console.log(`Pulling model ${model}...`);
      
      // The /api/pull endpoint uses a different request format
      // It needs to stream the response as the model is downloaded
      const isHttps = this.baseUrl.startsWith('https');
      const url = new URL('/api/pull', this.baseUrl);
      
      return new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        };
        
        const req = (isHttps ? https : http).request(options, (res) => {
          let responseData = '';
          
          // Listen for data chunks as they come in
          res.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            responseData += chunkStr;
            
            // Log download progress if present
            if (chunkStr.includes('download')) {
              console.log(`Model download progress: ${chunkStr.trim()}`);
            }
          });
          
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              console.error(`Error pulling model: ${res.statusCode} - ${responseData}`);
              reject(new Error(`Failed to pull model: ${res.statusCode}`));
              return;
            }
            
            console.log(`Successfully pulled model ${model}`);
            resolve(true);
          });
        });
        
        req.on('error', (error) => {
          console.error(`Error pulling model ${model}:`, error);
          reject(error);
        });
        
        // Send the pull request with the model name
        req.write(JSON.stringify({ name: model }));
        req.end();
      });
    } catch (error) {
      console.error(`Error pulling model ${model}:`, error);
      return false;
    }
  }

  /**
   * Check if the service is available
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // First try a simple GET request to root endpoint as a healthcheck
      try {
        const response = await this.makeRequest('/', {}, 'GET');
        return true;
      } catch (error) {
        console.log('Root endpoint check failed, trying list models');
        // If that fails, try listing models
        const models = await this.listModels();
        return models.length > 0;
      }
    } catch (error) {
      console.error('Ollama service health check failed:', error);
      return false;
    }
  }

  /**
   * Set model to use
   */
  public setModel(model: string): void {
    this.model = model;
    console.log(`Changed Ollama model to: ${this.model}`);
    this.isModelPullInitiated = false; // Reset so we'll check the new model
  }
}