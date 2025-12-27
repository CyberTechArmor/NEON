# NEON Brand Guidelines

> Official brand identity standards for the NEON collaboration platform

---

## Table of Contents

1. [Brand Overview](#brand-overview)
2. [Logo](#logo)
3. [Color Palette](#color-palette)
4. [Typography](#typography)
5. [Visual Elements](#visual-elements)
6. [Voice & Tone](#voice--tone)
7. [Usage Guidelines](#usage-guidelines)
8. [Accessibility](#accessibility)

---

## Brand Overview

### Mission

NEON is a real-time collaboration platform designed for organizations that need secure, compliant communication. We provide encrypted messaging, video calls, and meetings without reliance on paid third-party services.

### Brand Values

| Value | Description |
|-------|-------------|
| **Security** | Enterprise-grade encryption and compliance (HIPAA, GDPR, SOC 2) |
| **Privacy** | Self-hosted, data sovereignty, zero third-party dependencies |
| **Simplicity** | Clean, intuitive interfaces that don't require training |
| **Transparency** | Open source codebase, fair-code licensing model |
| **Control** | Organizations own their infrastructure and data |

### Brand Personality

- **Professional** — Enterprise-ready, trustworthy, reliable
- **Modern** — Contemporary design, cutting-edge technology
- **Minimal** — Clean, purposeful, distraction-free
- **Secure** — Protective, private, compliant
- **Empowering** — Gives control back to organizations

---

## Logo

### Primary Logo

The NEON logo consists of a bold, minimal **"N"** lettermark rendered in white on a dark background.

```
┌─────────────────────┐
│                     │
│        ██   █       │
│        ██  ██       │
│        ██ ██        │
│        ████         │
│        ███          │
│        ██           │
│                     │
└─────────────────────┘
```

**File Location:** `/apps/web/public/neon-icon.svg`

### Logo Specifications

| Attribute | Value |
|-----------|-------|
| Format | SVG (scalable) |
| Primary Color | White (`#FFFFFF`) |
| Background | Dark (`#0D0D0D`) |
| Style | Bold, sans-serif |
| Minimum Size | 24px × 24px |

### Clear Space

Maintain clear space around the logo equal to the height of the "N" letterform on all sides. This ensures the logo remains prominent and uncluttered.

```
     ┌───────────────────────────┐
     │         CLEAR SPACE       │
     │    ┌───────────────┐      │
     │    │               │      │
     │ C  │      N        │  C   │
     │ L  │               │  L   │
     │ E  └───────────────┘  E   │
     │ A       CLEAR SPACE   A   │
     │ R                     R   │
     └───────────────────────────┘
```

### Logo Variants

| Variant | Background | Logo Color | Usage |
|---------|------------|------------|-------|
| **Primary** | Dark (`#0D0D0D`) | White (`#FFFFFF`) | Default usage |
| **Reversed** | White/Light | Dark (`#0D0D0D`) | Light backgrounds |
| **Monochrome** | Any | Single color | Print, embroidery |

### Logo Don'ts

- Do not stretch or distort the logo
- Do not rotate the logo
- Do not add effects (shadows, gradients, outlines)
- Do not place on busy backgrounds without proper contrast
- Do not modify the letterform
- Do not use colors outside the approved palette
- Do not add text directly adjacent to the logo without proper spacing

---

## Color Palette

### Primary Colors

Our dark-first color system emphasizes security, professionalism, and modern aesthetics.

#### Core Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Background** | `#0D0D0D` | `13, 13, 13` | Primary background |
| **Surface** | `#161616` | `22, 22, 22` | Cards, panels, modals |
| **Surface Hover** | `#1A1A1A` | `26, 26, 26` | Interactive hover states |
| **Border** | `#2A2A2A` | `42, 42, 42` | Dividers, separators |
| **Border Focus** | `#3A3A3A` | `58, 58, 58` | Focus states, active borders |

#### Text Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Text Primary** | `#FFFFFF` | `255, 255, 255` | Headlines, primary content |
| **Text Secondary** | `#A0A0A0` | `160, 160, 160` | Supporting text, labels |
| **Text Muted** | `#666666` | `102, 102, 102` | Disabled, placeholder text |

#### Accent Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Accent** | `#FFFFFF` | `255, 255, 255` | Primary actions, links |
| **Accent Hover** | `#E0E0E0` | `224, 224, 224` | Hover state for accents |

### Status Colors

Used for system feedback, notifications, and user presence indicators.

| Status | Hex | RGB | Usage |
|--------|-----|-----|-------|
| **Success** | `#22C55E` | `34, 197, 94` | Online status, confirmations |
| **Warning** | `#EAB308` | `234, 179, 8` | Away status, cautions |
| **Error** | `#EF4444` | `239, 68, 68` | Busy/offline, errors |
| **Info** | `#3B82F6` | `59, 130, 246` | Information, notifications |

### Color Usage Guidelines

1. **Dark backgrounds are primary** — Light themes are not supported
2. **Maintain high contrast** — Ensure text is always readable
3. **Use status colors sparingly** — Reserve for functional indicators
4. **Accent white for emphasis** — Primary CTAs and important actions

### Color Accessibility

All color combinations must meet WCAG 2.1 AA standards:

| Combination | Contrast Ratio | Status |
|-------------|----------------|--------|
| White on Background | 19.6:1 | AAA |
| Secondary on Background | 8.5:1 | AAA |
| Muted on Background | 4.9:1 | AA |
| Success on Background | 9.2:1 | AAA |

---

## Typography

### Font Families

#### Primary: Inter

Used for all interface text, headings, and body content.

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

**Characteristics:**
- Modern, geometric sans-serif
- Highly legible at all sizes
- Optimized for screen readability
- Variable font support

#### Monospace: JetBrains Mono

Used for code blocks, technical content, and timestamps.

```css
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
```

### Type Scale

| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| **4XL** | 2.25rem (36px) | 1.2 | 700 | Hero headlines |
| **3XL** | 1.875rem (30px) | 1.2 | 700 | Page titles |
| **2XL** | 1.5rem (24px) | 1.3 | 600 | Section headers |
| **XL** | 1.25rem (20px) | 1.4 | 600 | Subsection headers |
| **LG** | 1.125rem (18px) | 1.5 | 500 | Large body text |
| **Base** | 1rem (16px) | 1.5 | 400 | Default body text |
| **SM** | 0.875rem (14px) | 1.5 | 400 | Secondary text |
| **XS** | 0.75rem (12px) | 1.4 | 400 | Captions, metadata |

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Emphasized text, labels |
| Semibold | 600 | Subheadings, buttons |
| Bold | 700 | Headlines, important |

### Typography Guidelines

1. **Use Inter for everything** except code
2. **Maintain hierarchy** through size and weight
3. **Limit line length** to 65-75 characters for readability
4. **Left-align text** — Never center body content
5. **Use sentence case** for UI text (not Title Case or ALL CAPS)

---

## Visual Elements

### Border Radius

Consistent rounding creates a cohesive, modern feel.

| Size | Value | Usage |
|------|-------|-------|
| None | 0 | Sharp edges when needed |
| Small | 4px | Small inputs, tags |
| Default | 8px | Buttons, cards, inputs |
| Medium | 12px | Modals, panels |
| Large | 16px | Large containers |
| Full | 9999px | Pills, avatars, badges |

### Shadows

Subtle shadows provide depth without distraction.

| Name | Value | Usage |
|------|-------|-------|
| **neon** | `0 4px 20px rgba(0,0,0,0.5)` | Standard elevation |
| **neon-lg** | `0 8px 40px rgba(0,0,0,0.6)` | Modals, popovers |
| **neon-glow** | `0 0 20px rgba(255,255,255,0.1)` | Subtle highlight |

### Spacing Scale

Consistent spacing creates visual rhythm.

| Token | Value | Usage |
|-------|-------|-------|
| 1 | 4px | Tight spacing |
| 2 | 8px | Component internal |
| 3 | 12px | Related elements |
| 4 | 16px | Standard gap |
| 5 | 20px | Section spacing |
| 6 | 24px | Large gaps |
| 8 | 32px | Major sections |
| 10 | 40px | Page sections |
| 12 | 48px | Hero spacing |

### Animations

Subtle, purposeful motion enhances usability.

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| **fade-in** | 200ms | ease-out | Element appearance |
| **slide-up** | 300ms | ease-out | Modal entry |
| **slide-down** | 300ms | ease-out | Dropdown menus |
| **scale-in** | 200ms | ease-out | Button feedback |
| **pulse** | 2000ms | ease-in-out | Loading, attention |

### Animation Guidelines

1. **Keep it subtle** — Motion should support, not distract
2. **Be purposeful** — Every animation should have a reason
3. **Respect preferences** — Honor `prefers-reduced-motion`
4. **Stay fast** — No animation should exceed 400ms

---

## Voice & Tone

### Brand Voice

NEON speaks with authority, clarity, and respect.

| Attribute | Description | Example |
|-----------|-------------|---------|
| **Clear** | Direct, jargon-free communication | "Your message was sent" not "Message transmission successful" |
| **Confident** | Assured without arrogance | "Enterprise-grade security" not "We think it's pretty secure" |
| **Helpful** | Guides users to success | "Try reconnecting" not "Connection failed" |
| **Professional** | Business-appropriate language | "Meeting scheduled" not "You're all set!" |
| **Respectful** | Treats users as experts | "Configure SSO" not "Easy SSO setup for beginners" |

### Writing Guidelines

#### Do

- Use active voice
- Be concise and specific
- Use sentence case for UI text
- Write helpful error messages
- Explain technical terms when necessary

#### Don't

- Use jargon or buzzwords
- Be overly casual or use slang
- Use exclamation points excessively
- Write vague or unhelpful messages
- Assume all users are developers

### Example Messages

| Context | Good | Bad |
|---------|------|-----|
| Success | "Message sent" | "Yay! Your message was sent successfully!" |
| Error | "Unable to connect. Check your network and try again." | "Oops! Something went wrong :(" |
| Empty state | "No messages yet. Start a conversation." | "It's quiet in here... too quiet!" |
| Loading | "Loading messages..." | "Hang tight!" |

---

## Usage Guidelines

### Digital Applications

#### Web Application
- Use the full dark theme consistently
- Maintain the established component library
- Follow the spacing and typography systems
- Ensure all interactive elements have proper states

#### Mobile/PWA
- Adapt layouts responsively
- Maintain touch-friendly sizing (minimum 44px tap targets)
- Use native-feeling animations
- Respect platform conventions where appropriate

### Marketing Materials

#### Presentations
- Use dark backgrounds (`#0D0D0D`)
- Apply the logo with proper clear space
- Use Inter for all text
- Maintain high contrast

#### Social Media
- Logo should be clearly visible at small sizes
- Use approved color palette only
- Maintain brand voice consistency

### Partner & Integration Usage

When NEON branding appears alongside partners:

1. Maintain equal visual weight with partner logos
2. Use proper clear space around the NEON logo
3. Do not modify the NEON logo to match partner styling
4. Ensure sufficient contrast in all applications

### Co-Branding

For approved co-branding scenarios:

- NEON logo appears on the left or top
- Maintain clear separation between logos
- Use a neutral divider if needed (vertical line in `#2A2A2A`)
- Both logos should be similar in visual weight

---

## Accessibility

### Standards

NEON adheres to WCAG 2.1 Level AA standards.

### Requirements

| Requirement | Standard | Implementation |
|-------------|----------|----------------|
| Color Contrast | 4.5:1 minimum | Verified in color palette |
| Focus Indicators | Visible focus states | Border-focus color on interactive elements |
| Text Size | Scalable up to 200% | Relative units (rem) throughout |
| Motion | Respect user preferences | `prefers-reduced-motion` support |
| Screen Readers | Semantic markup | ARIA labels, proper heading hierarchy |

### Implementation Checklist

- [ ] All interactive elements have visible focus states
- [ ] Color is not the only means of conveying information
- [ ] All images have descriptive alt text
- [ ] Form inputs have associated labels
- [ ] Error messages are descriptive and helpful
- [ ] Keyboard navigation works throughout
- [ ] Touch targets are at least 44×44px

---

## Quick Reference

### Essential Colors

```
Background:     #0D0D0D
Surface:        #161616
Border:         #2A2A2A
Text Primary:   #FFFFFF
Text Secondary: #A0A0A0
Success:        #22C55E
Warning:        #EAB308
Error:          #EF4444
Info:           #3B82F6
```

### Essential Typography

```
Font Family:    Inter
Heading Weight: 600-700
Body Weight:    400
Base Size:      16px
Line Height:    1.5
```

### Essential Spacing

```
Tight:          4px
Standard:       16px
Comfortable:    24px
Spacious:       32px
```

---

## Resources

### Design Files

- Logo SVG: `/apps/web/public/neon-icon.svg`
- Tailwind Config: `/apps/web/tailwind.config.js`
- Global Styles: `/apps/web/src/styles/globals.css`

### External Resources

- [Inter Font](https://rsms.me/inter/)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

## Contact

For questions about brand usage or to request brand assets:

- **Project:** [github.com/CyberTechArmor/NEON](https://github.com/CyberTechArmor/NEON)
- **Website:** [fractionate.ai](https://fractionate.ai)

---

*These guidelines are maintained by the NEON team. Last updated: December 2024*
