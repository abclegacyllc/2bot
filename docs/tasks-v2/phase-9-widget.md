# Phase 9: Widget System (V2)

> **Goal:** Build customizable dashboard with drag-and-drop grid layout and marketplace-ready widgets
> **Estimated Sessions:** 8-10
> **Prerequisites:** Phase 8 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Widget Models** ||||
| 9.1.1 | Create WidgetDefinition model | ⬜ | Marketplace widgets |
| 9.1.2 | Create UserWidget model | ⬜ | User's installed widgets |
| 9.1.3 | Create DashboardLayout model | ⬜ | Grid positions |
| **Widget Service** ||||
| 9.2.1 | Create widget service | ⬜ | Install, configure |
| 9.2.2 | Create layout service | ⬜ | Grid management |
| 9.2.3 | Create widget API endpoints | ⬜ | |
| **Widget Runtime** ||||
| 9.3.1 | Create widget registry | ⬜ | Built-in widgets |
| 9.3.2 | Create widget sandbox | ⬜ | Safe execution |
| 9.3.3 | Create widget data provider | ⬜ | Data hooks |
| **Widget UI** ||||
| 9.4.1 | Create dashboard grid component | ⬜ | react-grid-layout |
| 9.4.2 | Create widget chrome | ⬜ | Header, resize, etc |
| 9.4.3 | Create widget settings dialog | ⬜ | |
| 9.4.4 | Create widget browser | ⬜ | Add widgets |
| **Built-in Widgets** ||||
| 9.5.1 | Create stats widgets | ⬜ | Bots, messages |
| 9.5.2 | Create activity widgets | ⬜ | Chart, timeline |
| 9.5.3 | Create quick action widgets | ⬜ | Shortcuts |

---

## 🧩 Widget Architecture

### Grid System

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard Grid (12 columns, responsive)                    │
│                                                             │
│  ┌───────────┐  ┌───────────────────────┐  ┌───────────┐   │
│  │  Stats    │  │     Activity Chart     │  │  Quick    │   │
│  │  Widget   │  │        (6x4)           │  │  Actions  │   │
│  │  (3x2)    │  │                        │  │  (3x2)    │   │
│  └───────────┘  └───────────────────────┘  └───────────┘   │
│                                                             │
│  ┌───────────────────┐  ┌───────────────────────────────┐  │
│  │   Recent Bots     │  │      Message Timeline         │  │
│  │      (4x3)        │  │          (8x3)                │  │
│  │                   │  │                               │  │
│  └───────────────────┘  └───────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Widget Types

```typescript
// Widget categories
type WidgetCategory = 
  | 'stats'       // Numbers, metrics
  | 'chart'       // Graphs, visualizations  
  | 'list'        // Recent items, tables
  | 'action'      // Quick actions, shortcuts
  | 'info'        // Static info, notes
  | 'custom';     // User-created

// Widget size constraints
interface WidgetSize {
  minW: number;  // Min width in grid units
  maxW: number;  // Max width
  minH: number;  // Min height
  maxH: number;  // Max height
  defaultW: number;
  defaultH: number;
}
```

### Data Flow

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│   Widget     │────▶│  Data Provider │────▶│   API/DB     │
│  Component   │     │   (SWR hook)   │     │              │
└──────────────┘     └────────────────┘     └──────────────┘
       │                                           │
       │          ┌────────────────┐               │
       └─────────▶│ Widget Config  │◀──────────────┘
                  │  (Settings)    │
                  └────────────────┘
