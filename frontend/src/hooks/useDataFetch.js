// frontend/src/hooks/useDataFetch.js
import { useState, useEffect } from 'react';

export const useDataFetch = (apiCall, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetch = async () => {
      try {
        setError(null);
        const result = await apiCall();
        if (isMounted) setData(result);
      } catch (err) {
        if (isMounted) setError(err.response?.data?.detail || err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetch();
    return () => { isMounted = false; };
  }, dependencies);

  return { data, loading, error };
};