// A tiny event bus that tracks how many API requests are in flight.
// The GlobalLoader component subscribes to this to show a top progress bar,
// without api/client.js needing to know anything about React.
let count = 0;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(count));
}

export const loadingBus = {
  start() {
    count += 1;
    emit();
  },
  stop() {
    count = Math.max(0, count - 1);
    emit();
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(count);
    return () => listeners.delete(fn);
  },
};
