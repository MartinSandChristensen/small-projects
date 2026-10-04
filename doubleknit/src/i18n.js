import { enGB, da } from './messages.js';
import { enGB as uiEn, da as uiDa } from './ui-messages.js';
import { enGB as chartEn, da as chartDa } from './chart-messages.js';
import { enGB as displayEn, da as displayDa } from './display-messages.js';

import { enGB as projectEn, da as projectDa } from './project-messages.js';

Object.assign(enGB, uiEn, chartEn, displayEn, projectEn);
Object.assign(da, uiDa, chartDa, displayDa, projectDa);

export const LANGUAGE_KEY = 'doubleknit.language';
const numberFormats = new Map(), pluralRules = new Map();

export const dictionaries = { 'en-GB': enGB, da };
export const message = (key, args = {}) => ({ key, args });

// Keep messages as data until rendering, including errors already on screen.
export function translate(value, locale = 'en-GB') {
  if (!value) return '';
  const { key, args = {} } = typeof value === 'string' ? message(value) : value;
  let template = dictionaries[locale]?.[key] ?? enGB[key];
  if (template === undefined) throw new Error(`Missing English message: ${key}`);
  if (typeof template === 'object') {
    if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
    template = template[pluralRules.get(locale).select(args.count)] ?? template.other;
  }
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(args, name)) throw new Error(`Missing ${key} argument: ${name}`);
    const value = args[name];
    return value && typeof value === 'object' && value.key ? translate(value, locale)
      : typeof value === 'number' ? formatNumber(value, locale) : String(value);
  });
}
export function formatNumber(value, locale = 'en-GB') {
  if (!numberFormats.has(locale)) {
    numberFormats.set(locale, new Intl.NumberFormat(locale, { maximumSignificantDigits: 16 }));
  }
  return numberFormats.get(locale).format(value);
}
export function formatMillimetres(value, locale = 'en-GB') {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
export class AppError extends Error {
  constructor(key, args) {
    const descriptor = message(key, args);
    super(translate(descriptor));
    this.descriptor = descriptor;
  }
}
export const errorMessage = error => error?.descriptor ?? message('error.unexpected');

export function supportedLanguage(tag) {
  if (typeof tag !== 'string') return null;
  try {
    const base = new Intl.Locale(tag).language;
    return base === 'da' ? 'da' : base === 'en' ? 'en-GB' : null;
  } catch { return null; }
}
export function resolveLanguage(saved, languages, language) {
  // Only our two explicit preference values are valid stored choices.
  if (saved === 'da' || saved === 'en-GB') return saved;
  const candidates = Array.isArray(languages) && languages.length ? languages : [language];
  return candidates.map(supportedLanguage).find(Boolean) ?? 'en-GB';
}
export function createLanguagePreference(getStorage, navigator = {}) {
  let saved, failed = false;
  try { saved = getStorage().getItem(LANGUAGE_KEY); } catch { failed = true; }
  return {
    locale: resolveLanguage(saved, navigator.languages, navigator.language),
    warning: failed ? message('language.storage') : '',
    choose(locale) {
      if (!Object.hasOwn(dictionaries, locale)) throw new Error('Unsupported UI language');
      this.locale = locale;
      try { getStorage().setItem(LANGUAGE_KEY, locale); this.warning = ''; }
      catch { this.warning = message('language.storage'); }
    },
  };
}

// No grouping, exponent notation, mixed separators or implicit magnitude changes.
export function parseDecimal(text, locale = 'en-GB') {
  if (typeof text !== 'string') return null;
  const input = text.trim();
  const pattern = locale === 'da' ? /^\d+(?:,\d+)?$/ : /^\d+(?:\.\d+)?$/;
  if (!pattern.test(input)) return null;
  const number = Number(input.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}
export function decimalInput(number, locale = 'en-GB') {
  // Expand scientific notation losslessly, so all validated finite sources stay editable.
  let text = String(number);
  if (/e/i.test(text)) {
    const [coefficient, exponent] = text.toLowerCase().split('e');
    const digits = coefficient.replace('.', '');
    const point = (coefficient.indexOf('.') < 0 ? coefficient.length : coefficient.indexOf('.')) + Number(exponent);
    text = point <= 0 ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : digits.slice(0, point) + '.' + digits.slice(point);
  }
  return locale === 'da' ? text.replace('.', ',') : text;
}
