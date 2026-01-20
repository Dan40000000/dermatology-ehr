# Walkthrough System - Quick Start Guide

## 5-Minute Setup

Get the interactive tutorial system running in your app in just a few steps!

## Step 1: Wrap Your App (2 minutes)

### Update your main entry file

```tsx
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WalkthroughProvider } from './components/Walkthrough';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalkthroughProvider>
      <App />
    </WalkthroughProvider>
  </React.StrictMode>
);
```

## Step 2: Add Components to Your Layout (2 minutes)

### Add to your main App or Layout component

```tsx
// frontend/src/App.tsx or your main layout
import { Walkthrough } from './components/Walkthrough';

function App() {
  return (
    <>
      {/* Add this at the top level */}
      <Walkthrough />

      {/* Your existing app content */}
      <div className="your-app">
        {/* ... */}
      </div>
    </>
  );
}

export default App;
```

## Step 3: Add Tutorials Page to Router (1 minute)

```tsx
// In your router configuration
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TutorialsPage } from './pages/TutorialsPage';

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Your existing routes */}
        <Route path="/tutorials" element={<TutorialsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

## Step 4: Add Navigation Link (Optional)

```tsx
// In your navigation component
<nav>
  {/* Your existing nav items */}
  <a href="/tutorials">📚 Tutorials</a>
</nav>
```

## That's It! You're Done!

Visit `/tutorials` to see all available tutorials and start learning!

## Testing the System

### Test Tutorial Navigation
1. Go to `/tutorials`
2. Click "Start Tutorial" on "Your First Patient"
3. Follow the highlighted elements
4. Use Back/Next buttons
5. Complete the tutorial

### Test Demo Mode
```tsx
// Add a button to enable demo mode anywhere in your app
import { useWalkthrough } from './components/Walkthrough';

function DemoButton() {
  const { setDemoMode } = useWalkthrough();

  return (
    <button onClick={() => setDemoMode(true)}>
      🎓 Enable Demo Mode
    </button>
  );
}
```

### Test Progress Persistence
1. Start a tutorial
2. Complete a few steps
3. Refresh the page
4. Return to tutorials - you should see "In Progress"
5. Click "Continue" to resume

## Common Use Cases

### 1. Auto-start tutorial for new users

```tsx
import { useWalkthrough } from './components/Walkthrough';
import { useEffect } from 'react';

function App() {
  const { startWalkthrough, progress } = useWalkthrough();

  useEffect(() => {
    // Start first tutorial if no tutorials completed
    const completedCount = Object.values(progress).filter(p => p.completed).length;

    if (completedCount === 0) {
      startWalkthrough('first-patient');
    }
  }, []);

  return <YourApp />;
}
```

### 2. Show tutorial button for specific pages

```tsx
import { useWalkthrough } from './components/Walkthrough';
import { useLocation } from 'react-router-dom';

function TutorialButton() {
  const { startWalkthrough } = useWalkthrough();
  const location = useLocation();

  // Show tutorial button on patients page
  if (location.pathname === '/patients') {
    return (
      <button onClick={() => startWalkthrough('first-patient')}>
        📖 Learn Patient Workflow
      </button>
    );
  }

  return null;
}
```

### 3. Check if user completed onboarding

```tsx
import { useWalkthrough } from './components/Walkthrough';

function Dashboard() {
  const { progress } = useWalkthrough();

  const requiredTutorials = ['first-patient', 'end-of-day'];
  const hasCompletedOnboarding = requiredTutorials.every(
    id => progress[id]?.completed
  );

  if (!hasCompletedOnboarding) {
    return <OnboardingPrompt />;
  }

  return <DashboardContent />;
}
```

## Available Tutorials

1. **Your First Patient** (8 min, beginner)
   - ID: `first-patient`
   - Complete patient encounter workflow

2. **Ordering a Biopsy** (6 min, intermediate)
   - ID: `order-biopsy`
   - Requires: first-patient

3. **Prior Authorization** (5 min, intermediate)
   - ID: `prior-auth`
   - Requires: first-patient

4. **Cosmetic Visit** (7 min, intermediate)
   - ID: `cosmetic-visit`
   - Photos, consent, documentation

5. **Full Body Skin Exam** (10 min, intermediate)
   - ID: `skin-check`
   - Skin cancer screening

6. **End of Day Tasks** (5 min, beginner)
   - ID: `end-of-day`
   - Daily closeout workflow

## Customization

### Change Colors

Edit `frontend/src/components/Walkthrough/Walkthrough.css`:

```css
/* Change primary color from indigo to your brand color */
.walkthrough-spotlight {
  box-shadow: 0 0 0 4px rgba(YOUR_COLOR_HERE, 0.5);
}

.walkthrough-btn-primary {
  background: linear-gradient(135deg, YOUR_COLOR_1, YOUR_COLOR_2);
}
```

### Adjust Tutorial Difficulty

Edit walkthrough files in `frontend/src/components/Walkthrough/walkthroughs/`:

```typescript
export const myWalkthrough: Walkthrough = {
  // ...
  difficulty: 'beginner', // Change to: intermediate or advanced
  estimatedMinutes: 10,   // Adjust timing
  // ...
};
```

### Hide Demo Mode Bar

```tsx
// In Walkthrough.tsx, comment out:
// <DemoModeBar />
```

## Troubleshooting

### Tutorial won't start
- Check console for errors
- Verify WalkthroughProvider wraps your app
- Ensure tutorial ID is correct

### Spotlight not showing
- Check if target element exists: `document.querySelector('.your-selector')`
- Verify element is visible on screen
- Try a more specific selector

### Progress not saving
- Check localStorage is enabled in browser
- Look for localStorage errors in console
- Clear localStorage and try again: `localStorage.clear()`

## Next Steps

1. **Create Custom Tutorials**: See WALKTHROUGH_IMPLEMENTATION_SUMMARY.md
2. **Add Analytics**: Track completion rates
3. **Customize Styling**: Match your brand
4. **Add More Tutorials**: Cover all major workflows

## Resources

- Full Implementation Guide: `WALKTHROUGH_IMPLEMENTATION_SUMMARY.md`
- Component Files: `frontend/src/components/Walkthrough/`
- Tutorial Definitions: `frontend/src/components/Walkthrough/walkthroughs/`
- Tutorials Page: `frontend/src/pages/TutorialsPage.tsx`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the implementation summary
3. Inspect browser console for errors
4. Check that all files were created correctly

---

**You're all set!** Users can now learn your system without any training. 🎉
