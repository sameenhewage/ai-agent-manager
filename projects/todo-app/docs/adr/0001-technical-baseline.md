# ADR 0001: Technical Baseline for Todo App

## Status
Accepted

## Context
This Todo app is a workflow-test project inside the AI agent manager repository. The goal is to validate the AI agent workflow with a very small browser-based application.

The product requirements are intentionally simple:
- no authentication
- no backend
- no database
- no dependencies
- todos must survive page refresh
- app should run directly in the browser

## Decision
Use Vanilla HTML, CSS, and JavaScript with localStorage persistence.

The app will live under:

`projects/todo-app/`

Project-specific documentation will live under:

`projects/todo-app/docs/`

## Options Considered

### Option 1: Vanilla HTML/CSS/JS with localStorage
Pros:
- zero dependencies
- no build step
- simple to inspect and test
- best fit for workflow validation

Cons:
- not ideal for large applications
- less structure than a framework-based app

### Option 2: React + Vite
Pros:
- better component structure
- closer to modern web app development

Cons:
- adds dependencies and build tooling
- too heavy for this workflow-test project

### Option 3: Backend + database
Pros:
- stronger persistence model
- closer to production SaaS architecture

Cons:
- unnecessary for this test
- adds complexity before validating the agent workflow

## Reason
The purpose of this project is to test the AI workflow, not to test a full application stack. Vanilla HTML/CSS/JS keeps the implementation small and makes review easier.

localStorage satisfies the requirement that todos survive page refresh without introducing a backend or database.

## Consequences

### Positive
- fast to build
- easy to test
- easy to review
- no dependency risk
- suitable for validating the agent workflow

### Trade-offs
- data is limited to one browser/device
- no sync across devices
- not suitable for multi-user use
- future scaling would require a new architecture decision

## Related Documents
- `projects/todo-app/docs/product/00-product-vision.md`
- `projects/todo-app/docs/product/03-feature-scope.md`
- `projects/todo-app/docs/product/04-prd-first-slice.md`
