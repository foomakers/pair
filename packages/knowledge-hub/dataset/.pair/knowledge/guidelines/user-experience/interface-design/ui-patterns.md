# UI Patterns

## Overview

UI patterns represent reusable interface solutions that solve common design problems through established interaction models, visual structures, and behavioral frameworks. This comprehensive guide provides a systematic approach to pattern selection, implementation, and customization that ensures consistency, usability, and scalability across digital products while maintaining design system coherence.

## Navigation Patterns

### 1. Primary Navigation Systems

**Top Navigation Bar**

- **Use Cases**: Desktop applications, content-heavy websites, professional tools
- **Structure**: Horizontal menu with primary sections and optional secondary dropdowns
- **Behavior**: Fixed or sticky positioning with highlight states for active sections
- **Responsive Strategy**: Collapses to hamburger menu on mobile devices
- **Accessibility**: Full keyboard navigation with ARIA landmarks and skip links

**Side Navigation Panel**

- **Use Cases**: Dashboard interfaces, administrative tools, complex applications
- **Structure**: Vertical menu with hierarchical organization and expandable sections
- **Behavior**: Collapsible panel with icons-only compact mode
- **Content Strategy**: Grouped navigation items with clear visual hierarchy
- **Performance**: Lazy loading for nested navigation items

**Tab Navigation**

- **Use Cases**: Settings panels, multi-step processes, content categorization
- **Structure**: Horizontal or vertical tab arrangement with panel content areas
- **Behavior**: Single-select interaction with smooth transitions between panels
- **State Management**: Active, inactive, disabled, and loading states
- **Mobile Adaptation**: Swipeable tab panels with scroll indicators

### 2. Secondary Navigation Patterns

**Breadcrumb Navigation**

- **Purpose**: Hierarchical location awareness and quick backtracking
- **Structure**: Home > Category > Subcategory > Current Page pathway
- **Interaction**: Clickable ancestors with separator styling
- **Truncation Strategy**: Middle truncation for long paths on mobile
- **Schema Markup**: Structured data for search engine understanding

**Pagination Controls**

- **Linear Pagination**: Previous/Next with numbered page links
- **Infinite Scroll**: Progressive content loading with performance optimization
- **Load More**: Manual trigger for additional content batches
- **Virtual Scrolling**: Efficient handling of large datasets
- **Jump Navigation**: Quick access to specific page ranges

**Filter and Sort Controls**

- **Filter Panels**: Collapsible sidebar with multiple filter categories
- **Sort Dropdowns**: Quick sorting options with clear current selection
- **Search Integration**: Combined search and filter functionality
- **Active Filter Display**: Removable filter tags with clear all option
- **Result Feedback**: Live count updates and empty state handling

## Content Display Patterns

### 1. List and Grid Layouts

**Card-Based Layouts**

- **Information Architecture**: Title, description, metadata, and action areas
- **Visual Hierarchy**: Clear content prioritization through typography and spacing
- **Interaction States**: Hover, focus, selected, and loading states
- **Responsive Behavior**: Grid reflow from multi-column to single-column
- **Content Strategy**: Consistent card heights with overflow handling

**Data Table Patterns**

- **Column Management**: Sortable headers with sort direction indicators
- **Row Selection**: Individual and bulk selection with clear feedback
- **Responsive Strategy**: Horizontal scroll, stacked layout, or priority columns
- **Action Integration**: Row-level and bulk actions with confirmation patterns
- **Performance**: Virtual scrolling for large datasets with progressive loading

**Timeline Displays**

- **Chronological Organization**: Events arranged by date with clear time markers
- **Content Density**: Expandable detail levels for complex timeline items
- **Navigation**: Jump-to-date functionality and smooth scrolling
- **Interactive Elements**: Clickable events with detail modals or inline expansion
- **Responsive Adaptation**: Vertical timeline with adjusted spacing for mobile

### 2. Media and Rich Content

**Image Gallery Patterns**

- **Grid Layouts**: Masonry, uniform grid, or justified arrangements
- **Lightbox Modals**: Full-screen viewing with navigation controls
- **Thumbnail Generation**: Progressive loading with placeholder images
- **Zoom and Pan**: Touch-friendly image exploration on mobile
- **Metadata Display**: Caption, tags, and sharing options

**Video Player Integration**

- **Custom Controls**: Branded player interface with standard functionality
- **Responsive Sizing**: Aspect ratio preservation across screen sizes
- **Performance**: Progressive streaming with bandwidth adaptation
- **Accessibility**: Captions, transcripts, and keyboard controls
- **Playlist Management**: Sequential playback with queue visualization

**Document Viewers**

