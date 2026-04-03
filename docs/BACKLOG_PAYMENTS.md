# Payment Gateway Integration Backlog

## Overview
This document outlines the strategy for integrating direct payment gateways into AdForge, replacing the current Scalev-dependent checkout flow.

## Current State
- **Checkout**: Currently relies on Scalev embed/links for payment processing
- **Scalev**: Provides landing page hosting + checkout + payment in one platform

## Target State
- **Direct Integration**: Support Midtrans, Stripe, or other Indonesian payment gateways
- **Flexibility**: Ability to use Scalev OR direct PG based on user preference
- **Revenue Tracking**: All payment data flows back to AdForge analytics

---

## Option 1: Midtrans Integration (Indonesia)

### Pros
- Popular in Indonesia
- Supports various payment methods (GoPay, OVO, BCA, etc.)
- Easy API integration

### Cons
- Requires merchant account
- Transaction fees per payment

### Implementation Steps
1. Add Midtrans configuration to settings
2. Create payment initiate endpoint
3. Handle webhook for payment confirmation
4. Update LP templates to use direct checkout

### API Endpoints (Future)
```
POST /api/payments/midtrans/create
POST /api/payments/midtrans/webhook
GET  /api/payments/midtrans/status/:orderId
```

---

## Option 2: Stripe Integration (Global)

### Pros
- Global reach
- Excellent developer experience
- Strong security

### Cons
- Not ideal for Indonesian market (lower conversion)
- Currency handling needed for IDR

### Implementation Steps
1. Add Stripe configuration to settings
2. Create payment sessions
3. Handle webhook events
4. Currency conversion for IDR

### API Endpoints (Future)
```
POST /api/payments/stripe/create-session
POST /api/payments/stripe/webhook
GET  /api/payments/stripe/status/:sessionId
```

---

## Option 3: Xendit (Indonesia)

### Pros
- Designed for Indonesian market
- Competitive pricing
- Good API documentation

### Cons
- Requires business verification

---

## Recommended Approach

### Phase 1: Keep Scalev (Current)
- Continue using Scalev for checkout
- Document the integration points

### Phase 2: Add Midtrans (Next)
- Midtrans is best for Indonesian market
- Start with basic payment creation
- Use Snap (hosted payment page) for simplicity

### Phase 3: Multi-PG Support
- Allow users to choose their preferred gateway
- Normalize payment data across providers

---

## Technical Notes

### Database Changes
```sql
-- Future: payments table
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gateway TEXT NOT NULL, -- 'scalev', 'midtrans', 'stripe'
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'IDR',
  status TEXT DEFAULT 'pending', -- pending, success, failed
  transaction_id TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Security Considerations
- Never store raw card numbers
- Use gateway's PCI-compliant hosted pages
- Validate webhook signatures
- Implement idempotent payment processing

---

## Status

| Feature | Status | Notes |
|---------|--------|-------|
| Scalev Checkout | ✅ Implemented | Current default |
| Midtrans | 📋 Backlog | Not started |
| Stripe | 📋 Backlog | Not started |
| Xendit | 📋 Backlog | Not started |

---

*Last Updated: 2026-04-03*
*Owner: AdForge Development Team*