```

---

## 📝 Detailed Tasks

---

### Task 9.1.1: Create WidgetDefinition Model

**Session Type:** Database
**Estimated Time:** 25 minutes
**Prerequisites:** Phase 8 complete

#### Schema:
```prisma
model WidgetDefinition {
  id            String    @id @default(cuid())
  slug          String    @unique
  name          String
  description   String    @db.Text
  category      String    // stats, chart, list, action, info, custom
  
  // Author
  authorId      String?   @map("author_id")
  isBuiltIn     Boolean   @default(false) @map("is_built_in")
  
  // Pricing
  price         Decimal   @default(0) @db.Decimal(10, 2)
  priceType     String    @default("FREE")
  
  // Size constraints
  minWidth      Int       @default(2) @map("min_width")
  maxWidth      Int       @default(12) @map("max_width")
  minHeight     Int       @default(2) @map("min_height")
  maxHeight     Int       @default(8) @map("max_height")
  defaultWidth  Int       @default(4) @map("default_width")
  defaultHeight Int       @default(3) @map("default_height")
  
  // Component reference (for built-in)
  componentId   String?   @map("component_id")
  
  // For marketplace widgets: sandboxed code
  code          String?   @db.Text
  
  // Configuration schema (JSON Schema)
  configSchema  Json?     @map("config_schema")
  
  // Preview image URL
  previewUrl    String?   @map("preview_url")
  
  // Stats
  installCount  Int       @default(0) @map("install_count")
  
  // Status
  isActive      Boolean   @default(true) @map("is_active")
  
  // Timestamps
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  // Relations
  author        Developer?   @relation(fields: [authorId], references: [id])
  userWidgets   UserWidget[]
  
  @@index([isBuiltIn])
  @@index([category])
  @@map("widget_definitions")
}
```

#### Done Criteria:
- [ ] WidgetDefinition model created
- [ ] Size constraints defined
- [ ] Config schema field
- [ ] Migration applied

---

### Task 9.1.2: Create UserWidget Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 9.1.1 complete

#### Schema:
```prisma
model UserWidget {
  id              String           @id @default(cuid())
  userId          String           @map("user_id")
  widgetId        String           @map("widget_id")
  
  // Organization context
  organizationId  String?          @map("organization_id")
  
  // Widget instance configuration
  config          Json?            // Widget-specific settings
  
  // Custom title override
  title           String?
  
  // Status
  isActive        Boolean          @default(true) @map("is_active")
  
  // Timestamps
  installedAt     DateTime         @default(now()) @map("installed_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")
  
  // Relations
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  widget          WidgetDefinition @relation(fields: [widgetId], references: [id])
  organization    Organization?    @relation(fields: [organizationId], references: [id])
  layoutItems     DashboardLayoutItem[]
  
  @@index([userId, organizationId])
  @@index([widgetId])
  @@map("user_widgets")
}
```

#### Done Criteria:
- [ ] UserWidget model created
- [ ] Organization support
- [ ] Config JSON field
- [ ] Migration applied

---

### Task 9.1.3: Create DashboardLayout Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Task 9.1.2 complete

#### Schema:
```prisma
// Dashboard layout per user/org
model DashboardLayout {
  id              String    @id @default(cuid())
  userId          String    @map("user_id")
  
  // Organization context
  organizationId  String?   @map("organization_id")
  
  // Layout name (for multiple dashboards - future)
  name            String    @default("Default")
  isDefault       Boolean   @default(true) @map("is_default")
  
  // Columns (responsive breakpoints stored in items)
  columns         Int       @default(12)
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization    Organization? @relation(fields: [organizationId], references: [id])
  items           DashboardLayoutItem[]
  
  @@unique([userId, organizationId, isDefault])
  @@map("dashboard_layouts")
}

// Individual widget positions
model DashboardLayoutItem {
  id          String          @id @default(cuid())
  layoutId    String          @map("layout_id")
  userWidgetId String         @map("user_widget_id")
  
  // Grid position
  x           Int
  y           Int
  w           Int             // Width in grid units
  h           Int             // Height in grid units
  
  // Responsive positions (JSON)
  // { lg: {x,y,w,h}, md: {x,y,w,h}, sm: {x,y,w,h} }
  responsive  Json?
  
  // Order for list view
  order       Int             @default(0)
  
  // Relations
  layout      DashboardLayout @relation(fields: [layoutId], references: [id], onDelete: Cascade)
  userWidget  UserWidget      @relation(fields: [userWidgetId], references: [id], onDelete: Cascade)
  
  @@unique([layoutId, userWidgetId])
  @@map("dashboard_layout_items")
}
```

#### Done Criteria:
- [ ] DashboardLayout model created
- [ ] DashboardLayoutItem for positions
- [ ] Responsive breakpoints support
- [ ] Migrations applied

---

### Task 9.2.1: Create Widget Service

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 9.1.3 complete

#### Deliverables:
- [ ] src/modules/widget/widget.service.ts

#### Methods:
```typescript
class WidgetService {
  // ===== Widget Definitions =====
  async getAvailableWidgets(filters?: WidgetFilters): Promise<WidgetDefinition[]>
  
  async getWidgetBySlug(slug: string): Promise<WidgetDefinition | null>
  
  async getBuiltInWidgets(): Promise<WidgetDefinition[]>
  
