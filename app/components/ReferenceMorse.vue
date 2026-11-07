<script setup lang="ts">
import {
  beginChallenge,
  charactersInGroups,
  checkPractice,
  filterMorseCharacters,
  freshPracticeState,
  morseCharacter,
  morseTiming,
  patternText,
  practiceAccuracy,
  revealPractice,
  type MorseGroup,
  type PracticeState,
} from '~/utils/morse-code';
import { browserMorseAudioFactory, createMorsePlayer } from '~/utils/morse-audio';

const groups: Array<{ id: MorseGroup; label: string }> = [
  { id: 'letter', label: 'Letters A–Z' },
  { id: 'digit', label: 'Digits' },
  { id: 'punctuation', label: 'Punctuation' },
  { id: 'procedural', label: 'Procedural signals' },
  { id: 'accent', label: 'Accented E' },
];

const selected = reactive<Record<MorseGroup, boolean>>({
  letter: true,
  digit: false,
  punctuation: false,
  procedural: false,
  accent: false,
});

const wpm = ref(12);
const farnsworth = ref(false);
const characterWpm = ref(20);
const toneHz = ref(600);
const volume = ref(0.2);
const muted = ref(false);
const draft = ref('');
const session = ref<PracticeState>(freshPracticeState());
const playing = ref(false);
const audioProblem = ref('');
const referenceQuery = ref('');

const player = createMorsePlayer(browserMorseAudioFactory);
const referenceRows = computed(() => filterMorseCharacters(referenceQuery.value));
const pool = computed(() => {
  const active = groups.filter((group) => selected[group.id]).map((group) => group.id);
  return charactersInGroups(active);
});
const current = computed(() => (session.value.currentId ? morseCharacter(session.value.currentId) : undefined));
const showAnswer = computed(() => session.value.revealed || session.value.lastCorrect === true);
const accuracyLabel = computed(() => {
  const value = practiceAccuracy(session.value);

  if (value === null) {
    return 'No checks yet';
  }

  return `${session.value.correct} of ${session.value.attempts} correct (${Math.round(value * 100)}%)`;
});
const liveStatus = computed(() => {
  if (!session.value.hint) {
    return '';
  }

  if (showAnswer.value && current.value) {
    return `${session.value.hint} ${current.value.symbol}`;
  }

  return session.value.hint;
});
const farnsworthNote = computed(() => {
  return farnsworth.value && characterWpm.value <= wpm.value;
});
const timing = computed(() => {
  const overall = Number(wpm.value);
  const character = farnsworth.value ? Number(characterWpm.value) : undefined;
  const safeOverall = overall > 0 ? overall : 12;

  return morseTiming(safeOverall, character);
});

function stopPlayback(): void {
  player.stop();
  playing.value = false;
}

async function playPattern(pattern: string): Promise<void> {
  if (muted.value) {
    audioProblem.value = 'Muted. Turn mute off to hear the tone.';
    return;
  }

  audioProblem.value = '';
  playing.value = true;
  const result = await player.playPattern(pattern, {
    timing: timing.value,
    frequencyHz: Number(toneHz.value) || 600,
    volume: Number(volume.value),
    onEnded: () => {
      playing.value = false;
    },
  });

  if (!result.ok) {
    playing.value = false;

    if (result.reason === 'unsupported') {
      audioProblem.value = 'This browser has no Web Audio support, so practice tones are unavailable.';
    } else if (result.reason === 'suspended') {
      audioProblem.value = 'Audio stayed suspended. Use Start or Play again after a click.';
    }
  }
}

function onStart(): void {
  const next = beginChallenge(session.value, pool.value, Math.random);
  session.value = next;

  if (!next.currentId) {
    stopPlayback();
    return;
  }

  draft.value = '';
  const character = morseCharacter(next.currentId);

  if (character) {
    void playPattern(character.pattern);
  }
}

function onReplay(): void {
  if (!current.value) {
    return;
  }

  void playPattern(current.value.pattern);
}

function onCheck(): void {
  session.value = checkPractice(session.value, draft.value);
}

function onReveal(): void {
  session.value = revealPractice(session.value);
}

function onReset(): void {
  stopPlayback();
  draft.value = '';
  session.value = freshPracticeState();
  audioProblem.value = '';
}

function onMute(): void {
  muted.value = !muted.value;

  if (muted.value) {
    stopPlayback();
  } else if (audioProblem.value.startsWith('Muted')) {
    audioProblem.value = '';
  }
}

function playReference(id: string): void {
  const character = morseCharacter(id);

  if (!character) {
    return;
  }

  void playPattern(character.pattern);
}

