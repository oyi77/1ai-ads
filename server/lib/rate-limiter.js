export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async throttle() {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    
    if (this.requests.length >= this.limit) {
      const oldest = this.requests[0];
      const waitTime = this.windowMs - (now - oldest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.throttle(); 
    }
    
    this.requests.push(now);
  }
}
