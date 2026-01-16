# Phase 8: Theme System (V2)

> **Goal:** Build marketplace-ready theme system with custom themes and organization branding
> **Estimated Sessions:** 6-8
> **Prerequisites:** Phase 7 complete, basic theme toggle (Phase 6.2) working

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Theme Models** ||||
| 8.1.1 | Create ThemeDefinition model | ⬜ | Marketplace themes |
| 8.1.2 | Create UserTheme model | ⬜ | Per user/org themes |
| 8.1.3 | Create theme definition schema | ⬜ | CSS variables spec |
| **Theme Service** ||||
| 8.2.1 | Create theme service | ⬜ | Install, apply, customize |
| 8.2.2 | Create theme API endpoints | ⬜ | |
| 8.2.3 | Create theme CSS generator | ⬜ | |
| **Theme UI** ||||
| 8.3.1 | Create theme browser page | ⬜ | Available themes |
| 8.3.2 | Create theme preview component | ⬜ | Try before applying |
| 8.3.3 | Create theme customizer | ⬜ | Override CSS vars |
| **Built-in Themes** ||||
| 8.4.1 | Create official themes | ⬜ | 5 built-in themes |
| 8.4.2 | Seed themes to database | ⬜ | |

---

## 📝 Detailed Tasks

---

## 🎨 Theme Architecture

### Theme Storage

```
┌─────────────────────────────────────────────────────────────┐
│                    ThemeDefinition                          │
│                    (Marketplace Item)                       │
│                                                             │
│  id, slug, name, description                                │
│  author, isOfficial, price                                  │
│  variables: { light: {...}, dark: {...} }                   │
│  customizable: ['primary', 'accent', ...]                   │
│  preview: { primary, background }                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ User installs theme
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       UserTheme                             │
│                                                             │
│  userId + organizationId (context)                          │
│  themeId → ThemeDefinition                                  │
│  customVars: { primary: 'oklch(...)', ... }                 │
│  isActive: true                                             │
└─────────────────────────────────────────────────────────────┘
```

### CSS Variable System

```typescript
// Theme variables (30+ from globals.css)
const THEME_VARIABLES = [
  // Core
  'background', 'foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
  
  // Sidebar
  'sidebar-background', 'sidebar-foreground', 'sidebar-primary',
  'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  
  // Charts
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
] as const;

// Theme applies via CSS custom properties
// <html style="--primary: oklch(0.5 0.2 260); ...">
```

---

### Task 8.1.1: Create ThemeDefinition Model

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Phase 7 complete

#### Schema:
```prisma
model ThemeDefinition {
  id            String    @id @default(cuid())
  slug          String    @unique
  name          String
  description   String    @db.Text
  
  // Author
  authorId      String?   @map("author_id")  // Developer ID (null = official)
  isOfficial    Boolean   @default(false) @map("is_official")
  
  // Pricing (for marketplace)
  price         Decimal   @default(0) @db.Decimal(10, 2)
  priceType     String    @default("FREE") // FREE, ONE_TIME
  
  // Theme mode support
  mode          String    @default("both")  // light, dark, both
  
  // CSS Variables (JSON)
  // { light: { primary: '...', ... }, dark: { primary: '...', ... } }
  variables     Json
  
  // Which variables can users customize
  customizable  String[]
  
  // Preview colors (for thumbnail)
  // { primary: '#000', background: '#fff' }
  preview       Json
  
  // Stats
  installCount  Int       @default(0) @map("install_count")
  
  // Status
  isActive      Boolean   @default(true) @map("is_active")
  
  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  // Relations
  author        Developer? @relation(fields: [authorId], references: [id])
  userThemes    UserTheme[]
  
  @@index([isActive])
  @@index([isOfficial])
  @@map("theme_definitions")
}
```

#### Done Criteria:
- [ ] ThemeDefinition model created
- [ ] Variables JSON field for CSS vars
- [ ] Preview field for thumbnails
- [ ] Migration applied

