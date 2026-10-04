// Local-only startup text remains translated even when the pinned Vue CDN is unavailable.
import { createLanguagePreference, translate } from './i18n.js';
const { locale } = createLanguagePreference(() => window.localStorage, window.navigator);
document.documentElement.lang = locale;
document.title = translate('page.title', locale);
document.getElementById('loading').textContent = translate('page.loading', locale);
import('./app.js').catch(error => console.error('Doubleknit startup failed', error));
