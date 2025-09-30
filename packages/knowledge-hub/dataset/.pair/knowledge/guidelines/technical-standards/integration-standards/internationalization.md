# Internationalization (i18n)

This document defines our approach to internationalization and localization, enabling our applications to support multiple languages, regions, and cultural preferences.

## Overview

Our internationalization strategy ensures scalable multi-language support with efficient translation management, locale-aware formatting, and seamless user experience across different regions.

## i18n Architecture

### Core Configuration

```typescript
interface I18nConfig {
  default_locale: string
  supported_locales: string[]
  fallback_locale: string
  detection_strategy: LocaleDetectionStrategy
  storage_strategy: LocaleStorageStrategy
  translation_loading: TranslationLoadingStrategy
}

interface LocaleDetectionStrategy {
  sources: ('url' | 'cookie' | 'header' | 'query' | 'subdomain')[]
  priority: number[]
  cookie_name?: string
  query_param?: string
  header_name?: string
}

interface LocaleStorageStrategy {
  type: 'cookie' | 'localStorage' | 'session' | 'url'
  persistence: boolean
  sync_across_tabs: boolean
}

const i18nConfig: I18nConfig = {
  default_locale: 'en',
  supported_locales: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh'],
  fallback_locale: 'en',
  detection_strategy: {
    sources: ['url', 'cookie', 'header'],
    priority: [1, 2, 3],
    cookie_name: 'locale',
    query_param: 'lang',
    header_name: 'Accept-Language',
  },
  storage_strategy: {
    type: 'cookie',
    persistence: true,
    sync_across_tabs: true,
  },
  translation_loading: {
    strategy: 'lazy',
    preload_namespaces: ['common', 'navigation'],
    chunk_size: 'namespace',
  },
}
```

### Next.js i18n Implementation

```typescript
// next-i18next.config.js
import { UserConfig } from 'next-i18next'

const config: UserConfig = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh'],
    localeDetection: true,
    domains: [
      {
        domain: 'example.com',
        defaultLocale: 'en',
      },
      {
        domain: 'example.es',
        defaultLocale: 'es',
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  },
  localePath: './public/locales',
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  keySeparator: '.',
  namespaceSeparator: ':',
  pluralSeparator: '_',
  contextSeparator: '_',
  fallbackLng: 'en',
  supportedLngs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh'],
  ns: ['common', 'navigation', 'forms', 'errors', 'dashboard'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
    formatSeparator: ',',
    format: (value, format, lng) => {
      if (format === 'uppercase') return value.toUpperCase()
      if (format === 'lowercase') return value.toLowerCase()
      if (format === 'currency')
        return new Intl.NumberFormat(lng, {
          style: 'currency',
          currency: 'USD',
        }).format(value)
      return value
    },
  },
  detection: {
    order: ['path', 'cookie', 'header', 'querystring'],
    caches: ['cookie'],
    cookieOptions: {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    },
  },
}

export default config
```

## Translation Management

### Translation File Structure

```typescript
interface TranslationNamespace {
  common: CommonTranslations
  navigation: NavigationTranslations
  forms: FormTranslations
  errors: ErrorTranslations
  dashboard: DashboardTranslations
}

interface CommonTranslations {
  buttons: {
    save: string
    cancel: string
    delete: string
    edit: string
    create: string
    submit: string
    back: string
    next: string
    previous: string
    close: string
  }
  actions: {
    loading: string
    success: string
    error: string
    retry: string
    confirm: string
  }
  labels: {
    name: string
    email: string
    password: string
    phone: string
    address: string
    date: string
    time: string
    status: string
  }
  messages: {
    welcome: string
    goodbye: string
    thank_you: string
    please_wait: string
    coming_soon: string
  }
}

// Example: public/locales/en/common.json
const enCommon: CommonTranslations = {
  buttons: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    submit: 'Submit',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    close: 'Close',
  },
  actions: {
    loading: 'Loading...',
    success: 'Success!',
    error: 'An error occurred',
    retry: 'Retry',
    confirm: 'Are you sure?',
  },
  labels: {
    name: 'Name',
    email: 'Email',
    password: 'Password',
    phone: 'Phone',
    address: 'Address',
    date: 'Date',
    time: 'Time',
    status: 'Status',
  },
  messages: {
    welcome: 'Welcome to our application!',
    goodbye: 'Thank you for using our service',
    thank_you: 'Thank you',
    please_wait: 'Please wait...',
    coming_soon: 'Coming soon',
  },
}

// Example: public/locales/es/common.json
const esCommon: CommonTranslations = {
  buttons: {
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    create: 'Crear',
    submit: 'Enviar',
    back: 'Atrás',
    next: 'Siguiente',
    previous: 'Anterior',
    close: 'Cerrar',
  },
  actions: {
    loading: 'Cargando...',
    success: '¡Éxito!',
    error: 'Ocurrió un error',
    retry: 'Reintentar',
    confirm: '¿Estás seguro?',
  },
  labels: {
    name: 'Nombre',
    email: 'Correo electrónico',
    password: 'Contraseña',
    phone: 'Teléfono',
    address: 'Dirección',
    date: 'Fecha',
    time: 'Hora',
    status: 'Estado',
  },
  messages: {
    welcome: '¡Bienvenido a nuestra aplicación!',
    goodbye: 'Gracias por usar nuestro servicio',
    thank_you: 'Gracias',
    please_wait: 'Por favor espera...',
    coming_soon: 'Próximamente',
  },
}
```

