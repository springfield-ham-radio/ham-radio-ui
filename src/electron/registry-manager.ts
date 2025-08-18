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
      this.logger.info('Loading Baofeng module configurations...');
      
      // Hard-coded Baofeng UV-5R configuration
      const baofengConfig: RegistryRadio = {
        "$schema": "https://springfield-ham-radio.com/schemas/radio-config-v1.json",
        "id": {
          "model": "baofeng-uv5r",
          "name": "Baofeng UV-5R",
          "manufacturer": "Baofeng"
        },
        "version": "1.0.0",
        "description": "UV-5R and UV-5RE Plus models",
        "metadata": {
          moduleId: '@springfield/radio-module-baofeng',
          moduleVersion: '1.0.5',
          pluginPath: '',
          author: 'Springfield Ham Radio',
          license: 'MIT'
        },
        "capabilities": {
          dslProtocols: true,
          customCodecs: true,
          memoryRead: true,
          memoryWrite: true,
          sharedComponents: true
        },
        "settingsSchema": {
          "model": "baofeng-uv5r",
          "settingsSchema": {
            "$ref": "src/shared/schemas/settings-schema.json"
          },
          "channelSchema": {
            "$ref": "src/shared/schemas/channel-schema.json"
          }
        },
        "codec": {
          "type": "shared",
          "reference": "src/shared/codecs/baofeng-codec.ts",
          "config": {
            "channelMemorySegment": {
              "startAddress": 0,
              "endAddress": 6143
            },
            "settingsMemorySegment": {
              "startAddress": 7872,
              "endAddress": 8191
            },
            "memorySegmentSize": 64,
            "magicNumber": [80, 187, 255, 32, 18, 7, 37],
            "receiveFrequencyOffset": 0,
            "transmitFrequencyOffset": 4,
            "receiveToneOffset": 8,
            "transmitToneOffset": 10,
            "powerOffset": 12,
            "channelSize": 16,
            "numberChannels": 128,
            "radioSettingsSchemaPath": "src/shared/schemas/settings-schema.json",
            "channelSettingsSchemaPath": "src/shared/schemas/channel-schema.json"
          }
        },
        "serialConfig": {
          "baudRate": 9600,
          "dataBits": 8,
          "stopBits": 1,
          "parity": "none"
        },
        "memoryConfig": {
          "chunkSize": 64,
          "segments": {
            "channels": {
              "startAddress": 0,
              "endAddress": 6143
            },
            "settings": {
              "startAddress": 7872,
              "endAddress": 8191
            }
          }
        },
        "readMemory": [
          {
            "sendReceive": {
              "description": "Send magic number",
              "send": [80, 187, 255, 32, 18, 7, 37],
              "receive": {
                "type": "exact",
                "value": 6,
                "length": 1
              }
            }
          },
          {
            "sendReceive": {
              "description": "Get radio identifier",
              "send": [2],
              "receive": {
                "type": "variable",
                "length": 8
              }
            }
          },
          {
            "sendReceive": {
              "description": "Begin clone operation",
              "send": [6],
              "receive": {
                "type": "exact",
                "value": 6,
                "length": 1
              }
            }
          },
          {
            "readSegment": {
              "description": "Read all memory segments (single chunk per segment)",
              "segments": ["channels", "settings"],
              "startChunk": {
                "send": ["S", "address:2", "segment.chunkSize"],
                "receive": {
                  "type": "pattern",
                  "pattern": [
                    "X",
                    {
                      "field": "address",
                      "size": 2
                    },
                    {
                      "field": "length",
                      "size": 1
                    },
                    {
                      "field": "data",
                      "size": 0
                    }
                  ]
                }
              },
              "endChunk": {
                "send": [6],
                "receive": {
                  "type": "exact",
                  "value": 6,
                  "length": 1
                }
              }
            }
          }
        ],
        "writeMemory": [
          {
            "sendReceive": {
              "description": "Send magic number",
              "send": [80, 187, 255, 32, 18, 7, 37],
              "receive": {
                "type": "exact",
                "value": 6,
                "length": 1
              }
            }
          },
          {
            "writeSegment": {
              "description": "Write all memory segments (single chunk per segment)",
              "segments": ["channels", "settings"],
              "send": ["X", "segment.startAddress:2", "segment.chunkSize"],
              "data": "segment.data",
              "receive": {
                "type": "exact",
                "value": 6,
                "length": 1
              }
            }
          }
        ]
      };
      
      // Register the configuration
      await this.registry.registerConfiguration(baofengConfig);
      this.configurations.push(baofengConfig);
      
      this.logger.withMetadata({ 
        model: baofengConfig.id.model,
        manufacturer: baofengConfig.id.manufacturer
      }).info('Successfully loaded Baofeng configuration');
      
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
}
