import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Loads data from the backend when a page opens.
//   const { data, loading, error, reload } = useFetch('/classes');
// Pass null as the path to skip loading (useful when you are waiting for a choice).
export default function useFetch(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false; // ignore old answers if the path changed meanwhile
    setLoading(true);
    setError('');
    api
      .get(path)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