### Advanced Translation Features

```typescript
interface TranslationFeatures {
  pluralization: PluralRules
  interpolation: InterpolationConfig
  context: ContextConfig
  formatting: FormattingConfig
  namespacing: NamespaceConfig
}

interface PluralRules {
  count_key: string
  plural_forms: Record<string, string>
  languages: Record<string, PluralFunction>
}

// Pluralization examples
const pluralizationExamples = {
  // English: public/locales/en/messages.json
  items: {
    zero: 'No items',
    one: '{{count}} item',
    other: '{{count}} items',
  },
  notifications: {
    zero: 'No notifications',
    one: '{{count}} notification',
    other: '{{count}} notifications',
  },

  // Spanish: public/locales/es/messages.json
  items: {
    zero: 'Sin elementos',
    one: '{{count}} elemento',
    other: '{{count}} elementos',
  },
  notifications: {
    zero: 'Sin notificaciones',
    one: '{{count}} notificación',
    other: '{{count}} notificaciones',
  },
}

// Context-based translations
const contextExamples = {
  // public/locales/en/forms.json
  validation: {
    required: 'This field is required',
    required_male: 'This field is required',
    required_female: 'This field is required',
    email: 'Please enter a valid email address',
    password: 'Password must be at least 8 characters long',
  },

  // public/locales/es/forms.json
  validation: {
    required: 'Este campo es obligatorio',
    required_male: 'Este campo es obligatorio',
    required_female: 'Esta campo es obligatoria',
    email: 'Por favor ingresa una dirección de correo válida',
    password: 'La contraseña debe tener al menos 8 caracteres',
  },
}
```

## React Component Integration

### Translation Hooks and Components

