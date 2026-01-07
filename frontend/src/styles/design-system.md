# Mountain Pine Dermatology EHR Design System

## Overview
This design system ensures UI/UX consistency across the entire dermatology EHR application. All components and pages should follow these guidelines.

## Color Palette

### Primary Colors (Light Blue Theme)
- `--primary-900`: #0c4a6e - Darkest, for text/emphasis
- `--primary-800`: #075985 - Dark, for headers
- `--primary-700`: #0369a1 - Main brand color
- `--primary-600`: #0284c7 - Primary actions
- `--primary-500`: #0ea5e9 - Hover states
- `--primary-400`: #38bdf8 - Light accents
- `--primary-300`: #7dd3fc - Very light accents
- `--primary-200`: #bae6fd - Backgrounds
- `--primary-100`: #e0f2fe - Subtle backgrounds
- `--primary-50`: #f0f9ff - Very subtle backgrounds

### Accent Colors (Darker Blue for Actions)
- `--accent-600`: #1e40af - Dark action color
- `--accent-500`: #2563eb - Primary action buttons
- `--accent-400`: #3b82f6 - Hover states
- `--accent-100`: #dbeafe - Action backgrounds

### Neutral Colors
- `--gray-900`: #111827 - Body text
- `--gray-800`: #1f2937 - Dark text
- `--gray-700`: #374151 - Medium dark text
- `--gray-600`: #4b5563 - Secondary text
- `--gray-500`: #6b7280 - Muted text
- `--gray-400`: #9ca3af - Disabled text
- `--gray-300`: #d1d5db - Borders
- `--gray-200`: #e5e7eb - Light borders
- `--gray-100`: #f3f4f6 - Backgrounds
- `--gray-50`: #f9fafb - Light backgrounds
- `--white`: #ffffff - White

### Status Colors
#### Success (Green)
- `--success-600`: #059669 - Dark success
- `--success-500`: #10b981 - Success
- `--success-100`: #d1fae5 - Success background

#### Warning (Orange)
- `--warning-600`: #d97706 - Dark warning
- `--warning-500`: #f59e0b - Warning
- `--warning-100`: #fef3c7 - Warning background

#### Error (Red)
- `--error-600`: #dc2626 - Dark error
- `--error-500`: #ef4444 - Error
- `--error-100`: #fee2e2 - Error background

## Typography

### Font Family
- **Primary**: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Monospace**: "SF Mono", Monaco, "Cascadia Code", monospace

### Font Sizes
- **Base**: 14px (0.875rem)
- **Small**: 0.75rem (12px)
- **Body**: 0.875rem (14px)
- **Large**: 1rem (16px)
- **Heading 1**: 1.5rem (24px)
- **Heading 2**: 1.25rem (20px)
- **Heading 3**: 1.125rem (18px)

### Font Weights
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700
- **Extrabold**: 800

### Line Height
- **Default**: 1.5
- **Headings**: 1.2
- **Tight**: 1.25

## Spacing System

### Standard Spacing Scale
- **0.25rem** (4px) - xs
- **0.375rem** (6px) - sm
- **0.5rem** (8px) - md
- **0.75rem** (12px) - lg
- **1rem** (16px) - xl
- **1.25rem** (20px) - 2xl
- **1.5rem** (24px) - 3xl
- **2rem** (32px) - 4xl

### Common Patterns
- **Button padding**: 0.625rem 1.25rem (10px 20px)
- **Input padding**: 0.625rem 0.875rem (10px 14px)
- **Panel padding**: 1rem (16px)
- **Section padding**: 1.5rem (24px)
- **Gap between elements**: 0.75rem (12px)

## Border Radius

- `--radius-sm`: 4px - Small elements (badges, pills)
- `--radius-md`: 8px - Standard (buttons, inputs, cards)
- `--radius-lg`: 12px - Large panels
- `--radius-xl`: 16px - Extra large containers
- `--radius-full`: 9999px - Circular (pills, avatars)

## Shadows

- `--shadow-sm`: 0 1px 2px rgba(0, 0, 0, 0.05) - Subtle
- `--shadow-md`: 0 4px 6px -1px rgba(0, 0, 0, 0.1) - Standard
- `--shadow-lg`: 0 10px 15px -3px rgba(0, 0, 0, 0.1) - Elevated
- `--shadow-xl`: 0 20px 25px -5px rgba(0, 0, 0, 0.1) - Modals

