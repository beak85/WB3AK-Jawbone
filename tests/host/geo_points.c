/* Spot checks of is_position_geofenced() compiled verbatim from ../../utilities.c (via geo.inc). */
#include <stdio.h>
#include <string.h>
#include <math.h>

char *get_mh(double lat, double lon, int size);
int is_position_geofenced(double lat, double lon);
#include "geo.inc"

static const struct { const char *name; double lat, lon; int expect; } pts[] = {
    /* must be fenced */
    {"London",               51.507,  -0.128, 1},
    {"Belfast",              54.597,  -5.930, 1},
    {"Lerwick (Shetland)",   60.155,  -1.145, 1},
    {"St Mary's (Scilly)",   49.914,  -6.315, 1},
    {"Sanaa",                15.369,  44.191, 1},
    {"Socotra south coast",  12.300,  53.900, 1},
    {"Pyongyang",            39.039, 125.762, 1},
    {"NK northern tip",      43.005, 129.800, 1},   /* north of 43N, square PN43 */
    {"Korea Bay (NK waters)",39.700, 123.950, 1},   /* west of 124E, square PM19 */
    /* must NOT be fenced */
    {"Paris",                48.857,   2.352, 0},
    {"Brussels",             50.850,   4.350, 0},
    {"Cork",                 51.900,  -8.470, 0},
    {"Riyadh",               24.713,  46.675, 0},
    {"Tokyo",                35.676, 139.650, 0},
    {"Beijing",              39.904, 116.407, 0},
    {"Kansas",               38.500, -98.000, 0},
    /* known over-blocking of 2x1 degree squares (documented in README) */
    {"Seoul (over-blocked)", 37.566, 126.978, 1},
    {"Dublin (over-blocked)",53.350,  -6.260, 1},
    {"Calais (over-blocked)",50.950,   1.860, 1},
};

int main(void)
{
    int fails = 0;
    for (unsigned i = 0; i < sizeof(pts) / sizeof(pts[0]); i++) {
        int got = is_position_geofenced(pts[i].lat, pts[i].lon);
        char g[5]; strncpy(g, get_mh(pts[i].lat, pts[i].lon, 4), 4); g[4] = 0;
        printf("  %-24s %s  fenced=%d  %s\n", pts[i].name, g, got, got == pts[i].expect ? "ok" : "FAIL");
        fails += got != pts[i].expect;
    }
    return fails ? 1 : 0;
}
