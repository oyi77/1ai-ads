#!/usr/bin/env python3
"""
Brand Watch — Autonomous personal branding monitor for berkahkarya_dev
Scans Reddit + Twitter for opportunities, auto-suggests responses, reports to Telegram.

Run: python3 scripts/brand_watch.py
Schedule: cron or background exec loop
"""

import sys, os, json, time, re, subprocess, textwrap
from datetime import datetime, timezone
from pathlib import Path

# Config
WORKSPACE = Path.home() / ".openclaw" / "workspace"
REDDIT_CLI = str(WORKSPACE / "skills" / "reddit" / "reddit_cli.py")
LOG_DIR = WORKSPACE / "logs"
REPORT_FILE = LOG_DIR / "brand_watch_report.md"
STATE_FILE = LOG_DIR / "brand_watch_state.json"

# Keywords to monitor (mad scientist / AI research niche)
KEYWORDS = [
    "abliteration", "abliterated", "uncensored model", "qwen3", "qwen",
    "local LLM", "consumer GPU", "6GB VRAM", "GTX 1660",
    "LLM jailbreak", "refusal behavior", "open source weights",
    "model release", "HuggingFace", "ollama modelfile",
]

# Subreddits to scan
SUBREDDITS = ["LocalLLaMA", "singularity", "MachineLearning", "algotrading", "StableDiffusion"]

# Twitter config
TWITTER_WRAPPER = str(Path.home() / ".local" / "bin" / "twitter-fix.py")
TWITTER_SEARCH_QUERIES = [
    "qwen3 OR abliteration OR localLLaMA",
    "uncensored model OR open source weights LLM",
    "consumer GPU machine learning",
    "HuggingFace model release",
]


def log(msg, level="INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{level}] {msg}", flush=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_DIR / "brand_watch.log", "a") as f:
        f.write(f"[{ts}] [{level}] {msg}\n")


def run_reddit(args):
    """Run reddit-cli command and return output."""
    cmd = ["python3", REDDIT_CLI] + args.split()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=WORKSPACE)
        if result.returncode != 0:
            log(f"Reddit error: {result.stderr.strip()[:200]}", "WARN")
            return None
        return result.stdout
    except subprocess.TimeoutExpired:
        log("Reddit command timed out", "WARN")
        return None
    except Exception as e:
        log(f"Reddit command failed: {e}", "ERROR")
        return None


def scan_reddit_hot():
    """Scan hot posts from target subreddits."""
    findings = []
    for sub in SUBREDDITS:
        output = run_reddit(f"hot -s {sub} -l 10")
        if not output:
            continue
        
        # Parse posts
        lines = output.strip().split("\n")
        current_post = None
        for line in lines:
            line = line.strip()
            # Match post header: " 1. [▲] r/sub - title"
            match = re.match(r"\s*(\d+)\.\s*\[(\d+)▲.*?\]\s*r/(\w+)", line)
            if match:
                if current_post:
                    findings.append(current_post)
                num, ups, subreddit = match.groups()
                # Extract title
                title_part = line[line.find('"')+1:] if '"' in line else ""
                title = title_part[:title_part.rfind('"')] if '"' in title_part else ""
                current_post = {
                    "subreddit": subreddit,
                    "ups": int(ups),
                    "title": title,
                    "url": "",
                    "author": "",
                    "comments": 0,
                }
            elif current_post and "by u/" in line:
                author_match = re.search(r"u/([\w-]+)", line)
                if author_match:
                    current_post["author"] = author_match.group(1)
                comment_match = re.search(r"(\d+) 💬", line)
                if comment_match:
                    current_post["comments"] = int(comment_match.group(1))
                url_match = re.search(r"(https://www\.reddit\.com/\S+)", line)
                if url_match:
                    current_post["url"] = url_match.group(1)
        
        if current_post:
            findings.append(current_post)
    
    # Filter by keywords
    relevant = []
    for post in findings:
        title_lower = post["title"].lower()
        for kw in KEYWORDS:
            if kw.lower() in title_lower:
                post["matched_keyword"] = kw
                relevant.append(post)
                break
    
    return relevant


