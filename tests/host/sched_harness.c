/*
 * Host-side (PC) test harness for the JAWBONE TX scheduler and geofence.
 *
 * run_tests.sh copies WSPRbeaconTxScheduler() out of ../../WSPRbeacon.c and the
 * Maidenhead + geofence functions out of ../../utilities.c *verbatim* into
 * sched.inc / geo.inc, then compiles them together with the minimal mocks below.
 * Nothing in the firmware is modified for testing.
 *
 * Simulation: the tracker boots at 06:07:13 UTC, gets its first GPS fix 45 s after
 * boot, and after every TX burst (GPS powered back on) needs `reacq` seconds before
 * the GPS reports a fix again. The scheduler is called every 0.5 s, like main.c does.
 *
 * usage: sched_harness <lat> <lon> <minutes> <reacq_seconds>
 * prints: number of WSPR packets started, and the minute each TX cycle started.
 */
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>

/* ---- minimal mocks of the pico SDK calls used by the scheduler ---- */
typedef uint64_t absolute_time_t;
static uint64_t now_us = 0;
static absolute_time_t get_absolute_time(void) { return now_us; }
static int64_t absolute_time_diff_us(absolute_time_t a, absolute_time_t b) { return (int64_t)(b - a); }
static absolute_time_t delayed_by_us(absolute_time_t t, uint64_t d) { return t + d; }
static uint32_t to_ms_since_boot(absolute_time_t t) { return (uint32_t)(t / 1000); }
static void gpio_put(int p, int v) { (void)p; (void)v; }
static void sleep_ms(int ms) { (void)ms; }
#define VFO_ENABLE_PIN 1
#define GPS_ENABLE_PIN 2

/* ---- minimal copies of the JAWBONE structures (only the members the scheduler touches) ---- */
typedef struct { uint8_t _u8_is_solution_active; char _u8_last_digit_minutes; uint32_t _seconds;
                 int64_t _i64_lat_100k, _i64_lon_100k; } TD;
typedef struct { TD _time_data; uint32_t message_count; int Optional_Debug; float _altitude; } GPSCTX;
typedef struct { GPSCTX *_pGPStime; } OSC;
typedef struct { OSC *_p_oscillator; int _ix_output; uint32_t _u32_dialfreqhz; } TXC;
typedef struct { int led_mode; uint32_t minutes_since_boot, seconds_for_lock;
                 float voltage_at_idle, voltage_at_xmit, voltage; int verbosity; } SCHED;
typedef struct { TXC *_pTX; SCHED _txSched; char _pu8_locator[8];
                 uint8_t grid7, grid8, grid9, grid10; } WSPRbeaconContext;

char *get_mh(double lat, double lon, int size);
int is_position_geofenced(double lat, double lon);
#include "geo.inc"

/* ---- scheduler statics (same names as WSPRbeacon.c) ---- */
static char grid5, grid6, grid7, grid8, grid9, grid10;
static float altitude_snapshot;
static absolute_time_t start_time, start_time_of_GPS_search;
static int current_minute, current_second, first_broadcast_of_the_day, schedule[10], SEQ, gps_state;
static char _4_char_version_of_locator[5];
int xmit_count = 0; int32_t seconds_for_lock_previous; uint32_t XMIT_FREQUENCY = 14097100;

/* ---- instrumentation: count packets instead of transmitting ---- */
static int n_packets = 0; static int pkt_type[1000]; static uint64_t pkt_t[1000];
static int WSPRbeaconCreatePacket(WSPRbeaconContext *p, int type)
{ (void)p; if (n_packets < 1000) { pkt_type[n_packets] = type; pkt_t[n_packets] = now_us; } n_packets++; return 0; }
static int WSPRbeaconSendPacket(WSPRbeaconContext *p) { p->_pTX->_ix_output = 0; return 0; }

#include "sched.inc"

int main(int argc, char **argv)
{
    if (argc < 5) { fprintf(stderr, "usage: %s lat lon minutes reacq_s\n", argv[0]); return 2; }
    double lat = atof(argv[1]), lon = atof(argv[2]), reacq = atof(argv[4]);
    int minutes = atoi(argv[3]);
    static GPSCTX gps; static OSC osc = { &gps }; static TXC tx = { &osc };
    static WSPRbeaconContext ctx = { &tx };

    /* same schedule WSPRbeaconInit() builds for start minute 0 and ET config "72-" */
    for (int i = 0; i < 10; i++) schedule[i] = -1;
    schedule[0] = 1; schedule[2] = 2; schedule[4] = 5; schedule[6] = 6;
    first_broadcast_of_the_day = 1; SEQ = 10;

    gps._time_data._i64_lat_100k = (int64_t)llround(lat * 1e7);
    gps._time_data._i64_lon_100k = (int64_t)llround(lon * 1e7);
    const uint64_t boot_utc_s = 6 * 3600 + 7 * 60 + 13;
    uint64_t gps_on_at = 0; int prevSEQ = -1;

    for (now_us = 0; now_us < (uint64_t)minutes * 60 * 1000000ULL; now_us += 500000) {
        uint64_t utc = boot_utc_s + now_us / 1000000;
        if (SEQ == 20 && prevSEQ != 20) gps_on_at = now_us;       /* GPS was just powered on */
        prevSEQ = SEQ;
        int fix = (gps_on_at == 0) ? (now_us > 45000000ULL)
                                   : (now_us >= gps_on_at + (uint64_t)(reacq * 1e6));
        if (SEQ >= 60 && SEQ <= 90) fix = gps._time_data._u8_is_solution_active; /* GPS off during TX */
        gps.message_count++;
        gps._time_data._u8_is_solution_active = fix;
        gps._time_data._u8_last_digit_minutes = '0' + (utc / 60) % 10;
        gps._time_data._seconds = utc % 60;
        if (SEQ >= 70 && tx._ix_output < 162) tx._ix_output++;   /* symbols clock out */
        WSPRbeaconTxScheduler(&ctx, 0);
    }
    printf("%d packets; TX cycles started at minute:", n_packets);
    for (int i = 0; i < n_packets && i < 1000; i++) if (pkt_type[i] == 1) printf(" %.1f", pkt_t[i] / 60e6);
    printf("\n");
    return 0;
}