```typescript
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'

// Custom hook for enhanced translation features
interface UseI18nReturn {
  t: TFunction
  locale: string
  locales: string[]
  isLoading: boolean
  error?: Error
  changeLocale: (locale: string) => Promise<void>
  formatCurrency: (amount: number, currency?: string) => string
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (number: number, options?: Intl.NumberFormatOptions) => string
}

function useI18n(namespace: string | string[] = 'common'): UseI18nReturn {
  const { t, i18n } = useTranslation(namespace)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>()

  const changeLocale = async (locale: string): Promise<void> => {
    if (!i18n.options.supportedLngs?.includes(locale)) {
      throw new Error(`Unsupported locale: ${locale}`)
    }

    setIsLoading(true)
    setError(undefined)

    try {
      await router.push(router.pathname, router.asPath, { locale })
      await i18n.changeLanguage(locale)
    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency,
    }).format(amount)
  }

  const formatDate = (
    date: Date,
    options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
  ): string => {
    return new Intl.DateTimeFormat(i18n.language, options).format(date)
  }

  const formatNumber = (number: number, options?: Intl.NumberFormatOptions): string => {
    return new Intl.NumberFormat(i18n.language, options).format(number)
  }

  return {
    t,
    locale: i18n.language,
    locales: i18n.options.supportedLngs || [],
    isLoading,
    error,
    changeLocale,
    formatCurrency,
    formatDate,
    formatNumber,
  }
}

// Translation component examples
interface TranslatedComponentProps {
  children?: React.ReactNode
  className?: string
}

function WelcomeMessage({ className }: TranslatedComponentProps) {
  const { t, formatDate } = useI18n('common')
  const now = new Date()

  return (
    <div className={className}>
      <h1>{t('messages.welcome')}</h1>
      <p>{t('messages.today_is', { date: formatDate(now) })}</p>
    </div>
  )
}

function ItemCounter({ count }: { count: number }) {
  const { t } = useI18n('common')

  return <span>{t('items', { count })}</span>
}

// Language switcher component
interface LanguageSwitcherProps {
  showFlags?: boolean
  compact?: boolean
  className?: string
}

function LanguageSwitcher({ showFlags = true, compact = false, className }: LanguageSwitcherProps) {
  const { locale, locales, changeLocale, isLoading } = useI18n()
  const { t } = useTranslation('navigation')

  const languageNames: Record<string, string> = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    ja: '日本語',
    zh: '中文',
  }

  const languageFlags: Record<string, string> = {
    en: '🇺🇸',
    es: '🇪🇸',
    fr: '🇫🇷',
    de: '🇩🇪',
    it: '🇮🇹',
    pt: '🇵🇹',
    ja: '🇯🇵',
    zh: '🇨🇳',
  }

  if (compact) {
    return (
      <select
        value={locale}
        onChange={e => changeLocale(e.target.value)}
        disabled={isLoading}
        className={`language-switcher-select ${className || ''}`}
        aria-label={t('language_selector')}>
        {locales.map(loc => (
          <option key={loc} value={loc}>
            {showFlags && languageFlags[loc]} {languageNames[loc]}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className={`language-switcher ${className || ''}`}>
      <label className='language-switcher-label'>{t('select_language')}</label>
      <div className='language-options'>
        {locales.map(loc => (
          <button
            key={loc}
            onClick={() => changeLocale(loc)}
            disabled={isLoading}
            className={`language-option ${locale === loc ? 'active' : ''}`}
            aria-label={`${t('switch_to')} ${languageNames[loc]}`}>
            {showFlags && <span className='flag'>{languageFlags[loc]}</span>}
            <span className='name'>{languageNames[loc]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

## Server-Side i18n

### API Internationalization

```typescript
interface ApiI18nConfig {
  accept_language_header: boolean
  query_parameter: string
  cookie_name: string
  default_locale: string
  fallback_locale: string
}

// Express middleware for i18n
import { Request, Response, NextFunction } from 'express'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import middleware from 'i18next-http-middleware'

async function setupI18nMiddleware(app: Express) {
  await i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh'],
      backend: {
        loadPath: './locales/{{lng}}/{{ns}}.json',
      },
      detection: {
        order: ['querystring', 'cookie', 'header'],
        caches: ['cookie'],
        lookupQuerystring: 'lang',
        lookupCookie: 'locale',
        cookieOptions: {
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
          httpOnly: false,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
        },
      },
    })

  app.use(middleware.handle(i18next))
}

// API route with translations
interface LocalizedApiResponse<T = any> {
  data: T
  message: string
  errors?: Record<string, string>
  meta?: {
    locale: string
    timestamp: string
  }
}

function createLocalizedResponse<T>(
  req: Request,
  data: T,
  messageKey: string,
  errors?: Record<string, string>,
): LocalizedApiResponse<T> {
  return {
    data,
    message: req.t(messageKey),
    errors: errors
      ? Object.fromEntries(Object.entries(errors).map(([key, value]) => [key, req.t(value)]))
      : undefined,
    meta: {
      locale: req.language || 'en',
      timestamp: new Date().toISOString(),
    },
  }
}

// Example API endpoint
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const user = await createUser(req.body)
    const response = createLocalizedResponse(req, user, 'api.user.created_successfully')
    res.status(201).json(response)
  } catch (error) {
    const response = createLocalizedResponse(req, null, 'api.user.creation_failed', {
      general: 'api.errors.internal_server_error',
    })
    res.status(500).json(response)
  }
})
```

### Database Content Localization

```typescript
interface LocalizedContent {
  id: string
  locale: string
  title: string
  description: string
  content: string
  slug: string
  meta_title?: string
  meta_description?: string
  created_at: Date
  updated_at: Date
}

interface LocalizedEntity {
  id: string
  default_locale: string
  translations: LocalizedContent[]
  created_at: Date
  updated_at: Date
}

