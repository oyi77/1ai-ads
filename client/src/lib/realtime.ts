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
  type: 'snapshot' | 'metric_update';
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
  private attempts = 0;
  private readonly MAX_ATTEMPTS = 10;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws/realtime`;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        this.attempts = 0; // reset backoff on successful connection
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
    if (this.attempts >= this.MAX_ATTEMPTS) return; // stop after repeated failures
    // Exponential backoff 1s -> 30s cap with jitter
    const base = Math.min(1000 * Math.pow(2, this.attempts), 30000);
    const delay = base + Math.random() * 1000;
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const realtimeClient = new RealtimeClient();
export type { MetricUpdate, WSMessage };
