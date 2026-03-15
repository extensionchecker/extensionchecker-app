import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView - stub it so requestAnimationFrame
// callbacks in App.tsx do not throw an unhandled TypeError during tests.
Element.prototype.scrollIntoView = function () {};
