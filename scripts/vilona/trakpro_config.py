#!/usr/bin/env python3
"""VILONA TrakPro — configuration, accounts, exec state, shared constants.

Split from vilona_trakpro_engine.py to enforce the 800-line module limit.
"""

import json, os, sys, time, traceback, threading
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(str(_env_path))
    else:
        load_dotenv()
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

# ─── CONFIG ──────────────────────────────────────────────────────────────────
WIB = timezone(timedelta(hours=7))
_BASE = Path("/home/openclaw")
_DEFAULT_WORKSPACE = _BASE / ".openclaw" / "workspace"
_HERE_BASE = Path(__file__).resolve().parent.parent
WORKSPACE = Path(os.getenv("WORKSPACE", _HERE_BASE if _HERE_BASE.exists() else _DEFAULT_WORKSPACE))
DATA_DIR = Path(os.getenv("DATA_DIR", WORKSPACE / "data")).resolve()
LOG_FILE = WORKSPACE / "logs" / "vilona_trakpro_engine.log"
STATE_FILE = WORKSPACE / "data" / "vilona_trakpro_state.json"
SHOPEE_DATA = _BASE / ".openclaw" / "workspace" / "data" / "shopee"
os.makedirs(WORKSPACE / "logs", exist_ok=True)
os.makedirs(WORKSPACE / "data", exist_ok=True)

# Token: try /tmp/fb_token.txt first, then .env META_ACCESS_TOKEN, then ACCESS_TOKEN env
TOKEN_FILE = Path("/tmp/fb_token.txt")
ACCESS_TOKEN = (TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else
                os.getenv("META_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN"))
API = "https://graph.facebook.com/v22.0"

# ─── TELEGRAM BOT ────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "REPLACE_WITH_REAL_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_ADMIN_ID", "157228659")
TELEGRAM_API = "https://api.telegram.org"

try:
    from telegram import Bot, Update, CallbackQuery
    from telegram.ext import (
        Application,
        CommandHandler,
        CallbackQueryHandler,
        ContextTypes,
    )
    from telegram.constants import ParseMode
except Exception as e:  # pragma: no cover
    Bot = None
    Application = None
    Update = None
    ContextTypes = None
    ParseMode = None
    CallbackQuery = None

# ─── EXECUTION / HITL STATE ───────────────────────────────────────────────
EXEC_STATE_FILE = WORKSPACE / "data" / "executor_state.json"

def _load_exec_state():
    try:
        return json.loads(EXEC_STATE_FILE.read_text())
    except Exception:
        return {
            "queue": [],       # pending exec requests
            "history": [],     # executed + dry_run conclusions
            "rate": {},        # cooldown per campaign
            "last_cycle_w": 0,
            "last_cycle_b": 0,
        }

def _save_exec_state(state):
    EXEC_STATE_FILE.write_text(json.dumps(state, indent=2))

exec_state = _load_exec_state()

