import type { RadioMemoryMapFieldUi, RadioMemoryMapValueKind } from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

/** Front-panel menu item. Mirrors the memory-map `ui.menu` object. */
export interface SettingsFieldMenu {
  number: number;
  code?: string;
}

/** Text blocks rendered in a settings help tooltip. */
export interface SettingsFieldHelp {
  menuLabel?: string;
  description?: string;
  constraint?: string;
  ariaLabel: string;
}

type FieldUiWithMenu = RadioMemoryMapFieldUi & {
  menu?: SettingsFieldMenu;
};

const CHOICE_LIMIT = 8;

function fieldMenu(ui: RadioMemoryMapFieldUi): SettingsFieldMenu | undefined {
  const menu = (ui as FieldUiWithMenu).menu;

  if (!menu || typeof menu.number !== 'number' || !Number.isInteger(menu.number) || menu.number < 0) {
    return undefined;
  }

  const code = typeof menu.code === 'string' ? menu.code.trim() : '';

  return code ? { number: menu.number, code } : { number: menu.number };
}

function fieldConstraint(value: RadioMemoryMapValueKind | undefined, fieldWidget: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (
    value.kind === 'integer' &&
    fieldWidget !== 'select' &&
    typeof value.min === 'number' &&
    typeof value.max === 'number'
  ) {
    return `Range ${value.min}–${value.max}`;
  }

  if (value.kind === 'enum' && value.values.length > 0 && value.values.length <= CHOICE_LIMIT) {
    const choices = value.values.map((entry) => (entry === '' ? 'None' : entry));
    return `Choices: ${choices.join(', ')}`;
  }

  if ((value.kind === 'ascii' || value.kind === 'dtmf') && value.length > 0) {
    return `Up to ${value.length} characters`;
  }

  return undefined;
}

/**
 * Help shown for a settings field. Returns undefined when the field has no description and no menu reference.
 * Range and short choice lists are added only when there is already something to explain.
 */
export function settingsFieldHelp(field: RadioMemoryMapUiField): SettingsFieldHelp | undefined {
  const menu = fieldMenu(field.ui);
  const description = field.ui.description?.trim() || undefined;
  const menuLabel = menu ? `Menu ${menu.number}${menu.code ? ` · ${menu.code}` : ''}` : undefined;

  if (!menuLabel && !description) {
    return undefined;
  }

  const constraint = fieldConstraint(field.value, field.ui.widget);
  const ariaLabel = [menuLabel, description, constraint]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .map((part) => part.replace(/\.+$/, ''))
    .join('. ');

  return {
    menuLabel,
    description,
    constraint,
    ariaLabel,
  };
}
