# POUR Principles Implementation

## 🎯 **PURPOSE**

Comprehensive implementation guide for the four fundamental principles of web accessibility: Perceivable, Operable, Understandable, and Robust (POUR), providing practical strategies and code examples for creating truly accessible web experiences.

## 🔧 **PERCEIVABLE: INFORMATION MUST BE PRESENTABLE**

### **Alternative Text for Images**

**Informative Images**

```html
<!-- Descriptive alt text for meaningful images -->
<img src="chart.png" alt="Sales increased 40% from Q1 to Q2 2024, reaching $2.3M" />

<!-- Decorative images should be marked as such -->
<img src="decoration.png" alt="" role="presentation" />

<!-- Complex images need extended descriptions -->
<img src="complex-chart.png" alt="Quarterly sales data" aria-describedby="chart-description" />
<div id="chart-description">
  Detailed breakdown: Q1: $1.6M, Q2: $2.3M, Q3: $2.1M, Q4: $2.8M. Notable trend shows 40% growth
  from Q1 to Q2, slight decline in Q3, followed by strong 33% recovery in Q4.
</div>
```

**Functional Images**

```html
<!-- Button images need action descriptions -->
<button type="submit">
  <img src="search-icon.svg" alt="Search" />
</button>

<!-- Linked images describe the destination -->
<a href="/download/report.pdf">
  <img src="pdf-icon.png" alt="Download quarterly report (PDF, 2.3MB)" />
</a>
```

### **Captions and Transcripts**

**Video Content Accessibility**

```html
<video controls>
  <source src="presentation.mp4" type="video/mp4" />
  <track kind="captions" src="presentation-captions.vtt" srclang="en" label="English" />
  <track
    kind="descriptions"
    src="presentation-descriptions.vtt"
    srclang="en"
    label="English Descriptions" />
</video>
```

**WebVTT Caption Format**

```
WEBVTT

00:00:00.000 --> 00:00:05.000
Welcome to our quarterly business review presentation.

00:00:05.000 --> 00:00:12.000
Today we'll be covering our financial performance and strategic initiatives.

NOTE
This is a speaker note for additional context that won't be displayed.
```

**Audio Transcription**

```html
<audio controls>
  <source src="podcast.mp3" type="audio/mpeg" />
</audio>

<details>
  <summary>Full Transcript</summary>
  <div class="transcript">
    <h3>Podcast Episode: Web Accessibility Best Practices</h3>
    <p><strong>Host:</strong> Welcome to our accessibility podcast...</p>
    <p><strong>Guest:</strong> Thanks for having me. Today I'd like to discuss...</p>
  </div>
</details>
```

### **Color and Contrast**

**Color Contrast Implementation**

```css
/* WCAG AA compliant color combinations */
.text-primary {
  color: #212529; /* 4.5:1 contrast on white background */
  background-color: #ffffff;
}

.text-secondary {
  color: #495057; /* 4.5:1 contrast on light backgrounds */
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .text-primary {
    color: #000000;
    background-color: #ffffff;
  }
}

/* Color blindness considerations */
.status-success {
  color: #28a745;
  background-image: url('checkmark-icon.svg'); /* Don't rely on color alone */
}

.status-error {
  color: #dc3545;
  background-image: url('error-icon.svg');
}
```

**Color Usage Guidelines**

```html
<!-- Bad: Using only color to convey information -->
<span style="color: red;">Error: Invalid input</span>

<!-- Good: Using color plus text/icons -->
<span class="error-message">
  <span class="error-icon" aria-hidden="true">⚠️</span>
  Error: Invalid input
</span>

<!-- Form validation with multiple indicators -->
<input type="email" aria-invalid="true" aria-describedby="email-error" />
<div id="email-error" class="error-message">
  <span class="error-icon" aria-hidden="true">⚠️</span>
  Please enter a valid email address
</div>
```

## 🖱️ **OPERABLE: INTERFACE COMPONENTS MUST BE OPERABLE**

### **Keyboard Navigation**