  // ===== User's Widgets =====
  async getUserWidgets(ctx: ServiceContext): Promise<UserWidgetWithDef[]> {
    return prisma.userWidget.findMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
        isActive: true,
      },
      include: { widget: true },
    });
  }
  
  async installWidget(
    ctx: ServiceContext,
    widgetId: string,
    config?: Record<string, any>
  ): Promise<UserWidget> {
    // Verify widget exists
    const widget = await prisma.widgetDefinition.findUniqueOrThrow({
      where: { id: widgetId },
    });
    
    // Check if already installed
    const existing = await prisma.userWidget.findFirst({
      where: {
        userId: ctx.userId,
        widgetId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
      },
    });
    
    if (existing) {
      throw new BadRequestError('Widget already installed');
    }
    
    // Install
    const userWidget = await prisma.userWidget.create({
      data: {
        userId: ctx.userId,
        widgetId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
        config,
      },
    });
    
    // Update install count
    await prisma.widgetDefinition.update({
      where: { id: widgetId },
      data: { installCount: { increment: 1 } },
    });
    
    return userWidget;
  }
  
  async uninstallWidget(
    ctx: ServiceContext,
    userWidgetId: string
  ): Promise<void> {
    // Verify ownership
    const userWidget = await prisma.userWidget.findFirst({
      where: {
        id: userWidgetId,
        userId: ctx.userId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
      },
    });
    
    if (!userWidget) {
      throw new NotFoundError('Widget not found');
    }
    
    // Cascade deletes layout items
    await prisma.userWidget.delete({
      where: { id: userWidgetId },
    });
  }
  
  async updateWidgetConfig(
    ctx: ServiceContext,
    userWidgetId: string,
    config: Record<string, any>
  ): Promise<UserWidget> {
    // Validate config against schema
    const userWidget = await prisma.userWidget.findFirst({
      where: { id: userWidgetId, userId: ctx.userId },
      include: { widget: true },
    });
    
    if (!userWidget) {
      throw new NotFoundError('Widget not found');
    }
    
    if (userWidget.widget.configSchema) {
      // Validate against JSON Schema
      const valid = validateConfig(config, userWidget.widget.configSchema);
      if (!valid) {
        throw new BadRequestError('Invalid widget configuration');
      }
    }
    
    return prisma.userWidget.update({
      where: { id: userWidgetId },
      data: { config },
    });
  }
}

export const widgetService = new WidgetService();
```

#### Done Criteria:
- [ ] WidgetService implemented
- [ ] Context-aware (personal/org)
- [ ] Install/uninstall working
- [ ] Config validation

---

### Task 9.2.2: Create Layout Service

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 9.2.1 complete

#### Deliverables:
- [ ] src/modules/widget/layout.service.ts

#### Methods:
```typescript
import { Layout } from 'react-grid-layout';

class LayoutService {
  // ===== Get Layout =====
  async getLayout(ctx: ServiceContext): Promise<DashboardLayoutWithItems | null> {
    return prisma.dashboardLayout.findFirst({
      where: {
        userId: ctx.userId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
        isDefault: true,
      },
      include: {
        items: {
          include: { userWidget: { include: { widget: true } } },
        },
      },
    });
  }
  
  // ===== Create Default Layout =====
  async createDefaultLayout(ctx: ServiceContext): Promise<DashboardLayout> {
    return prisma.dashboardLayout.create({
      data: {
        userId: ctx.userId,
        organizationId: ctx.isOrgContext() ? ctx.organizationId : null,
        name: 'Default',
        isDefault: true,
        columns: 12,
      },
    });
  }
  
  // ===== Add Widget to Layout =====
  async addWidgetToLayout(
    ctx: ServiceContext,
    userWidgetId: string,
    position?: { x: number; y: number; w: number; h: number }
  ): Promise<DashboardLayoutItem> {
    // Get or create layout
    let layout = await this.getLayout(ctx);
    if (!layout) {
      layout = await this.createDefaultLayout(ctx) as any;
    }
    
    // Get widget definition for default size
    const userWidget = await prisma.userWidget.findUniqueOrThrow({
      where: { id: userWidgetId },
      include: { widget: true },
    });
    
    // Calculate position (find empty spot or use provided)
    const finalPosition = position ?? this.findEmptySpot(
      layout.items,
      userWidget.widget.defaultWidth,
      userWidget.widget.defaultHeight
    );
    
    return prisma.dashboardLayoutItem.create({
      data: {
        layoutId: layout.id,
        userWidgetId,
        x: finalPosition.x,
        y: finalPosition.y,
        w: finalPosition.w ?? userWidget.widget.defaultWidth,
        h: finalPosition.h ?? userWidget.widget.defaultHeight,
      },
    });
  }
  
  // ===== Update Layout Positions =====
  async updateLayoutPositions(
    ctx: ServiceContext,
    items: Layout[]
  ): Promise<void> {
    const layout = await this.getLayout(ctx);
    if (!layout) {
      throw new NotFoundError('Layout not found');
    }
    
    // Batch update all positions
    await prisma.$transaction(
      items.map(item => 
        prisma.dashboardLayoutItem.updateMany({
          where: {
            layoutId: layout.id,
            userWidgetId: item.i, // react-grid-layout uses 'i' for id
          },
          data: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          },
        })
      )
    );
  }
  
  // ===== Remove Widget from Layout =====
  async removeFromLayout(
    ctx: ServiceContext,
    userWidgetId: string
  ): Promise<void> {
    const layout = await this.getLayout(ctx);
    if (!layout) return;
    
    await prisma.dashboardLayoutItem.deleteMany({
      where: {
        layoutId: layout.id,
        userWidgetId,
      },
    });
  }
  
  // ===== Find Empty Spot =====
  private findEmptySpot(
    items: DashboardLayoutItem[],
    width: number,
    height: number
  ): { x: number; y: number; w: number; h: number } {
    // Simple algorithm: find max Y and place below
    const maxY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    return { x: 0, y: maxY, w: width, h: height };
  }
  
  // ===== Convert to react-grid-layout format =====
  toGridLayout(items: DashboardLayoutItem[]): Layout[] {
    return items.map(item => ({
      i: item.userWidgetId,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.userWidget?.widget?.minWidth,
      maxW: item.userWidget?.widget?.maxWidth,
      minH: item.userWidget?.widget?.minHeight,
      maxH: item.userWidget?.widget?.maxHeight,
    }));
  }
}

