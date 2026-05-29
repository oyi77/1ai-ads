"""Test script for AdForge API client.

Run:  python test_adforge_client.py
Requires AdForge backend running on http://localhost:5000
"""

from meta_client import adforge


def test_campaigns():
    """Test get_campaigns endpoint."""
    print("=== Testing get_campaigns ===")
    try:
        result = adforge.get_campaigns()
        print(f"  OK: {type(result).__name__} returned")
        if isinstance(result, list):
            print(f"  Count: {len(result)} campaigns")
        elif isinstance(result, dict):
            print(f"  Keys: {list(result.keys())[:5]}")
        return result
    except Exception as e:
        print(f"  FAIL: {e}")
        return None


def test_autonomous_status():
    """Test get_autonomous_status endpoint."""
    print("\n=== Testing get_autonomous_status ===")
    try:
        result = adforge.get_autonomous_status()
        print(f"  OK: {type(result).__name__} returned")
        if isinstance(result, dict):
            print(f"  Keys: {list(result.keys())[:5]}")
        return result
    except Exception as e:
        print(f"  FAIL: {e}")
        return None


if __name__ == "__main__":
    print(f"AdForge base: {adforge.base}\n")

    campaigns = test_campaigns()
    status = test_autonomous_status()

    print("\n=== Summary ===")
    print(f"  Campaigns: {'PASS' if campaigns is not None else 'FAIL'}")
    print(f"  Autonomous: {'PASS' if status is not None else 'FAIL'}")