## Transitions

### Standard Timing
- **Fast**: 0.15s - Hover states, color changes
- **Medium**: 0.2s - Modal open/close
- **Slow**: 0.3s - Drawer/sidebar animations

### Easing Functions
- **Ease**: Standard for most transitions
- **Ease-in-out**: Smooth start and end
- **Ease-out**: Fast start, slow end (better for UI)

## Button Styles

### Variants
1. **Primary** - Main actions (gradient blue)
   - Background: linear-gradient(135deg, var(--accent-500), var(--accent-600))
   - Color: white
   - Hover: Lift effect + shadow

2. **Ghost** - Secondary actions
   - Background: white
   - Border: 1px solid var(--gray-300)
   - Color: var(--gray-700)
   - Hover: Background var(--gray-50)

3. **Danger** - Destructive actions
   - Background: var(--error-600)
   - Color: white
   - Hover: Darken

4. **Success** - Positive actions
   - Background: var(--success-600)
   - Color: white
   - Hover: Darken

### Sizes
- **Small**: padding 0.5rem 1rem, font-size 0.75rem
- **Medium** (default): padding 0.625rem 1.25rem, font-size 0.875rem
- **Large**: padding 0.875rem 1.5rem, font-size 1rem

### States
- **Hover**: translateY(-1px) + shadow-md
- **Active**: translateY(0)
- **Disabled**: opacity 0.5, no hover effects
- **Loading**: Show spinner, disable interaction

## Form Fields

### Input Styles
- Border: 1px solid var(--gray-300)
- Padding: 0.625rem 0.875rem
- Border radius: var(--radius-md)
- Background: white
- Focus: border var(--primary-500) + shadow (0 0 0 3px var(--primary-100))

### Label Styles
- Font size: 0.8125rem
- Font weight: 600
- Color: var(--gray-700)
- Margin bottom: 0.375rem

### Error States
- Border: var(--error-500)
- Background: var(--error-100)
- Error message: var(--error-600), font-size 0.8125rem

### Required Field Indicator
- Red asterisk: color var(--error-500)
- Position: After label text

## Modal Styles

### Structure
- **Overlay**: rgba(0, 0, 0, 0.6) + backdrop-filter blur(2px)
- **Container**: White background, border-radius var(--radius-lg)
- **Shadow**: var(--shadow-xl)

### Sizes
- **Small**: max-width 400px
- **Medium**: max-width 600px
- **Large**: max-width 900px
- **Full**: max-width 95vw

### Header
- Padding: 1.5rem
- Border bottom: 1px solid var(--gray-200)
- Close button: Top right, font-size 1.5rem

### Body
- Padding: 1.5rem

### Footer
- Padding: 1rem 1.5rem
- Border top: 1px solid var(--gray-200)
- Buttons: Right-aligned, gap 0.75rem

## Card/Panel Styles

### Standard Card
- Background: white
- Border: 1px solid var(--gray-200)
- Border radius: var(--radius-lg)
- Box shadow: var(--shadow-lg)

### Panel Header
- Background: linear-gradient(to bottom, var(--primary-50), var(--white))
- Padding: 0.875rem 1rem
- Border bottom: 1px solid var(--gray-200)
- Font size: 0.9375rem, font weight 700

### Panel Body
- Padding: 1rem

## Empty States

### Structure
- Center aligned
- Icon: Font size 3rem
- Title: Font size 1.125rem, font weight 600, color var(--gray-900)
- Description: Font size 0.875rem, color var(--gray-500)
- Action button: Primary variant, margin top 1rem

### Icons
Use emojis for now (consistent across app):
- No patients: 👥
- No appointments: 📅
- No messages: 💬
- No documents: 📄
- No photos: 📸
- No tasks: ✅
- No results: 🔍
- No data: 📊

## Loading States

### Spinner
- Border width: 3px
- Border color: var(--gray-200)
- Border top: var(--primary-600)
- Animation: spin 0.8s linear infinite

### Skeleton Loader
- Background: Shimmer gradient (gray-200 to gray-100)
- Border radius: var(--radius-md)
- Animation: shimmer 1.5s infinite

