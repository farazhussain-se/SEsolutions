"""Phase 10 — Final audit. Verifies every phase landed correctly."""
import json, re
from collections import Counter
from _common import get


def main():
    print("="*78)
    print(" ROSS DEMO INSTANCE — FINAL AUDIT")
    print("="*78)

    b = get("/branch")
    print(f"\n[1] BRANCH: {b.get('name')!r} ({b.get('slug')!r})")
    print(f"    enabledProducts: {b.get('config',{}).get('enabledProducts')}")

    sp = get("/spaces").get("data", [])
    print(f"\n[2] SPACES ({len(sp)}):")
    for s in sp: print(f"    • {s['name']!r}  sections={s.get('sections')}")

    pf = get("/branch/profilefields").get("schema", {})
    cus = sorted([k for k,v in pf.items() if not v.get("system")])
    ross_set = {'associateRole','costCenter','district','hireDate','homeStore','region','storeNumber'}
    yt = [k for k in cus if pf[k].get("yieldsTags")]
    print(f"\n[3] PROFILE FIELDS: {len(pf)} ({sum(1 for v in pf.values() if v.get('system'))} system + {len(cus)} custom)")
    print(f"    Ross fields present: {sorted(ross_set & set(cus))} ({'all 7' if ross_set <= set(cus) else 'MISSING'})")
    print(f"    yieldsTags=true on Ross fields: {sorted(set(yt) & ross_set)}")

    chs = get("/channels?limit=100").get("data", [])
    titles = [c.get("config",{}).get("localization",{}).get("en_US",{}).get("title") for c in chs]
    expected = {"From Jim's Desk","Buying Office & DC News","Associate Spotlight","Store News","District & Region Updates","Off-Price Retail News","Associate Wall","Quick Takes","Ross on LinkedIn"}
    print(f"\n[4] CHANNELS ({len(chs)}):  Ross renames present: {len(expected & set(titles))}/9")

    posts = get("/posts?limit=500").get("data", [])
    img = teaser = 0
    for p in posts:
        en = p.get("contents",{}).get("en_US",{})
        if en.get("image"): img+=1
        if en.get("teaser"): teaser+=1
    print(f"\n[5] POSTS visible: {len(posts)}  (scheduled hidden)  with image={img}  with teaser={teaser}")

    pages = get("/pages?limit=500").get("data", [])
    sp_by_id = {s["id"]: s["name"] for s in sp}
    by_sp = Counter(sp_by_id.get(p.get("spaceId"),"?") for p in pages)
    ai_titles = {"Shift Schedules, Swaps & Time Off","Inventory, Receiving & Markdowns","Loss Prevention & Shrink","Associate Discount & Benefits","Store Opening & Closing Procedures","Code of Business Conduct (Quick Reference)"}
    ai_present = sum(1 for p in pages if p.get("contents",{}).get("en_US",{}).get("title") in ai_titles)
    total_widgets = sum(len(re.findall(r'<div[^>]+data-widget-', p.get("contents",{}).get("en_US",{}).get("content","") or "")) for p in pages)
    print(f"\n[6] PAGES ({len(pages)}): {dict(by_sp)}")
    print(f"    AI reference pages: {ai_present}/6   widget divs total: {total_widgets}")

    gs = get("/branch/groups").get("data", [])
    print(f"\n[7] GROUPS ({len(gs)}):")
    for g in sorted(gs, key=lambda x: (x.get("type",""), x.get("name",""))):
        n = g.get("users",{}).get("total","?")
        tags = sum([c.get("tags",[]) for c in g.get("conditions",[])],[])
        tail = f" tags={tags}" if tags else ""
        print(f"    [{g.get('type'):<11}] {n!s:>2} users | {g.get('name'):<40}{tail}")

    cs = get("/campaigns?limit=50").get("data", [])
    total_refs = 0
    print(f"\n[8] CAMPAIGNS ({len(cs)}):")
    for c in cs:
        refs = get(f"/campaigns/{c['id']}/references?limit=200").get("data", [])
        total_refs += len(refs)
        print(f"    • {c['title']:<45} refs={len(refs)}")
    print(f"    Total references: {total_refs}")

    qld = get("/branch/quicklinks?platform=desktop").get("data", [])
    qlm = get("/branch/quicklinks?platform=mobile").get("data", [])
    print(f"\n[9] QUICK LINKS: desktop={len(qld)}  mobile={len(qlm)}")

    us = get("/users?limit=500").get("data", [])
    cc = Counter(u.get("profile",{}).get("costCenter") for u in us)
    have_h = sum(1 for u in us if u.get("profile",{}).get("profileHeadline") and "happy employee" not in (u.get("profile",{}).get("profileHeadline","") or "").lower())
    have_e = sum(1 for u in us if "@ross.com" in (u.get("profile",{}).get("publicEmailAddress") or ""))
    idx = get("/profiles/search?limit=10").get("total")
    print(f"\n[10] USERS ({len(us)}): costCenter={dict(cc)}")
    print(f"     Ross headline: {have_h}/{len(us)}   @ross.com email: {have_e}/{len(us)}   search index total: {idx}")

    print("\n" + "="*78)


if __name__ == "__main__":
    main()