export const layoutService = new LayoutService();
```

#### Done Criteria:
- [ ] LayoutService implemented
- [ ] Add/remove from layout
- [ ] Update positions (drag-drop)
- [ ] Grid layout conversion

---

### Task 9.2.3: Create Widget API Endpoints

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 9.2.2 complete

#### Deliverables:
- [ ] src/server/routes/widget.routes.ts

#### Endpoints:
```typescript
// ===== Widget Definitions (Public) =====
GET    /api/widgets              - List available widgets
GET    /api/widgets/:slug        - Get widget details

// ===== User's Widgets =====
GET    /api/user/widgets         - List installed widgets
POST   /api/user/widgets         - Install widget
       Body: { widgetId: string, config?: object }
PUT    /api/user/widgets/:id     - Update widget config
       Body: { config: object, title?: string }
DELETE /api/user/widgets/:id     - Uninstall widget

// ===== Dashboard Layout =====
GET    /api/user/dashboard       - Get dashboard with layout
PUT    /api/user/dashboard       - Update layout positions
       Body: { items: Array<{i,x,y,w,h}> }
POST   /api/user/dashboard/add   - Add widget to dashboard
       Body: { widgetId: string, position?: {x,y,w,h} }
DELETE /api/user/dashboard/:widgetId - Remove from dashboard

// ===== Dashboard Response =====
{
  layout: {
    id: "...",
    columns: 12,
    items: [
      {
        x: 0, y: 0, w: 3, h: 2,
        widget: {
          id: "...",
          widgetId: "...",
          config: { ... },
          definition: {
            slug: "bot-stats",
            name: "Bot Statistics",
            category: "stats",
            componentId: "BotStatsWidget"
          }
        }
      }
    ]
  }
}
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth middleware applied
- [ ] Layout sync working
- [ ] Validation working

---

### Task 9.3.1: Create Widget Registry

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 9.2.3 complete

#### Deliverables:
- [ ] src/components/widgets/registry.ts

#### Implementation:
```typescript
// src/components/widgets/registry.ts

import { ComponentType } from 'react';
import { BotStatsWidget } from './built-in/bot-stats-widget';
import { MessageChartWidget } from './built-in/message-chart-widget';
import { RecentBotsWidget } from './built-in/recent-bots-widget';
import { QuickActionsWidget } from './built-in/quick-actions-widget';
import { ActivityTimelineWidget } from './built-in/activity-timeline-widget';

export interface WidgetProps<TConfig = Record<string, any>> {
  config: TConfig;
  onConfigChange: (config: TConfig) => void;
  width: number;
  height: number;
}

export interface WidgetRegistration<TConfig = any> {
  component: ComponentType<WidgetProps<TConfig>>;
  defaultConfig: TConfig;
  settingsComponent?: ComponentType<{
    config: TConfig;
    onChange: (config: TConfig) => void;
  }>;
}

// Built-in widget registry
const WIDGET_REGISTRY: Record<string, WidgetRegistration> = {
  'bot-stats': {
    component: BotStatsWidget,
    defaultConfig: { showInactive: false },
  },
  'message-chart': {
    component: MessageChartWidget,
    defaultConfig: { period: '7d', chartType: 'bar' },
    settingsComponent: MessageChartSettings,
  },
  'recent-bots': {
    component: RecentBotsWidget,
    defaultConfig: { limit: 5 },
  },
  'quick-actions': {
    component: QuickActionsWidget,
    defaultConfig: { actions: ['create-bot', 'view-analytics'] },
  },
  'activity-timeline': {
    component: ActivityTimelineWidget,
    defaultConfig: { limit: 10 },
  },
};

export function getWidgetComponent(componentId: string): WidgetRegistration | null {
  return WIDGET_REGISTRY[componentId] || null;
}

export function getAllBuiltInWidgets(): string[] {
  return Object.keys(WIDGET_REGISTRY);
}
```

#### Done Criteria:
- [ ] Widget registry created
- [ ] Built-in widgets registered
- [ ] Settings components supported
- [ ] Type-safe config

---

### Task 9.3.2: Create Widget Sandbox

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 9.3.1 complete

