<script setup lang="ts">
import { PREDEFINED_CHANNEL_GROUP_IDS } from '~/utils/predefined-channel-groups';

const { settings, setShown } = usePredefinedChannelGroups();

function onShowWeather(shown: boolean): void {
  setShown(PREDEFINED_CHANNEL_GROUP_IDS.weather, shown);
}

function onShowFrs(shown: boolean): void {
  setShown(PREDEFINED_CHANNEL_GROUP_IDS.frs, shown);
}

function onShowGmrs(shown: boolean): void {
  setShown(PREDEFINED_CHANNEL_GROUP_IDS.gmrs, shown);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">
      Weather, FRS, and GMRS are built-in channel groups. They are not saved in your library. Turn a group off to remove its tab from Channels and from Add from library.
    </p>

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Show weather stations</p>
          <p class="text-xs text-muted">NOAA WX1–WX7 and Environment Canada WX8–WX10. Receive only.</p>
        </div>
        <USwitch
          :model-value="settings.showWeather"
          aria-label="Show weather stations"
          @update:model-value="onShowWeather"
        />
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Show FRS</p>
          <p class="text-xs text-muted">FRS channels 1–22.</p>
        </div>
        <USwitch :model-value="settings.showFrs" aria-label="Show FRS" @update:model-value="onShowFrs" />
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Show GMRS</p>
          <p class="text-xs text-muted">GMRS simplex channels 1–7 and 15–22, plus repeater pairs 15–22.</p>
        </div>
        <USwitch :model-value="settings.showGmrs" aria-label="Show GMRS" @update:model-value="onShowGmrs" />
      </div>
    </div>
  </div>
</template>
