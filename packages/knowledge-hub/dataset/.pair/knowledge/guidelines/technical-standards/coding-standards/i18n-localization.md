# Internationalization and Localization (i18n/l10n)

## Overview

Internationalization (i18n) is the process of designing software applications to support multiple languages and regions. Localization (l10n) is the process of adapting the internationalized software for specific regions or languages.

## Implementation Strategy

### 1. Core Principles

#### Design for Global Audience

- **Unicode Support**: Use UTF-8 encoding throughout the application
- **Text Expansion**: Design UI to accommodate text length variations (up to 300% expansion)
- **Cultural Sensitivity**: Consider cultural differences in colors, symbols, and layouts
- **Right-to-Left (RTL) Support**: Prepare for languages like Arabic and Hebrew

#### Separation of Concerns

- **Content Externalization**: Separate all user-facing text from code
- **Resource Bundles**: Organize translations in structured files
- **Dynamic Loading**: Load translations based on user locale preferences

### 2. Technical Implementation

#### Modern JavaScript/TypeScript Approach

```typescript
// Type definitions for translation keys
interface TranslationKeys {
  common: {
    save: string
    cancel: string
    delete: string
    confirm: string
  }
  auth: {
    login: string
    logout: string
    forgotPassword: string
  }
  errors: {
    networkError: string
    validationError: string
  }
}

// Translation service
export class I18nService {
  private translations: Map<string, TranslationKeys> = new Map()
  private currentLocale: string = 'en-US'

  async loadTranslations(locale: string): Promise<void> {
    try {
      const translations = await import(`./locales/${locale}.json`)
      this.translations.set(locale, translations.default)
      this.currentLocale = locale
    } catch (error) {
      console.warn(`Failed to load translations for ${locale}`, error)
      // Fallback to default locale
      if (locale !== 'en-US') {
        await this.loadTranslations('en-US')
      }
    }
  }

  t(key: keyof TranslationKeys, params?: Record<string, string>): string {
    const translation = this.getNestedValue(this.translations.get(this.currentLocale), key)

    if (!translation) {
      console.warn(`Translation missing for key: ${key}`)
      return key // Return key as fallback
    }

    return this.interpolate(translation, params)
  }

  private interpolate(text: string, params?: Record<string, string>): string {
    if (!params) return text

    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] || match
    })
  }

  private getNestedValue(obj: any, path: string): string | undefined {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }
}
```

#### React Integration

```typescript
// React Context for i18n
export const I18nContext = createContext<I18nService | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [i18nService] = useState(() => new I18nService())

  useEffect(() => {
    const userLocale = navigator.language || 'en-US'
    i18nService.loadTranslations(userLocale)
  }, [i18nService])

  return <I18nContext.Provider value={i18nService}>{children}</I18nContext.Provider>
}

// Hook for using translations
export function useTranslation() {
  const i18nService = useContext(I18nContext)

  if (!i18nService) {
    throw new Error('useTranslation must be used within I18nProvider')
  }

  return {
    t: (key: string, params?: Record<string, string>) => i18nService.t(key, params),
    locale: i18nService.currentLocale,
  }
}

// Component usage
export function WelcomeMessage({ userName }: { userName: string }) {
  const { t } = useTranslation()

  return <h1>{t('common.welcome', { name: userName })}</h1>
}
```

#### Next.js Integration

```typescript
// next-i18next configuration
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'

// pages/_app.tsx
import { appWithTranslation } from 'next-i18next'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default appWithTranslation(MyApp)

// Page component
export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'auth'])),
    },
  }
}
```

### 3. Resource Management

#### Translation File Structure

```json
// locales/en-US.json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "welcome": "Welcome, {{name}}!",
    "itemCount": {
      "zero": "No items",
      "one": "{{count}} item",
      "other": "{{count}} items"
    }
  },
  "auth": {
    "login": "Sign In",
    "logout": "Sign Out",
    "forgotPassword": "Forgot Password?"
  },
  "errors": {
    "networkError": "Network connection failed. Please try again.",
    "validationError": "Please check your input and try again."
  }
}
```

