#!/usr/bin/env python3
"""Gmail Mass Login + OAuth Account Factory — via GoLogin browser profiles"""

import json, time, requests, sys
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent.parent


def load_gologin_token():
    return json.load(open(BASE / "data/gologin_config.json"))["api_token"]


def load_accounts():
    return json.load(open(BASE / "data/account_factory_gmails.json"))


def load_profiles():
    if (BASE / "data/gologin_profiles.json").exists():
        return json.load(open(BASE / "data/gologin_profiles.json"))
    return []


def launch_browser(token, profile_id=None, port=18810):
    """Launch GoLogin browser with unique fingerprint"""
    from gologin import GoLogin

    gl = GoLogin(
        {
            "token": token,
            "profile_id": profile_id,
            "port": port,
            "extra_params": ["--remote-allow-origins=*"],
        }
    )
    debugger = gl.start()
    time.sleep(3)

    # Verify browser is responsive
    r = requests.get(f"http://{debugger}/json/version", timeout=5)
    if r.status_code != 200:
        gl.stop()
        return None, None

    return gl, debugger


def connect_websocket(debugger):
    """Connect to browser via CDP WebSocket"""
    import websocket

    pages = requests.get(f"http://{debugger}/json", timeout=5).json()
    if not pages:
        return None, pages

    ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"])
    return ws, pages


def run_js(ws, js_code):
    """Execute JavaScript in browser"""
    msg = json.dumps(
        {"id": 1, "method": "Runtime.evaluate", "params": {"expression": js_code}}
    )
    ws.send(msg)
    return json.loads(ws.recv()).get("result", {}).get("result", {}).get("value", "")


def login_gmail(ws, email, password):
    """Login to Gmail via browser"""
    # Navigate to Gmail
    run_js(
        ws,
        "window.location.href = 'https://accounts.google.com/signin/v2/identifier?service=mail'",
    )
    time.sleep(4)

    # Check current state
    current_url = run_js(ws, "window.location.href")

    # If already logged in
    if "myaccount" in current_url or "mail" in current_url:
        if "signin" not in current_url and "accounts" not in current_url:
            return True, "already_logged_in", current_url

    # Fill email
    email_js = f"""
    (() => {{
        let input = document.querySelector('input[type="email"]') || document.querySelector('input[name="identifier"]');
        if(!input) return 'no_email_field';
        input.value = '{email}';
        // Trigger React onChange
        let event = new Event('input', {{ bubbles: true }});
        input.dispatchEvent(event);
        
        // Click Next
        setTimeout(() => {{
            let btn = document.querySelector('#identifierNext') || document.querySelector('button[jsname="LgbsSe"]');
            if(btn) btn.click();
        }}, 500);
        return 'email_filled';
    }})();
    """
    run_js(ws, email_js)
    time.sleep(3)

    # Fill password
    pass_js = f"""
    (() => {{
        let input = document.querySelector('input[type="password"]') || document.querySelector('input[name="Passwd"]');
        if(!input) return 'no_pass_field';
        input.value = '{password}';
        let event = new Event('input', {{ bubbles: true }});
        input.dispatchEvent(event);
        
        setTimeout(() => {{
            let btn = document.querySelector('#passwordNext') || document.querySelector('button[jsname="LgbsSe"]');
            if(btn) btn.click();
        }}, 500);
        return 'pass_filled';
    }})();
    """
    run_js(ws, pass_js)
    time.sleep(5)

    # Check result
    final_url = run_js(ws, "window.location.href")

    if "challenge" in final_url.lower() or "verify" in final_url.lower():
        return False, "challenge_required", final_url
    elif "myaccount" in final_url or "mail.google.com" in final_url:
        return True, "logged_in", final_url
    elif "signin" in final_url.lower() or "accounts" in final_url.lower():
        return False, "login_failed", final_url
    else:
        return True, "unknown_success", final_url


def get_gmail_cookies(ws):
    """Extract Gmail session cookies"""
    cookies_js = """
    JSON.stringify(document.cookie.split(';').map(c => c.trim().split('=')).reduce((a, [k, v]) => ({...a, [k]: v}), {}))
    """
    return json.loads(run_js(ws, cookies_js) or "{}")


def create_account_via_google(ws, platform):
    """Create account via 'Sign in with Google' button"""
    platforms = {
        "instagram": "https://www.instagram.com/accounts/login/",
        "twitter": "https://x.com/i/flow/login",
        "threads": "https://www.threads.net/login",
        "youtube": "https://www.youtube.com/",
    }

    url = platforms.get(platform)
    if not url:
        return False, "unknown_platform"

    run_js(ws, f"window.location.href = '{url}'")
    time.sleep(4)

    # Click "Continue with Google" button
    click_google_js = """
    (() => {
        let buttons = document.querySelectorAll('button, a, div[role="button"]');
        for(let b of buttons) {
            if(b.innerText.toLowerCase().includes('google') || b.innerText.toLowerCase().includes('continue with google')) {
                b.click();
                return 'clicked_google_btn';
            }
        }
        return 'no_google_btn_found';
    })();
    """
    result = run_js(ws, click_google_js)
    time.sleep(3)

    if result == "no_google_btn_found":
        return False, "no_google_button"

    # If Gmail is logged in, Google will auto-approve
    current = run_js(ws, "window.location.href")
    return True, f"oauth_flow:{current[:60]}"