onUnmounted(() => {
  void player.close();
});
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section aria-labelledby="morse-table" class="min-w-0">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p id="morse-table" class="max-w-2xl text-xs text-muted">
          ITU-R M.1677-1. A dash is three dots. Gaps inside a character, between characters, and between words are 1, 3, and 7 dots.
          % is sent as 0/0, not as one character. The multiplication sign is sent as X.
        </p>
        <div class="w-full sm:w-52">
          <label for="morse-search" class="mb-1 block text-xs font-medium text-highlighted">Search</label>
          <UInput id="morse-search" v-model="referenceQuery" icon="i-lucide-search" placeholder="A, comma, SK" autocomplete="off" />
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-[28rem] border-collapse text-sm">
          <thead class="bg-elevated text-left text-xs text-muted">
            <tr>
              <th scope="col" class="px-3 py-2 font-medium">Character</th>
              <th scope="col" class="px-3 py-2 font-medium">Code</th>
              <th scope="col" class="px-3 py-2 font-medium">Play</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="character in referenceRows" :key="character.id" class="border-t border-default">
              <th scope="row" class="px-3 py-1.5 text-left font-medium text-highlighted">
                <span class="font-mono text-base">{{ character.symbol }}</span>
                <span class="ml-2 text-xs font-normal text-muted">{{ character.name }}</span>
                <span v-if="character.note" class="mt-0.5 block text-xs font-normal text-muted">{{ character.note }}</span>
              </th>
              <td class="px-3 py-1.5 font-mono tracking-widest">{{ patternText(character.pattern) }}</td>
              <td class="px-3 py-1.5">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-play"
                  :aria-label="`Play ${character.symbol}`"
                  @click="playReference(character.id)"
                />
              </td>
            </tr>
            <tr v-if="referenceRows.length === 0">
              <td colspan="3" class="px-3 py-4 text-muted">No matches.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="morse-practice" class="h-fit rounded-lg border border-default bg-default p-3">
      <h3 id="morse-practice" class="text-sm font-semibold text-highlighted">Listening practice</h3>
      <p class="mt-1 text-xs text-muted">
        Starts when you press Start. One character at a time, PARIS timing (50 units). No microphone or radio.
      </p>

      <fieldset class="mt-3">
        <legend class="text-xs font-medium text-highlighted">Character sets</legend>
        <div class="mt-1 flex flex-col gap-1">
          <UCheckbox
            v-for="group in groups"
            :key="group.id"
            v-model="selected[group.id]"
            :label="group.label"
          />
        </div>
      </fieldset>

      <div class="mt-3 flex flex-col gap-3">
        <label class="block text-xs font-medium text-highlighted" for="morse-wpm">
          Speed
          <span class="font-normal text-muted">{{ wpm }} WPM</span>
        </label>
        <input id="morse-wpm" v-model.number="wpm" type="range" min="5" max="40" step="1" class="w-full">

        <UCheckbox v-model="farnsworth" label="Farnsworth spacing" />
        <p v-if="farnsworthNote" class="text-xs text-muted">
          Character speed is not faster than the overall speed, so the gaps stay at the standard 3 and 7 dots.
        </p>
        <template v-if="farnsworth">
          <label class="block text-xs font-medium text-highlighted" for="morse-character-wpm">
            Character speed
            <span class="font-normal text-muted">{{ characterWpm }} WPM</span>
          </label>
          <input id="morse-character-wpm" v-model.number="characterWpm" type="range" min="10" max="40" step="1" class="w-full">
        </template>

        <label class="block text-xs font-medium text-highlighted" for="morse-tone">
          Tone
          <span class="font-normal text-muted">{{ toneHz }} Hz</span>
        </label>
        <input id="morse-tone" v-model.number="toneHz" type="range" min="400" max="900" step="10" class="w-full">

        <label class="block text-xs font-medium text-highlighted" for="morse-volume">
          Volume
          <span class="font-normal text-muted">{{ Math.round(volume * 100) }}%</span>
        </label>
        <input id="morse-volume" v-model.number="volume" type="range" min="0" max="1" step="0.05" class="w-full">
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <UButton size="sm" icon="i-lucide-play" :label="session.currentId ? 'Next' : 'Start'" @click="onStart" />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="Replay" :disabled="!current" @click="onReplay" />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-square" label="Stop" @click="stopPlayback" />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :icon="muted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          :label="muted ? 'Unmute' : 'Mute'"
          :aria-pressed="muted"
          @click="onMute"
        />
      </div>

      <p v-if="audioProblem" class="mt-2 text-xs text-muted" role="status">{{ audioProblem }}</p>

      <form class="mt-3 flex flex-col gap-2" @submit.prevent="onCheck">
        <label for="morse-answer" class="text-xs font-medium text-highlighted">What did you hear?</label>
        <UInput
          id="morse-answer"
          v-model="draft"
          name="morse-answer"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="Character you heard"
        />
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" size="sm" label="Check" :disabled="!current || session.checked" />
          <UButton type="button" size="sm" color="neutral" variant="outline" label="Reveal" :disabled="!current || session.revealed" @click="onReveal" />
          <UButton type="button" size="sm" color="neutral" variant="ghost" label="Reset" @click="onReset" />
        </div>
      </form>

      <p class="mt-3 text-sm text-highlighted" aria-live="polite">{{ liveStatus }}</p>
      <p v-if="showAnswer && current" class="font-mono text-lg text-highlighted">
        {{ current.symbol }}
        <span class="ml-2 text-sm tracking-widest text-muted">{{ patternText(current.pattern) }}</span>
      </p>
      <p v-else-if="current" class="text-xs text-muted">The character stays hidden until a correct check or Reveal.</p>
      <p class="mt-2 text-xs text-muted">{{ accuracyLabel }}</p>
      <p v-if="playing" class="text-xs text-muted">Playing.</p>
    </section>
  </div>
</template>