---

### Task 8.1.2: Create UserTheme Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 8.1.1 complete

#### Schema:
```prisma
model UserTheme {
  id              String          @id @default(cuid())
  userId          String          @map("user_id")
  themeId         String          @map("theme_id")
  
  // Organization context (for org-wide themes)
  organizationId  String?         @map("organization_id")
  
  // Custom overrides (user's tweaks)
  customVars      Json?           @map("custom_vars")
  
  // Status
  isActive        Boolean         @default(true) @map("is_active")
  
  // Timestamps
  activatedAt     DateTime        @default(now()) @map("activated_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  
  // Relations
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  theme           ThemeDefinition @relation(fields: [themeId], references: [id])
  organization    Organization?   @relation(fields: [organizationId], references: [id])
  
  // One active theme per context
  @@unique([userId, organizationId])
  @@index([themeId])
  @@map("user_themes")
}
```

#### Done Criteria:
- [ ] UserTheme model created
- [ ] Organization support for org-wide themes
- [ ] One active theme per context (user or org)
- [ ] Custom overrides JSON field

---

### Task 8.1.3: Create Theme Definition Schema

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 8.1.2 complete

#### Deliverables:
- [ ] src/shared/types/theme.ts
- [ ] src/shared/schemas/theme.schema.ts

#### Types:
```typescript
// src/shared/types/theme.ts

export const THEME_VARIABLES = [
  'background', 'foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
  'border', 'input', 'ring', 'radius',
  'sidebar-background', 'sidebar-foreground', 'sidebar-primary',
  'sidebar-primary-foreground', 'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
] as const;

export type ThemeVariable = typeof THEME_VARIABLES[number];

export type ThemeMode = 'light' | 'dark' | 'both';

export interface ThemeVariables {
  light?: Partial<Record<ThemeVariable, string>>;
  dark?: Partial<Record<ThemeVariable, string>>;
}

export interface ThemeDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  mode: ThemeMode;
  variables: ThemeVariables;
  customizable: ThemeVariable[];
  preview: {
    primary: string;
    background: string;
  };
  isOfficial: boolean;
  price: number;
}

export interface ActiveTheme {
  definition: ThemeDefinition;
  customVars?: Partial<Record<ThemeVariable, string>>;
}

export interface AppliedThemeCSS {
  light: string;  // CSS for light mode
  dark: string;   // CSS for dark mode
}
```

#### Validation Schema:
```typescript
// src/shared/schemas/theme.schema.ts
import { z } from 'zod';

export const themeVariablesSchema = z.object({
  light: z.record(z.string()).optional(),
  dark: z.record(z.string()).optional(),
});

export const createThemeSchema = z.object({
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(500),
  mode: z.enum(['light', 'dark', 'both']),
  variables: themeVariablesSchema,
  customizable: z.array(z.enum(THEME_VARIABLES as any)),
  preview: z.object({
    primary: z.string(),
    background: z.string(),
  }),
});

export const customVarsSchema = z.record(z.string());
```

#### Done Criteria:
- [ ] Theme types defined
- [ ] Variables match globals.css
- [ ] Zod schemas for validation
- [ ] Export from shared module

---

### Task 8.2.1: Create Theme Service

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 8.1.3 complete

#### Deliverables:
- [ ] src/modules/theme/theme.service.ts
- [ ] src/modules/theme/theme.types.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';

class ThemeService {
  // ===== Available Themes =====
  async getAvailableThemes(filters?: ThemeFilters): Promise<ThemeDefinition[]>
  
  async getThemeBySlug(slug: string): Promise<ThemeDefinition | null>
  
  async getOfficialThemes(): Promise<ThemeDefinition[]>
  
