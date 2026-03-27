import { useEffect, useState } from 'react';

export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      window.clearTimeout(id);
    };
  }, [value, delayMs]);

  return debounced;
}
