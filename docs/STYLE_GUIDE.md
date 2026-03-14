# Style Guide

Coding conventions for the ExtensionChecker project. Follow these guidelines
when contributing to keep the codebase consistent and maintainable.

## Language

- **TypeScript** everywhere. No plain JavaScript files.
- Strict mode enabled (`"strict": true` in every tsconfig).

## Formatting

- **Indentation**: 2 spaces.
- **Semicolons**: always.
- **Quotes**: single quotes for strings (except JSX attributes, which use
  double quotes per React convention).
- **Trailing commas**: use them in multiline arrays, objects, and parameter
  lists.
- **Line length**: aim for ≤100 characters. Occasional longer lines are fine
  when breaking would reduce readability.

## Naming

| Kind | Convention | Example |
|------|-----------|---------|
| Files / modules | `kebab-case.ts` | `manifest-analysis.ts` |
| Types / interfaces | `PascalCase` | `AnalysisReport` |
| Zod schemas | `PascalCase` + `Schema` suffix | `AnalysisReportSchema` |
| Functions | `camelCase` | `analyzeManifest` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_PACKAGE_SIZE_BYTES` |
| CSS custom properties | `--kebab-case` | `--panel-border` |
| React components | `PascalCase` | `App` |

## TypeScript

- Prefer `interface` for object shapes that may be extended, `type` for unions
  and intersections.
- Never use `any`. Use `unknown` when the type truly is not known, then narrow.
- Export types explicitly: `export type { Foo }`.
- Zod schemas are the single source of truth for shared data shapes. Derive
  TypeScript types with `z.infer<>`.

## Module Structure

- One primary export per file when practical.
- Re-export public API from `index.ts` at each package root.
- Keep internal helpers private (unexported) unless another package needs them.
- Avoid circular imports — if two modules need each other, extract the shared
  piece into a third module.

## Functions

- Prefer pure functions. Side effects should be explicit and isolated.
- Keep functions short and single-purpose.
- Use early returns to reduce nesting.
- Avoid default exports — use named exports.

## Error Handling

- Throw descriptive `Error` objects, not strings.
- Validate at system boundaries (user input, external APIs, file parsing).
  Trust internal code paths.
- Use Zod's `.safeParse()` for schema validation so you can inspect errors.

## Testing

- Test files live in `test/` beside `src/` in each package.
- Name test files `<module>.test.ts` (or `.test.tsx` for React).
- Use Vitest. Prefer `describe` / `it` structure.
- Test behavior, not implementation details.
- Cover edge cases: invalid input, empty data, boundary values.

## CSS

- Use CSS custom properties (design tokens) for all colors, spacing, and
  typography values.
- Mobile-first responsive design with `clamp()` for fluid sizing.
- Light and dark themes via `[data-theme]` attribute and
  `prefers-color-scheme` media query.
- No CSS-in-JS. Styles live in `.css` files.

## Commits

- Write clear, imperative commit messages: "Add manifest parser" not "Added
  manifest parser".
- Keep commits focused — one logical change per commit.

## Dependencies

- Minimize external dependencies. Evaluate necessity before adding.
- Pin major versions in `package.json`.
- Security-sensitive packages (archive extraction, parsing) must be
  well-maintained and audited.