#### Deliverables:
- [ ] src/components/widgets/widget-sandbox.tsx

#### Implementation:
```typescript
// For marketplace widgets (user-submitted code)
// Uses iframe sandbox for security

interface WidgetSandboxProps {
  code: string;
  config: Record<string, any>;
  width: number;
  height: number;
  onMessage: (message: any) => void;
}

export function WidgetSandbox({ code, config, width, height, onMessage }: WidgetSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  useEffect(() => {
    if (!iframeRef.current) return;
    
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;
    
    // Inject widget code into sandboxed iframe
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, sans-serif; }
        </style>
      </head>
      <body>
        <div id="widget-root"></div>
        <script>
          const config = ${JSON.stringify(config)};
          const width = ${width};
          const height = ${height};
          
          // Send message to parent
          function postMessage(type, data) {
            window.parent.postMessage({ type, data }, '*');
          }
          
          // Widget code
          ${code}
        </script>
      </body>
      </html>
    `;
    
    doc.open();
    doc.write(html);
    doc.close();
  }, [code, config, width, height]);
  
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow) {
        onMessage(event.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);
  
  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      style={{ width, height, border: 'none' }}
      title="Widget Sandbox"
    />
  );
}
```

#### Note:
> For V2, marketplace widgets can be sandboxed JavaScript
> Built-in widgets use React components directly

#### Done Criteria:
- [ ] Sandbox iframe created
- [ ] Config injection working
- [ ] Message passing working
- [ ] Security restricted

---

### Task 9.3.3: Create Widget Data Provider

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 9.3.2 complete

#### Deliverables:
- [ ] src/components/widgets/widget-data-hooks.ts

#### Implementation:
```typescript
// Data hooks for built-in widgets

import useSWR from 'swr';

// Bot statistics
export function useBotStats() {
  return useSWR('/api/user/bots/stats', {
    refreshInterval: 60000, // Refresh every minute
  });
}

// Message statistics
export function useMessageStats(period: '7d' | '30d' | '90d' = '7d') {
  return useSWR(`/api/user/messages/stats?period=${period}`, {
    refreshInterval: 300000, // 5 minutes
  });
}

// Recent bots
export function useRecentBots(limit = 5) {
  return useSWR(`/api/user/bots?limit=${limit}&sort=updatedAt:desc`);
}

// Activity timeline
export function useActivityTimeline(limit = 10) {
  return useSWR(`/api/user/activity?limit=${limit}`);
}

// Organization stats (for org context)
export function useOrgStats(orgId?: string) {
  return useSWR(orgId ? `/api/organizations/${orgId}/stats` : null);
}

// Generic widget data hook
export function useWidgetData(endpoint: string, options?: SWRConfiguration) {
  return useSWR(endpoint, options);
}
```

#### Done Criteria:
- [ ] Data hooks created
- [ ] SWR caching configured
- [ ] Refresh intervals set
- [ ] Org context supported

---

### Task 9.4.1: Create Dashboard Grid Component

**Session Type:** Frontend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 9.3.3 complete

#### Dependencies:
```bash
npm install react-grid-layout
npm install -D @types/react-grid-layout
```

#### Deliverables:
- [ ] src/components/widgets/dashboard-grid.tsx

#### Implementation:
```tsx
import { useState, useCallback } from 'react';
import GridLayout, { Layout, WidthProvider } from 'react-grid-layout';
import { WidgetChrome } from './widget-chrome';
import { getWidgetComponent } from './registry';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGrid = WidthProvider(GridLayout);

interface DashboardGridProps {
  layout: DashboardLayoutWithItems;
  onLayoutChange: (layout: Layout[]) => void;
  onRemoveWidget: (userWidgetId: string) => void;
  onConfigureWidget: (userWidgetId: string) => void;
  isEditing?: boolean;
}