  // ===== User's Active Theme =====
  async getActiveTheme(ctx: ServiceContext): Promise<ActiveTheme | null> {
    // Get theme for current context (personal or org)
    const filter = ctx.isOrgContext()
      ? { userId: ctx.userId, organizationId: ctx.organizationId }
      : { userId: ctx.userId, organizationId: null };
    
    const userTheme = await prisma.userTheme.findUnique({
      where: { userId_organizationId: filter },
      include: { theme: true },
    });
    
    if (!userTheme) return null;
    
    return {
      definition: mapToThemeDefinition(userTheme.theme),
      customVars: userTheme.customVars as Record<string, string> | undefined,
    };
  }
  
  async setActiveTheme(
    ctx: ServiceContext,
    themeId: string
  ): Promise<UserTheme> {
    // Set theme for current context
    const data = {
      userId: ctx.userId,
      organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
      themeId,
      isActive: true,
    };
    
    return prisma.userTheme.upsert({
      where: {
        userId_organizationId: {
          userId: ctx.userId,
          organizationId: ctx.isOrgContext() ? ctx.organizationId! : null,
        },
      },
      create: data,
      update: { themeId, isActive: true },
    });
  }
  
  async removeActiveTheme(ctx: ServiceContext): Promise<void> {
    await prisma.userTheme.deleteMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
      },
    });
  }
  
  // ===== Customization =====
  async setCustomVars(
    ctx: ServiceContext,
    vars: Record<string, string>
  ): Promise<UserTheme>
  
  async resetCustomVars(ctx: ServiceContext): Promise<UserTheme>
  
  // ===== Generate CSS =====
  generateThemeCSS(theme: ActiveTheme, mode: 'light' | 'dark'): string {
    const baseVars = theme.definition.variables[mode] || {};
    const customVars = theme.customVars || {};
    const merged = { ...baseVars, ...customVars };
    
    return Object.entries(merged)
      .map(([key, value]) => `--${key}: ${value};`)
      .join('\n');
  }
}

export const themeService = new ThemeService();
```

#### Done Criteria:
- [ ] ThemeService implemented
- [ ] Context-aware (personal/org)
- [ ] Get/set active theme working
- [ ] Custom vars working
- [ ] CSS generation working

---

### Task 8.2.2: Create Theme API Endpoints

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 8.2.1 complete

#### Deliverables:
- [ ] src/server/routes/theme.routes.ts

#### Endpoints:
```typescript
// ===== Public (no auth) =====
GET    /api/themes              - List available themes
GET    /api/themes/:slug        - Get theme details

// ===== Authenticated =====
GET    /api/user/theme          - Get active theme for current context
PUT    /api/user/theme          - Set active theme
       Body: { themeId: string }
DELETE /api/user/theme          - Remove active theme (use default)

PUT    /api/user/theme/custom   - Set custom variable overrides
       Body: { vars: Record<string, string> }
DELETE /api/user/theme/custom   - Reset custom overrides

// ===== Response: Active Theme =====
{
  definition: {
    id: "...",
    slug: "ocean-breeze",
    name: "Ocean Breeze",
    mode: "both",
    variables: { light: {...}, dark: {...} },
    customizable: ["primary", "accent"],
  },
  customVars: {
    primary: "oklch(0.6 0.15 220)"
  }
}
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth middleware applied
- [ ] Context isolation working
- [ ] Validation working

---

### Task 8.2.3: Create Theme CSS Generator

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 8.2.2 complete

#### Deliverables:
- [ ] GET /api/user/theme/css endpoint
- [ ] Or include in theme response

#### Implementation:
```typescript
// Option 1: Separate CSS endpoint
router.get('/user/theme/css', requireAuth, async (req, res) => {
  const ctx = createServiceContext(req.user, req);
  const theme = await themeService.getActiveTheme(ctx);
  
  if (!theme) {
    return res.type('text/css').send('/* No theme active */');
  }
  
  const lightCSS = themeService.generateThemeCSS(theme, 'light');
  const darkCSS = themeService.generateThemeCSS(theme, 'dark');
  
  const css = `
    :root {
      ${lightCSS}
    }
    .dark {
      ${darkCSS}
    }
  `;
  
  res.type('text/css').send(css);
});

// Option 2: Include CSS in theme response
{
  definition: {...},
  customVars: {...},
  css: {
    light: "--primary: ...; --background: ...;",
    dark: "--primary: ...; --background: ...;"
  }
}
```

