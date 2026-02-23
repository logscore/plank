# TV Client Implementation Plan

## Overview

Build a multi-platform TV client for Plank that supports Apple TV, Android TV, Fire TV, Samsung Tizen, LG webOS, and Roku. The strategy uses a progressive approach starting with a TV-optimized web UI, then wrapping for app stores, with native clients as future optimization.

## Goals

- Support all major TV platforms with minimal code duplication
- Provide a 10-foot UI optimized for remote control navigation
- Integrate seamlessly with existing Plank backend
- Enable device pairing without painful TV keyboard input

## Architecture

### Phase 1: TV-Optimized Web UI (Weeks 1-3)

Build TV-specific routes within the existing SvelteKit application.

#### Routes Structure

```
src/routes/(tv)/
├── +layout.svelte              # TV layout with focus management
├── +page.svelte                # Home: Continue Watching + Recent
├── browse/
│   └── +page.svelte            # Library grid (movies/shows)
├── browse/[type]/
│   └── +page.svelte            # Filtered grid (movies or tv)
├── watch/[id]/
│   └── +page.svelte            # TV-optimized player
├── search/
│   └── +page.svelte            # On-screen keyboard search
└── settings/
    └── +page.svelte            # TV settings (playback, subtitles)
```

#### Components

```
src/lib/components/tv/
├── FocusManager.svelte         # D-pad navigation system
├── Focusable.svelte            # Wrapper for focusable elements
├── Card.svelte                 # Focusable poster card
├── CardRow.svelte              # Horizontal scrolling row
├── Player.svelte               # TV video player
├── PlayerControls.svelte       # Overlay controls
├── Keyboard.svelte             # On-screen keyboard
├── MenuBar.svelte              # Top navigation bar
├── DetailPage.svelte           # Movie/show detail view
└── EpisodeList.svelte          # TV episode selector
```

#### Focus Management System

The most critical component. Must handle:
- Arrow key navigation between focusable elements
- Focus trapping within groups (e.g., card rows)
- Scroll into view for focused elements
- Focus restoration after navigation
- Visual focus indicators

```typescript
// src/lib/stores/tv-focus.ts
interface FocusState {
  currentFocus: string | null;
  focusGroups: Map<string, string[]>;
  registerFocusable(id: string, groupId: string): void;
  unregisterFocusable(id: string): void;
  moveFocus(direction: 'up' | 'down' | 'left' | 'right'): void;
}

// Key mapping (normalize across platforms)
const TV_KEY_MAP = {
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
  'Enter': 'select',
  'Backspace': 'back',
  'Escape': 'back',
  'MediaPlay': 'play',
  'MediaPause': 'pause',
  'MediaPlayPause': 'playPause',
  'MediaStop': 'stop',
  'MediaRewind': 'rewind',
  'MediaFastForward': 'fastForward',
};
```

#### Player Considerations

- HLS.js for web-based streaming
- Native video element with native HLS on Safari/tvOS
- Subtitle rendering (VTT support)
- Audio track switching
- Quality selection (if multiple qualities available)
- Trick play (seek preview on fast-forward/rewind)

---

### Phase 2: Backend Enhancements (Week 2)

#### Device Authentication Flow

TV keyboards are painful. Use device code flow:

```
1. TV: POST /api/auth/device/start
   Response: { deviceCode, userCode, expiresIn, interval, verificationUrl }
   
2. TV: Display "Visit plank.tv/pair and enter code: ABC-123"
   
3. User: Opens URL on phone/laptop, logs in, enters code
   
4. TV: Polls GET /api/auth/device/poll?deviceCode=xxx
   Response: { status: 'pending' } or { status: 'complete', token, user }
   
5. TV: Stores token, proceeds to main UI
```

#### New Endpoints

```
POST   /api/auth/device/start     # Start device pairing
GET    /api/auth/device/poll      # Poll for completion
DELETE /api/auth/device/{id}      # Revoke device
GET    /api/auth/devices          # List user's devices
```

#### Database Schema

```sql
CREATE TABLE auth_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  name TEXT,  -- "Living Room TV"
  platform TEXT  -- "tizen", "webos", "android-tv", etc.
);
```

---

### Phase 3: App Store Distribution (Weeks 4-6)

Wrap the TV web UI for each platform.

#### Android TV / Fire TV

- Use **Trusted Web Activity (TWA)** or **Capacitor**
- Package as APK for Google Play Store and Amazon Appstore
- Add native receiver for media sessions (play/pause from remote)

```
android-tv/
├── app/src/main/
│   ├── java/.../
│   ├── assets/
│   │   └── index.html  → Redirects to plank server URL
│   └── AndroidManifest.xml
└── build.gradle
```

#### Samsung Tizen

- Tizen Studio with Web Application
- Direct submission to Samsung Apps
- config.xml with TV-specific permissions

```
tizen/
├── config.xml
├── index.html → Redirects to plank server URL
├── css/
└── js/
```

#### LG webOS

- webOS SDK with enyoJS or standard web app
- appinfo.json configuration
- Submission to LG Content Store

