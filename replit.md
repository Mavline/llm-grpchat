# AI Group Chat

## Overview
AI Group Chat is a Next.js application that allows users to chat with multiple AI models simultaneously. Users can select which AI models to include in the conversation and interact with them in a unified chat interface.

## Project Structure
- `src/app/` - Next.js app router pages and API routes
- `src/components/` - React components (ChatContainer, MessageList, ModelSelector, etc.)
- `src/lib/` - Utility libraries (conversation engine, models, stream handler)
- `src/store/` - Zustand state management
- `src/types/` - TypeScript type definitions
- `docs/` - Documentation for API integrations (OpenAI, OpenRouter)

## Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **State Management**: Zustand
- **AI Integration**: OpenAI SDK

## Development
- Run the dev server: `next dev -H 0.0.0.0 -p 5000`
- Build for production: `npm run build`
- Start production server: `npm run start`

## Deployment
Configured for autoscale deployment on Replit with:
- Build: `npm run build`
- Start: `npm run start`
