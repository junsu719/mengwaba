# MENGWABA「悶蛙吧」CIS + UI/UX Redesign Specification

## 0. Project Overview

專案名稱：

**悶蛙吧 MENGWABA**

目前網站：

- https://mengwaba.com/
- https://mengwaba.com/trash/kaohsiung/lingya/8A78ED9466/

目前主要功能：

- 台灣生活資訊工具
- 目前核心功能為「垃圾車清運時間查詢」

本次任務不是單純美化 UI，而是：

> 將 MENGWABA 從「垃圾車查詢網站」重新定位成「台灣生活工具品牌」。

網站未來應能持續加入：

- 垃圾車
- 薪資／加班費試算
- 日期／國定假日
- 交通
- 停車
- 居家
- 回收
- 水電
- 其他台灣日常生活工具

因此本次設計必須具備可擴充性。

---

# 1. Core Brand Positioning

## Brand Name

中文：

**悶蛙吧**

英文：

**MENGWABA**

## Brand Concept

「生活有點麻煩，來悶蛙吧。」

品牌核心：

> 把台灣生活中那些瑣碎、麻煩、需要查資料的事情，整理成簡單、快速、好用的工具。

品牌不是：

- 政府資訊網站
- 新聞網站
- 內容農場
- SaaS Dashboard
- 純可愛吉祥物網站

品牌應該呈現：

**台灣生活感 × 工具感 × 設計感 × 一點幽默**

---

# 2. Design Personality

視覺方向：

- Modern
- Friendly
- Practical
- Slightly playful
- Taiwanese everyday life
- Designer-made
- Clean
- Warm
- Human

避免：

- 過度企業化
- 過度政府網站感
- 過度 Apple 化
- 過度 SaaS 化
- 大量漸層
- 大量玻璃效果
- 過度卡通化
- 大量青蛙插圖
- 廉價 App UI 感

核心原則：

> 「看起來有設計，但使用者不應該感覺自己正在使用一個設計作品。」

功能優先。

---

# 3. Visual Identity

## 3.1 Primary Color

建議主品牌色：

```text
Frog Green
#78B82A
```

此色不是螢光綠。

應該偏：

- 自然
- 清爽
- 生活
- 有辨識度

## 3.2 Base Colors

```text
Ink
#202522

Warm White
#F7F5EF

Soft Gray
#E6E4DC

White
#FFFFFF
```

不要讓整個網站變成純白背景。

建議使用 Warm White 作為主要頁面背景。

---

# 4. Functional Accent Colors

未來不同工具可以有自己的 accent color。

但所有工具必須共用 MENGWABA Design System。

例如：

- Trash → Green
- Finance → Orange
- Transportation → Blue
- Weather → Purple
- Home → Yellow

注意：

Accent color 只能用於：

- Icon
- Status
- CTA
- Highlight
- Small decorative element

不能讓每個工具變成完全不同的網站。

---

# 5. Typography

主要中文：

```text
Noto Sans TC
```

英文與數字：

```text
Inter
```

Typography 原則：

- 高可讀性
- 大量留白
- 不使用過度裝飾字體
- 數字資訊需要具有明確視覺層級

垃圾車時間尤其重要。

例如：

```text
21:24
```

應該是頁面中最醒目的資訊之一。

---

# 6. Logo Direction

不要設計一隻完整的卡通青蛙作為 Logo。

應採用：

> 「抽象青蛙識別」

方向：

- Frog eyes
- Frog mouth
- M / W 幾何結構
- 簡化的青蛙輪廓
- 幾何符號

Logo 必須：

- 小尺寸仍可辨識
- 可以當 favicon
- 可以當 mobile app icon
- 可以單獨使用 symbol
- 可以與 MENGWABA wordmark 組合

Logo 應避免：

- 複雜插畫
- 過多細節
- 可愛幼兒園風格

---

# 7. Frog Character System

可以建立「蛙蛙」作為品牌輔助角色。

但：

> 吉祥物不是主視覺。

蛙蛙只在特定情境出現：

### Loading

