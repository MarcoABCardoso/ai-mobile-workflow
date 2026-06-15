# ADR 008 — Expo Router for mobile navigation

**Status:** Accepted  
**Date:** 2026-06-15

## Context

The mobile app needs a navigation system. The two realistic options in the React Native / Expo ecosystem are React Navigation (manual configuration) and Expo Router (file-based, built on top of React Navigation).

## Decision

**Expo Router** (file-based routing).

## Reasons

- **Opinionated structure reduces decisions.** Route configuration is implicit in the file system: `app/(tabs)/index.tsx` is a tab, `app/[id].tsx` is a dynamic route. The AI never has to decide where to wire up a new screen — it creates the file in the right place.
- **Consistent with the rest of the stack.** Expo Router mirrors Next.js conventions (`_layout.tsx`, route groups with `()`), which are well-represented in training data and produce predictable scaffolding.
- **Built on React Navigation.** Expo Router uses React Navigation under the hood. Knowledge of React Navigation is not wasted; and if a specific navigation pattern needs React Navigation directly, it can be accessed via the `useNavigation` hook.
- **Deep linking and web routing included.** Expo Router handles web URLs, native deep links, and server-rendering (Expo's web target) with the same file structure. No separate URL scheme configuration.
- **Stable.** Expo Router has been stable since Expo SDK 50 (early 2024) and is the Expo team's recommended approach.

## What this means in practice

- `mobile/app/_layout.tsx` is the root layout — this is where global providers live (QueryClientProvider, auth context, etc.).
- Tab groups live in `mobile/app/(tabs)/` with their own `_layout.tsx` defining the tab bar.
- Authenticated screens go in `mobile/app/(app)/` (a route group) with a layout that enforces auth.
- Dynamic routes use `[param].tsx` convention.
- `Link` from `expo-router` replaces `navigation.navigate()` for declarative links.
- The AI navigates programmatically using `router.push()` / `router.replace()` from `expo-router`.

## Trade-offs

- Less fine-grained control than manual React Navigation configuration. For the kinds of apps this workflow targets (standard tab/stack navigation), this is not a practical limitation.
- File-system routing can feel surprising when the navigation hierarchy does not map cleanly to the folder hierarchy. Route groups (`(name)/`) address most of these cases.

## Alternatives considered

- **React Navigation (manual)** — more control, more established. Ruled out because the manual navigator configuration (Stack.Navigator, Tab.Navigator, etc.) is boilerplate that varies per feature and is harder for AI to scaffold consistently. Expo Router makes the right choice automatic.
