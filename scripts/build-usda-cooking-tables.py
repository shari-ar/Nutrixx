"""Build a pinned, compact USDA cooking reference from official Release 6/2 files.

Usage: python scripts/build-usda-cooking-tables.py retn06.txt USDA_CookingYields_MeatPoultry02.xlsx SRLegacyFoods.json
"""

import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from decimal import Decimal
from pathlib import Path


def fraction(value):
    result = format(Decimal(str(value)) / Decimal(100), "f").rstrip("0").rstrip(".")
    return result or "0"


def yield_rows(path):
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(f"{namespace}t"))
            for item in shared_root.iter(f"{namespace}si")
        ]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in sheet.iter(f"{namespace}row"):
            if row.attrib["r"] == "1":
                continue
            values = {}
            for cell in row.iter(f"{namespace}c"):
                value = cell.find(f"{namespace}v")
                if value is None or value.text is None:
                    continue
                values[cell.attrib["r"].rstrip("0123456789")] = (
                    shared[int(value.text)] if cell.attrib.get("t") == "s" else value.text
                )
            if "E" in values:
                yield int(row.attrib["r"]), values


retention_path = Path(sys.argv[1])
yield_path = Path(sys.argv[2])
legacy_path = Path(sys.argv[3])
output_path = Path(__file__).resolve().parents[1] / "apps/web/lib/usda-cooking-tables.json"
crosswalk_path = output_path.with_name("usda-ndb-crosswalk.json")

legacy_foods = []
decoder = json.JSONDecoder()
with legacy_path.open(encoding="utf-8") as source:
    for line in source:
        if "foodClass" not in line[:40]:
            continue
        food, _ = decoder.raw_decode(line)
        legacy_foods.append(food)
if len(legacy_foods) < 7000:
    raise ValueError("Incomplete USDA SR Legacy source")
fdc_to_ndb = {str(food["fdcId"]): str(food["ndbNumber"]) for food in legacy_foods}
if len(fdc_to_ndb) != len(legacy_foods):
    raise ValueError("Duplicate FDC IDs in USDA SR Legacy source")
by_ndb = {str(food["ndbNumber"]): food for food in legacy_foods}
raw_by_description = {}
for food in legacy_foods:
    description = food["description"]
    if description.casefold().endswith(", raw"):
        raw_by_description.setdefault(description.casefold(), []).append(food)

treatments = {}
for line in retention_path.read_text(encoding="latin-1").splitlines():
    fields = [field.strip().strip("~") for field in line.split("^")]
    if len(fields) != 7:
        raise ValueError("Unexpected USDA retention record")
    code, group, description, nutrient_number, _, percent, _ = fields
    entry = treatments.setdefault(
        code,
        {"code": code, "foodGroup": group, "description": description, "factors": {}},
    )
    if entry["foodGroup"] != group or entry["description"] != description:
        raise ValueError("Conflicting USDA retention treatment")
    if nutrient_number in entry["factors"]:
        raise ValueError("Duplicate USDA nutrient retention factor")
    if percent:
        entry["factors"][nutrient_number] = fraction(percent)

yields = []
for number, row in yield_rows(yield_path):
    group, description, method, percent = (row[column] for column in "ACDE")
    ndb = row.get("B")
    cooked = by_ndb.get(str(int(ndb))) if ndb else None
    raw_candidates = []
    if cooked and ", cooked," in cooked["description"].casefold():
        raw_description = cooked["description"].casefold().split(", cooked,", 1)[0] + ", raw"
        raw_candidates = raw_by_description.get(raw_description, [])
    yields.append(
        {
            "id": str(number),
            "foodGroup": str(int(group)).zfill(2),
            "ndbNumber": str(int(ndb)) if ndb else "",
            "description": description,
            "method": method,
            "factor": fraction(percent),
            **({"rawNdbNumber": str(raw_candidates[0]["ndbNumber"])} if len(raw_candidates) == 1 else {}),
        }
    )

output = {
    "retentionRelease": "6 (2007)",
    "retentionSha256": hashlib.sha256(retention_path.read_bytes()).hexdigest(),
    "yieldRelease": "2 (2014)",
    "yieldSha256": hashlib.sha256(yield_path.read_bytes()).hexdigest(),
    "treatments": list(treatments.values()),
    "yields": yields,
}
output_path.write_text(json.dumps(output, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")
with legacy_path.open("rb") as source:
    legacy_sha256 = hashlib.file_digest(source, "sha256").hexdigest()
crosswalk_path.write_text(
    json.dumps(
        {
            "sourceRelease": "2018-04",
            "sourceSha256": legacy_sha256,
            "fdcToNdb": fdc_to_ndb,
        },
        separators=(",", ":"),
    ) + "\n",
    encoding="utf-8",
)
matched = sum("rawNdbNumber" in row for row in yields)
print(f"{len(treatments)} treatments, {len(yields)} yield rows, {matched} exact raw NDB links, {len(fdc_to_ndb)} FDC IDs")
