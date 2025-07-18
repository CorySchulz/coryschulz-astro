# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is an Astro 5.x static site generator project using TypeScript. The project name is "technological-singularity" and uses the basic Astro starter template with minimal configuration.

## Development Commands
```bash
npm run dev          # Start development server at localhost:4321
npm run build        # Build production site to ./dist/
npm run preview      # Preview production build locally
npm run astro ...    # Run Astro CLI commands directly
```

## Architecture & Structure
- **Astro Islands Architecture**: Components are rendered server-side by default with optional client-side hydration
- **File-based Routing**: Pages in `src/pages/` automatically become routes
- **Component Structure**: 
  - `src/layouts/` - Reusable page layouts
  - `src/components/` - Astro components
  - `src/assets/` - Optimized images and assets
  - `public/` - Static assets served as-is

## Key Technologies
- **Astro 5.12.0** with TypeScript support
- **ES Modules** configuration
- **Strict TypeScript** extending Astro's preset

## Important Notes
- Project uses ES modules (`"type": "module"` in package.json)
- TypeScript config extends `@astrojs/ts-config/strict`
- No additional integrations or frameworks currently configured
- Build output goes to `./dist/` directory
- Development server runs on port 4321 by default

## File Extensions & Patterns
- `.astro` files for Astro components
- TypeScript is used throughout with strict configuration
- Component files use PascalCase naming (e.g., `Welcome.astro`, `Layout.astro`)