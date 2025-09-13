<template>
  <div class="serial-log-viewer">
    <div v-if="!logData" class="empty-state">
      <i class="pi pi-file-o text-6xl text-gray-400 mb-4"></i>
      <h3>No Serial Log Data</h3>
      <p class="text-gray-500">Serial logging was not enabled for this import operation.</p>
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
</template>

<script setup lang="ts">
import { computed } from 'vue';

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

const props = defineProps<{
  logData: SerialLogData | null;
}>();

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString();
};

const getDirectionIcon = (direction: string): string => {
  return direction === 'SEND' ? 'pi pi-arrow-right' : 'pi pi-arrow-left';
};
</script>

<style scoped>
.serial-log-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.empty-state h3 {
  margin: 0 0 1rem 0;
  color: #d4d4d4;
  font-size: 1.25rem;
}

.log-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
