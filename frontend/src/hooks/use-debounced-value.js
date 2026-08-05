"use client";

import { useEffect, useState } from "react";

/**
 * The value, held back until it has stopped changing for `delay` ms.
 *
 * Used by the student search box so typing "Ahmed" is ONE request instead of
 * five. The input itself stays uncontrolled-feeling (it updates on every
 * keystroke); only the query key debounces, which is what keeps React Query
 * from opening and abandoning a request per character on a slow connection.
 */
export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delay);

    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debounced;
}
