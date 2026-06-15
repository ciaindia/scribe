# Scribe - PLAN.md

## Version

v1.0 MVP

---

# Overview

Scribe is a reusable AI-powered knowledge assistant designed for any product.

Initial Products:

* Nmail
* EmaCloud

Future Products:

* PowerInbox
* CQuiz
* Internal Applications

Purpose:

* Product navigation
* Knowledge discovery
* Feature explanation
* Troubleshooting guidance
* Documentation assistant

The assistant must be loosely coupled from consuming applications.

---

# Technology Stack

## Backend

* Node.js
* Express.js
* Redis
* JWT
* Winston
* Axios
* Simple Git

## Frontend

* React
* Bootstrap
* Axios

## LLM

* Ollama
* Qwen 3 8B

## Documentation

* Markdown
* Git Repositories

---

# Architecture

```text
Nmail React
      |
      |
      v

Scribe Widget
      |
      |
      v

Scribe API
      |
      +-- JWT
      |
      +-- Redis
      |
      +-- Documentation Loader
      |
      +-- Ollama
      |
      +-- Git Repositories
```

---

# Repository Structure

netcore-scribe/

├── scribe-api/
├── scribe-widget/
├── deployment/
├── docs/
└── scripts/

---

# Documentation Strategy

Documentation is NOT stored in Scribe.

Documentation is maintained separately.

Repositories:

* nmail-docs
* emacloud-docs

Future:

* powerinbox-docs
* cquiz-docs

---

# Documentation Repository Example

nmail-docs/

├── monitoring/
│   └── watchdog.md
│
├── domains/
│   └── domain-management.md
│
├── users/
│   └── user-management.md
│
├── troubleshooting/
│
└── release-notes/

---

# Markdown Standard

Every document must contain metadata.

Example:

```md
---
title: Watchdog
application: nmail
module: monitoring
url: /watchdog
menu: Monitoring > Watchdog

keywords:
  - watchdog
  - monitoring
  - cron
---

# Watchdog

Watchdog monitors services and cron jobs.
```

---

# Application Registration

Database Table:

applications

Columns:

* id
* name
* code
* enabled
* client_id
* client_secret_hash
* created_at
* updated_at

Examples:

Nmail

code = nmail

EmaCloud

code = emacloud

---

# Authentication

Scribe owns authentication.

Flow:

Application
↓
Request Token
↓
Receive JWT
↓
Call APIs

---

# APIs

## Health

GET /api/health

Response:

```json
{
  "status": "ok"
}
```

---

## Authentication

POST /api/auth/token

Request:

```json
{
  "clientId": "nmail",
  "clientSecret": "secret"
}
```

Response:

```json
{
  "accessToken": "jwt"
}
```

---

## Chat

POST /api/chat

Request:

```json
{
  "application": "nmail",
  "sessionId": "abc123",
  "question": "Where can I see Watchdog?"
}
```

Response:

```json
{
  "answer": "Watchdog is available under Monitoring > Watchdog.",
  "url": "/watchdog"
}
```

---

## Reindex

POST /api/reindex

Request:

```json
{
  "application": "nmail"
}
```

---

# Redis Session Memory

Purpose:

Maintain short conversation history.

Key Format:

scribe:{application}:{userId}:{sessionId}

Example:

scribe:nmail:101:abc123

Store:

* Last 5 user messages
* Last 5 assistant messages

Maximum:

10 messages

---

# Session Strategy

Widget generates:

sessionId

Store in:

sessionStorage

Behavior:

Browser Open
↓
Create Session

Browser Close
↓
Session Ends

Logout
↓
Delete Redis Session

New Login
↓
Fresh Conversation

---

# Documentation Sync

Phase 1:

Manual Sync

Flow:

POST /api/reindex

↓

Clone Repository (if missing)

↓

Git Pull

↓

Read Markdown Files

↓

Parse Metadata

↓

Refresh In-Memory Index

No Elasticsearch.

No Embeddings.

No Semantic Search.

---

# Ollama Integration

Model:

qwen3:8b

Environment:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

Responsibilities:

* Build prompt
* Add document context
* Add Redis conversation history
* Generate answer

---

# Widget

Package Name:

@netcore/scribe-widget

Purpose:

Reusable chatbot widget for any React application.

---

# Widget Placement

Bottom Right Corner

Style:

```css
position: fixed;
bottom: 20px;
right: 20px;
z-index: 9999;
```

---

# Widget Components

ScribeWidget

├── FloatingButton
├── ChatWindow
├── WelcomeScreen
├── MessageList
├── MessageInput
└── TypingIndicator

---

# Widget Features

MVP:

* Floating Chat Button
* Chat Drawer
* Minimize
* Maximize
* Mobile Responsive
* Markdown Responses
* Session Persistence
* Loading Indicator
* Error Handling

---

# Welcome Screen

Display:

Hello 👋

I'm Scribe.

You can ask:

* Where is Watchdog?
* How do I create a domain?
* What does Mail Flow Control do?

---

# Navigation Actions

API Response:

```json
{
  "answer": "Watchdog is available under Monitoring > Watchdog.",
  "url": "/watchdog"
}
```

Widget should display:

Open Watchdog

When clicked:

```javascript
navigate('/watchdog');
```

---

# Configuration

application.config.json

Example:

```json
{
  "netcoreScribe": {
    "enabled": true,
    "application": "nmail",
    "apiUrl": "https://scribe.company.com/api"
  }
}
```

Usage:

```jsx
<App>
  <Routes />
  <ScribeWidget />
</App>
```

---

# Security

Requirements:

* HTTPS Only
* JWT Authentication
* Application Isolation
* Redis Rate Limiting
* Secret Hashing
* Protected APIs

Rules:

Nmail can access only Nmail documentation.

EmaCloud can access only EmaCloud documentation.

Cross-product access is forbidden.

---

# Deployment

Dedicated Server

Recommended:

* Ubuntu
* Node.js
* Redis
* Ollama
* Qwen 3

Applications connect using HTTPS.

---

# Phase 1 Milestones

Milestone 1

Project Skeleton

Milestone 2

Health API

Milestone 3

Authentication API

Milestone 4

Application Registration

Milestone 5

Markdown Loader

Milestone 6

Git Sync

Milestone 7

Redis Memory

Milestone 8

Ollama Integration

Milestone 9

Chat API

Milestone 10

React Widget

Milestone 11

Nmail Integration

Milestone 12

EmaCloud Integration

---

# Phase 2

Future Enhancements

* Elasticsearch
* Semantic Search
* Embeddings
* Feedback Collection
* Usage Analytics
* Suggested Questions
* Search Ranking

Future Architecture:

Markdown
↓
Embeddings
↓
Elasticsearch
↓
Qwen

---

# Success Criteria

A user should be able to:

1. Open Scribe
2. Ask in English
3. Ask in Hindi
4. Ask in Marathi
5. Receive correct product guidance
6. Open application pages directly

Example:

Question:

Where can I see Watchdog?

Answer:

Watchdog is available under Monitoring > Watchdog.

Open Page:

/watchdog

Phase 1 is complete when Scribe successfully supports Nmail and EmaCloud documentation and navigation using Git-based Markdown documentation and Qwen 3 running on Ollama.
