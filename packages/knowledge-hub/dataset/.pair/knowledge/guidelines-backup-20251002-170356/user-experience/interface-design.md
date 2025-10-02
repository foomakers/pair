# Interface Design Practice (Level 2)

UI design patterns, layout principles, visual standards, and interaction design for intuitive and effective user interfaces.

## Purpose

Define interface design standards and patterns that ensure intuitive user interactions, consistent visual hierarchy, and effective responsive design across all digital platforms.

## Scope

**In Scope:**

- Interface design patterns and conventions
- Layout systems and responsive design
- Typography and visual hierarchy
- Interaction design and micro-interactions
- Visual design standards and guidelines

**Out of Scope:**

- Design system architecture (see [Design Systems](design-systems.md))
- User research and validation (see [User Research](user-research.md))
- Content strategy and writing (see [Content Strategy](content-strategy.md))
- Technical implementation (see [Code Design](../code-design/README.md))

## Topics Covered

### Interface Design Patterns

Common UI patterns and design conventions

- Navigation patterns and information architecture
- Form design and data input patterns
- Data display and visualization patterns
- Feedback and notification patterns

### Layout Systems

Grid systems, spacing, and responsive design

- Grid systems and layout principles
- Responsive design and breakpoint management
- Spacing systems and visual rhythm
- Container and content organization

### Typography and Visual Hierarchy

Typography implementation and information hierarchy

- Typography scales and hierarchy
- Text formatting and content structure
- Visual hierarchy and information design
- Readability and accessibility considerations

### Interaction Design

Interaction patterns and micro-interactions

- Interactive states and transitions
- Micro-interactions and feedback
- Gesture design and touch interactions
- Animation principles and implementation

## 🛠️ Level 3: Tool-Specific Implementations

### CSS Frameworks

- **[Tailwind CSS](../tailwind/)** - Utility-first CSS framework
- **[Styled Components](../styled-components/)** - CSS-in-JS styling

### UI Libraries

- **[React](../react/)** - React component patterns
- **[Vue](../vue/)** - Vue.js interface implementation

## 🎨 Interface Design Patterns

### Navigation Patterns

**Primary Navigation**:

- Top navigation for main sections
- Sidebar navigation for complex applications
- Tab navigation for related content
- Breadcrumb navigation for hierarchical content

**Navigation Implementation**:

```jsx
// Responsive navigation pattern
<Navigation>
  <Navigation.Brand>
    <Logo />
  </Navigation.Brand>

  <Navigation.Menu>
    <Navigation.Item href='/dashboard'>Dashboard</Navigation.Item>
    <Navigation.Item href='/projects'>Projects</Navigation.Item>
    <Navigation.Item href='/settings'>Settings</Navigation.Item>
  </Navigation.Menu>

  <Navigation.Actions>
    <Button variant='outline'>Sign In</Button>
    <Button variant='primary'>Sign Up</Button>
  </Navigation.Actions>

  <Navigation.Mobile>
    <MobileMenuButton />
  </Navigation.Mobile>
</Navigation>
```

### Form Design Patterns

**Form Layout Standards**:

```jsx
// Comprehensive form pattern
<Form onSubmit={handleSubmit}>
  <Form.Section title='Personal Information'>
    <Form.Row>
      <Form.Field span={6}>
        <Form.Label required>First Name</Form.Label>
        <Form.Input name='firstName' placeholder='Enter your first name' required />
        <Form.Help>This will be displayed on your profile</Form.Help>
      </Form.Field>

      <Form.Field span={6}>
        <Form.Label required>Last Name</Form.Label>
        <Form.Input name='lastName' placeholder='Enter your last name' required />
      </Form.Field>
    </Form.Row>

    <Form.Field>
      <Form.Label required>Email</Form.Label>
      <Form.Input type='email' name='email' placeholder='Enter your email address' required />
      <Form.Error name='email' />
    </Form.Field>
  </Form.Section>

  <Form.Actions>
    <Button variant='outline' type='button'>
      Cancel
    </Button>
    <Button variant='primary' type='submit' isLoading={isSubmitting}>
      Save Changes
    </Button>
  </Form.Actions>
</Form>
```

### Data Display Patterns

**Table Design**:

```jsx
// Responsive data table pattern
<DataTable
  data={users}
  pagination={{ pageSize: 10, showSizeChanger: true }}
  sorting={{ defaultSort: 'name', direction: 'asc' }}
  filtering={{ searchable: true, filters: ['status', 'role'] }}>
  <DataTable.Column
    key='name'
    title='Name'
    sortable
    render={user => (
      <div className='flex items-center space-x-3'>
        <Avatar src={user.avatar} name={user.name} />
        <div>
          <div className='font-medium'>{user.name}</div>
          <div className='text-sm text-muted'>{user.email}</div>
        </div>
      </div>
    )}
  />

  <DataTable.Column
    key='status'
    title='Status'
    render={user => (
      <Badge variant={user.status === 'active' ? 'success' : 'secondary'}>{user.status}</Badge>
    )}
  />

  <DataTable.Column
    key='actions'
    title='Actions'
    render={user => (
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button variant='ghost' size='sm'>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={() => editUser(user.id)}>Edit</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => deleteUser(user.id)}>Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    )}
  />
</DataTable>
```