// Prisma schema for localized content
/*
model Article {
  id            String   @id @default(cuid())
  defaultLocale String   @default("en")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  translations ArticleTranslation[]
  
  @@map("articles")
}

model ArticleTranslation {
  id              String   @id @default(cuid())
  articleId       String
  locale          String
  title           String
  description     String?
  content         String
  slug            String
  metaTitle       String?
  metaDescription String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  article Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  
  @@unique([articleId, locale])
  @@unique([locale, slug])
  @@map("article_translations")
}
*/

// Repository for localized content
class LocalizedContentRepository {
  private prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }

  async findBySlug(slug: string, locale: string = 'en'): Promise<LocalizedEntity | null> {
    const article = await this.prisma.article.findFirst({
      where: {
        translations: {
          some: {
            slug,
            locale,
          },
        },
      },
      include: {
        translations: {
          where: { locale },
        },
      },
    })

    if (!article) return null

    return this.mapToLocalizedEntity(article)
  }

  async findAllByLocale(
    locale: string = 'en',
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<LocalizedEntity>> {
    const [articles, total] = await Promise.all([
      this.prisma.article.findMany({
        where: {
          translations: {
            some: { locale },
          },
        },
        include: {
          translations: {
            where: { locale },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.article.count({
        where: {
          translations: {
            some: { locale },
          },
        },
      }),
    ])

    return {
      items: articles.map(this.mapToLocalizedEntity),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async createWithTranslations(data: CreateLocalizedEntityData): Promise<LocalizedEntity> {
    const article = await this.prisma.article.create({
      data: {
        defaultLocale: data.defaultLocale,
        translations: {
          create: data.translations.map(translation => ({
            locale: translation.locale,
            title: translation.title,
            description: translation.description,
            content: translation.content,
            slug: translation.slug,
            metaTitle: translation.metaTitle,
            metaDescription: translation.metaDescription,
          })),
        },
      },
      include: {
        translations: true,
      },
    })

    return this.mapToLocalizedEntity(article)
  }

  private mapToLocalizedEntity(article: any): LocalizedEntity {
    return {
      id: article.id,
      default_locale: article.defaultLocale,
      translations: article.translations,
      created_at: article.createdAt,
      updated_at: article.updatedAt,
    }
  }
}
```

## Locale-Aware Formatting

### Intl API Integration

```typescript
interface FormattingService {
  formatCurrency: (amount: number, currency: string, locale: string) => string
  formatDate: (date: Date, locale: string, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (number: number, locale: string, options?: Intl.NumberFormatOptions) => string
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, locale: string) => string
  formatList: (items: string[], locale: string, options?: Intl.ListFormatOptions) => string
}

class IntlFormattingService implements FormattingService {
  private formatters: Map<string, any> = new Map()

  formatCurrency(amount: number, currency: string, locale: string): string {
    const key = `currency-${locale}-${currency}`
    if (!this.formatters.has(key)) {
      this.formatters.set(
        key,
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
        }),
      )
    }
    return this.formatters.get(key).format(amount)
  }

  formatDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
    const key = `date-${locale}-${JSON.stringify(options)}`
    if (!this.formatters.has(key)) {
      this.formatters.set(key, new Intl.DateTimeFormat(locale, options))
    }
    return this.formatters.get(key).format(date)
  }

  formatNumber(number: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
    const key = `number-${locale}-${JSON.stringify(options)}`
    if (!this.formatters.has(key)) {
      this.formatters.set(key, new Intl.NumberFormat(locale, options))
    }
    return this.formatters.get(key).format(number)
  }

  formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string): string {
    const key = `relative-${locale}`
    if (!this.formatters.has(key)) {
      this.formatters.set(
        key,
        new Intl.RelativeTimeFormat(locale, {
          numeric: 'auto',
        }),
      )
    }
    return this.formatters.get(key).format(value, unit)
  }

  formatList(
    items: string[],
    locale: string,
    options: Intl.ListFormatOptions = { style: 'long', type: 'conjunction' },
  ): string {
    const key = `list-${locale}-${JSON.stringify(options)}`
    if (!this.formatters.has(key)) {
      this.formatters.set(key, new Intl.ListFormat(locale, options))
    }
    return this.formatters.get(key).format(items)
  }
}

// React hook for formatting
function useFormatting() {
  const { locale } = useI18n()
  const formattingService = useMemo(() => new IntlFormattingService(), [])

  return {
    formatCurrency: (amount: number, currency: string = 'USD') =>
      formattingService.formatCurrency(amount, currency, locale),

    formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) =>
      formattingService.formatDate(date, locale, options),

    formatNumber: (number: number, options?: Intl.NumberFormatOptions) =>
      formattingService.formatNumber(number, locale, options),

    formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      formattingService.formatRelativeTime(value, unit, locale),

    formatList: (items: string[], options?: Intl.ListFormatOptions) =>
      formattingService.formatList(items, locale, options),
  }
}
```

## Testing i18n

### Translation Testing Strategies

```typescript
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from 'i18next'

// Test utility for i18n
function createTestI18n(resources: Record<string, any>) {
  const testI18n = i18n.createInstance()
  testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false,
    },
  })
  return testI18n
}