### Loading Overlay
- Background: rgba(255, 255, 255, 0.9)
- Backdrop filter: blur(4px)
- z-index: 9999

## Status Badges/Pills

### Structure
- Display: inline-flex
- Padding: 0.375rem 0.875rem (small: 0.25rem 0.625rem)
- Border radius: var(--radius-full)
- Font size: 0.8125rem
- Font weight: 600

### Variants
- **Success**: background var(--success-100), color var(--success-600)
- **Warning**: background var(--warning-100), color var(--warning-600)
- **Error**: background var(--error-100), color var(--error-600)
- **Neutral**: background var(--gray-100), color var(--gray-600)

## Tables

### Header
- Background: var(--gray-50)
- Padding: 0.75rem 1rem
- Font size: 0.75rem
- Font weight: 700
- Text transform: uppercase
- Letter spacing: 0.05em
- Border bottom: 2px solid var(--gray-200)

### Body Rows
- Padding: 0.875rem 1rem
- Border bottom: 1px solid var(--gray-100)
- Hover: background var(--gray-50)

## Page Layout

### Page Header
- Padding: 1.5rem
- Background: linear-gradient(to bottom, var(--white), var(--gray-50))
- Border bottom: 1px solid var(--gray-200)

### Page Title
- Font size: 1.5rem
- Font weight: 700
- Color: var(--gray-900)
- Margin bottom: 0.25rem

### Page Subtitle/Description
- Font size: 0.875rem
- Color: var(--gray-500)

### Quick Actions
- Display: flex, gap 0.5rem
- Padding: 1rem 1.5rem
- Background: white
- Border bottom: 1px solid var(--gray-200)

## Navigation

### Top Bar
- Height: 56px (var(--header-height))
- Background: linear-gradient(135deg, var(--primary-800), var(--primary-700))
- Box shadow: var(--shadow-md)
- Sticky position

### Main Navigation
- Background: var(--primary-700)
- Height: 44px
- Border bottom: 1px solid var(--primary-800)

### Nav Items
- Padding: 0.625rem 0.875rem
- Font size: 0.8125rem
- Color: var(--primary-100)
- Hover: background var(--primary-600), color white
- Active: background var(--primary-600), color white

## Responsive Breakpoints

- **Mobile**: max-width 768px
- **Tablet**: max-width 1024px
- **Desktop**: min-width 1025px

### Mobile Adjustments
- Hide desktop navigation, show hamburger menu
- Stack form fields vertically
- Reduce padding/margins
- Single column grids
- Touch targets minimum 44px

## Accessibility

### Focus States
- Outline: 2px solid var(--primary-500)
- Outline offset: 2px
- Box shadow: 0 0 0 4px var(--primary-100)

### Color Contrast
- Text: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- Interactive elements: Clear visual distinction

### Screen Reader Support
- Use semantic HTML
- Proper ARIA labels
- Skip navigation links
- Meaningful alt text

## Animation Guidelines

### Use Cases
- **Fade in**: Page loads, new content
- **Slide in**: Modals, drawers, notifications
- **Scale**: Buttons, interactive elements
- **Shake**: Form errors
- **Pulse**: Loading states, notifications

### Reduced Motion
Respect `prefers-reduced-motion: reduce` by disabling or minimizing animations.

## Best Practices

1. **Consistency**: Always use design system tokens, never hardcode values
2. **Hierarchy**: Use typography and spacing to create clear visual hierarchy
3. **Feedback**: Provide immediate feedback for all user actions
4. **Progressive disclosure**: Show only what's necessary, hide complexity
5. **Accessibility first**: Design for keyboard navigation and screen readers
6. **Mobile friendly**: Ensure touch targets are large enough (min 44px)
7. **Performance**: Optimize images, use CSS instead of JS where possible
8. **Error handling**: Clear, helpful error messages with recovery actions

## Component Checklist

Before creating a new component, ensure it has:
- [ ] Proper TypeScript types
- [ ] Accessibility attributes (ARIA labels, roles)
- [ ] Keyboard navigation support
- [ ] Loading and error states
- [ ] Responsive design
- [ ] Focus management
- [ ] Consistent styling using design tokens
- [ ] Empty state handling
- [ ] Proper documentation
