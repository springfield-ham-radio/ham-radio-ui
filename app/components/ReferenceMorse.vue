<script setup lang="ts">
import {
  beginChallenge,
  charactersInGroups,
  checkPractice,
  DEFAULT_MORSE_CHARACTER_WPM,
  filterMorseCharacters,
  freshPracticeState,
  MORSE_PARAGRAPH_WORD_GAPS,
  morseCharacter,
  morseTiming,
  patternText,
  practiceAccuracy,
  revealPractice,
  scheduleMorseTextFromIndex,
  type MorseGroup,
  type MorseTextSchedule,
  type PracticeState,
} from '~/utils/morse-code';
import { browserMorseAudioFactory, createMorsePlayer, MORSE_TONE_LEAD_SECONDS } from '~/utils/morse-audio';

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
const characterWpm = ref(DEFAULT_MORSE_CHARACTER_WPM);
const toneHz = ref(600);
const volume = ref(0.2);
const muted = ref(false);
const draft = ref('');
const pasteText = ref('');
const session = ref<PracticeState>(freshPracticeState());
const playing = ref(false);
const audioProblem = ref('');
const referenceQuery = ref('');
const activePaste = ref<{ index: number; length: number } | null>(null);
const pastePreview = ref<HTMLElement | null>(null);
const activeMarkElement = ref<HTMLElement | null>(null);
const pastePlaying = ref(false);
const pasteOriginIndex = ref(0);
const pasteTimers: ReturnType<typeof setTimeout>[] = [];
let pasteToken = 0;

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
const timing = computed(() => {
  const overall = Number(wpm.value);
  const character = Number(characterWpm.value);
  const safeOverall = overall > 0 ? overall : 12;
  const safeCharacter = Math.max(safeOverall, character > 0 ? character : safeOverall);

  return morseTiming(safeOverall, safeCharacter);
});
const spacingNote = computed(() => {
  if (timing.value.farnsworth) {
    return 'Dits and dahs use the character speed. Character and word gaps stretch so PARIS matches the overall speed.';
  }

  return 'Character speed matches the overall speed, so the gaps stay at 3 and 7 dits.';
});
const pasteBefore = computed(() => pasteText.value.slice(0, activePaste.value?.index ?? 0));
const pasteActive = computed(() => {
  const mark = activePaste.value;

  if (!mark) {
    return '';
  }

  return pasteText.value.slice(mark.index, mark.index + mark.length);
});
const pasteAfter = computed(() => {
  const mark = activePaste.value;

  if (!mark) {
    return '';
  }

  return pasteText.value.slice(mark.index + mark.length);
});

watch([wpm, characterWpm, toneHz, volume], () => {
  if (characterWpm.value < wpm.value) {
    characterWpm.value = wpm.value;
    return;
  }

  if (!pastePlaying.value) {
    return;
  }

  void playPasteFrom(pasteOriginIndex.value);
});

function clearPasteHighlight(): void {
  for (const timer of pasteTimers) {
    clearTimeout(timer);
  }

  pasteTimers.length = 0;
  activePaste.value = null;
}

function scrollPasteMark(): void {
  const container = pastePreview.value;
  const mark = activeMarkElement.value;

  if (!container || !mark) {
    return;
  }

  const markTop = mark.offsetTop;
  const markBottom = markTop + mark.offsetHeight;

  if (markTop < container.scrollTop) {
    container.scrollTop = markTop;
  } else if (markBottom > container.scrollTop + container.clientHeight) {
    container.scrollTop = markBottom - container.clientHeight;
  }
}

function armPasteHighlight(schedule: MorseTextSchedule): void {
  clearPasteHighlight();
  const leadMs = MORSE_TONE_LEAD_SECONDS * 1000;

  for (const mark of schedule.marks) {
    pasteTimers.push(setTimeout(() => {
      pasteOriginIndex.value = mark.index;
      activePaste.value = { index: mark.index, length: mark.length };
      void nextTick(scrollPasteMark);
    }, mark.startSeconds * 1000 + leadMs));
  }
}

function cancelPasteSession(): void {
  pastePlaying.value = false;
  pasteToken += 1;
  clearPasteHighlight();
}

function toneOptions(onEnded?: () => void) {
  return {
    timing: timing.value,
    frequencyHz: Number(toneHz.value) || 600,
    volume: Number(volume.value),
    onEnded,
  };
}

function stopPlayback(): void {
  cancelPasteSession();
  player.stop();
  playing.value = false;
}

function reportAudioFailure(reason: string | undefined): void {
  if (reason === 'unsupported') {
    audioProblem.value = 'This browser has no Web Audio support, so practice tones are unavailable.';
  } else if (reason === 'suspended') {
    audioProblem.value = 'Audio stayed suspended. Use Start or Play again after a click.';
  }
}