**Focus Management**

```typescript
class FocusManager {
  private focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')

  getFocusableElements(container: Element): HTMLElement[] {
    return Array.from(container.querySelectorAll(this.focusableSelectors))
  }

  trapFocus(container: Element): void {
    const focusableElements = this.getFocusableElements(container)
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    container.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement.focus()
          }
        }
      }
    })
  }
}
```

**Skip Links Implementation**

```html
<!-- Skip links should be the first focusable elements -->
<div class="skip-links">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <a href="#nav-menu" class="skip-link">Skip to navigation</a>
  <a href="#search" class="skip-link">Skip to search</a>
</div>

<header>
  <nav id="nav-menu" aria-label="Main navigation">
    <!-- Navigation content -->
  </nav>
</header>

<main id="main-content">
  <!-- Main content -->
</main>
```

**Skip Link Styling**

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: #000;
  color: #fff;
  padding: 8px;
  text-decoration: none;
  z-index: 100;
  transition: top 0.3s;
}

.skip-link:focus {
  top: 6px;
}
```

### **Timing and Motion**

**Pause/Stop Controls**

```html
<!-- Auto-playing content with controls -->
<div class="carousel" role="region" aria-label="Featured products">
  <div class="carousel-controls">
    <button type="button" id="pause-btn" aria-label="Pause slideshow">
      <span id="pause-text">Pause</span>
    </button>
    <button type="button" id="prev-btn" aria-label="Previous slide">Previous</button>
    <button type="button" id="next-btn" aria-label="Next slide">Next</button>
  </div>

  <div class="carousel-content" aria-live="polite">
    <!-- Carousel slides -->
  </div>