export function DashboardGrid({
  layout,
  onLayoutChange,
  onRemoveWidget,
  onConfigureWidget,
  isEditing = false,
}: DashboardGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  
  const gridLayout = layout.items.map(item => ({
    i: item.userWidgetId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.userWidget.widget.minWidth,
    maxW: item.userWidget.widget.maxWidth,
    minH: item.userWidget.widget.minHeight,
    maxH: item.userWidget.widget.maxHeight,
  }));
  
  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    if (isDragging) return; // Wait for drag end
    onLayoutChange(newLayout);
  }, [isDragging, onLayoutChange]);
  
  return (
    <ResponsiveGrid
      className="dashboard-grid"
      layout={gridLayout}
      cols={12}
      rowHeight={80}
      isDraggable={isEditing}
      isResizable={isEditing}
      onLayoutChange={handleLayoutChange}
      onDragStart={() => setIsDragging(true)}
      onDragStop={() => setIsDragging(false)}
      draggableHandle=".widget-drag-handle"
      margin={[16, 16]}
      containerPadding={[0, 0]}
    >
      {layout.items.map(item => {
        const { userWidget } = item;
        const registration = getWidgetComponent(userWidget.widget.componentId);
        
        if (!registration) {
          return (
            <div key={item.userWidgetId}>
              <WidgetChrome
                title={userWidget.widget.name}
                isEditing={isEditing}
                onRemove={() => onRemoveWidget(item.userWidgetId)}
              >
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Widget not found
                </div>
              </WidgetChrome>
            </div>
          );
        }
        
        const WidgetComponent = registration.component;
        
        return (
          <div key={item.userWidgetId}>
            <WidgetChrome
              title={userWidget.title || userWidget.widget.name}
              isEditing={isEditing}
              hasSettings={!!registration.settingsComponent}
              onRemove={() => onRemoveWidget(item.userWidgetId)}
              onConfigure={() => onConfigureWidget(item.userWidgetId)}
            >
              <WidgetComponent
                config={userWidget.config || registration.defaultConfig}
                onConfigChange={() => {}}
                width={item.w * 80}
                height={item.h * 80 - 48} // Minus header
              />
            </WidgetChrome>
          </div>
        );
      })}
    </ResponsiveGrid>
  );
}
```

#### Done Criteria:
- [ ] react-grid-layout integrated
- [ ] Drag and drop working
- [ ] Resize working
- [ ] Widget rendering

---

### Task 9.4.2: Create Widget Chrome

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 9.4.1 complete

#### Deliverables:
- [ ] src/components/widgets/widget-chrome.tsx

#### Implementation:
```tsx
interface WidgetChromeProps {
  title: string;
  children: React.ReactNode;
  isEditing?: boolean;
  hasSettings?: boolean;
  onRemove?: () => void;
  onConfigure?: () => void;
}

export function WidgetChrome({
  title,
  children,
  isEditing = false,
  hasSettings = false,
  onRemove,
  onConfigure,
}: WidgetChromeProps) {
  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Widget Header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b",
        isEditing && "widget-drag-handle cursor-move"
      )}>
        <div className="flex items-center gap-2">
          {isEditing && (
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm truncate">{title}</span>
        </div>
        
        <div className="flex items-center gap-1">
          {hasSettings && onConfigure && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onConfigure}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {isEditing && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Widget Content */}
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </Card>
  );
}
```

#### Done Criteria:
- [ ] Widget chrome component
- [ ] Drag handle for edit mode
- [ ] Settings button
- [ ] Remove button

---

### Task 9.4.3: Create Widget Settings Dialog

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 9.4.2 complete

#### Deliverables:
- [ ] src/components/widgets/widget-settings-dialog.tsx

#### Implementation:
```tsx
interface WidgetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userWidget: UserWidgetWithDef;
  onSave: (config: Record<string, any>) => Promise<void>;
}

