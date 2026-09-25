#!/usr/bin/env python3
"""
Geofence list generator / verifier for JAWBONE.

The firmware's geofence (utilities.c, forbidden_grids[]) is a list of 4-character
Maidenhead squares (2 deg longitude x 1 deg latitude). This tool regenerates that
list from Natural Earth country borders and checks how well any list covers them.

  pip install shapely pyproj
  python3 geofence_tool.py generate                 # prints the C array for the default countries
  python3 geofence_tool.py generate GBR YEM PRK FRA # any ISO-3166 alpha-3 codes (Natural Earth ADM0_A3)
  python3 geofence_tool.py verify ../../utilities.c # Monte-Carlo coverage check of the list in the source

A square is included if it touches the country's land, its 12 nm territorial sea,
or a further MARGIN_KM of drift margin (default 25 km, about one 8-minute TX cycle
at 190 km/h). Natural Earth 1:10m data is downloaded on first use.
"""
import json, math, os, random, re, sys, urllib.request

NE_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
          "geojson/ne_10m_admin_0_countries.geojson")
NE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ne_10m_admin_0_countries.geojson")
TERRITORIAL_SEA_KM = 22.224   # 12 nautical miles
MARGIN_KM = 25.0
DEFAULT_COUNTRIES = ["GBR", "YEM", "PRK"]
A = "ABCDEFGHIJKLMNOPQR"

from shapely.geometry import shape, box, Point
from shapely.ops import transform
from shapely.prepared import prep
from pyproj import CRS, Transformer


def load_countries():
    if not os.path.exists(NE_FILE):
        print(f"downloading {NE_URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(NE_URL, NE_FILE)
    d = json.load(open(NE_FILE))
    return {f["properties"]["ADM0_A3"]: (f["properties"]["NAME"], shape(f["geometry"])) for f in d["features"]}


def buffered(geom, km):
    c = geom.centroid
    crs = CRS.from_proj4(f"+proj=aeqd +lat_0={c.y} +lon_0={c.x} +units=m")
    fw = Transformer.from_crs(4326, crs, always_xy=True).transform
    bw = Transformer.from_crs(crs, 4326, always_xy=True).transform
    return transform(bw, transform(fw, geom).buffer(km * 1000, resolution=32))


def grid4(lat, lon):
    L, T = lon + 180, lat + 90
    return A[int(L // 20)] + A[int(T // 10)] + str(int((L % 20) // 2)) + str(int(T % 10))


def squares_touching(geom):
    minx, miny, maxx, maxy = geom.bounds
    out = set()
    for lon0 in range(int(math.floor(minx / 2)) * 2, int(math.ceil(maxx / 2)) * 2, 2):
        for lat0 in range(int(math.floor(miny)), int(math.ceil(maxy))):
            b = box(lon0, lat0, lon0 + 2, lat0 + 1)
            if b.intersects(geom) and b.intersection(geom).area > 0:
                out.add(grid4(lat0 + 0.5, lon0 + 1))
    return out


def generate(codes):
    feats = load_countries()
    print("static const char *forbidden_grids[] = {")
    total = 0
    for code in codes:
        name, geom = feats[code]
        sq = sorted(squares_touching(buffered(geom, TERRITORIAL_SEA_KM + MARGIN_KM)))
        total += len(sq)
        print(f"    /* {name}: land + 12 nm territorial sea + {MARGIN_KM:g} km drift margin ({len(sq)} squares) */")
        for i in range(0, len(sq), 12):
            print("    " + ",".join(f'"{s}"' for s in sq[i:i + 12]) + ",")
    print("};")
    print(f"/* {total} squares total */", file=sys.stderr)


def verify(source, codes, n=3000):
    src = open(source).read()
    block = src[src.index("forbidden_grids[]"):]
    block = block[:block.index("};")]
    fence = set(re.findall(r'"([A-R]{2}[0-9]{2})"', block))
    print(f"{len(fence)} squares in {source}")
    feats = load_countries()
    random.seed(1)

    def sample(poly, k):
        P = prep(poly); minx, miny, maxx, maxy = poly.bounds; pts = []
        while len(pts) < k:
            x, y = random.uniform(minx, maxx), random.uniform(miny, maxy)
            if P.contains(Point(x, y)):
                pts.append((y, x))
        return pts

    ok = True
    for code in codes:
        name, g = feats[code]
        ts = buffered(g, TERRITORIAL_SEA_KM)
        ring = buffered(g, TERRITORIAL_SEA_KM + MARGIN_KM).difference(ts)
        res = []
        for label, poly in (("land", g), ("12nm sea", ts.difference(g)), (f"{MARGIN_KM:g} km margin", ring)):
            pts = sample(poly, n)
            pct = 100.0 * sum(grid4(a, b) in fence for a, b in pts) / len(pts)
            res.append(f"{label} {pct:5.1f}%")
            ok &= pct == 100.0
        print(f"  {name:16s} " + " | ".join(res))
    print("PASS" if ok else "FAIL: some points are not fenced")
    return ok


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("generate", "verify"):
        print(__doc__); sys.exit(1)
    if sys.argv[1] == "generate":
        generate(sys.argv[2:] or DEFAULT_COUNTRIES)
    else:
        sys.exit(0 if verify(sys.argv[2] if len(sys.argv) > 2 else "../../utilities.c", sys.argv[3:] or DEFAULT_COUNTRIES) else 1)