```json
// locales/es-ES.json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "welcome": "¡Bienvenido, {{name}}!",
    "itemCount": {
      "zero": "Sin elementos",
      "one": "{{count}} elemento",
      "other": "{{count}} elementos"
    }
  },
  "auth": {
    "login": "Iniciar Sesión",
    "logout": "Cerrar Sesión",
    "forgotPassword": "¿Olvidaste tu contraseña?"
  },
  "errors": {
    "networkError": "Error de conexión de red. Inténtalo de nuevo.",
    "validationError": "Por favor revisa tu entrada e inténtalo de nuevo."
  }
}
```

#### Namespace Organization

- **common**: Shared UI elements, buttons, labels
- **navigation**: Menu items, breadcrumbs, links
- **forms**: Form labels, placeholders, validation messages
- **errors**: Error messages, warnings, notifications
- **domain**: Business-specific terminology

### 4. Advanced Features

#### Pluralization

```typescript
export class PluralService {
  getPlural(count: number, translations: { zero?: string; one: string; other: string }): string {
    if (count === 0 && translations.zero) return translations.zero
    if (count === 1) return translations.one
    return translations.other
  }

  formatCount(count: number, key: string): string {
    const translations = this.i18nService.t(`${key}.count`)
    const pluralized = this.getPlural(count, translations)
    return pluralized.replace('{{count}}', count.toString())
  }
}
```

#### Date and Number Formatting

```typescript
export class LocaleFormatService {
  private formatters: Map<string, Intl.NumberFormat> = new Map()
  private dateFormatters: Map<string, Intl.DateTimeFormat> = new Map()

  formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
    const key = `${locale}-${JSON.stringify(options)}`

    if (!this.formatters.has(key)) {
      this.formatters.set(key, new Intl.NumberFormat(locale, options))
    }

    return this.formatters.get(key)!.format(value)
  }

  formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions): string {
    const key = `${locale}-${JSON.stringify(options)}`

    if (!this.dateFormatters.has(key)) {
      this.dateFormatters.set(key, new Intl.DateTimeFormat(locale, options))
    }

    return this.dateFormatters.get(key)!.format(date)
  }

  formatCurrency(amount: number, currency: string, locale: string): string {
    return this.formatNumber(amount, locale, {
      style: 'currency',
      currency: currency,
    })
  }
}
```

#### RTL Support

```css
/* CSS for RTL support */
[dir='rtl'] {
  text-align: right;
}

[dir='rtl'] .flex-row {
  flex-direction: row-reverse;
}

[dir='rtl'] .margin-left {
  margin-left: 0;
  margin-right: var(--spacing);
}

/* Logical properties (preferred) */
.content {
  margin-inline-start: 1rem;
  padding-inline-end: 2rem;
  border-inline-start: 1px solid #ccc;
}
```

```typescript
// RTL detection and application
export class RTLService {
  isRTL(locale: string): boolean {
    const rtlLocales = ['ar', 'he', 'fa', 'ur']
    return rtlLocales.some(rtl => locale.startsWith(rtl))
  }

  applyDirection(locale: string): void {
    const direction = this.isRTL(locale) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', direction)
    document.documentElement.setAttribute('lang', locale)
  }
}
```

## Best Practices

### 1. Development Guidelines

- **Extract Early**: Externalize text from the beginning of development
- **Context Matters**: Provide context comments for translators
- **Avoid Concatenation**: Don't build sentences by concatenating translations
- **Test with Pseudolocalization**: Test UI with expanded and accented text

### 2. Translation Management

```typescript
// Good: Contextual keys
t('button.save.user.profile')
t('message.error.network.timeout')

// Bad: Generic keys
t('save')
t('error')

// Good: Complete phrases
t('welcome.message', { userName })
// "Welcome back, {{userName}}!"

// Bad: Concatenation
t('welcome') + ' ' + t('back') + ', ' + userName + '!'
```

### 3. Performance Optimization

```typescript
// Lazy loading of translations
export class LazyI18nService {
  private loadedNamespaces: Set<string> = new Set()

  async loadNamespace(namespace: string, locale: string): Promise<void> {
    const key = `${namespace}-${locale}`

    if (this.loadedNamespaces.has(key)) return

    try {
      const translations = await import(`./locales/${locale}/${namespace}.json`)
      this.mergeTranslations(locale, namespace, translations.default)
      this.loadedNamespaces.add(key)
    } catch (error) {
      console.warn(`Failed to load ${namespace} for ${locale}`, error)
    }
  }

  private mergeTranslations(locale: string, namespace: string, translations: any): void {
    const existing = this.translations.get(locale) || {}
    existing[namespace] = translations
    this.translations.set(locale, existing)
  }
}
```