ACCOUNTS = {
    "0858": {
        "id": "act_435670549443081",
        "name": "Kakriput",
        "roas_winner": 3.0,
        "roas_super": 8.0,
        "roas_kill": 0.3,
        "cpc_kill": 120,
        "cpc_safe_cbo": 80, "cpc_danger_cbo": 120,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 500000,
        "tags": ["rakpiringpengering", "organizerpullout", "Dongkrakelektrik", "setelanbajukaosmihugajah", "setelangajahthaialand"],
        "manual_managed": [
            "ON_ON_VILONA_organizerpullout_FBonly",
            "🌟_🌟_🌟_🌟_BIDCAP_Organizer_organizerpullout_Dapur_0603",
            "🌟_ON__Kakriput_organizerpullout_INT06",
            "🌟_🌟_🌟_🌟_🌟_🌟_TEST_setelanbajukaosmihugajah_shoppingFashiOFF",
            "🌟_🌟_🌟_🌟_🌟_🌟_🌟_LC_0858_setelanbajukaosmihugajah_fashiOn",
            "Scale_setelangajahthaialand_Belanja_26-40",
        ],
    },
    "1041": {
        "id": "act_380721031313330",
        "name": "Nyamiresep",
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 120,
        "cpc_safe_cbo": 80, "cpc_danger_cbo": 120,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 300000,
        "tags": ["rakdapur3", "multistorage", "atayasetelankaosanak"],
        "manual_managed": [
            "ON_BIDCAP_atayasetelankaosanak_Kursi _07", "STAR_🌟_STAR_ON_LC_atayasetelankaosanak_Anak_25-52",
            "ON_LC__atayasetelankaosanak_Interior_Usia_25-50", "ON_LC_atayasetelankaosanak_Apartemen_28-48",
            "ON_BIDCAP_atayasetelankaosanak_Apartemen_07 SCALE", "ON_BIDCAP_atayasetelankaosanak_0806_07 SCALE_Kamar tidu",
            "ON_BIDCAP_atayasetelankaosanak_0306_07 SCALE", "ON_BIDCAP_atayasetelankaosanak_Aksesori fashion_07 SCAL",
            "ON_BIDCAP_atayasetelankaosanak_Anak_0606", "ON_atayasetelankaosanak_Belanja_0609",
            "BIDCAP_atayasetelankaosanak_Ruang tamu (arsitektur)_07", "BIDCAP_atayasetelankaosanak_Kursi _07 OFF",
            "STAR_🌟_STAR_🌟_ON_BIDCAP_Rakdapur3_Belanja_0607_v3", "ON_BIDCAP_Rakdapur3_Belanja_0607_v3",
            "ON_Scale_BIDCAP_Rakdapur3_Fashion_0607_v3", "ON_Scale_BIDCAP_rakdapur3_Dapur_1006",
            "ON_LC_rakdapur3_24-57_0611", "ON_LC_Rakdapur3_Belanja_Scale 25-46",
            "ON_LC_Rakdapur3_Belanja_Scale 25-50", "ON_LC_Rakdapur3_Belanja_Scale 25-49",
            "ON_LC_Rakdapur3_Belanja_Scale 25-44", "ON_LC_Rakdapur3_Belanja_Scale 25-52",
            "ON_LC_Rakdapur3_Belanja_Scale 25-53", "ON_LC_Rakdapur3_Belanja_Scale 25-51",
            "ON_LC_Rakdapur3_Belanja_Scale 25-48", "ON_LC_Rakdapur3_Belanja_Scale 25-45",
        ],
    },
    "1208": {
        "id": "act_1439536310038458",
        "name": "Herbal",
        "enabled": False,  # Sales campaign, not CPC — skip engine
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 350,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 250000,
        "tags": ["herbal", "herbalisme", "herborist", "bibitbidara"],
    },
    "1134": {
        "id": "act_2125021885010866",
        "name": "Glowscent-1134",
        "roas_winner": 1.5,
        "roas_super": 4.0,
        "roas_kill": 0.15,
        "cpc_kill": 400,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 200000,
        "tags": ["abera", "pintulipatgeser", "lemaridapur", "lemariperhiasan", "bajubayi", "bedongbayi", "hijabbayi", "hoodiebaby", "popok", "selimutbayi", "kolamrenang", "bakmandibayi", "sampobayi", "lotionbayi", "tumbler", "uban", "jetcleaner", "rakcucipiring", "alatpijat", "pemotongsayur"],
    },
    "1340": {
        "id": "act_1181078009580337",
        "name": "Selow-1340",
        "enabled": False,
        "roas_winner": 1.5,
        "roas_super": 4.0,
        "roas_kill": 0.15,
        "cpc_kill": 400,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 140,
        "cpc_safe_abo": 150, "cpc_danger_abo": 250,
        "budget_cap_per_camp": 200000,
        "tags": ["studiolands", "selow", "setelanbajukaosmihugajah", "setelangajahthaialand"],
    },
    "BK_PRODUK_DIGITAL": {
        "id": "act_1204208138534580",
        "name": "BerkahKarya Produk Digital",
        "enabled": False,
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 500,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 200,
        "cpc_safe_abo": 150, "cpc_danger_abo": 300,
        "budget_cap_per_camp": 100000,
        "tags": ["academy", "digital", "courses"],
    },
    "BK_EBOOK_PRIA": {
        "id": "act_1601373334527521",
        "name": "BerkahKarya Ebook Pria",
        "enabled": False,
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 500,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 200,
        "cpc_safe_abo": 150, "cpc_danger_abo": 300,
        "budget_cap_per_camp": 100000,
        "tags": ["ebook", "digital", "products"],
    },
    "BK_WEBSITE": {
        "id": "act_1005166835197534",
        "name": "BerkahKarya Website (new)",
        "enabled": False,
        "roas_winner": 2.0,
        "roas_super": 5.0,
        "roas_kill": 0.2,
        "cpc_kill": 500,
        "cpc_safe_cbo": 100, "cpc_danger_cbo": 200,
        "cpc_safe_abo": 150, "cpc_danger_abo": 300,
        "budget_cap_per_camp": 100000,
        "tags": ["website", "academy", "services"],
    },
}