#### Done Criteria:
- [ ] CSS generation working
- [ ] Light/dark mode support
- [ ] Custom vars merged correctly

---

### Task 8.3.1: Create Theme Browser Page

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 8.2.3 complete

#### Deliverables:
- [ ] src/app/(dashboard)/themes/page.tsx
- [ ] src/components/theme/theme-card.tsx

#### Implementation:
```tsx
export default function ThemesPage() {
  const { data: themes } = useSWR('/api/themes');
  const { data: activeTheme, mutate } = useSWR('/api/user/theme');
  
  const handleApply = async (themeId: string) => {
    await fetch('/api/user/theme', {
      method: 'PUT',
      body: JSON.stringify({ themeId }),
    });
    mutate();
    toast.success('Theme applied!');
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Themes</h1>
        <p className="text-muted-foreground">
          Customize your dashboard appearance
        </p>
      </div>
      
      {/* Active Theme */}
      {activeTheme && (
        <Card>
          <CardHeader>
            <CardTitle>Current Theme</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <ThemePreviewSwatch theme={activeTheme.definition} />
            <div>
              <p className="font-medium">{activeTheme.definition.name}</p>
              <p className="text-sm text-muted-foreground">
                {activeTheme.definition.description}
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/themes/customize')}>
              Customize
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Available Themes */}
      <div className="grid grid-cols-3 gap-4">
        {themes?.map(theme => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            isActive={activeTheme?.definition.id === theme.id}
            onApply={() => handleApply(theme.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

#### Done Criteria:
- [ ] Shows available themes
- [ ] Shows current active theme
- [ ] Can apply theme
- [ ] Preview swatches

---

### Task 8.3.2: Create Theme Preview Component

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 8.3.1 complete

#### Deliverables:
- [ ] src/components/theme/theme-preview.tsx

#### Implementation:
```tsx
interface ThemePreviewProps {
  theme: ThemeDefinition;
  isActive: boolean;
  onApply: () => void;
}