```
webos/
├── appinfo.json
├── index.html → Redirects to plank server URL
└── icon.png
```

#### Apple tvOS

Options:
1. **React Native tvOS** - Shared code with Android TV
2. **SwiftUI + WKWebView** - Native wrapper around web UI
3. **Pure Swift** - Full native app (Phase 4)

Recommend starting with React Native tvOS for code sharing:

```
apple-tv/
├── src/
│   ├── App.tsx
│   ├── screens/
│   ├── components/
│   └── navigation/
├── ios/
└── tvos/
```

#### Roku

- **BrightScript** or **Roku Web Installer** for web apps
- Roku Direct Publisher for web-based channels
- channel manifest configuration

```
roku/
├── manifest
├── source/
│   └── main.brs
└── components/
```

---

### Phase 4: Native Optimization (Future)

If web performance is insufficient on any platform, build native:

#### React Native for TV

Shared codebase for tvOS and Android TV:

```
src/
├── native/
│   ├── components/     # TV-optimized components
│   ├── screens/        # Screen layouts
│   ├── navigation/     # TV navigation
│   ├── player/         # Native video player
│   └── api/            # Plank API client
├── web/                # Web implementation
└── shared/             # Shared logic, types
```

#### Flutter TV

Alternative to React Native with different tradeoffs:
- Better performance for complex animations
- Smaller community for TV-specific issues
- Single codebase for all platforms

---

## UI/UX Specifications

### 10-Foot Design Principles

- **Minimum touch target**: 48x48px (prefer 64x64)
- **Typography**: 24px minimum body text, 32px+ headings
- **Spacing**: Generous padding (24px+)
- **Focus indicators**: Clear, high-contrast outlines
- **Color contrast**: WCAG AAA (7:1 ratio minimum)
- **No hover states**: TVs don't have mice

### Navigation Model

```
┌─────────────────────────────────────────────────────────┐
│  [Home]   [Movies]   [TV Shows]   [Search]      [Settings] │  ← Menu bar (horizontal)
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Continue Watching                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │  ← Horizontal rows
│  │      │ │      │ │      │ │      │ │      │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                         │
│  Movies                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │      │ │      │ │      │ │      │ │      │          │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Player UI

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                                                         │
│                     [VIDEO]                             │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Movie Title]                                          │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  45:23 / 2:15:00 │
│  [CC] [Audio] [Quality]                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Remote Control Key Mappings

| Action | Apple TV | Android TV | Samsung | LG | Roku |
|--------|----------|------------|---------|-----|------|
| Up | ArrowUp | ArrowUp | ArrowUp | ArrowUp | ArrowUp |
| Down | ArrowDown | ArrowDown | ArrowDown | ArrowDown | ArrowDown |
| Left | ArrowLeft | ArrowLeft | ArrowLeft | ArrowLeft | ArrowLeft |
| Right | ArrowRight | ArrowRight | ArrowRight | ArrowRight | ArrowRight |
| Select | Enter | Enter | Enter | Enter | Enter |
| Back | Escape | Backspace | Backspace | Backspace | Backspace |
| Play/Pause | MediaPlayPause | MediaPlayPause | MediaPlayPause | MediaPlayPause | MediaPlayPause |
| Menu | KeyG | KeyH | KeyQ | KeyQ | Home |

---

## Implementation Checklist

### Phase 1: TV Web UI

- [ ] Create `(tv)` route group with TV layout
- [ ] Implement FocusManager store and Focusable component
- [ ] Build TV Card and CardRow components
- [ ] Create TV home page with continue watching
- [ ] Build TV browse page with grid navigation
- [ ] Implement TV detail page
- [ ] Build TV player with controls
- [ ] Add on-screen keyboard for search
- [ ] Add TV detection and redirect logic

### Phase 2: Device Auth

- [ ] Add auth_devices table to schema
- [ ] Implement /api/auth/device/start endpoint
- [ ] Implement /api/auth/device/poll endpoint
- [ ] Build device pairing page on main site
- [ ] Create device management UI in settings

### Phase 3: App Store Wrappers

- [ ] Create Android TV TWA project
- [ ] Create Tizen web app project
- [ ] Create webOS app project
- [ ] Create React Native tvOS project
- [ ] Create Roku channel project
- [ ] Submit to each app store

### Phase 4: Native (Future)

- [ ] Evaluate web performance on each platform
- [ ] Identify platforms needing native implementation
- [ ] Build React Native TV shared codebase
- [ ] Platform-specific native modules

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Focus management complexity | Use established library (js-spatial-navigation) as starting point |
| App store rejections | Test thoroughly, follow platform guidelines |
| Platform-specific bugs | Feature detection, graceful degradation |
| Remote control differences | Comprehensive key mapping layer |
| Performance on low-end TVs | Lazy loading, virtualized lists, optimized assets |

---

## Success Metrics

- All major TV platforms supported
- Device pairing completed in under 60 seconds
- Navigation latency under 100ms
- Video starts within 3 seconds
- App store ratings above 4.0 stars