</div>
```

**Motion Preferences**

```css
/* Respect user motion preferences */
@media (prefers-reduced-motion: reduce) {
  .carousel {
    animation: none;
  }

  .slide-transition {
    transition: none;
  }

  /* Provide alternative visual feedback */
  .carousel-indicator.active {
    background-color: #007bff;
    transform: scale(1.2);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .carousel {
    animation: auto-advance 5s infinite;
  }

  .slide-transition {
    transition: transform 0.5s ease-in-out;
  }
}
```

**Timeout Management**

```javascript
class TimeoutManager {
  constructor(timeoutDuration = 900000) {
    // 15 minutes default
    this.timeoutDuration = timeoutDuration
    this.warningDuration = 120000 // 2 minutes warning
    this.setupTimeout()
  }

  setupTimeout() {
    // Show warning before timeout
    setTimeout(() => {
      this.showTimeoutWarning()
    }, this.timeoutDuration - this.warningDuration)

    // Actual timeout
    setTimeout(() => {
      this.handleTimeout()
    }, this.timeoutDuration)
  }

  showTimeoutWarning() {
    const modal = document.createElement('div')
    modal.setAttribute('role', 'alertdialog')
    modal.setAttribute('aria-labelledby', 'timeout-title')
    modal.setAttribute('aria-describedby', 'timeout-message')

    modal.innerHTML = `
      <h2 id="timeout-title">Session Timeout Warning</h2>
      <p id="timeout-message">Your session will expire in 2 minutes. 
         Would you like to extend your session?</p>
      <button type="button" onclick="this.extendSession()">Extend Session</button>
      <button type="button" onclick="this.logout()">Logout Now</button>
    `

    document.body.appendChild(modal)
    modal.querySelector('button').focus()
  }
}
```

## 🧠 **UNDERSTANDABLE: INFORMATION AND UI OPERATION MUST BE UNDERSTANDABLE**

### **Language Identification**

**Page Language Declaration**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Accessible Web Application</title>
  </head>
  <body>
    <!-- Main content in English -->
    <main>
      <h1>Welcome to Our Service</h1>
      <p>This content is in English.</p>

      <!-- Foreign language content -->
      <blockquote lang="es">
        <p>Este contenido está en español.</p>
      </blockquote>

      <!-- Mixed language content -->
      <p>The French phrase <span lang="fr">"bonjour"</span> means hello in English.</p>
    </main>
  </body>
</html>
```

### **Predictable Navigation**

**Consistent Navigation Structure**

```html
<!-- Consistent navigation across all pages -->
<nav aria-label="Main navigation" class="main-nav">
  <ul>
    <li><a href="/" aria-current="page">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li><a href="/services">Services</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
</nav>
```

**Focus Indication**

```css
/* Consistent focus indicators */
a:focus,
button:focus,
input:focus,
textarea:focus,
select:focus {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
  background-color: rgba(0, 102, 204, 0.1);
}

/* Navigation specific focus */
.main-nav a:focus {
  background-color: #0066cc;
  color: white;
}
```

### **Input Assistance**

**Form Labels and Instructions**

```html
<form novalidate>
  <fieldset>
    <legend>Personal Information</legend>

    <div class="form-group">
      <label for="email">Email Address (required)</label>
      <input
        type="email"
        id="email"
        name="email"
        aria-describedby="email-help email-error"
        aria-required="true"
        aria-invalid="false" />
      <div id="email-help" class="help-text">We'll use this to send you important updates</div>
      <div id="email-error" class="error-message" aria-live="polite">
        <!-- Error messages appear here -->
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password (required)</label>
      <input
        type="password"
        id="password"
        name="password"
        aria-describedby="password-requirements"
        aria-required="true" />
      <div id="password-requirements" class="help-text">
        <p>Password must contain:</p>
        <ul>
          <li>At least 8 characters</li>
          <li>One uppercase letter</li>
          <li>One lowercase letter</li>
          <li>One number</li>
          <li>One special character</li>
        </ul>
      </div>
    </div>
  </fieldset>
</form>
```

**Error Handling**

```javascript
class FormValidator {
  validateField(field) {
    const value = field.value.trim()
    const fieldType = field.type
    const errorContainer = document.getElementById(
      field
        .getAttribute('aria-describedby')
        .split(' ')
        .find(id => id.includes('error')),
    )

    let isValid = true
    let errorMessage = ''

    // Email validation
    if (fieldType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value)) {
        isValid = false
        errorMessage = 'Please enter a valid email address (example: user@domain.com)'
      }
    }

    // Update field state
    field.setAttribute('aria-invalid', !isValid)
    errorContainer.textContent = errorMessage

    // Update visual styling
    field.classList.toggle('error', !isValid)

    return isValid
  }

  showSuccessMessage(message) {
    const successDiv = document.createElement('div')
    successDiv.setAttribute('role', 'status')
    successDiv.setAttribute('aria-live', 'polite')
    successDiv.className = 'success-message'
    successDiv.textContent = message

    document.querySelector('form').appendChild(successDiv)

    // Focus success message for screen readers
    successDiv.focus()
  }
}
```

## 🔧 **ROBUST: CONTENT MUST BE ROBUST ENOUGH FOR VARIOUS USER AGENTS**

### **Valid HTML and ARIA**

**Semantic HTML Structure**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Title</title>
  </head>
  <body>
    <header role="banner">
      <h1>Site Title</h1>
      <nav role="navigation" aria-label="Main navigation">
        <!-- Navigation content -->
      </nav>
    </header>

    <main role="main">
      <article>
        <header>
          <h2>Article Title</h2>
          <p>Published on <time datetime="2024-01-15">January 15, 2024</time></p>
        </header>
        <!-- Article content -->
      </article>
    </main>

    <aside role="complementary">
      <!-- Sidebar content -->
    </aside>

    <footer role="contentinfo">
      <!-- Footer content -->
    </footer>
  </body>
</html>
```

**ARIA Best Practices**

```html
<!-- Custom components with proper ARIA -->
<div role="tablist" aria-label="Content sections" class="tab-container">
  <button role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1" tabindex="0">
    Section 1
  </button>
  <button role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2" tabindex="-1">
    Section 2
  </button>
</div>

<div role="tabpanel" id="panel-1" aria-labelledby="tab-1" tabindex="0">Content for section 1</div>

<div role="tabpanel" id="panel-2" aria-labelledby="tab-2" tabindex="0" hidden>
  Content for section 2
</div>
```

### **Progressive Enhancement**

**Feature Detection and Fallbacks**

```javascript
class AccessibleComponent {
  constructor(element) {
    this.element = element
    this.initialize()
  }

  initialize() {
    // Check for JavaScript support
    if (!window.addEventListener) {
      this.provideBasicFunctionality()
      return
    }

    // Check for modern browser features
    if (this.supportsModernFeatures()) {
      this.enableAdvancedFeatures()
    } else {
      this.enableBasicFeatures()
    }
  }

  supportsModernFeatures() {
    return (
      'querySelector' in document &&
      'classList' in document.createElement('div') &&
      'addEventListener' in window
    )
  }

  provideBasicFunctionality() {
    // Ensure basic functionality works without JavaScript
    this.element.innerHTML = `
      <noscript>
        <p>This component requires JavaScript. 
           <a href="/accessible-alternative">View accessible alternative</a>
        </p>
      </noscript>
    `
  }
}
```

### **Assistive Technology Compatibility**

**Testing with Multiple AT**

```javascript
// Screen reader detection and optimization
class ScreenReaderOptimization {
  constructor() {
    this.detectScreenReader()
    this.optimizeForScreenReader()
  }

  detectScreenReader() {
    // Check for common screen reader indicators
    this.hasScreenReader =
      navigator.userAgent.includes('NVDA') ||
      navigator.userAgent.includes('JAWS') ||
      window.speechSynthesis ||
      'speechSynthesis' in window
  }

  optimizeForScreenReader() {
    if (this.hasScreenReader) {
      // Provide enhanced descriptions
      this.addEnhancedDescriptions()
      // Optimize live regions
      this.optimizeLiveRegions()
      // Provide keyboard shortcuts
      this.addKeyboardShortcuts()
    }
  }

  addEnhancedDescriptions() {
    document.querySelectorAll('[data-description]').forEach(element => {
      const description = element.getAttribute('data-description')
      element.setAttribute('aria-description', description)
    })
  }

  optimizeLiveRegions() {
    // Create status announcements region
    const statusRegion = document.createElement('div')
    statusRegion.setAttribute('aria-live', 'polite')
    statusRegion.setAttribute('aria-atomic', 'true')
    statusRegion.className = 'sr-only'
    statusRegion.id = 'status-announcements'
    document.body.appendChild(statusRegion)
  }
}
```

## 📊 **POUR COMPLIANCE CHECKLIST**

### **Perceivable Checklist**

- [ ] All images have appropriate alt text
- [ ] Videos have captions and transcripts
- [ ] Audio content has transcripts
- [ ] Color contrast meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- [ ] Information is not conveyed by color alone
- [ ] Text can be resized up to 200% without loss of functionality

### **Operable Checklist**

- [ ] All functionality is keyboard accessible
- [ ] No seizure-inducing content (no flashing more than 3 times per second)
- [ ] Users can pause, stop, or hide moving content
- [ ] Time limits have warnings and extension options
- [ ] Focus indicators are visible and clear
- [ ] Skip links are provided for repetitive content

### **Understandable Checklist**

- [ ] Page language is identified
- [ ] Navigation is consistent across pages
- [ ] Form labels and instructions are clear
- [ ] Error messages are descriptive and helpful
- [ ] Content is written in plain language
- [ ] Unusual words are defined or explained

### **Robust Checklist**

- [ ] HTML validates according to standards
- [ ] ARIA is used correctly
- [ ] Content works across different browsers and devices
- [ ] Progressive enhancement ensures basic functionality without JavaScript
- [ ] Assistive technology compatibility is tested
- [ ] Future-proof markup and coding practices are used

---

_The POUR principles provide the foundation for creating accessible web content that works for all users, regardless of their abilities or the assistive technologies they use._