def process_account(acct, token, profile_id, proxy=None):
    """Process one Gmail account"""
    email = acct["Email"]
    password = acct["Password"]

    print(f"\n{'='*50}")
    print(f"📧 {email}")
    print(f"   Password: {password[:15]}...")
    print(f"   FB Name: {acct['Nama Akun FB']}")

    # Launch browser
    port = hash(email) % 10000 + 18800
    gl, debugger = launch_browser(token, profile_id, port)
    if not gl:
        return {"email": email, "success": False, "error": "browser_launch_failed"}

    ws, pages = connect_websocket(debugger)
    if not ws:
        gl.stop()
        return {"email": email, "success": False, "error": "websocket_failed"}

    # Login to Gmail
    success, status, url = login_gmail(ws, email, password)
    print(f"   Gmail: {'✅' if success else '❌'} {status}")

    result = {
        "email": email,
        "fb_name": acct["Nama Akun FB"],
        "gmail_login": success,
        "gmail_status": status,
        "accounts_created": {},
    }

    if success:
        # Get cookies
        cookies = get_gmail_cookies(ws)
        result["cookies"] = {k: v[:20] + "..." for k, v in (cookies or {}).items()}

        # Save cookies
        cfile = BASE / f"data/gmail_sessions/{email.split('@')[0]}_cookies.json"
        cfile.parent.mkdir(parents=True, exist_ok=True)
        cfile.write_text(json.dumps(cookies, indent=2))
        result["cookies_saved"] = str(cfile)

        # Create accounts via OAuth
        for platform in ["instagram", "twitter", "youtube"]:
            try:
                ok, msg = create_account_via_google(ws, platform)
                result["accounts_created"][platform] = {"success": ok, "detail": msg}
                print(f"   {platform}: {'✅' if ok else '❌'} {msg[:50]}")
                time.sleep(2)
            except Exception as e:
                result["accounts_created"][platform] = {
                    "success": False,
                    "error": str(e)[:80],
                }

    ws.close()
    gl.stop()
    return result


def check_all_gmails():
    """Check which of 375 Gmails are still active"""
    accounts = load_accounts()
    token = load_gologin_token()
    profiles = load_profiles()

    results = []
    active = 0
    challenge = 0
    failed = 0

    for i, acct in enumerate(accounts[:10]):  # Test first 10
        # Reuse profiles (max 3 for free tier)
        pid = profiles[i % len(profiles)]["profile_id"] if profiles else None

        try:
            result = process_account(acct, token, pid)
            results.append(result)

            if result["gmail_login"]:
                active += 1
            elif result.get("gmail_status") == "challenge_required":
                challenge += 1
            else:
                failed += 1
        except Exception as e:
            results.append(
                {"email": acct["Email"], "success": False, "error": str(e)[:100]}
            )
            failed += 1

        # Save progress
        with open(BASE / "data/gmail_login_results.json", "w") as f:
            json.dump(results, f, indent=2)

        time.sleep(2)

    print(f"\n{'='*50}")
    print(f"📊 RESULTS ({len(results)}/10 processed):")
    print(f"   ✅ Active: {active}")
    print(f"   ⚠️ Challenge: {challenge}")
    print(f"   ❌ Failed: {failed}")

    return results


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Gmail Mass Login + OAuth Account Factory")
    p.add_argument("--test", action="store_true", help="Test 1 account")
    p.add_argument("--batch", type=int, default=10, help="Batch size")
    p.add_argument("--status", action="store_true", help="Show status")

    args = p.parse_args()

    if args.status:
        if (BASE / "data/gmail_login_results.json").exists():
            results = json.load(open(BASE / "data/gmail_login_results.json"))
            active = sum(1 for r in results if r.get("gmail_login"))
            print(f"📊 Processed: {len(results)} | Active: {active}")
        else:
            print("No results yet. Run --test first.")

    elif args.test:
        accounts = load_accounts()
        acct = accounts[0]
        token = load_gologin_token()
        result = process_account(acct, token, None)
        print(f"\n{'='*50}")
        print(f"Result: {'✅ LOGGED IN' if result.get('gmail_login') else '❌ FAILED'}")
        print(json.dumps(result, indent=2))

    else:
        check_all_gmails()
