/**
 * Real-time WebSocket client for live campaign metrics.
 * Connects to /ws/realtime and dispatches updates to React Query cache.
 */

type MetricUpdate = {
  campaign_id: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
  roas: number | null;
  timestamp: string;
};

type WSMessage = {
  type: 'snapshot' | 'metric_update' | 'pong';
  data: Record<string, MetricUpdate> | MetricUpdate;
  timestamp?: string;
};

type Listener = (message: WSMessage) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private _connected = false;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws/realtime`;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        console.log('[realtime] Connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          for (const listener of this.listeners) {
            listener(message);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        console.log('[realtime] Disconnected, reconnecting in 5s...');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._connected = false;
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}

export const realtimeClient = new RealtimeClient();
export type { MetricUpdate, WSMessage };
