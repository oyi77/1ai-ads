import { useEffect, useState, useRef } from 'react';
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

  // Debounce campaign refetch so a high-frequency metric stream (one WS message
  // per campaign) doesn't trigger a full /api/campaigns round-trip per message.
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateCampaigns = () => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    }, 1500);
  };

  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe((message: WSMessage) => {
      setConnected(realtimeClient.connected);

      if (message.type === 'snapshot' && message.data) {
        setLiveMetrics(message.data as Record<string, MetricUpdate>);
        setLastUpdate(message.timestamp || new Date().toISOString());
        invalidateCampaigns();
      }

      if (message.type === 'metric_update' && message.data) {
        const update = message.data as MetricUpdate;
        setLiveMetrics(prev => ({
          ...prev,
          [update.campaign_id]: update,
        }));
        setLastUpdate(update.timestamp);
        invalidateCampaigns();
      }
    });

    // Check connection status periodically
    const interval = setInterval(() => {
      setConnected(realtimeClient.connected);
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    };
  }, [queryClient]);

  return {
    connected,
    lastUpdate,
    liveMetrics,
    metricCount: Object.keys(liveMetrics).length,
  };
}