function renderWithI18n(
  component: React.ReactElement,
  resources: Record<string, any> = {},
  locale: string = 'en',
) {
  const testI18n = createTestI18n({
    [locale]: resources,
  })

  return render(<I18nextProvider i18n={testI18n}>{component}</I18nextProvider>)
}

// Example tests
describe('WelcomeMessage Component', () => {
  const mockTranslations = {
    common: {
      messages: {
        welcome: 'Welcome to our application!',
      },
    },
  }

  it('renders welcome message in English', () => {
    renderWithI18n(<WelcomeMessage />, mockTranslations, 'en')

    expect(screen.getByText('Welcome to our application!')).toBeInTheDocument()
  })

  it('renders welcome message in Spanish', () => {
    const spanishTranslations = {
      common: {
        messages: {
          welcome: '¡Bienvenido a nuestra aplicación!',
        },
      },
    }

    renderWithI18n(<WelcomeMessage />, spanishTranslations, 'es')

    expect(screen.getByText('¡Bienvenido a nuestra aplicación!')).toBeInTheDocument()
  })
})

// Translation completeness test
describe('Translation Completeness', () => {
  const supportedLocales = ['en', 'es', 'fr', 'de']
  const namespaces = ['common', 'navigation', 'forms', 'errors']

  supportedLocales.forEach(locale => {
    describe(`${locale} translations`, () => {
      namespaces.forEach(namespace => {
        it(`should have complete ${namespace} translations`, async () => {
          const translations = await import(`../public/locales/${locale}/${namespace}.json`)
          const englishTranslations = await import(`../public/locales/en/${namespace}.json`)

          expect(translations).toBeDefined()
          expect(Object.keys(translations)).toEqual(Object.keys(englishTranslations))
        })
      })
    })
  })
})
```

## Performance Optimization

### Translation Loading Optimization

```typescript
interface TranslationCache {
  namespace: string
  locale: string
  translations: Record<string, any>
  timestamp: number
  ttl: number
}

class TranslationCacheManager {
  private cache: Map<string, TranslationCache> = new Map()
  private defaultTTL: number = 1000 * 60 * 60 // 1 hour

  async loadTranslations(namespace: string, locale: string): Promise<Record<string, any>> {
    const cacheKey = `${namespace}-${locale}`
    const cached = this.cache.get(cacheKey)

    if (cached && !this.isExpired(cached)) {
      return cached.translations
    }

    try {
      const translations = await this.fetchTranslations(namespace, locale)
      this.cache.set(cacheKey, {
        namespace,
        locale,
        translations,
        timestamp: Date.now(),
        ttl: this.defaultTTL,
      })
      return translations
    } catch (error) {
      console.error(`Failed to load translations for ${namespace}:${locale}`, error)
      return {}
    }
  }

  private async fetchTranslations(namespace: string, locale: string): Promise<Record<string, any>> {
    const response = await fetch(`/api/translations/${locale}/${namespace}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.json()
  }

  private isExpired(cached: TranslationCache): boolean {
    return Date.now() - cached.timestamp > cached.ttl
  }

  clearCache(namespace?: string, locale?: string): void {
    if (namespace && locale) {
      this.cache.delete(`${namespace}-${locale}`)
    } else if (namespace) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${namespace}-`)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }
}
```

## Related Concepts

- **UX/UI Guidelines**: User interface design for international audiences
- **Performance Patterns**: Optimization strategies for i18n applications
- **External Services**: Third-party translation and localization services
- **Testing Strategy**: Testing approaches for multilingual applications
- **Quality Standards**: Code quality standards for internationalized code

## Tools and Libraries

- **next-i18next**: Next.js integration for React i18n
- **react-i18next**: React integration for i18next
- **i18next**: Core internationalization framework
- **Intl API**: Native browser internationalization support
- **Crowdin/Lokalise**: Translation management platforms