- **PDF Integration**: In-browser viewing with zoom and navigation controls
- **Document Thumbnails**: Preview generation for quick document identification
- **Search Functionality**: Text search within documents with result highlighting
- **Download Options**: Original and converted format download links
- **Collaboration**: Comment and annotation capabilities

## Form and Input Patterns

### 1. Form Layout Strategies

**Single-Column Forms**

- **Mobile Optimization**: Vertical flow optimized for small screens
- **Cognitive Load**: Reduced complexity through linear progression
- **Field Grouping**: Related fields organized in logical sections
- **Progress Indication**: Step counters and completion percentage
- **Validation Strategy**: Inline validation with clear error messaging

**Multi-Column Forms**

- **Desktop Utilization**: Efficient use of horizontal space
- **Related Field Grouping**: Logical associations between adjacent fields
- **Responsive Collapse**: Single-column reflow on smaller screens
- **Tab Order**: Logical keyboard navigation flow
- **Visual Balance**: Consistent field heights and alignment

**Wizard and Multi-Step Forms**

- **Step Progression**: Clear current step indication with previous/next navigation
- **Data Persistence**: Save progress with ability to return to incomplete forms
- **Validation Timing**: Step-level validation before progression
- **Summary Review**: Final confirmation step with edit capabilities
- **Error Handling**: Step navigation to error locations with clear messaging

### 2. Input Component Patterns

**Text Input Variations**

- **Basic Text Fields**: Standard input with label, placeholder, and help text
- **Search Inputs**: Magnifying glass icon with autocomplete suggestions
- **Textarea Fields**: Expandable height with character count and formatting options
- **Rich Text Editors**: WYSIWYG editing with toolbar and formatting preservation
- **Code Editors**: Syntax highlighting with line numbers and error indication

**Selection Controls**

- **Dropdown Menus**: Single and multi-select with search functionality
- **Radio Button Groups**: Mutually exclusive options with clear grouping
- **Checkbox Lists**: Multiple selection with select all/none options
- **Toggle Switches**: Binary state controls with clear on/off indication
- **Slider Controls**: Range selection with value display and step indicators

**Date and Time Inputs**

- **Calendar Pickers**: Monthly view with date range selection
- **Time Selectors**: 12/24 hour format with AM/PM indicators
- **Date Range Pickers**: Start and end date selection with preset ranges
- **Timezone Handling**: Automatic detection with manual override options
- **Localization**: Regional date and time format adaptation

## Feedback and Notification Patterns

### 1. User Feedback Systems

**Toast Notifications**

- **Positioning Strategy**: Top-right corner with stack management
- **Duration Control**: Auto-dismiss timing based on message complexity
- **Interaction Options**: Dismiss button and action links
- **Priority Levels**: Success, warning, error, and info styling
- **Accessibility**: Screen reader announcements with appropriate ARIA roles

**Modal Dialogs**

- **Purpose Classification**: Confirmation, information, form, and media modals
- **Focus Management**: Trap focus within modal with return to trigger element
- **Backdrop Interaction**: Click-outside-to-close with escape key support
- **Size Adaptation**: Responsive sizing with maximum width constraints
- **Animation**: Smooth entrance and exit transitions

**Inline Messaging**

- **Contextual Placement**: Messages positioned near relevant interface elements
- **Validation Feedback**: Real-time form validation with clear error descriptions
- **Help Text**: Progressive disclosure of additional information
- **Status Updates**: Live regions for dynamic content changes
- **Dismissal Options**: Manual or automatic message removal

### 2. Loading and Progress Patterns

**Loading States**

- **Skeleton Screens**: Content placeholder that mimics final layout structure
- **Spinner Indicators**: Indeterminate progress for unknown duration tasks
- **Progress Bars**: Determinate progress with percentage or step completion
- **Lazy Loading**: Progressive content appearance with smooth transitions
- **Error States**: Graceful failure handling with retry options

**Empty States**

- **First Use**: Onboarding guidance for new users with clear next steps
- **No Results**: Search and filter empty states with suggestion alternatives
- **Error Recovery**: Helpful error messages with resolution guidance
- **Maintenance**: System unavailability messaging with expected resolution time
- **Feature Introduction**: Promotional content for unused features

## Interactive Component Patterns

### 1. Action-Oriented Components

**Button Hierarchies**

- **Primary Actions**: High-contrast buttons for main user actions
- **Secondary Actions**: Lower-contrast alternatives for optional actions
- **Tertiary Actions**: Text-only links for minor actions
- **Destructive Actions**: Warning-colored buttons for irreversible actions
- **Loading States**: Disabled state with spinner for processing actions

**Dropdown and Menu Systems**

- **Context Menus**: Right-click activated menus with keyboard alternatives
- **Action Menus**: Three-dot menus with common action shortcuts
- **Mega Menus**: Large dropdown panels with rich content and navigation
- **Autocomplete**: Search-as-you-type with suggestion highlighting
- **Command Palettes**: Keyboard-driven action selection interfaces