## 📐 Layout Systems

### Grid System Implementation

**CSS Grid Layout**:

```css
/* Modern CSS Grid system */
.grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(12, 1fr);
}

.grid-cols-1 {
  grid-template-columns: repeat(1, 1fr);
}
.grid-cols-2 {
  grid-template-columns: repeat(2, 1fr);
}
.grid-cols-3 {
  grid-template-columns: repeat(3, 1fr);
}
.grid-cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

.col-span-1 {
  grid-column: span 1;
}
.col-span-2 {
  grid-column: span 2;
}
.col-span-3 {
  grid-column: span 3;
}
.col-span-6 {
  grid-column: span 6;
}
.col-span-12 {
  grid-column: span 12;
}

/* Responsive grid utilities */
@media (min-width: 768px) {
  .md\:grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .md\:grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .md\:col-span-6 {
    grid-column: span 6;
  }
}
```

### Responsive Design Patterns

**Breakpoint System**:

```css
/* Responsive breakpoints */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Container system */
.container {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: var(--space-4);
  padding-right: var(--space-4);
}

@media (min-width: 640px) {
  .container {
    max-width: 640px;
  }
}

@media (min-width: 768px) {
  .container {
    max-width: 768px;
  }
}

@media (min-width: 1024px) {
  .container {
    max-width: 1024px;
  }
}
```

## 📝 Typography and Visual Hierarchy

### Typography Implementation

**Heading Hierarchy**:

```css
/* Typography system */
.text-display {
  font-size: var(--text-5xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-tight);
  letter-spacing: -0.025em;
}

.text-heading-1 {
  font-size: var(--text-4xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-tight);
}

.text-heading-2 {
  font-size: var(--text-3xl);
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
}

.text-heading-3 {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  line-height: var(--leading-normal);
}

.text-body {
  font-size: var(--text-base);
  font-weight: var(--font-normal);
  line-height: var(--leading-relaxed);
}

.text-caption {
  font-size: var(--text-sm);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
  color: var(--color-text-secondary);
}
```

### Information Hierarchy

**Visual Hierarchy Patterns**:

```jsx
// Page structure with clear hierarchy
<Page>
  <Page.Header>
    <Breadcrumb>
      <Breadcrumb.Item href='/dashboard'>Dashboard</Breadcrumb.Item>
      <Breadcrumb.Item href='/projects'>Projects</Breadcrumb.Item>
      <Breadcrumb.Item>Project Details</Breadcrumb.Item>
    </Breadcrumb>

    <div className='flex items-center justify-between'>
      <div>
        <h1 className='text-heading-1'>Project Name</h1>
        <p className='text-body text-muted'>Last updated 2 hours ago by John Doe</p>
      </div>

      <div className='flex space-x-3'>
        <Button variant='outline'>Share</Button>
        <Button variant='primary'>Edit Project</Button>
      </div>
    </div>
  </Page.Header>

  <Page.Content>
    <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
      <div className='lg:col-span-2'>
        <Card>
          <Card.Header>
            <h2 className='text-heading-3'>Project Overview</h2>
          </Card.Header>
          <Card.Content>{/* Main content */}</Card.Content>
        </Card>
      </div>

      <div>
        <Card>
          <Card.Header>
            <h3 className='text-heading-3'>Project Details</h3>
          </Card.Header>
          <Card.Content>{/* Sidebar content */}</Card.Content>
        </Card>
      </div>
    </div>
  </Page.Content>
</Page>
```

## ⚡ Interaction Design

### Interactive States

**Component State Management**:

```css
/* Interactive state system */
.interactive {
  transition: all 0.2s ease-in-out;
  cursor: pointer;
}

.interactive:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.interactive:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

.interactive:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.interactive:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

### Micro-interactions

**Animation Principles**:

```css
/* Animation system */
:root {
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  --easing-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --easing-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --easing-ease-out: cubic-bezier(0, 0, 0.2, 1);
  --easing-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Loading animations */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}
.animate-fadeIn {
  animation: fadeIn var(--duration-normal) var(--easing-ease);
}
```

## 🔗 Related Practices

- **[Design Systems](design-systems.md)** - Component libraries and design tokens
- **[User Research](user-research.md)** - Interface testing and validation
- **[Content Strategy](content-strategy.md)** - Content integration and information architecture
- **[Quality/Accessibility](../quality/accessibility.md)** - Accessible interface design

---

_Focus on intuitive interface patterns, responsive design systems, and effective visual communication._
