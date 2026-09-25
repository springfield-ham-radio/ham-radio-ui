<script setup lang="ts">
import type { LicensePerson } from '~/utils/license-people';

const { people, licensesFor, addLicensePerson, removeLicensePerson } = useOperatorLicense();

const personName = shallowRef('');
const nameError = shallowRef<string | undefined>();
const removeConfirmOpen = shallowRef(false);
const pendingRemove = shallowRef<LicensePerson | undefined>();

function onAddPerson(): void {
  const created = addLicensePerson(personName.value);

  if (!created) {
    nameError.value = 'Enter a name';
    return;
  }

  personName.value = '';
  nameError.value = undefined;
}

function requestRemove(person: LicensePerson): void {
  pendingRemove.value = person;
  removeConfirmOpen.value = true;
}

function cancelRemove(): void {
  removeConfirmOpen.value = false;
  pendingRemove.value = undefined;
}

function confirmRemove(): void {
  const person = pendingRemove.value;

  if (person) {
    removeLicensePerson(person.id);
  }

  cancelRemove();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-3 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">People</p>
          <p class="text-xs text-muted">
            Group licenses by person. A person can hold no license. Anyone may use FRS, including someone with no grant on file.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="personName"
            placeholder="Name"
            class="min-w-40 flex-1"
            @keydown.enter.prevent="onAddPerson"
          />
          <UButton label="Add person" color="primary" icon="i-lucide-plus" @click="onAddPerson" />
        </div>
        <p v-if="nameError" class="text-xs text-error">{{ nameError }}</p>
      </div>
    </div>

    <p v-if="people.length === 0" class="text-xs text-muted">
      Add a person to look up amateur or GMRS licenses, or leave them without a license for FRS.
    </p>

    <LicensePersonCard
      v-for="person in people"
      :key="person.id"
      :person="person"
      :licenses="licensesFor(person.id)"
      @remove="requestRemove(person)"
    />

    <UModal v-model:open="removeConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
      <template #content>
        <div class="flex flex-col gap-4 p-5">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">Remove person?</h2>
            <p class="mt-2 text-sm text-muted">
              {{
                pendingRemove
                  ? `Remove ${pendingRemove.name} and the licenses saved for them? Radios using that person will need another selection.`
                  : ''
              }}
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelRemove" />
            <UButton label="Remove" color="error" @click="confirmRemove" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
