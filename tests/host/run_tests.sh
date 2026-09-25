#!/bin/bash
# Host-side tests for the JAWBONE scheduler + geofence. Needs only gcc (no Pico SDK).
#   cd tests/host && ./run_tests.sh
# Builds with AddressSanitizer/UBSan, so memory errors in the extracted firmware code fail the run.
set -e
cd "$(dirname "$0")"
ROOT=../..

# Copy firmware code verbatim into the harness
awk '/^int WSPRbeaconTxScheduler\(/{p=1} /^int WSPRbeaconCreatePacket\(/{p=0} p' $ROOT/WSPRbeacon.c > sched.inc
awk '/^char letterize\(/{p=1} /^char\* complete_mh\(/{p=0} p' $ROOT/utilities.c > geo.inc
[ -s sched.inc ] && [ -s geo.inc ] || { echo "extraction failed"; exit 1; }

CFLAGS="-O1 -w -fsanitize=address,undefined -fno-sanitize-recover=all"
gcc $CFLAGS -o sched_harness sched_harness.c -lm
gcc $CFLAGS -o geo_points geo_points.c -lm

fail=0
echo "== geofence spot checks"
./geo_points || fail=1

echo "== scheduler: 60 simulated minutes from power-up (ET config 72-, 4 packets per cycle)"
check() {  # name lat lon reacq expected_packets
    out=$(./sched_harness "$2" "$3" 60 "$4" | grep packets)
    got=${out%% packets*}
    if [ "$got" = "$5" ]; then r=ok; else r=FAIL; fail=1; fi
    printf "  %-10s GPS re-fix %3ss: %-60s expect %2s  %s\n" "$1" "$4" "$out" "$5" "$r"
}
for reacq in 0 2 30; do
    check Pyongyang 39.039 125.762 $reacq 0
    check Sanaa     15.369  44.191 $reacq 0
    check London    51.507  -0.128 $reacq 0
    check Belfast   54.597  -5.930 $reacq 0
    check Kansas    38.500 -98.000 $reacq 24
    check Paris     48.857   2.352 $reacq 24
done

rm -f sched_harness geo_points sched.inc geo.inc
[ $fail = 0 ] && echo "ALL TESTS PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
