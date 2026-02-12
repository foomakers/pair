# Accessibility Code Examples and Patterns

## 🎯 **PURPOSE**

Comprehensive collection of accessibility code examples and patterns for React, TypeScript, and modern web development, demonstrating practical implementation of WCAG guidelines through reusable components and development patterns.

## ♿ **SEMANTIC HTML PATTERNS**

### **Form Accessibility Patterns**

Accessible forms require proper labeling, validation feedback, and logical organization to support all users including those using assistive technologies.

#### Essential Form Elements

Every form input must have an associated label that clearly describes its purpose. Labels should be programmatically associated with inputs using the `for` attribute or by wrapping the input element.

#### Error Handling and Validation

Form validation errors must be clearly communicated to all users. Error messages should be programmatically associated with the relevant form fields and announced by screen readers.

#### Fieldset and Legend Usage

Related form controls should be grouped using fieldset elements with descriptive legend elements that provide context for the grouped controls.

```typescript
// Accessible form component example
interface FormFieldProps {
  id: string
  label: string
  error?: string
  required?: boolean
  type?: string
}

export const AccessibleFormField: React.FC<FormFieldProps> = ({
  id,
  label,
  error,
  required,
  type = 'text',
}) => {
  return (
    <div className='form-field'>
      <label htmlFor={id} className='form-label'>
        {label}
        {required && <span aria-label='required'>*</span>}
      </label>
      <input
        id={id}
        type={type}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className='form-input'
      />
      {error && (
        <div id={`${id}-error`} role='alert' className='form-error'>
          {error}
        </div>
      )}
    </div>
  )
}
```

### **Navigation Patterns**

Accessible navigation provides clear structure and multiple ways for users to orient themselves and move through content efficiently.

#### Skip Links Implementation

Skip links allow keyboard users to bypass repetitive navigation and jump directly to main content. These links should be the first focusable elements on each page.

#### Breadcrumb Navigation

Breadcrumb navigation helps users understand their current location within a website hierarchy. Proper implementation includes aria-label attributes and current page indication.

#### Menu and Dropdown Patterns

Complex navigation menus require careful implementation of ARIA attributes and keyboard navigation support to ensure accessibility across all interaction methods.

## 🧩 **COMPONENT ACCESSIBILITY PATTERNS**

### **Modal and Dialog Patterns**

Accessible modals maintain focus management, provide proper labeling, and support keyboard navigation while preventing background interaction during modal display.

#### Focus Management

When modals open, focus should move to the first focusable element within the modal. When closed, focus should return to the element that triggered the modal opening.

#### Escape Key Handling

All modals should close when the Escape key is pressed, providing users with a consistent method for dismissing modal content.

#### Background Interaction Prevention

While modals are open, interaction with background content should be prevented using techniques like focus trapping and aria-hidden attributes.

### **Data Table Patterns**

Complex data tables require proper heading structure, scope definitions, and caption information to ensure screen reader users can understand table relationships and navigate efficiently.

#### Table Headers and Scope

Table headers must clearly identify the data they describe using scope attributes that define whether headers apply to rows, columns, or groups of cells.

#### Sortable Table Implementation

When tables support sorting, the current sort state must be communicated to assistive technologies through aria-sort attributes and visual indicators.

#### Table Caption and Summary

Tables should include captions that describe the table purpose and, when necessary, summary information that explains complex table structures.

## 🔧 **INTERACTIVE ELEMENT PATTERNS**

### **Button and Link Patterns**

Clear distinction between buttons and links ensures users understand the expected behavior when interacting with these elements.

#### Button vs Link Usage

Buttons should be used for actions that change application state or trigger functionality. Links should be used for navigation to different pages or content sections.

#### Icon Button Accessibility

Icon buttons require accessible names through aria-label attributes or visually hidden text to ensure their purpose is clear to all users.

#### Loading and Disabled States

When buttons enter loading or disabled states, these changes must be communicated to assistive technologies using appropriate ARIA attributes.

### **Custom Control Patterns**

Custom interactive controls require careful implementation of ARIA roles, properties, and keyboard navigation to match the behavior of native HTML elements.

#### Dropdown and Combobox Patterns

Custom dropdown controls must implement proper ARIA attributes including roles, expanded states, and selected option communication.

#### Toggle and Switch Patterns

Custom toggle controls require clear labeling and state communication through aria-pressed or aria-checked attributes depending on their semantic meaning.

#### Slider and Range Controls

Custom slider implementations must provide keyboard navigation, value communication, and proper labeling for screen reader users.

## 📱 **RESPONSIVE ACCESSIBILITY PATTERNS**

### **Mobile Touch Patterns**

Accessible mobile interfaces require adequate touch target sizes, clear visual feedback, and support for various interaction methods including voice control.

#### Touch Target Sizing

All interactive elements must meet minimum size requirements (44x44 pixels) to ensure they can be easily activated by users with motor impairments.

#### Gesture Alternative Patterns

Custom gestures must have alternative interaction methods available for users who cannot perform complex touch gestures.

#### Orientation Support

Applications should support both portrait and landscape orientations unless a specific orientation is essential for functionality.

### **Focus Management Patterns**

Proper focus management ensures keyboard and screen reader users can navigate efficiently through responsive layouts across all device sizes.

#### Focus Visible Indicators

All focusable elements must have clear visual focus indicators that remain visible across different viewport sizes and color schemes.

#### Focus Order Management

Focus order should follow logical content flow even when visual layout changes in response to different screen sizes.

#### Off-Screen Content Handling

Content that moves off-screen in responsive layouts must be properly hidden from assistive technologies when not visible.

## 🎨 **STYLING AND VISUAL PATTERNS**

### **Color and Contrast Patterns**

Accessible color usage ensures information remains perceivable for users with color vision differences and maintains sufficient contrast ratios.

#### Color-Independent Information

Information conveyed through color must also be available through other visual means such as text, icons, or patterns.

#### Contrast Ratio Compliance

All text and interactive elements must meet WCAG contrast ratio requirements with consideration for different text sizes and font weights.

#### High Contrast Mode Support

Applications should remain functional and usable when users enable high contrast mode or other accessibility display preferences.

### **Typography and Layout Patterns**

Accessible typography supports readability for users with various visual and cognitive needs through proper sizing, spacing, and content organization.

#### Text Scaling Support

Content must remain usable and readable when users zoom text up to 200% without horizontal scrolling.

#### Content Reflow Patterns

Content should reflow appropriately when viewport dimensions change or when users adjust text size preferences.

#### White Space and Spacing

Adequate spacing between interactive elements and content sections improves usability for users with motor impairments and cognitive differences.

## 🔄 **ANIMATION AND MOTION PATTERNS**

### **Reduced Motion Support**

Accessibility requires respecting user preferences for reduced motion while maintaining essential functionality and user feedback.

#### Prefers-Reduced-Motion Implementation

Applications should detect and respond to the prefers-reduced-motion media query to provide appropriate alternatives for users sensitive to animation.

#### Essential vs Decorative Animation

Essential animations that convey important information should have alternative methods for communicating the same information when motion is reduced.

#### Animation Control Patterns

Users should have control over auto-playing animations through pause, stop, or hide mechanisms.

---

_Implementing these accessibility patterns ensures inclusive user experiences while maintaining modern development practices and performance standards._
