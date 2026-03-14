# HuggingBox — Agent Instructions

## What This Is
A desktop app (Tauri + React + TypeScript) that lets users browse
Hugging Face models and run them locally with AI-generated Python code.

## Key Specs
- Full design spec: docs/DESIGN_SPEC.md (READ THIS FIRST)
- PRD: docs/PRD.md
- Sprint plan: docs/SPRINT_PLAN.md

## Conventions
- React + TypeScript + Tailwind CSS
- Zustand for state management
- Lucide React for icons (18px, 1.5px stroke)
- Fonts: JetBrains Mono (code/UI labels), Inter (prose)
- 4px spacing grid
- One component per file, PascalCase naming
- Dark mode default, CSS variables for theming
- See docs/DESIGN_SPEC.md Section 1 for full design system

## Project Structure
See docs/DESIGN_SPEC.md Section 9.3

## Current Sprint
Sprint 1: App Shell & UI Foundation
See docs/SPRINT_PLAN.md Sprint 1 for scope and deliverables
```

Also create a `.cursorrules` file at the repo root if you're using Cursor:
```
You are building HuggingBox, a Tauri desktop app with React + TypeScript.

Read AGENTS.md and docs/DESIGN_SPEC.md before writing any code.

Rules:
- Use Tailwind utility classes, never inline styles
- Use Zustand for all state, never useState for shared state
- Use Lucide React for all icons
- Use JetBrains Mono for code and UI labels, Inter for prose
- All colours must use CSS variables defined in the design spec
- Components go in src/components/{feature}/ one per file
- Hooks go in src/hooks/
- Services (API calls) go in src/services/
- Never make network calls to domains other than huggingface.co
- Dark mode is default
```
 
---

**Step 7: Set up your AI coding tool (10 minutes)**

If using **Claude Code**: Install it (`npm install -g @anthropic-ai/claude-code`), navigate to your repo directory, and run `claude`. It will read your AGENTS.md automatically.

If using **Cursor**: Open the repo folder in Cursor. It will read `.cursorrules` automatically. Make sure the Hugging Face MCP Server is configured — go to huggingface.co/settings/mcp, copy the config snippet, and add it to `.cursor/mcp.json` in your project.

If using **both** (recommended): Use Cursor for frontend component work and Claude Code for backend/Rust/systems work.

---

**Step 8: Set up the Hugging Face MCP Server (5 minutes)**

Go to huggingface.co/settings/mcp. You'll see a configuration snippet for your MCP client. Copy it into your Claude Code or Cursor MCP configuration. This lets your AI agent search HF models during development to verify API response shapes and test against real data.

---

**Step 9: Verify everything works (10 minutes)**

Run this checklist:

1. `npm run tauri dev` opens a window — yes/no
2. `python --version` returns 3.11+ — yes/no
3. `pip install transformers torch` succeeds — yes/no
5. Your HF token works: go to huggingface.co/meta-llama/Llama-3.1-8B and check you can see the model page (you may need to accept the license first) — yes/no
6. Git push to your repo works — yes/no

If all six pass, you're ready.

---

**Step 10: Write your Sprint 1 prompt**

When you sit down to start building, give the agent this:
```
Read AGENTS.md and docs/DESIGN_SPEC.md.

Build Sprint 1 of HuggingBox. The deliverables are:

1. Three-panel layout: Header Bar, Main Content Area, Status Bar
   (exact specs in Design Spec Section 2)
2. Browse View with search bar, filter dropdowns, and model card grid
   connected to the Hugging Face API (Design Spec Section 2.4)
3. Model Detail Phase 1 view with model info and "Generate Code" button
   (Design Spec Section 2.5)
4. Monaco Editor integrated in the workspace panel
5. Status bar showing real system RAM and GPU info
6. Dark/light theme toggle
7. CSS variables matching the design system in Section 1

The project is already scaffolded with Tauri + React + TypeScript + Tailwind.
Fonts are bundled in src/assets/fonts/.
Zustand, Monaco, and Lucide are installed.

Start by building the layout shell, then the Browse view, then the Model Detail view.