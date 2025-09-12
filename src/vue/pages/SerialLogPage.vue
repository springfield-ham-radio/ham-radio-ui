<template>
  <div class="serial-log-page">
    <div class="page-header">
      <div class="header-content">
        <Button 
          label="Back to Radio" 
          icon="pi pi-arrow-left" 
          severity="secondary"
          @click="goBack"
        />
        <h1>Serial Communication Log Viewer</h1>
      </div>
      <div class="header-actions">
        <Button 
          label="Load Log File" 
          icon="pi pi-upload" 
          @click="loadLogFile"
          :disabled="loading"
        />
        <Button 
          v-if="logData"
          label="Clear" 
          icon="pi pi-trash" 
          severity="secondary"
          @click="clearLog"
        />
      </div>
    </div>
    
    <div class="page-content">
      <div v-if="loading" class="loading-container">
        <ProgressSpinner />
        <p>Loading log file...</p>
      </div>
      
      <div v-else-if="!logData" class="empty-state">
        <i class="pi pi-file-o text-8xl text-gray-400 mb-6"></i>
        <h2>No Log File Loaded</h2>
        <p class="text-lg text-gray-500 mb-4">Load a SerialLogger JSON file to view serial communication data</p>
        <p class="text-sm text-gray-400">Use the "Load Log File" button or the File menu to select a log file</p>
      </div>
      
      <div v-else class="log-content">
        <div class="log-info-card">
          <div class="log-metadata">
            <h3>Log Information</h3>
            <div class="metadata-grid">
              <div class="metadata-item">
                <label>Start Time:</label>
                <span>{{ formatDateTime(logData.metadata.startTime) }}</span>
              </div>
              <div class="metadata-item" v-if="logData.metadata.endTime">
                <label>End Time:</label>
                <span>{{ formatDateTime(logData.metadata.endTime) }}</span>
              </div>
              <div class="metadata-item">
                <label>Total Entries:</label>
                <span>{{ logData.metadata.totalEntries }}</span>
              </div>
              <div class="metadata-item">
                <label>Version:</label>
                <span>{{ logData.metadata.version }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="log-entries">
          <div 
            v-for="(entry, index) in logData.entries" 
            :key="index" 
            class="log-entry"
            :class="entry.direction.toLowerCase()"
          >
            <div class="entry-header">
              <div class="entry-timestamp">{{ entry.timestamp }}</div>
              <div class="entry-direction">
                <i :class="getDirectionIcon(entry.direction)"></i>
                {{ entry.direction }}
              </div>
              <div v-if="entry.description" class="entry-description">{{ entry.description }}</div>
            </div>
            <div class="entry-data">
              <div class="hex-data">
                <span 
                  v-for="(byte, byteIndex) in entry.data" 
                  :key="byteIndex" 
                  class="hex-byte"
                >
                  {{ byte.toString(16).padStart(2, '0').toUpperCase() }}
                </span>
              </div>
              <div class="ascii-data">
                <span 
                  v-for="(byte, byteIndex) in entry.data" 
                  :key="byteIndex" 
                  class="ascii-char"
                >
                  {{ (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Button, ProgressSpinner } from 'primevue';

interface LogEntry {
  timestamp: string;
  elapsedMs: number;
  direction: 'SEND' | 'RECV';
  data: number[];
  description?: string;
}

interface LogMetadata {
  startTime: string;
  endTime?: string;
  totalEntries: number;
  version: string;
}

interface SerialLogData {
  metadata: LogMetadata;
  entries: LogEntry[];
}

const logData = ref<SerialLogData | null>(null);
const loading = ref(false);

const loadLogFile = async () => {
  try {
    loading.value = true;
    
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        console.log('Loading file:', file.name, 'Size:', file.size);
        const text = await file.text();
        console.log('File content length:', text.length);
        
        const parsed = JSON.parse(text) as SerialLogData;
        console.log('Parsed data:', parsed);
        
        // Validate the structure
        if (!parsed.metadata || !parsed.entries || !Array.isArray(parsed.entries)) {
          console.error('Invalid structure:', { 
            hasMetadata: !!parsed.metadata, 
            hasEntries: !!parsed.entries, 
            isArray: Array.isArray(parsed.entries) 
          });
          throw new Error('Invalid log file format - missing metadata or entries');
        }
        
        logData.value = parsed;
        console.log('Successfully loaded log file with', parsed.entries.length, 'entries');
      } catch (error) {
        console.error('Error loading log file:', error);
        alert(`Error loading log file: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure it is a valid SerialLogger JSON file.`);
      } finally {
        loading.value = false;
      }
    };
    
    input.click();
  } catch (error) {
    console.error('Error setting up file picker:', error);
    loading.value = false;
  }
};

const clearLog = () => {
  logData.value = null;
};

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString();
};

