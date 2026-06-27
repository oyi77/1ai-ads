import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeClient } from '../lib/realtime';
import type { MetricUpdate, WSMessage } from '../lib/realtime';

/**
 * Hook that connects to the WebSocket and provides live campaign metrics.
 * Automatically updates React Query cache when new data arrives.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, MetricUpdate>>({});

  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe((message: WSMessage) => {
      setConnected(realtimeClient.connected);

      if (message.type === 'snapshot' && message.data) {
        setLiveMetrics(message.data as Record<string, MetricUpdate>);
        setLastUpdate(message.timestamp || new Date().toISOString());
        // Invalidate campaigns query to refresh dashboard
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      }

      if (message.type === 'metric_update' && message.data) {
        const update = message.data as MetricUpdate;
        setLiveMetrics(prev => ({
          ...prev,
          [update.campaign_id]: update,
        }));
        setLastUpdate(update.timestamp);
        // Invalidate campaigns query to refresh dashboard
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      }
    });

    // Check connection status periodically
    const interval = setInterval(() => {
      setConnected(realtimeClient.connected);
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [queryClient]);

  const getMetric = useCallback((campaignId: string): MetricUpdate | undefined => {
    return liveMetrics[campaignId];
  }, [liveMetrics]);

  return {
    connected,
    lastUpdate,
    liveMetrics,
    getMetric,
    metricCount: Object.keys(liveMetrics).length,
  };
}