async function playPattern(pattern: string): Promise<void> {
  if (muted.value) {
    audioProblem.value = 'Muted. Turn mute off to hear the tone.';
    return;
  }

  cancelPasteSession();
  audioProblem.value = '';
  playing.value = true;
  const result = await player.playPattern(pattern, toneOptions(() => {
    playing.value = false;
  }));

  if (!result.ok) {
    playing.value = false;
    reportAudioFailure(result.reason);
  }
}

async function playPasteFrom(fromIndex: number): Promise<void> {
  if (muted.value) {
    audioProblem.value = 'Muted. Turn mute off to hear the tone.';
    return;
  }

  const token = pasteToken + 1;
  pasteToken = token;
  pastePlaying.value = true;
  pasteOriginIndex.value = fromIndex;
  const schedule = scheduleMorseTextFromIndex(pasteText.value, timing.value, fromIndex);

  if (schedule.events.length === 0) {
    if (token !== pasteToken) {
      return;
    }

    stopPlayback();

    if (fromIndex === 0) {
      audioProblem.value = pasteText.value.trim()
        ? 'No Morse characters in that text. Unsupported characters are skipped.'
        : 'Paste text to play.';
    }

    return;
  }

  clearPasteHighlight();
  audioProblem.value = '';
  playing.value = true;
  const result = await player.playEvents(schedule.events, toneOptions(() => {
    if (token !== pasteToken) {
      return;
    }

    pastePlaying.value = false;
    playing.value = false;
    clearPasteHighlight();
  }));

  if (token !== pasteToken) {
    return;
  }

  if (!result.ok || !playing.value) {
    pastePlaying.value = false;
    playing.value = false;
    clearPasteHighlight();
    reportAudioFailure(result.reason);
    return;
  }

  armPasteHighlight(schedule);
}

function onPlayText(): void {
  void playPasteFrom(0);
}

function onPasteEdit(): void {
  if (pastePlaying.value || activePaste.value || pasteTimers.length > 0) {
    stopPlayback();
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
  cancelPasteSession();
  void player.close();
});
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section aria-labelledby="morse-table" class="min-w-0">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p id="morse-table" class="max-w-2xl text-xs text-muted">
          ITU-R M.1677-1. A dash is three dots. Standard gaps inside a character, between characters, and between words are 1, 3, and 7 dots.
          Farnsworth keeps the dit at the character speed and stretches the character and word gaps.
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

    <div class="flex flex-col gap-4">
    <section aria-labelledby="morse-practice" class="h-fit rounded-lg border border-default bg-default p-3">
      <h3 id="morse-practice" class="text-sm font-semibold text-highlighted">Listening practice</h3>
      <p class="mt-1 text-xs text-muted">
        Starts when you press Start. One character at a time, at the character speed above. No microphone or radio.
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
          Overall speed
          <span class="font-normal text-muted">{{ wpm }} WPM</span>
        </label>
        <input id="morse-wpm" v-model.number="wpm" type="range" min="5" max="40" step="1" class="w-full">

        <label class="block text-xs font-medium text-highlighted" for="morse-character-wpm">
          Character speed
          <span class="font-normal text-muted">{{ characterWpm }} WPM</span>
        </label>
        <input id="morse-character-wpm" v-model.number="characterWpm" type="range" :min="wpm" max="40" step="1" class="w-full">
        <p class="text-xs text-muted">{{ spacingNote }}</p>

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

    <section aria-labelledby="morse-paste" class="h-fit rounded-lg border border-default bg-default p-3">
      <h3 id="morse-paste" class="text-sm font-semibold text-highlighted">Play text</h3>
      <p class="mt-1 text-xs text-muted">
        Paste text and play it with the speed, character speed, tone, and volume above.
        Changing one of those while text is playing restarts at the current character.
        A space or a single newline is a word gap. A blank line is {{ MORSE_PARAGRAPH_WORD_GAPS }} word gaps.
        Characters with no Morse code are skipped.
      </p>
      <label for="morse-paste-text" class="mt-3 block text-xs font-medium text-highlighted">Text</label>
      <UTextarea
        id="morse-paste-text"
        v-model="pasteText"
        :rows="6"
        autoresize
        class="mt-1 w-full font-mono"
        placeholder="CQ CQ DE W1AW"
        spellcheck="false"
        aria-label="Text to play as Morse"
        @update:model-value="onPasteEdit"
      />
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton size="sm" icon="i-lucide-play" label="Play" @click="onPlayText" />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-square" label="Stop" @click="stopPlayback" />
      </div>
      <p
        v-if="activePaste"
        ref="pastePreview"
        class="relative mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-sm text-highlighted"
        aria-live="polite"
      >
        <span>{{ pasteBefore }}</span><mark ref="activeMarkElement" class="rounded-sm bg-primary/25 px-0.5 text-highlighted">{{ pasteActive }}</mark><span>{{ pasteAfter }}</span>
      </p>
    </section>
    </div>
  </div>
</template>
