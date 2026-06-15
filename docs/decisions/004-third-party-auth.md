# ADR 004 — Third-party authentication providers only

**Status:** Accepted  
**Date:** 2026-06-14

## Context

Decided how to handle user authentication and identity in projects built with this workflow.

## Decision

Third-party auth providers exclusively:
- **Firebase Auth** when the project cloud is GCP
- **Azure AD B2C** when the project cloud is Azure

Provider is selected automatically based on the `cloud` field in `infra/bootstrap.json`.

## Reasons

- **Security features out of the box.** MFA, brute-force protection, token refresh, session revocation, and secure password storage are handled by the provider — not by the project team.
- **Compliance.** Both providers are SOC 2 and ISO 27001 certified. Custom auth implementations require significant effort to reach equivalent assurance.
- **AI safety constraint.** Custom auth logic is a high-risk surface for subtle security bugs. Prohibiting it entirely removes a class of vulnerability from AI-generated code.
- **React Native SDK support.** Both providers have mature, well-maintained React Native SDKs.
- **Free tier.** Firebase Auth is free up to 10k MAU/month. Azure AD B2C is free up to 50k MAU/month. Cost is $0 for most early-stage projects.

## Trade-offs

- Some auth requirements (e.g. custom token claims, exotic identity providers) may require workarounds within the provider's framework.
- Vendor dependency for a core infrastructure concern.

## What this means in practice

- Services validate JWTs using the provider SDK middleware only (`firebase-admin` or `@azure/msal-node`).
- No password hashing, session management, or token generation code is written in any service.
- The `CLAUDE.md` generated at bootstrap enforces this as a hard rule the AI cannot override.