「蛙蛙正在幫你找資料……」

### Empty State

「蛙蛙也找不到這個地方。」

### Error

「糟糕，蛙蛙迷路了。」

### Data Updated

「蛙蛙確認過了。」

角色風格：

- 極簡
- 幾何
- 小尺寸
- 不要大面積卡通插畫

---

# 8. Design System

建立可重複使用的 Design System。

## 8.1 Border Radius

推薦：

```text
Small: 10px
Medium: 16px
Large: 20px
XL: 28px
```

避免整個網站所有東西都使用相同 radius。

---

# 9. Card System

建立至少：

### Standard Card

用於：

- 工具
- 資訊
- 地點

### Featured Card

用於：

- 下一班垃圾車
- 主要 CTA

### Status Card

用於：

- 今天有收運
- 即將到站
- 無服務

### Tool Card

用於首頁工具入口。

---

# 10. Buttons

建立：

### Primary

品牌綠。

### Secondary

淺色背景＋深色文字。

### Ghost

透明。

### Icon Button

搜尋、定位、分享等。

所有按鈕：

- 觸控區域至少 44px
- Mobile 友善
- 清楚 hover / active / disabled 狀態

---

# 11. Iconography

Icon 使用：

- Lucide
- 或現有專案已使用的 icon system

不要混用大量不同 icon style。

Icon 原則：

- outline
- simple
- rounded
- consistent stroke width

避免 emoji 作為主要 UI icon。

Emoji 可以作為品牌語氣或 secondary visual。

---

# 12. Homepage Redesign

目前首頁的核心問題：

> 看起來像「工具列表」，而不是一個品牌入口。

需要重新設計首頁。

---

## 12.1 Hero

推薦架構：

```text
悶蛙吧

台灣人的生活小工具箱

生活有點麻煩，
來悶蛙吧。

[ 搜尋你想查的東西... ]
```

搜尋框是主要 CTA。

搜尋 placeholder：

```text
試試「垃圾車」、「薪資」、「國定假日」...
```

---

# 13. Homepage Tool Categories

首頁應該開始建立分類。

例如：

- 垃圾車
- 薪資試算
- 國定假日
- 交通
- 居家
- 回收

目前尚未實作的工具不要假裝存在。

可以顯示：

```text
即將推出
```

但不要建立假的功能頁。

---

# 14. Homepage Trash Feature

垃圾車是目前唯一成熟工具。

因此首頁應給它最高曝光。

例如：

```text
🚛 垃圾車

今天幾點來？

輸入地址
[ 查詢垃圾車 ]
```

也可以使用：

```text
尋找附近垃圾車
```

如果目前沒有定位功能，不要自行增加需要後端支援的功能。

---

# 15. Garbage Truck Page Redesign

Target URL：

```text
/trash/kaohsiung/lingya/8A78ED9466/
```

這個頁面是本次 redesign 的核心。

---

# 16. Garbage Page Information Hierarchy

優先順序：

1. 地點
2. 今天有沒有收運
3. 下一班時間
4. 等待時間
5. 本週時刻
6. 詳細資訊

不要讓使用者需要閱讀大量文字才能找到時間。

---

# 17. Garbage Page Hero

推薦：

```text
🚛 垃圾車

凱旋三路367巷口

今天

21:24
～
21:27

● 今天有收運
```

如果可以根據目前時間計算：

```text
還有 32 分鐘
```

但：

> 不要自行建立錯誤的時間計算。

只有在現有資料與系統時間能可靠支援時才顯示。

---

# 18. Next Collection Card

建立核心 UI：

```text
下一班垃圾車

今天 21:24

21:24
```

可以加入：

```text
距離現在約 XX 分鐘
```

如果當天沒有垃圾車：

```text
今天沒有垃圾車

下一班：
週二 21:24
```

---

# 19. Weekly Schedule

目前的星期列表應重新設計。

推薦：

```text
本週清運時間

一   二   三   四   五   六   日
●   ●   —   ●   ●   ●   —
```

選擇某一天後顯示：