export function WidgetSettingsDialog({
  open,
  onOpenChange,
  userWidget,
  onSave,
}: WidgetSettingsDialogProps) {
  const registration = getWidgetComponent(userWidget.widget.componentId);
  const [config, setConfig] = useState(userWidget.config || registration?.defaultConfig || {});
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(config);
      onOpenChange(false);
      toast.success('Widget settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };
  
  const SettingsComponent = registration?.settingsComponent;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {userWidget.title || userWidget.widget.name} Settings
          </DialogTitle>
          <DialogDescription>
            Configure this widget's appearance and behavior
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* Custom title */}
          <div className="space-y-2 mb-4">
            <Label>Widget Title</Label>
            <Input
              value={config.title || ''}
              onChange={e => setConfig({ ...config, title: e.target.value })}
              placeholder={userWidget.widget.name}
            />
          </div>
          
          {/* Widget-specific settings */}
          {SettingsComponent ? (
            <SettingsComponent config={config} onChange={setConfig} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No additional settings available
            </p>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### Done Criteria:
- [ ] Settings dialog component
- [ ] Custom title field
- [ ] Widget-specific settings
- [ ] Save functionality

---

### Task 9.4.4: Create Widget Browser

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 9.4.3 complete

#### Deliverables:
- [ ] src/components/widgets/widget-browser.tsx
- [ ] src/app/(dashboard)/dashboard/widgets/page.tsx

#### Implementation:
```tsx
interface WidgetBrowserProps {
  onAddWidget: (widgetId: string) => Promise<void>;
}

export function WidgetBrowser({ onAddWidget }: WidgetBrowserProps) {
  const { data: availableWidgets } = useSWR('/api/widgets');
  const { data: installedWidgets } = useSWR('/api/user/widgets');
  const [filter, setFilter] = useState<string>('all');
  const [adding, setAdding] = useState<string | null>(null);
  
  const installedIds = new Set(
    installedWidgets?.map((w: UserWidget) => w.widgetId) || []
  );
  
  const filteredWidgets = availableWidgets?.filter((widget: WidgetDefinition) => {
    if (filter === 'all') return true;
    return widget.category === filter;
  });
  
  const handleAdd = async (widgetId: string) => {
    setAdding(widgetId);
    try {
      await onAddWidget(widgetId);
      toast.success('Widget added to dashboard');
    } finally {
      setAdding(null);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Category filter */}
      <div className="flex gap-2">
        {['all', 'stats', 'chart', 'list', 'action'].map(cat => (
          <Button
            key={cat}
            variant={filter === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>
      
      {/* Widget grid */}
      <div className="grid grid-cols-3 gap-4">
        {filteredWidgets?.map((widget: WidgetDefinition) => {
          const isInstalled = installedIds.has(widget.id);
          
          return (
            <Card key={widget.id}>
              {widget.previewUrl && (
                <div className="h-32 bg-muted rounded-t-lg">
                  <img 
                    src={widget.previewUrl} 
                    alt={widget.name}
                    className="w-full h-full object-cover rounded-t-lg"
                  />
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{widget.name}</CardTitle>
                  {widget.isBuiltIn && (
                    <Badge variant="secondary">Built-in</Badge>
                  )}
                </div>
                <CardDescription>{widget.description}</CardDescription>
              </CardHeader>
              
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isInstalled ? 'outline' : 'default'}
                  disabled={isInstalled || adding === widget.id}
                  onClick={() => handleAdd(widget.id)}
                >
                  {adding === widget.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : isInstalled ? (
                    'Already Added'
                  ) : (
                    'Add to Dashboard'
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

#### Done Criteria:
- [ ] Widget browser component
- [ ] Category filtering
- [ ] Add to dashboard
- [ ] Shows installed state

---

### Task 9.5.1: Create Stats Widgets

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 9.4.4 complete

#### Deliverables:
- [ ] src/components/widgets/built-in/bot-stats-widget.tsx
- [ ] src/components/widgets/built-in/message-stats-widget.tsx

#### Implementation:
```tsx
// Bot Stats Widget
interface BotStatsConfig {
  showInactive: boolean;
}

export function BotStatsWidget({ config, width, height }: WidgetProps<BotStatsConfig>) {
  const { data, isLoading } = useBotStats();
  
  if (isLoading) {
    return <WidgetSkeleton />;
  }
  
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <p className="text-2xl font-bold">{data?.totalBots || 0}</p>
        <p className="text-xs text-muted-foreground">Total Bots</p>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-green-500">{data?.activeBots || 0}</p>
        <p className="text-xs text-muted-foreground">Active</p>
      </div>
      {config.showInactive && (
        <div className="space-y-1">
          <p className="text-2xl font-bold text-muted-foreground">{data?.inactiveBots || 0}</p>
          <p className="text-xs text-muted-foreground">Inactive</p>
        </div>
      )}
    </div>
  );
}

// Message Stats Widget
interface MessageStatsConfig {
  period: '7d' | '30d' | '90d';
}

export function MessageStatsWidget({ config }: WidgetProps<MessageStatsConfig>) {
  const { data, isLoading } = useMessageStats(config.period);
  
  if (isLoading) {
    return <WidgetSkeleton />;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold">{data?.totalMessages?.toLocaleString() || 0}</p>
          <p className="text-sm text-muted-foreground">Messages ({config.period})</p>
        </div>
        <TrendBadge value={data?.trend || 0} />
      </div>
      {/* Mini sparkline */}
      <div className="h-12">
        <Sparkline data={data?.daily || []} />
      </div>
    </div>
  );
}
```

#### Done Criteria:
- [ ] BotStatsWidget created
- [ ] MessageStatsWidget created
- [ ] Loading skeletons
- [ ] Config options

---

### Task 9.5.2: Create Activity Widgets

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 9.5.1 complete

#### Deliverables:
- [ ] src/components/widgets/built-in/message-chart-widget.tsx
- [ ] src/components/widgets/built-in/activity-timeline-widget.tsx

#### Implementation:
```tsx
// Message Chart Widget
interface MessageChartConfig {
  period: '7d' | '30d' | '90d';
  chartType: 'bar' | 'line' | 'area';
}

export function MessageChartWidget({ config, width, height }: WidgetProps<MessageChartConfig>) {
  const { data, isLoading } = useMessageStats(config.period);
  
  if (isLoading) {
    return <WidgetSkeleton />;
  }
  
  const chartData = data?.daily?.map((d: any) => ({
    date: format(new Date(d.date), 'MMM d'),
    messages: d.count,
  })) || [];
  
  return (
    <ResponsiveContainer width="100%" height={height - 20}>
      {config.chartType === 'bar' ? (
        <BarChart data={chartData}>
          <XAxis dataKey="date" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={chartData}>
          <XAxis dataKey="date" fontSize={10} />
          <YAxis fontSize={10} />
          <Tooltip />
          <Line type="monotone" dataKey="messages" stroke="hsl(var(--primary))" />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// Activity Timeline Widget
interface ActivityTimelineConfig {
  limit: number;
}

export function ActivityTimelineWidget({ config }: WidgetProps<ActivityTimelineConfig>) {
  const { data, isLoading } = useActivityTimeline(config.limit);
  
  if (isLoading) {
    return <WidgetSkeleton />;
  }
  
  return (
    <div className="space-y-3">
      {data?.activities?.map((activity: any) => (
        <div key={activity.id} className="flex items-start gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full mt-2",
            activity.type === 'bot_created' && 'bg-green-500',
            activity.type === 'message_received' && 'bg-blue-500',
            activity.type === 'error' && 'bg-red-500',
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{activity.description}</p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### Done Criteria:
- [ ] MessageChartWidget with chart types
- [ ] ActivityTimelineWidget created
- [ ] Responsive charts
- [ ] Time formatting

---

### Task 9.5.3: Create Quick Action Widgets

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 9.5.2 complete

#### Deliverables:
- [ ] src/components/widgets/built-in/quick-actions-widget.tsx
- [ ] src/components/widgets/built-in/recent-bots-widget.tsx

#### Implementation:
```tsx
// Quick Actions Widget
interface QuickActionsConfig {
  actions: string[];
}

const AVAILABLE_ACTIONS = [
  { id: 'create-bot', label: 'Create Bot', icon: Plus, href: '/bots/new' },
  { id: 'view-analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { id: 'manage-plugins', label: 'Plugins', icon: Puzzle, href: '/plugins' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
  { id: 'docs', label: 'Documentation', icon: BookOpen, href: '/docs' },
];

export function QuickActionsWidget({ config }: WidgetProps<QuickActionsConfig>) {
  const actions = AVAILABLE_ACTIONS.filter(a => config.actions.includes(a.id));
  
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map(action => (
        <Button
          key={action.id}
          variant="outline"
          className="h-auto py-3 flex flex-col items-center gap-2"
          asChild
        >
          <Link href={action.href}>
            <action.icon className="h-5 w-5" />
            <span className="text-xs">{action.label}</span>
          </Link>
        </Button>
      ))}
    </div>
  );
}

// Recent Bots Widget
interface RecentBotsConfig {
  limit: number;
}

export function RecentBotsWidget({ config }: WidgetProps<RecentBotsConfig>) {
  const { data, isLoading } = useRecentBots(config.limit);
  
  if (isLoading) {
    return <WidgetSkeleton />;
  }
  
  return (
    <div className="space-y-2">
      {data?.bots?.slice(0, config.limit).map((bot: any) => (
        <Link
          key={bot.id}
          href={`/bots/${bot.id}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <div className={cn(
            "w-2 h-2 rounded-full",
            bot.isConnected ? 'bg-green-500' : 'bg-muted-foreground'
          )} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{bot.name}</p>
            <p className="text-xs text-muted-foreground">
              {bot.messageCount} messages
            </p>
          </div>
        </Link>
      ))}
      
      {(!data?.bots || data.bots.length === 0) && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No bots yet.{' '}
          <Link href="/bots/new" className="text-primary hover:underline">
            Create one
          </Link>
        </div>
      )}
    </div>
  );
}
```

#### Done Criteria:
- [ ] QuickActionsWidget with configurable actions
- [ ] RecentBotsWidget with links
- [ ] Empty states
- [ ] Hover interactions

---

## ✅ Phase 9 Completion Checklist

### Widget Models
- [ ] WidgetDefinition model created
- [ ] UserWidget model with org support
- [ ] DashboardLayout + DashboardLayoutItem models

### Widget Service
- [ ] Widget service working
- [ ] Layout service working
- [ ] API endpoints complete

### Widget Runtime
- [ ] Widget registry for built-ins
- [ ] Widget sandbox for marketplace
- [ ] Data hooks created

### Widget UI
- [ ] Dashboard grid with react-grid-layout
- [ ] Widget chrome (header, controls)
- [ ] Settings dialog
- [ ] Widget browser

### Built-in Widgets
- [ ] Bot stats widget
- [ ] Message stats widget
- [ ] Message chart widget
- [ ] Activity timeline widget
- [ ] Quick actions widget
- [ ] Recent bots widget

### Integration
- [ ] Drag and drop layout editing
- [ ] Persist layout changes
- [ ] Widget config saved
- [ ] Personal + org context support

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Widget Models | 3 | 65 min |
| Widget Service | 3 | 105 min |
| Widget Runtime | 3 | 90 min |
| Widget UI | 4 | 130 min |
| Built-in Widgets | 3 | 110 min |
| **Total** | **16** | **~8-10 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 10 (Marketplace)
