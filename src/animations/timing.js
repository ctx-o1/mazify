export const ease = (progress) => 0.5 - Math.cos(Math.PI * progress) / 2;
export const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Each renderer owns its timeline. Starting a new run cancels the old one.
export function createTimeline() {
  let runId = 0;

  function nextRun() {
    runId += 1;
    return runId;
  }

  function tween(duration, onFrame, token) {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        if (token !== runId) {
          resolve(false);
          return;
        }

        const progress = Math.min(1, (now - start) / duration);
        onFrame(progress);
        if (progress < 1) requestAnimationFrame(tick);
        else resolve(true);
      };
      requestAnimationFrame(tick);
    });
  }

  function wait(duration, token) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(token === runId), duration);
    });
  }

  return { nextRun, tween, wait };
}
