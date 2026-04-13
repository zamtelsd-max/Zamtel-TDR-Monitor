import { useState, useCallback } from 'react';

export function useGPS() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const capture = useCallback((): Promise<{ latitude: number; longitude: number }> => {
    setLoading(true);
    setError(null);

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setLoading(false);
        const msg = 'Geolocation is not supported by your browser';
        setError(msg);
        reject(new Error(msg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        (err) => {
          setLoading(false);
          const msg = err.message || 'Failed to get location';
          setError(msg);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  return { capture, loading, error };
}