## Testing Strategy

### 1. Unit Testing

```typescript
describe('I18nService', () => {
  let i18nService: I18nService

  beforeEach(async () => {
    i18nService = new I18nService()
    await i18nService.loadTranslations('en-US')
  })

  test('should translate simple keys', () => {
    expect(i18nService.t('common.save')).toBe('Save')
  })

  test('should handle interpolation', () => {
    expect(i18nService.t('common.welcome', { name: 'John' })).toBe('Welcome, John!')
  })

  test('should fallback to key for missing translations', () => {
    expect(i18nService.t('missing.key')).toBe('missing.key')
  })

  test('should handle nested keys', () => {
    expect(i18nService.t('common.itemCount.one', { count: '1' })).toBe('1 item')
  })
})
```

### 2. Integration Testing

```typescript
// Test with actual translation files
describe('Translation Integration', () => {
  test('should load and use Spanish translations', async () => {
    const i18nService = new I18nService()
    await i18nService.loadTranslations('es-ES')

    expect(i18nService.t('common.save')).toBe('Guardar')
  })

  test('should fallback to English for missing keys', async () => {
    const i18nService = new I18nService()
    await i18nService.loadTranslations('incomplete-locale')

    expect(i18nService.t('common.save')).toBe('Save')
  })
})
```

### 3. Visual Testing

```typescript
// Pseudolocalization for testing
export function pseudolocalize(text: string): string {
  const pseudoMap: Record<string, string> = {
    a: 'å',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ü',
    A: 'Å',
    E: 'É',
    I: 'Í',
    O: 'Ó',
    U: 'Ü',
  }

  let result = text.replace(/[aeiouAEIOU]/g, char => pseudoMap[char] || char)
  result = `[${result}]` // Add brackets to show boundaries
  result = result.repeat(1.3).substring(0, result.length * 1.3) // Simulate expansion

  return result
}
```

## Accessibility Considerations

### 1. Screen Reader Support

```typescript
// Language announcement
export function announceLanguageChange(locale: string): void {
  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', 'polite')
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'

  const languageName = new Intl.DisplayNames([locale], {
    type: 'language',
  }).of(locale)

  announcement.textContent = `Language changed to ${languageName}`
  document.body.appendChild(announcement)

  setTimeout(() => document.body.removeChild(announcement), 1000)
}
```

### 2. Form Label Association

```typescript
// Ensure form labels are properly translated and associated
export function TranslatedInput({ labelKey, placeholderKey, ...props }: TranslatedInputProps) {
  const { t } = useTranslation()
  const id = useId()

  return (
    <div>
      <label htmlFor={id}>{t(labelKey)}</label>
      <input id={id} placeholder={t(placeholderKey)} {...props} />
    </div>
  )
}
```

## Deployment and Operations

### 1. Build-Time Optimization

```typescript
// Webpack plugin for translation optimization
export class I18nOptimizationPlugin {
  apply(compiler: any) {
    compiler.hooks.emit.tapAsync(
      'I18nOptimizationPlugin',
      (compilation: any, callback: Function) => {
        // Remove unused translation keys
        // Minify translation files
        // Generate type definitions
        callback()
      },
    )
  }
}
```

### 2. Runtime Language Detection

```typescript
export class LocaleDetectionService {
  detectLocale(): string {
    // 1. URL parameter
    const urlParams = new URLSearchParams(window.location.search)
    const urlLocale = urlParams.get('lang')
    if (urlLocale && this.isValidLocale(urlLocale)) {
      return urlLocale
    }

    // 2. Local storage
    const storedLocale = localStorage.getItem('preferred-locale')
    if (storedLocale && this.isValidLocale(storedLocale)) {
      return storedLocale
    }

    // 3. Browser preference
    const browserLocale = navigator.language
    if (this.isValidLocale(browserLocale)) {
      return browserLocale
    }

    // 4. Fallback to default
    return 'en-US'
  }

  private isValidLocale(locale: string): boolean {
    return this.supportedLocales.includes(locale)
  }
}
```

## Related Documentation

- [User Experience Guidelines](../../user-experience/README.md)
- [Accessibility Standards](../../quality-assurance/accessibility/README.md)
- [Content Strategy](../../user-experience/content-strategy/README.md)
- [Testing Strategy](../../testing/README.md)