def scan_twitter():
    """Scan Twitter for relevant discussions."""
    findings = []
    
    for query in TWITTER_SEARCH_QUERIES:
        try:
            result = subprocess.run(
                ["python3", TWITTER_WRAPPER, "search", query, "-n", "5"],
                capture_output=True, text=True, timeout=30,
                env={**os.environ, "TWITTER_AUTH_TOKEN": os.environ.get("TWITTER_AUTH_TOKEN", ""),
                     "TWITTER_CT0": os.environ.get("TWITTER_CT0", "")}
            )
            if result.returncode == 0 and result.stdout.strip():
                findings.append({"query": query, "results": result.stdout[:500]})
        except Exception as e:
            log(f"Twitter scan error: {e}", "WARN")
        time.sleep(1)
    
    return findings


def scan_reddit_search():
    """Search Reddit for relevant keywords."""
    findings = []
    for kw in KEYWORDS[:5]:  # Limit to top 5 keywords
        output = run_reddit(f'search -q "{kw}" -l 5')
        if not output:
            continue
        
        lines = output.strip().split("\n")
        current_post = None
        for line in lines:
            line = line.strip()
            match = re.match(r"\s*(\d+)\.\s*\[(\d+)▲.*?\]\s*r/(\w+)", line)
            if match:
                if current_post:
                    findings.append(current_post)
                num, ups, subreddit = match.groups()
                title_part = line[line.find('"')+1:] if '"' in line else ""
                title = title_part[:title_part.rfind('"')] if '"' in title_part else ""
                current_post = {
                    "subreddit": subreddit,
                    "ups": int(ups),
                    "title": title,
                    "url": "",
                    "author": "",
                    "matched_keyword": kw,
                }
            elif current_post and "reddit.com" in line:
                url_match = re.search(r"(https://www\.reddit\.com/\S+)", line)
                if url_match:
                    current_post["url"] = url_match.group(1)
                author_match = re.search(r"u/([\w-]+)", line)
                if author_match:
                    current_post["author"] = author_match.group(1)
        
        if current_post:
            findings.append(current_post)
    
    return findings


def check_reddit_inbox():
    """Check for replies and mentions."""
    output = run_reddit("inbox -l 5")
    if not output:
        return []
    
    messages = []
    lines = output.strip().split("\n")
    current_msg = None
    for line in lines:
        line = line.strip()
        if line.startswith(("1.", "2.", "3.", "4.", "5.")):
            if current_msg:
                messages.append(current_msg)
            current_msg = {"raw": line}
        elif current_msg and line and not line.startswith("by") and not line.startswith("http"):
            if "body" not in current_msg:
                current_msg["body"] = line
    
    if current_msg:
        messages.append(current_msg)
    
    return messages