**Accordion and Disclosure**

- **Content Organization**: Expandable sections for large content hierarchies
- **FAQ Patterns**: Question and answer layout with search functionality
- **Settings Panels**: Collapsible configuration sections
- **Detail Expansion**: Progressive disclosure of additional information
- **Performance**: Lazy loading of collapsed content

### 2. Data Manipulation Patterns

**Drag and Drop Interfaces**

- **Sortable Lists**: Reorderable items with visual feedback during drag
- **File Upload Areas**: Drop zones with progress indication and error handling
- **Kanban Boards**: Column-based organization with card movement
- **Tree Reorganization**: Hierarchical structure manipulation
- **Accessibility**: Keyboard alternatives for drag and drop functionality

**Inline Editing**

- **Click-to-Edit**: Direct content editing with save/cancel options
- **Bulk Editing**: Multiple item selection with batch operation capabilities
- **Real-time Collaboration**: Live editing with conflict resolution
- **Validation**: Immediate feedback for invalid inputs
- **History**: Undo/redo functionality for content changes

## Responsive Pattern Adaptations

### 1. Mobile-Specific Patterns

**Touch-Optimized Interactions**

- **Swipe Gestures**: Horizontal navigation through content panels
- **Pull-to-Refresh**: Vertical drag to reload content with visual feedback
- **Long Press**: Context menu activation with haptic feedback
- **Pinch-to-Zoom**: Image and map manipulation with smooth scaling
- **Bottom Sheet**: Modal panels that slide up from screen bottom

**Mobile Navigation**

- **Tab Bars**: Bottom navigation with icon and label combinations
- **Hamburger Menus**: Slide-out navigation panels with overlay backdrop
- **Floating Action Buttons**: Primary action access with contextual positioning
- **Search Overlays**: Full-screen search interfaces with suggestion panels
- **Back Navigation**: Clear hierarchy with swipe-back gesture support

### 2. Cross-Device Consistency

**Breakpoint Strategies**

- **Component Adaptation**: Pattern transformation across screen sizes
- **Content Prioritization**: Information hierarchy adjustment for space constraints
- **Interaction Model**: Touch vs. mouse interaction optimization
- **Performance**: Resource optimization for different device capabilities
- **Testing**: Pattern validation across device categories

```html
<!-- Responsive navigation example -->
<nav class="main-navigation" role="navigation">
  <div class="nav-container">
    <div class="nav-brand">Logo</div>
    <button class="nav-toggle" aria-expanded="false">Menu</button>
    <ul class="nav-menu">
      <li><a href="/home">Home</a></li>
      <li><a href="/products">Products</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </div>
</nav>
```

**Progressive Enhancement**

- **Core Functionality**: Basic interaction works without JavaScript
- **Enhanced Features**: JavaScript-powered improvements for capable browsers
- **Graceful Degradation**: Fallback experiences for limited environments
- **Feature Detection**: Capability-based enhancement activation
- **Performance**: Minimal resource usage for enhanced features

## Implementation Guidelines

### 1. Pattern Selection Criteria

**User Context Analysis**

- **Task Complexity**: Pattern sophistication matching user goals
- **Frequency of Use**: Optimization for common vs. occasional interactions
- **User Expertise**: Beginner-friendly vs. power-user optimized patterns
- **Device Context**: Primary device and interaction method considerations
- **Accessibility Requirements**: Universal design principle application

**Technical Considerations**

- **Performance Impact**: Resource usage and loading time implications
- **Browser Support**: Cross-browser compatibility requirements
- **Maintenance Complexity**: Long-term update and modification ease
- **Integration Effort**: Compatibility with existing design systems
- **Scalability**: Pattern adaptation for growing content and user bases

### 2. Customization and Theming

**Design Token Integration**

- **Color Systems**: Pattern adaptation to brand color palettes
- **Typography**: Font family and sizing consistency across patterns
- **Spacing**: Consistent rhythm through standardized spacing units
- **Animation**: Coordinated motion design across interface patterns
- **Breakpoints**: Responsive behavior aligned with design system grid

**Brand Adaptation**

- **Visual Identity**: Pattern styling aligned with brand guidelines
- **Voice and Tone**: Microcopy and messaging consistency
- **Cultural Considerations**: Localization for international audiences
- **Accessibility Standards**: WCAG compliance across all pattern variations
- **Performance Budgets**: Resource constraints for pattern implementations

This comprehensive UI patterns framework ensures consistent, usable, and scalable interface solutions that adapt gracefully across devices, contexts, and user needs while maintaining design system coherence and accessibility standards.
