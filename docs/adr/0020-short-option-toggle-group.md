# Short option pickers use ToggleGroup

**Status:** accepted  
**Date:** 2026-11-23

## Context

Channel filters, layout switches, theme preference, and lab frequency units are short, mutually exclusive choices. Dropdowns (`USelect`) add clicks and hide options until opened. Nuxt UI 4.13 adds `UToggle` and `UToggleGroup` for compact, always-visible selection.

## Decision

Use **`UToggleGroup`** (single-select, `attached` when grouped) for **three or fewer** short labeled or icon options where the value is always required.

Keep **`USelect`** when:

- There are more than three options.
- Options are long or need search (for example band filters, CTCSS tone lists).
- The control is a multi-select or nullable field.

Guard single-select groups so clearing the selection does not write an empty model value (see `requiredToggleGroupModel` in `app/utils/required-toggle-group-model.ts`).

## Consequences

- Filter rows and preference panels read more like segmented controls.
- Tone and band pickers stay as selects for scanability.
- New short pickers should default to `UToggleGroup` unless this ADR’s exceptions apply.