def load_state():
    """Load previous scan state."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            pass
    return {"last_scan": None, "known_posts": []}


def save_state(state):
    """Save scan state."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def generate_report(reddit_hot, reddit_search, inbox, twitter_results=None):
    """Generate human-readable report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M WIB")
    lines = [f"# Brand Watch Report — {now}", ""]
    
    # Trending discussions
    lines.append("## 🔥 Trending Discussions to Monitor")
    lines.append("")
    
    all_posts = reddit_hot + reddit_search
    seen_urls = set()
    unique_posts = []
    for p in all_posts:
        if p.get("url") and p["url"] not in seen_urls:
            seen_urls.add(p["url"])
            unique_posts.append(p)
    
    if unique_posts:
        unique_posts.sort(key=lambda x: x.get("ups", 0), reverse=True)
        for p in unique_posts[:10]:
            kw = p.get("matched_keyword", "")
            lines.append(f"### [{p.get('ups', 0)}▲] r/{p.get('subreddit', '?')}")
            lines.append(f"**{p.get('title', '?')}**")
            lines.append(f"- Matched: `{kw}`")
            lines.append(f"- by u/{p.get('author', '?')} | {p.get('comments', 0)} comments")
            if p.get("url"):
                lines.append(f"- [View]({p['url']})")
            lines.append("")
    else:
        lines.append("*No relevant discussions found in this scan.*")
        lines.append("")
    
    # Twitter
    lines.append("## 🐦 Twitter Trends")
    if twitter_results:
        for tw in twitter_results:
            lines.append(f"- Query: `{tw['query']}`")
            results = tw['results'][:200]
            lines.append(f"  {results}")
            lines.append("")
    else:
        lines.append("*No Twitter data.*")
        lines.append("")
    
    # Inbox check
    lines.append("## 📬 Reddit Inbox")
    if inbox:
        for msg in inbox:
            lines.append(f"- {msg.get('raw', '?')}")
            if msg.get('body'):
                lines.append(f"  → {msg['body']}")
        lines.append("")
    else:
        lines.append("*Inbox empty.*")
        lines.append("")
    
    # Suggestions
    lines.append("## 💡 Suggested Actions")
    lines.append("")
    if unique_posts:
        best_post = unique_posts[0]
        lines.append(f"1. **Engage:** Comment on [{best_post.get('title', '')}]({best_post.get('url', '')}) — trending in r/{best_post.get('subreddit', '')}")
        lines.append(f"   *Suggested angle:* Share your experience with {best_post.get('matched_keyword', 'similar topics')}")
        lines.append("")
    
    lines.append("2. **Post Idea:** Based on trending topics, consider:")
    trending_kws = set(p.get("matched_keyword", "") for p in unique_posts[:5])
    if "abliteration" in str(trending_kws) or "abliterated" in str(trending_kws):
        lines.append("   - 🧪 New abliteration experiment post (compare methods)")
    if "qwen" in " ".join(str(p.get("matched_keyword", "")) for p in unique_posts).lower():
        lines.append("   - 🚀 Qwen model release / benchmark post")
    lines.append("   - 📄 Zenodo paper discussion thread")
    lines.append("")
    
    lines.append(f"---")
    lines.append(f"*Next scan in ~{SCAN_INTERVAL_HOURS}h. Automatically generated by Brand Watch v1.*")
    
    return "\n".join(lines)


def scan_and_report():
    """Execute scan iteration."""
    log("Starting brand scan...")
    
    # Scan Reddit
    reddit_hot = scan_reddit_hot()
    log(f"Found {len(reddit_hot)} relevant hot posts")
    
    reddit_search = scan_reddit_search()
    log(f"Found {len(reddit_search)} from keyword search")
    
    inbox = check_reddit_inbox()
    log(f"Inbox: {len(inbox)} messages")
    
    # Scan Twitter
    twitter_results = scan_twitter()
    log(f"Twitter: {len(twitter_results)} queries scanned")
    
    # Generate report
    report = generate_report(reddit_hot, reddit_search, inbox, twitter_results)
    
    # Save report
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(REPORT_FILE, "w") as f:
        f.write(report)
    
    log(f"Report saved to {REPORT_FILE}")
    
    # Update state
    state = load_state()
    state["last_scan"] = datetime.now().isoformat()
    known_urls = set(state.get("known_posts", []))
    for p in reddit_hot + reddit_search:
        if p.get("url"):
            known_urls.add(p["url"])
    state["known_posts"] = list(known_urls)[-500:]  # Keep last 500
    save_state(state)
    
    return report


# ============================================================
# MAIN LOOP
# ============================================================

SCAN_INTERVAL_HOURS = 4

def main_loop():
    """Continuous monitoring loop with self-wake."""
    log(f"Brand Watch started. Scan interval: {SCAN_INTERVAL_HOURS}h")
    log(f"Monitoring: {', '.join(SUBREDDITS)}")
    log(f"Keywords: {', '.join(KEYWORDS[:8])}...")
    
    while True:
        try:
            report = scan_and_report()
            
            # Print report summary (stdout captured by exec tool)
            print("\n" + "="*60)
            print("REPORT SUMMARY")
            print(report[:500])
            print("="*60 + "\n")
            
        except Exception as e:
            log(f"Scan failed: {e}", "ERROR")
            import traceback
            log(traceback.format_exc(), "ERROR")
        
        # Sleep
        log(f"Sleeping for {SCAN_INTERVAL_HOURS}h...")
        for _ in range(SCAN_INTERVAL_HOURS * 6):  # 10 min intervals for responsive stop
            time.sleep(600)
            # Check if stop file exists
            if (LOG_DIR / "STOP").exists():
                log("Stop signal received. Exiting.", "INFO")
                (LOG_DIR / "STOP").unlink(missing_ok=True)
                return


def single_run():
    """Single scan (for cron)."""
    report = scan_and_report()
    print(report)


if __name__ == "__main__":
    if "--once" in sys.argv:
        single_run()
    elif "--help" in sys.argv or "-h" in sys.argv:
        print("Usage: python3 scripts/brand_watch.py [--once]")
        print("  --once    Single scan (for cron). Default: continuous loop.")
        sys.exit(0)
    else:
        main_loop()
