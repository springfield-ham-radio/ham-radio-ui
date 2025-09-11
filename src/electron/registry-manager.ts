import { BrowserWindow, ipcMain } from 'electron';
import { createRegistry, type RegistryRadio, type RadioConfigRegistry } from '@springfield/ham-radio-registry';
import type { RadioModelId } from '@springfield/ham-radio-api';
import type { ILogLayer } from 'loglayer';

export class RegistryManager {
  private registry: RadioConfigRegistry;
  private configurations: RegistryRadio[] = [];
  private initialized = false;

  constructor(private window: BrowserWindow, private logger: ILogLayer) {
    this.registry = createRegistry(logger);
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('registry:discover-configurations', async () => {
      try {
        if (!this.initialized) {
          await this.initializeConfigurations();
        }
        return {
          success: true,
          data: this.configurations,
        };
      } catch (error) {
        this.logger.withError(error).error('Failed to discover configurations');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    ipcMain.handle('registry:get-manufacturers', async () => {
      try {
        if (!this.initialized) {
          await this.initializeConfigurations();
        }
        
        const manufacturers = new Set<string>();
        for (const config of this.configurations) {
          manufacturers.add(config.id.manufacturer);
        }
        
        return {
          success: true,
          data: Array.from(manufacturers).sort(),
        };
      } catch (error) {
        this.logger.withError(error).error('Failed to get manufacturers');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    ipcMain.handle('registry:get-models-by-manufacturer', async (_, manufacturer: string) => {
      try {
        if (!this.initialized) {
          await this.initializeConfigurations();
        }
        
        const models = this.configurations
          .filter(config => config.id.manufacturer === manufacturer)
          .map(config => ({
            id: config.id,
            name: config.id.model,
            config,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        return {
          success: true,
          data: models,
        };
      } catch (error) {
        this.logger.withError(error).error('Failed to get models by manufacturer');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    ipcMain.handle('registry:get-configuration', async (_, modelId: RadioModelId) => {
      try {
        const config = await this.registry.getConfiguration(modelId);
        return {
          success: true,
          data: config,
        };
      } catch (error) {
        this.logger.withError(error).error(`Failed to get configuration for ${modelId}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });
  }

  private async initializeConfigurations() {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing radio configurations from registry...');
    
    try {
      // Hard-code the baofeng module registration for now
      await this.loadBaofengModule();
      
      // Discover other configurations from the registry
      const discoveredConfigurations = await this.registry.discoverConfigurations();
      this.configurations.push(...discoveredConfigurations);
      
      this.initialized = true;
      
      this.logger.withMetadata({ 
        count: this.configurations.length,
        manufacturers: new Set(this.configurations.map(c => c.id.manufacturer)).size
      }).info('Successfully loaded radio configurations');
      
    } catch (error) {
      this.logger.withError(error).error('Failed to initialize radio configurations');
      throw error;
    }
  }

  private async loadBaofengModule() {
    try {
      this.logger.info('Baofeng configuration will be loaded from radio-module-baofeng package via registry discovery');
    } catch (error) {
      this.logger.withError(error).error('Failed to load Baofeng module');
      // Don't throw here - we want the app to continue even if baofeng fails to load
    }
  }

  // Optional: Initialize on startup
  async initialize() {
    await this.initializeConfigurations();
  }

  // Method for other main process components to get configurations directly
  async getConfigurationDirect(modelId: string): Promise<RegistryRadio | undefined> {
    if (!this.initialized) {
      await this.initializeConfigurations();
    }
    
    return this.configurations.find(config => config.id.model === modelId);
  }

  // Method for other main process components to get codecs directly  
  async getCodecDirect(modelId: RadioModelId) {
    return this.registry.getCodec(modelId);
  }
}
