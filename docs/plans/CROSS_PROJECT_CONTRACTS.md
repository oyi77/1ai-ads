# Cross-Project API Contracts
> Defines the interfaces between 1ai-ads, 1ai-social, and 1ai-content

---

## 1ai-ads → 1ai-content (Video Generation)

### POST /api/content/video/create
Request video generation for ad creative.

**Auth:** `x-api-key` header or `Authorization: Bearer <JWT>`

**Request:**
```json
{
  "niche": "fashion|fb|tech|health|travel|beauty",
  "duration": 15,
  "customPrompt": "Optional custom prompt for video generation",
  "platform": "tiktok|instagram|facebook",
  "enableVO": true,
  "enableSubtitles": true,
  "language": "id"
}
```

**Response (200):**
```json
{
  "jobId": "uuid",
  "status": "processing|completed|failed",
  "estimatedTime": 120
}
```

**Response (400):**
```json
{
  "error": "niche and duration required"
}
```

**Response (402):**
```json
{
  "error": "Insufficient credits"
}
```

---

### GET /api/content/videos
List generated videos for the authenticated user.

**Response (200):**
```json
{
  "videos": [
    {
      "id": "uuid",
      "jobId": "uuid",
      "niche": "fashion",
      "duration": 15,
      "status": "completed",
      "videoUrl": "https://...",
      "thumbnailUrl": "https://...",
      "title": "Video title",
      "createdAt": "2026-06-02T00:00:00Z"
    }
  ]
}
```

---

### GET /api/content/health
Check content service health.

**Response (200):**
```json
{
  "status": "ok",
  "version": "3.0.0",
  "services": { "video": true, "image": true, "ebook": true, "social": true },
  "timestamp": "2026-06-02T00:00:00Z"
}
```

---

## 1ai-ads → 1ai-social (Fanpage Posting)

### POST /api/webhooks/fanpage-post
Post content to a Facebook Fanpage via GoLogin browser automation.

**Auth:** `x-api-key` header

**Request:**
```json
{
  "profile_id": "gologin-profile-uuid",
  "page_id": "facebook-page-id",
  "message": "Post caption text",
  "image_url": "https://optional-image-url.jpg"
}
```

**Response (200):**
```json
{
  "status": "queued",
  "message": "Fanpage post queued for automation",
  "post_id": "optional-post-id"
}
```

**Response (401):**
```json
{
  "detail": "Invalid API key"
}
```

**Response (500):**
```json
{
  "detail": "GOLOGIN_API_KEY not configured"
}
```

---

## 1ai-content → 1ai-ads (Video Completion Webhook)

### POST /api/webhooks/video-complete
Notify 1ai-ads when a video generation job completes.

**Request:**
```json
{
  "jobId": "uuid",
  "status": "completed|failed",
  "videoUrl": "https://...",
  "thumbnailUrl": "https://..."
}
```

**Response (200):**
```json
{
  "received": true
}
```

---

## 1ai-content → 1ai-social (Content Distribution)

### POST /api/webhooks/content
Distribute content to social platforms.

**Auth:** `x-api-key` header (`CONTENT_WEBHOOK_SECRET`)

**Request:**
```json
{
  "source": "1ai-content",
  "event_type": "video.completed|image.completed",
  "content_id": "uuid",
  "content_type": "video|image",
  "title": "Content title",
  "description": "Optional description",
  "media_url": "https://...",
  "thumbnail_url": "https://...",
  "caption": "Social media caption",
  "hashtags": ["tag1", "tag2"],
  "platform": "instagram|tiktok|facebook",
  "metadata": {}
}
```

**Response (200):**
```json
{
  "status": "accepted",
  "message": "Content queued for distribution: video",
  "post_ids": ["content-db-id"]
}
```

---

## Environment Variables

| Variable | Project | Purpose |
|---|---|---|
| `CONTENT_SERVICE_URL` | 1ai-ads | 1ai-content base URL (default: `http://localhost:3000`) |
| `CONTENT_API_KEY` | 1ai-ads | API key for 1ai-content auth |
| `SOCIAL_SERVICE_URL` | 1ai-ads | 1ai-social base URL (default: `http://localhost:8000`) |
| `SOCIAL_WEBHOOK_SECRET` | 1ai-ads | API key for 1ai-social auth |
| `CONTENT_WEBHOOK_SECRET` | 1ai-social | Validates incoming webhooks from 1ai-content |
| `FANPAGE_WEBHOOK_SECRET` | 1ai-social | Validates incoming Fanpage post requests |
| `GOLOGIN_API_KEY` | 1ai-social | GoLogin API key for browser automation |

---

## Error Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Bad request (missing required fields) |
| 401 | Unauthorized (invalid/missing API key) |
| 402 | Payment required (insufficient credits) |
| 404 | Resource not found |
| 500 | Internal server error |
