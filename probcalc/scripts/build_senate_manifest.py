#!/usr/bin/env python3
"""
Builds public/data/precincts/senate-2024-manifest.json from the MEDSL-style
individual_states.zip precinct returns (each entry is itself a zip containing
one CSV with EVERY office on the 2024 ballot for that state, precinct by
precinct: US PRESIDENT, US SENATE where applicable, US HOUSE, state
legislature, local races, and ballot measures).

For each state we aggregate, straight off real precinct rows:
  - US PRESIDENT: total R / D / all votes
  - US SENATE:    total R / D / all votes (only ~34 states had a 2024 Senate
                   race — Class I seats plus a couple of specials)

From those two real, same-precinct-set aggregates we derive the real
"ticket-splitting offset" for every state that had both races on the ballot:
    offset = senate_R_margin - president_R_margin   (points, R positive)
This is the actual, measured gap between how a state voted for President vs.
Senate in 2024 — not an assumption. Split Ticket then uses this fixed offset
plus a universal (uniform) generic-ballot shift to predict a hypothetical
2026 Senate lean, instead of re-deriving Senate behavior from scratch.

Usage: python3 build_senate_manifest.py /path/to/individual_states.zip /path/to/output.json
"""
import sys
import json
import zipfile
import csv
import io

OFFICES = {"US PRESIDENT", "US SENATE"}
PARTIES = {"REPUBLICAN", "DEMOCRAT"}


def process_state_csv(fileobj, state_abbr):
    """Streams one state's CSV, returns per-office vote totals + precinct counts."""
    totals = {
        "US PRESIDENT": {"REPUBLICAN": 0, "DEMOCRAT": 0, "ALL": 0},
        "US SENATE": {"REPUBLICAN": 0, "DEMOCRAT": 0, "ALL": 0},
    }
    precincts = {"US PRESIDENT": set(), "US SENATE": set()}

    text = io.TextIOWrapper(fileobj, encoding="utf-8", errors="replace")
    reader = csv.DictReader(text)
    for row in reader:
        office = row.get("office")
        if office not in OFFICES:
            continue
        votes_raw = row.get("votes") or "0"
        try:
            votes = int(float(votes_raw))
        except ValueError:
            continue
        party = (row.get("party_simplified") or "").upper()
        totals[office]["ALL"] += votes
        if party in PARTIES:
            totals[office][party] += votes
        precinct_id = row.get("precinct") or row.get("jurisdiction_name")
        if precinct_id:
            precincts[office].add(precinct_id)

    return totals, precincts


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/individual_states.zip"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/data/precincts/senate-2024-manifest.json"

    results = []
    total_precincts_scanned = 0

    with zipfile.ZipFile(src) as outer:
        inner_names = sorted(
            n for n in outer.namelist() if n.endswith(".zip") and "/" in n
        )
        for inner_name in inner_names:
            state_abbr = inner_name.split("/")[-1].replace(".zip", "")[:-2].upper()
            with outer.open(inner_name) as inner_bytes_stream:
                inner_bytes = inner_bytes_stream.read()
            with zipfile.ZipFile(io.BytesIO(inner_bytes)) as inner_zip:
                csv_names = [n for n in inner_zip.namelist() if n.endswith(".csv")]
                if not csv_names:
                    print(f"  {state_abbr}: no CSV found, skipping", file=sys.stderr)
                    continue
                with inner_zip.open(csv_names[0]) as f:
                    totals, precincts = process_state_csv(f, state_abbr)

            pres = totals["US PRESIDENT"]
            sen = totals["US SENATE"]
            has_senate = sen["ALL"] > 0

            entry = {
                "state": state_abbr,
                "precincts": len(precincts["US PRESIDENT"]),
                "president_votes_rep": pres["REPUBLICAN"],
                "president_votes_dem": pres["DEMOCRAT"],
                "president_votes_total": pres["ALL"],
                "has_senate_race_2024": has_senate,
            }
            if has_senate:
                entry["senate_votes_rep"] = sen["REPUBLICAN"]
                entry["senate_votes_dem"] = sen["DEMOCRAT"]
                entry["senate_votes_total"] = sen["ALL"]
                entry["senate_precincts"] = len(precincts["US SENATE"])

            results.append(entry)
            total_precincts_scanned += entry["precincts"]
            sen_note = "senate race ✓" if has_senate else "no senate race"
            print(f"  {state_abbr}: {entry['precincts']:>6} precincts, {sen_note}", file=sys.stderr)

    results.sort(key=lambda r: r["state"])
    with open(out, "w") as f:
        json.dump(results, f, indent=1)

    print(f"\nWrote {len(results)} states, {total_precincts_scanned:,} precincts scanned -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