export function ThemePreview({ theme, isActive, onApply }: ThemePreviewProps) {
  const [previewing, setPreviewing] = useState(false);
  
  // Apply theme temporarily on hover
  useEffect(() => {
    if (!previewing) return;
    
    const root = document.documentElement;
    const originalVars: Record<string, string> = {};
    
    // Save originals
    for (const key of THEME_VARIABLES) {
      originalVars[key] = getComputedStyle(root).getPropertyValue(`--${key}`);
    }
    
    // Apply preview
    const isDark = root.classList.contains('dark');
    const vars = theme.variables[isDark ? 'dark' : 'light'] || {};
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, value);
    }
    
    return () => {
      // Restore originals
      for (const [key, value] of Object.entries(originalVars)) {
        if (value) {
          root.style.setProperty(`--${key}`, value);
        } else {
          root.style.removeProperty(`--${key}`);
        }
      }
    };
  }, [previewing, theme]);
  
  return (
    <Card className={cn(isActive && 'ring-2 ring-primary')}>
      {/* Color swatches */}
      <div className="h-20 flex rounded-t-lg overflow-hidden">
        <div 
          className="flex-1" 
          style={{ backgroundColor: theme.preview.background }} 
        />
        <div 
          className="flex-1" 
          style={{ backgroundColor: theme.preview.primary }} 
        />
      </div>
      
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{theme.name}</CardTitle>
          {theme.isOfficial && (
            <Badge variant="secondary">Official</Badge>
          )}
        </div>
        <CardDescription>{theme.description}</CardDescription>
      </CardHeader>
      
      <CardFooter className="gap-2">
        <Button 
          variant="outline"
          className="flex-1"
          onMouseEnter={() => setPreviewing(true)}
          onMouseLeave={() => setPreviewing(false)}
        >
          Preview
        </Button>
        <Button 
          className="flex-1"
          disabled={isActive}
          onClick={onApply}
        >
          {isActive ? 'Active' : 'Apply'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

#### Done Criteria:
- [ ] Preview on hover
- [ ] Restores original on mouse leave
- [ ] Apply button works
- [ ] Shows active state

---

### Task 8.3.3: Create Theme Customizer

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 8.3.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/themes/customize/page.tsx
- [ ] src/components/theme/color-picker.tsx

#### Implementation:
```tsx
export default function ThemeCustomizerPage() {
  const { data: activeTheme, mutate } = useSWR('/api/user/theme');
  const [customVars, setCustomVars] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  useEffect(() => {
    if (activeTheme?.customVars) {
      setCustomVars(activeTheme.customVars);
    }
  }, [activeTheme]);
  
  // Live preview
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(customVars)) {
      root.style.setProperty(`--${key}`, value);
    }
  }, [customVars]);
  
  const handleSave = async () => {
    await fetch('/api/user/theme/custom', {
      method: 'PUT',
      body: JSON.stringify({ vars: customVars }),
    });
    mutate();
    setHasChanges(false);
    toast.success('Theme customizations saved!');
  };
  
  const handleReset = async () => {
    await fetch('/api/user/theme/custom', { method: 'DELETE' });
    setCustomVars({});
    mutate();
    toast.success('Reset to theme defaults');
  };
  
  if (!activeTheme) {
    return (
      <div className="text-center py-12">
        <p>No theme selected. Choose a theme first.</p>
        <Button onClick={() => router.push('/themes')}>
          Browse Themes
        </Button>
      </div>
    );
  }
  
  const { definition } = activeTheme;
  
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customize {definition.name}</h1>
          <p className="text-muted-foreground">
            Adjust colors to match your brand
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Customizable Colors</CardTitle>
          <CardDescription>
            These colors can be adjusted for this theme
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {definition.customizable.map(varName => (
            <div key={varName} className="flex items-center justify-between">
              <Label className="capitalize">
                {varName.replace(/-/g, ' ')}
              </Label>
              <ColorPicker
                value={customVars[varName] || definition.variables.light?.[varName]}
                onChange={(color) => {
                  setCustomVars(prev => ({ ...prev, [varName]: color }));
                  setHasChanges(true);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      
      {/* Preview panel */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button>Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="destructive">Destructive Button</Button>
            <Input placeholder="Input field" />
            <Badge>Badge</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Done Criteria:
- [ ] Shows customizable variables
- [ ] Color pickers work
- [ ] Live preview
- [ ] Save customizations
- [ ] Reset to defaults

---

### Task 8.4.1: Create Official Themes

**Session Type:** Design
**Estimated Time:** 45 minutes
**Prerequisites:** Task 8.3.3 complete

#### Built-in Themes:
```typescript
const OFFICIAL_THEMES: ThemeDefinitionCreate[] = [
  {
    slug: 'default',
    name: 'Default',
    description: 'Clean neutral theme with great readability',
    mode: 'both',
    isOfficial: true,
    variables: {
      light: {
        background: '0 0% 100%',
        foreground: '0 0% 3.9%',
        primary: '0 0% 9%',
        // ... matches current globals.css
      },
      dark: {
        background: '0 0% 3.9%',
        foreground: '0 0% 98%',
        primary: '0 0% 98%',
        // ...
      },
    },
    customizable: ['primary', 'accent'],
    preview: { primary: '#171717', background: '#ffffff' },
  },
  {
    slug: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Calming blue tones inspired by the sea',
    mode: 'both',
    isOfficial: true,
    variables: {
      light: {
        primary: 'oklch(0.5 0.15 230)',
        accent: 'oklch(0.7 0.12 200)',
        // ...
      },
      dark: {
        primary: 'oklch(0.7 0.15 230)',
        // ...
      },
    },
    customizable: ['primary', 'accent', 'background'],
    preview: { primary: '#3b82f6', background: '#f0f9ff' },
  },
  {
    slug: 'forest-green',
    name: 'Forest Green',
    description: 'Natural green palette for a calming workspace',
    mode: 'both',
    isOfficial: true,
    variables: {
      light: {
        primary: 'oklch(0.5 0.15 145)',
        accent: 'oklch(0.6 0.12 160)',
      },
    },
    customizable: ['primary', 'accent'],
    preview: { primary: '#22c55e', background: '#f0fdf4' },
  },
  {
    slug: 'sunset-orange',
    name: 'Sunset Orange',
    description: 'Warm and energetic orange theme',
    mode: 'both',
    isOfficial: true,
    variables: {
      light: {
        primary: 'oklch(0.6 0.2 30)',
        accent: 'oklch(0.7 0.15 45)',
      },
    },
    customizable: ['primary', 'accent'],
    preview: { primary: '#f97316', background: '#fff7ed' },
  },
  {
    slug: 'midnight-purple',
    name: 'Midnight Purple',
    description: 'Deep purple theme for night owls',
    mode: 'dark',
    isOfficial: true,
    variables: {
      dark: {
        background: 'oklch(0.15 0.05 280)',
        primary: 'oklch(0.6 0.2 280)',
        accent: 'oklch(0.5 0.15 300)',
      },
    },
    customizable: ['primary', 'accent'],
    preview: { primary: '#a855f7', background: '#1e1b4b' },
  },
];
```

#### Done Criteria:
- [ ] 5 official themes designed
- [ ] Light + dark variants
- [ ] OKLCH color format used
- [ ] Preview colors accurate

---

### Task 8.4.2: Seed Themes to Database

**Session Type:** Database
**Estimated Time:** 15 minutes
**Prerequisites:** Task 8.4.1 complete

#### Deliverables:
- [ ] prisma/seed-themes.ts
- [ ] Add to main seed script

#### Implementation:
```typescript
// prisma/seed-themes.ts

import { prisma } from '../src/lib/prisma';
import { OFFICIAL_THEMES } from './theme-data';

export async function seedThemes() {
  console.log('Seeding themes...');
  
  for (const theme of OFFICIAL_THEMES) {
    await prisma.themeDefinition.upsert({
      where: { slug: theme.slug },
      create: theme,
      update: theme,
    });
  }
  
  console.log(`Seeded ${OFFICIAL_THEMES.length} themes`);
}
```

#### Done Criteria:
- [ ] Seed script created
- [ ] Themes appear in database
- [ ] Upsert prevents duplicates

---

## ✅ Phase 8 Completion Checklist

### Theme Models
- [ ] ThemeDefinition model created
- [ ] UserTheme model with org support
- [ ] Theme types/schemas defined

### Theme Service
- [ ] Get available themes working
- [ ] Get/set active theme working
- [ ] Custom vars working
- [ ] CSS generation working

### Theme UI
- [ ] Theme browser page
- [ ] Theme preview on hover
- [ ] Theme customizer
- [ ] Color pickers

### Built-in Themes
- [ ] 5 official themes created
- [ ] Themes seeded to database
- [ ] All themes working

### Integration
- [ ] Works for personal context
- [ ] Works for organization context
- [ ] Theme persists across sessions
- [ ] Custom vars saved correctly

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Theme Models | 3 | 70 min |
| Theme Service | 3 | 85 min |
| Theme UI | 3 | 105 min |
| Built-in Themes | 2 | 60 min |
| **Total** | **11** | **~5-6 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 9 (Widget System)