```text
週一
21:24 – 21:27
```

Mobile 必須容易操作。

---

# 20. Location Information

建立：

```text
📍 清運地點

凱旋三路367巷口

高雄市苓雅區

[ 在地圖查看 ]
```

如果現有專案已有地圖功能則整合。

如果沒有，不要自行新增第三方 API。

---

# 21. Data Source

建立：

```text
資料來源
高雄市政府 / 現有資料來源
```

具體文字應依現有網站實際資料來源。

不要虛構資料來源。

---

# 22. Responsive Design

必須同時支援：

### Mobile

主要使用情境。

### Tablet

### Desktop

Mobile 優先。

垃圾車頁面在手機上必須能做到：

> 打開 → 看到今天時間

目標：

**3 秒內找到答案。**

---

# 23. Mobile Navigation

建議：

```text
Logo        🔍
```

或：

```text
悶蛙吧     搜尋
```

如果未來工具數量增加，再加入：

```text
首頁
工具
搜尋
更多
```

不要目前就建立複雜 navigation。

---

# 24. Desktop Navigation

推薦：

```text
悶蛙吧

首頁
生活工具
關於悶蛙吧

                搜尋
```

保持簡單。

---

# 25. Search Experience

搜尋會是未來網站的核心。

設計系統必須預留：

```text
搜尋工具
搜尋地點
搜尋生活資訊
```

例如：

```text
搜尋「垃圾車」

→ 垃圾車查詢

搜尋「苓雅區」

→ 高雄市苓雅區垃圾車

搜尋「加班」

→ 加班費試算
```

目前如果後端尚未支援 global search：

> 先設計 UI，但不要製作假的搜尋功能。

---

# 26. SEO

不要破壞目前 SEO URL structure。

尤其：

```text
/trash/kaohsiung/lingya/8A78ED9466/
```

必須保持可用。

不要因為 redesign 而任意更改 URL。

如果需要更改：

- 建立 301 redirect
- 保留原 URL SEO value

每個工具頁應預留：

- Title
- Description
- canonical
- Open Graph
- structured data

---

# 27. Performance

禁止因為 redesign 引入大量：

- 動畫
- WebGL
- 大型背景影片
- 大型圖片
- 不必要 JS library

網站本質是工具。

因此：

> Performance > Visual effects

---

# 28. Animation

只使用微互動。

例如：

- Card hover
- Button press
- Search focus
- Page transition
- Loading
- Status change

Animation：

```text
150–250ms
```

避免：

- 大型 parallax
- 滾動動畫
- 複雜 3D
- 過度 bouncing

---

# 29. Accessibility

至少做到：

- 正確 semantic HTML
- keyboard navigation
- focus state
- aria-label
- color contrast
- touch target >= 44px
- 不依賴顏色判斷資訊

例如：

不能只有：

```text
🟢
```

代表今天有收運。

應該：

```text
● 今天有收運
```

---

# 30. Dark Mode

目前可以先不實作完整 Dark Mode。

但 Design Token 必須預留。

不要在 CSS 中大量 hard-code 顏色。

建立：

```text
--color-background
--color-surface
--color-text
--color-primary
--color-border
--color-accent
```

方便未來擴充。

---

# 31. Design Tokens

建立統一 tokens。

例如：

