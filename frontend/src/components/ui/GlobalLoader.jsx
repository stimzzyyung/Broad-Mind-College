import { useEffect, useState } from 'react';
import { loadingBus } from '../../lib/loadingBus.js';

// A thin bar pinned to the top of the screen, like a browser tab's loading
// indicator. Subscribes to the loading bus so it lights up for any api.* call,
// anywhere in the app, without every page having to wire it up itself.
export default function GlobalLoader() {
  const [active, setActive] = useState(false);

  useEffect(() => loadingBus.subscribe((count) => setActive(count > 0)), []);

  if (!active) return null;
  return (
    <div className="global-loader" role="status" aria-label="Loading">
      <div className="global-loader-bar" />
    </div>
  );
}
