import http from 'http';
import https from 'https';

/**
 * Client for interacting with the vLLM Text Generation Inference service
 * Optimized for use with Microsoft's Phi-3 model, but compatible with any model
 * served by the Text Generation Inference API
 */
export class VLLMClient {
  private baseUrl: string;
  private model: string;
  private isModelReady: boolean = false;

  constructor(
    baseUrl = process.env.LLM_SERVICE_URL || 'http://vllm_service:8000',
    model = process.env.LLM_MODEL || 'Phi-3-mini-4k-instruct-q4'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
    console.log(`Initializing vLLM client with URL: ${this.baseUrl} and model: ${this.model}`);
  }

  /**
   * Makes a request to the vLLM API
   */
  private async makeRequest(path: string, data: any, method = 'POST', timeout = 60000): Promise<any> {
    return new Promise((resolve, reject) => {
      const isHttps = this.baseUrl.startsWith('https');
      const url = new URL(path, this.baseUrl);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: timeout
      };

      const req = (isHttps ? https : http).request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          const endTime = Date.now();
          console.log(`Request to ${path} completed in ${endTime - startTime}ms`);
          
          if (res.statusCode && res.statusCode >= 400) {
            console.error(`vLLM API Error: ${res.statusCode} - ${responseData}`);
            reject(new Error(`Invalid response from vLLM: ${res.statusCode} ${responseData}`));
            return;
          }

          try {
            if (!responseData.trim()) {
              resolve({});
              return;
            }
            
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (error) {
            console.error('Error parsing vLLM response:', error);
            resolve({ raw: responseData });
          }
        });
      });

      const startTime = Date.now();
      console.log(`Request to ${path} started at ${new Date(startTime).toISOString()}`);

      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error(`Request to ${path} timed out after ${timeout}ms`));
      });

      req.on('error', (error) => {
        console.error('Error making request to vLLM:', error);
        reject(error);
      });

      if (method === 'POST' && data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Generate a completion using the vLLM Text Generation Inference API
   */
  public async generateCompletion(prompt: string, options: any = {}): Promise<string> {
    const maxRetries = 2;
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        console.log(`Sending prompt to vLLM (model: ${this.model}): ${prompt.substring(0, 50)}...`);

        // Check if the service is available
        if (!this.isModelReady) {
          const health = await this.healthCheck().catch(() => false);
          if (!health) {
            console.error(`vLLM service is not ready yet. Waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          this.isModelReady = true;
        }

        const startTime = Date.now();
        console.log(`Starting LLM request at ${new Date(startTime).toISOString()}`);

        // Format the request based on the model (adding system prompts for instruction models)
        const requestData = {
          inputs: this.formatPrompt(prompt),
          parameters: {
            max_new_tokens: options.max_tokens || 2048,
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.95,
            do_sample: true,
            return_full_text: false
          }
        };

        const response = await this.makeRequest('/generate', requestData);

        const endTime = Date.now();
        console.log(`LLM request completed in ${endTime - startTime}ms`);

        if (response && response.generated_text) {
          return response.generated_text;
        } else if (response && Array.isArray(response) && response[0] && response[0].generated_text) {
          return response[0].generated_text;
        } else {
          throw new Error('Empty or invalid response from vLLM');
        }
      } catch (error) {
        console.error(`Error generating completion (attempt ${retries + 1}/${maxRetries + 1}):`, error);

        if (retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          retries++;
        } else {
          return `Error generating AI response: ${error instanceof Error ? error.message : String(error)}. Consider using a different model.`;
        }
      }
    }

    return 'Error generating AI response: Maximum retries reached';
  }

  /**
   * Format the prompt based on the model type
   * Different models require different prompt formats
   */
  private formatPrompt(prompt: string): string {
    // Check if we're using Phi-3
    if (this.model.toLowerCase().includes('phi-3')) {
      return `<|system|>
You are a helpful AI assistant specializing in recipes and cooking.
<|user|>
${prompt}
<|assistant|>`;
    } 
    // Check if using Mixtral
    else if (this.model.toLowerCase().includes('mixtral')) {
      return `<s>[INST] ${prompt} [/INST]`;
    } 
    // For other models, use a simple format
    else {
      return prompt;
    }
  }

  /**
   * Get information about the model
   */
  public async getModelInfo(): Promise<any> {
    try {
      const response = await this.makeRequest('/info', {}, 'GET');
      return response;
    } catch (error) {
      console.error('Error getting model info:', error);
      return null;
    }
  }

  /**
   * Check if the service is available
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.makeRequest('/health', {}, 'GET');
      return true;
    } catch (error) {
      console.error('vLLM service health check failed:', error);
      return false;
    }
  }

  /**
   * Set model to use
   */
  public setModel(model: string): void {
    this.model = model;
    console.log(`Changed vLLM model to: ${this.model}`);
    // Reset model ready flag when changing models
    this.isModelReady = false;
  }
}