def log(msg, level="INFO"):
    ts = datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass

AUDIENCE_POOL = {
    "Belanja": [
        {"id": "6003263791114", "name": "Belanja"},
        {"id": "6003346592981", "name": "Belanja online"},
    ],
    "Dapur": [
        {"id": "6003077174939", "name": "Perkakas dapur"},
        {"id": "6003113941014", "name": "Kitchen"},
        {"id": "6003206259061", "name": "Kitchenware"},
    ],
    "Fashion": [
        {"id": "6003242077675", "name": "Baju"},
        {"id": "6003456388203", "name": "Pakaian"},
    ],
    "IbuRumah": [
        {"id": "6003107471210", "name": "Ibu rumah tangga"},
    ],
    "Diskon": [
        {"id": "6003386553489", "name": "Kupon diskon"},
    ],
    "Travel": [
        {"id": "6004078861067", "name": "Traveling"},
    ],
    "Interior": [
        {"id": "6003384677038", "name": "Dekorasi rumah"},
        {"id": "6003455765814", "name": "Perabotan rumah"},
    ],
    "Resep": [
        {"id": "6003397425735", "name": "Resep masakan"},
    ],
    "Broad": [],  # Broad = hapus flexible_spec, biarkan Meta optimize
}

SCALE_SEED_AUDIENCE = [
    {"id": "6003263791114", "name": "Belanja"},
    {"id": "6003346592981", "name": "Belanja online"},
    {"id": "6016343989160", "name": "Lazada"},
    {"id": "6003220634758", "name": "Toko diskon"},
    {"id": "6849890049601", "name": "Situs web belanja online"},
]

CORE_PORTFOLIO = {
    "0858": [
        "BIDCAP_Rakpiring_rakpiringpengering_Shopping_0603",
        "BIDCAP_Rakpiring_rakpiringpengering_Winner_0603",
        "BIDCAP_Rakpiring_rakpiringpengering_Broad_0603",
        "BIDCAP_GEO_rakpiringpengering_INT04",
        "BIDCAP_GEO_rakpiringpengering_INT07",
        "BIDCAP_GEO_rakpiringpengering_INT08",
        "BIDCAP_GEO_rakpiringpengering_INT10",
        "BIDCAP_Organizer_organizerpullout_Travel_0603",
        "BIDCAP_Organizer_organizerpullout_Dapur_0603",
        "BIDCAP_Organizer_organizerpullout_Fashion_0603",
    ],
    "1041": [],
    "1208": [],
    "1134": [],
    "1340": [],
}