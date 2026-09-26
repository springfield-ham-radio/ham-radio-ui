<script setup lang="ts">
import { PREDEFINED_CHANNEL_GROUP_IDS } from '~/utils/predefined-channel-groups';

const { settings, setHidden } = usePredefinedChannelGroups();

function onHideWeather(hidden: boolean): void {
  setHidden(PREDEFINED_CHANNEL_GROUP_IDS.weather, hidden);
}

function onHideFrs(hidden: boolean): void {
  setHidden(PREDEFINED_CHANNEL_GROUP_IDS.frs, hidden);
}

function onHideGmrs(hidden: boolean): void {
  setHidden(PREDEFINED_CHANNEL_GROUP_IDS.gmrs, hidden);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">
      Weather, FRS, and GMRS are built-in channel groups. They are not saved in your library. Hide a group to remove its tab from Channels and from Add from library.
    </p>

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Hide weather stations</p>
          <p class="text-xs text-muted">NOAA WX1–WX7 and Environment Canada WX8–WX10. Receive only.</p>
        </div>
        <USwitch
          :model-value="settings.hideWeather"
          aria-label="Hide weather stations"
          @update:model-value="onHideWeather"
        />
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Hide FRS</p>
          <p class="text-xs text-muted">FRS channels 1–22.</p>
        </div>
        <USwitch :model-value="settings.hideFrs" aria-label="Hide FRS" @update:model-value="onHideFrs" />
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-default px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Hide GMRS</p>
          <p class="text-xs text-muted">GMRS simplex channels 1–7 and 15–22, plus repeater pairs 15–22.</p>
        </div>
        <USwitch :model-value="settings.hideGmrs" aria-label="Hide GMRS" @update:model-value="onHideGmrs" />
      </div>
    </div>
  </div>
</template>