const getDirectionIcon = (direction: string): string => {
  return direction === 'SEND' ? 'pi pi-arrow-right' : 'pi pi-arrow-left';
};

const goBack = () => {
  console.log('Navigating back to radio page');
  // Emit event to parent to navigate back
  window.dispatchEvent(new CustomEvent('navigate-to-radio'));
};

// Listen for native menu file open events
const handleFileOpen = async (filePath: string) => {
  try {
    loading.value = true;
    console.log('Loading file from path:', filePath);
    
    // Use Electron IPC to read the file
    const text = await window.electron.readFile(filePath);
    console.log('File content length:', text.length);
    
    const parsed = JSON.parse(text) as SerialLogData;
    console.log('Parsed data:', parsed);
    
    // Validate the structure
    if (!parsed.metadata || !parsed.entries || !Array.isArray(parsed.entries)) {
      console.error('Invalid structure:', { 
        hasMetadata: !!parsed.metadata, 
        hasEntries: !!parsed.entries, 
        isArray: Array.isArray(parsed.entries) 
      });
      throw new Error('Invalid log file format - missing metadata or entries');
    }
    
    logData.value = parsed;
    console.log('Successfully loaded log file with', parsed.entries.length, 'entries');
  } catch (error) {
    console.error('Error loading log file:', error);
    alert(`Error loading log file: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure it is a valid SerialLogger JSON file.`);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  // Listen for file open events from the native menu
  const handleFileOpenEvent = (event: any, data: { filePath: string }) => {
    handleFileOpen(data.filePath);
  };
  
  window.electron.onFileOpen(handleFileOpenEvent);
  
  // Store the handler for cleanup
  (window as any).__fileOpenHandler = handleFileOpenEvent;
});

onUnmounted(() => {
  if ((window as any).__fileOpenHandler) {
    // Note: Electron doesn't provide a way to remove specific listeners
    // The handler will be cleaned up when the component is destroyed
  }
});
</script>

<style scoped>
.serial-log-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #1e1e1e;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  background-color: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-content h1 {
  margin: 0;
  color: #d4d4d4;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.page-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #d4d4d4;
  gap: 1rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
}

.empty-state h2 {
  margin: 0 0 1rem 0;
  color: #d4d4d4;
  font-size: 1.5rem;
}

.log-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 2rem;
  gap: 1.5rem;
}

.log-info-card {
  background-color: #2d2d30;
  border-radius: 8px;
  padding: 1.5rem;
  border: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.log-metadata h3 {
  margin: 0 0 1rem 0;
  color: #d4d4d4;
  font-size: 1.125rem;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metadata-item label {
  font-size: 0.875rem;
  color: #9ca3af;
  font-weight: 500;
}

.metadata-item span {
  font-family: monospace;
  color: #d4d4d4;
  font-size: 0.875rem;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.log-entry {
  border-radius: 8px;
  padding: 1.5rem;
  border-left: 4px solid;
  background-color: #2d2d30;
  border: 1px solid #3c3c3c;
}

.log-entry.send {
  border-left-color: #4ade80;
  background-color: rgba(74, 222, 128, 0.05);
}

.log-entry.recv {
  border-left-color: #60a5fa;
  background-color: rgba(96, 165, 250, 0.05);
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  flex-wrap: wrap;
}

.entry-timestamp {
  font-family: monospace;
  color: #9ca3af;
  font-weight: 500;
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.entry-direction {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.log-entry.send .entry-direction {
  color: #4ade80;
  background-color: rgba(74, 222, 128, 0.2);
}

.log-entry.recv .entry-direction {
  color: #60a5fa;
  background-color: rgba(96, 165, 250, 0.2);
}

.entry-description {
  color: #d4d4d4;
  font-style: italic;
  font-size: 0.875rem;
}

.entry-data {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hex-data {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  font-family: monospace;
  font-size: 0.875rem;
}

.hex-byte {
  display: inline-block;
  width: 2.5rem;
  text-align: center;
  padding: 0.375rem 0.25rem;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #d4d4d4;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ascii-data {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  font-family: monospace;
  font-size: 0.875rem;
}

.ascii-char {
  display: inline-block;
  width: 2.5rem;
  text-align: center;
  padding: 0.375rem 0.25rem;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  color: #ce9178;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Scrollbar styling */
.log-entries::-webkit-scrollbar {
  width: 8px;
}

.log-entries::-webkit-scrollbar-track {
  background: #2d2d30;
}

.log-entries::-webkit-scrollbar-thumb {
  background: #5a5a5a;
  border-radius: 4px;
}

.log-entries::-webkit-scrollbar-thumb:hover {
  background: #6a6a6a;
}
</style>
