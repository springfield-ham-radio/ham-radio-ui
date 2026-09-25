import type { ComputedRef, InjectionKey } from 'vue';

/**
 * Saved-radio id of the card that contains the current component.
 *
 * Absent outside a radio card, where radio actions follow the focused card.
 */
export const radioCardIdKey: InjectionKey<ComputedRef<string | undefined>> = Symbol('radioCardId');