```css
--color-brand: #78B82A;
--color-ink: #202522;
--color-background: #F7F5EF;
--color-surface: #FFFFFF;
--color-border: #E6E4DC;

--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 20px;
--radius-xl: 28px;

--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

實際數值可以依現有 framework 調整。

---

# 32. Component Architecture

如果目前專案技術架構允許，建立可重用 components：

```text
Header
Footer
SearchBar
ToolCard
FeaturedToolCard
StatusBadge
InfoCard
ScheduleCard
DaySelector
LocationCard
Button
IconButton
EmptyState
LoadingState
```

不要針對單一頁面寫大量重複 CSS。

---

# 33. Important Development Rule

## 不要破壞現有功能

本次任務優先順序：

1. 保留現有功能
2. 改善 UI
3. 改善 UX
4. 建立 Design System
5. 建立未來擴充架構

不要因為重新設計而：

- 刪除資料
- 修改 API
- 修改資料結構
- 修改 URL
- 移除既有功能
- 引入不必要依賴

除非必要且確認現有架構確實需要。

---

# 34. Existing Code First

Claude Code 開始工作前：

1. 檢查專案架構
2. 找出 framework
3. 找出 routing
4. 找出 data source
5. 找出垃圾車頁面 component
6. 找出目前 CSS / Tailwind / design system
7. 找出 responsive implementation
8. 找出 SEO implementation

先理解現有程式。

不要直接重寫整個專案。

---

# 35. Implementation Strategy

## Phase 1 — Audit

先檢查現有 codebase。

輸出：

- Framework
- Component structure
- Routing
- Data flow
- CSS architecture
- Potential risks

不要先修改。

---

## Phase 2 — Design Tokens

建立 MENGWABA Design Tokens：

- Colors
- Typography
- Spacing
- Radius
- Shadows
- Breakpoints
- Component states

---

## Phase 3 — Core Components

建立核心 components。

優先：

```text
Header
SearchBar
Button
Card
StatusBadge
ToolCard
```

---

## Phase 4 — Homepage

重新設計 Homepage。

要求：

- 品牌感
- 搜尋入口
- 工具分類
- 垃圾車突出
- Mobile first

---

## Phase 5 — Garbage Truck Page

重新設計垃圾車頁面。

核心：

```text
Location
Today
Next Collection
Weekly Schedule
Location details
Data source
```

---

## Phase 6 — Responsive QA

測試：

- 375px
- 390px
- 430px
- 768px
- 1024px
- 1440px

---

# 36. Visual QA

完成後必須檢查：

### Homepage

- Header
- Hero
- Search
- Tool cards
- Footer

### Garbage page

- Location
- Next collection
- Today state
- Weekly schedule
- Location
- Data source

檢查：

- spacing
- typography
- alignment
- overflow
- mobile layout
- button size
- contrast
- visual hierarchy

---

# 37. Do Not Overdesign

非常重要。

MENGWABA 不是作品集網站。

不是 Dribbble showcase。

不是 landing page。

它是一個：

> **每天可能被打開一次的生活工具。**

因此：

### 好設計

使用者一打開：

「喔，我知道垃圾車幾點來了。」

### 壞設計

使用者一打開：

「哇，好漂亮，但我要找什麼？」

永遠優先前者。

---

# 38. Brand Keywords

整體視覺應圍繞：

```text
生活
台灣
工具
簡單
快速
親切
可靠
幽默
設計
```

不要圍繞：

```text
科技
AI
未來
企業
金融
Cyberpunk
Glassmorphism
```

---

# 39. Final Design Goal

完成後，使用者看到網站應該產生：

> 「這不是政府網站。」

> 「這也不是一般工具網站。」

> 「這是一個很懂台灣生活的工具品牌。」

並且：

> 「有事情不知道要去哪裡查，可以先來悶蛙吧。」

---

# 40. Final Deliverables

完成後請確認：

- [ ] MENGWABA brand colors
- [ ] Typography system
- [ ] Logo usage direction
- [ ] Design tokens
- [ ] Button system
- [ ] Card system
- [ ] Icon system
- [ ] Header
- [ ] Footer
- [ ] Search UI
- [ ] Homepage redesign
- [ ] Garbage truck page redesign
- [ ] Mobile responsive
- [ ] Desktop responsive
- [ ] Accessibility basics
- [ ] SEO preservation
- [ ] Existing functionality preserved

---

# 41. Important Final Instruction

不要只把目前網站「換皮」。

請把它視為：

> **MENGWABA 第一版 Design System + Brand Identity + Product UI**

設計必須考慮未來增加 10～20 個生活工具之後仍然成立。

最終結果應該讓「垃圾車」只是第一個工具，而不是讓整個品牌看起來像「垃圾車網站」。

**Brand first → Product second → Tool third.**
