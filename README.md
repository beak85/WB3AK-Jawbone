# JAWBONE with geofencing

**JAWBONE = Just Another WSPR Beacon Of Noisy Electronics**

This is a fork of [EngineerGuy314/JAWBONE](https://github.com/EngineerGuy314/JAWBONE), the RP2040 + MS5351 WSPR tracker for pico balloons. It is upstream `main` at commit `38deb1e` (2026-07-30, "allowed all blank telem spots"). On top of that it adds:

- geofencing, so the tracker won't transmit over the United Kingdom, Yemen or North Korea
- a fix for a stack buffer overflow bug
- a geofence line on the setup screen
- host-side tests
- a tool for regenerating and checking the geofence list

Upstream's hardware, telemetry, configuration menu and NVRAM layout are unchanged. For everything else (ordering PCBs, wiring, the configuration menu, channels, telemetry types), see the upstream [JAWBONE wiki](https://github.com/EngineerGuy314/JAWBONE/wiki/JAWBONE-Balloon-Tracker). Read the corrections to it [below](#corrections-to-the-upstream-wiki) as well.

> **Status: not flight-tested.** The firmware builds cleanly and passes the host-side simulation and geofence tests described below. It has not flown and has not been bench-tested on a real board. Check it on the bench before launch; see [Bench check](#bench-check-before-launch).

The pre-compiled firmware is `build/JAWBONE.uf2`. Flash it exactly as upstream describes: hold BOOT while plugging in USB, then drag the file onto the drive that appears.

---

## Changes from upstream

| # | Change | Type | Files |
|---|---|---|---|
| 1 | No transmitting over the UK, Yemen or North Korea | New feature | `WSPRbeacon.c`, `utilities.c`, `defines.h` |
| 2 | Fixed a stack buffer overflow in the 10-character grid string (two places) | Bug fix | `WSPRbeacon.c` |
| 3 | Boot banner and setup screen show the geofence | Improvement | `main.c`, `utilities.c`, `defines.h` |
| 4 | Host-side tests for the scheduler and geofence | Tooling | `tests/host/` |
| 5 | Tool to regenerate and check the geofence list from real borders | Tooling | `tools/geofence/` |

### 1. Geofencing

**What it does.** Before every transmit cycle, the tracker compares its current GPS position against a list of 4-character Maidenhead grid squares (each 2° longitude × 1° latitude). If the position is in a listed square, the whole cycle is skipped: the WSPR message, the U4B basic telemetry and all extended-telemetry slots. The GPS stays on and the tracker checks again at the next cycle start 10 minutes later. Once the balloon is outside the fenced squares, transmissions resume on the next cycle.

**Where the check is.** The check is at a single point in `WSPRbeaconTxScheduler()` (`WSPRbeacon.c`), just before the state that turns off the GPS and turns on the MS5351 (`SEQ==60`). Every path to the transmitter passes through that point. That includes the first transmission after each power-up, which in the scheduler goes directly from `SEQ 35` to `SEQ 60` without passing through the normal `SEQ 40/50` states. For a solar balloon, "first transmission after power-up" means every sunrise, wherever the balloon drifted overnight.

**Which squares are fenced.** There are 132 squares, listed in `forbidden_grids[]` in `utilities.c`. They were generated from Natural Earth 1:10m country borders. A square is included if it touches any of the following:

- the country's land, including islands (for example Shetland, Scilly and Socotra)
- its 12 nautical mile territorial sea
- a further **25 km drift margin**

| Country | Squares |
|---|---|
| United Kingdom | 63 |
| Yemen | 45 |
| North Korea | 24 |

Why the drift margin is needed:
- The position is checked once, at the start of a cycle.
- The GPS is powered off during transmission.
- With telemetry config `72-` a cycle transmits for about 8 minutes, and at a 190 km/h jet-stream speed that is about 25 km of drift.

So a balloon approaching a border stops transmitting before it can drift across during a cycle.

**The cost: nearby places are silenced too.** Squares 2° × 1° are coarse, so the fence also silences places that aren't in the three countries:
- Seoul and most of northern South Korea
- Dublin and eastern Ireland
- Calais and Lille in northern France
- A strip of Belgium
- Parts of Saudi Arabia, Oman, China, Somalia, Eritrea, Djibouti and far-eastern Russia

Expect gaps in your track there. Brussels, Paris, Cork, Riyadh, Beijing and Tokyo are not fenced. A finer fence using 6-character squares or real border outlines would reduce this, at the cost of a larger table.

**Isle of Man and the Channel Islands** are Crown Dependencies, not part of the UK, so they aren't targeted separately. The Isle of Man lies within the UK squares anyway (IO74). Jersey and Guernsey (IN89) are covered by the UK margin.

**How to confirm the geofence firmware is loaded.** The setup screen banner reads `version (new CT may 2026) + geofence v1`, and the settings list includes the line `Geofence: no TX over UK, Yemen, North Korea (132 grid squares, see README)`. With verbosity ≥ 1, every skipped cycle prints `TX cycle suppressed by geofence (IO91)` on the USB serial port.

**Changing the fence.** Regenerate the table with `tools/geofence/geofence_tool.py` (see [Tools](#5-geofence-tool)) and paste it over `forbidden_grids[]` in `utilities.c`. The code doesn't depend on the list's length.

**Comparison with upstream PR #17.** [PR #17](https://github.com/EngineerGuy314/JAWBONE/pull/17) also proposes a grid-square geofence. This fork doesn't use it, for these reasons:

- The PR as submitted doesn't compile: a `}` is missing in `main.c`'s status printout.
- Its check is only in `SEQ 50`, so the first transmit cycle after every power-up is never checked. Later cycles are skipped too whenever the GPS reports a fix in its second message after being switched back on.
  - In simulation over Pyongyang, it sent a full 4-packet cycle after boot.
  - With a quick GPS fix after power-up it sent every cycle: 24 packets per hour.
- It has no UK squares.
- It misses North Korea's northern tip (north of 43°N), Korea Bay west of 124°E, and Socotra's territorial sea south of 12°N.
- In places its fence edge touches the border, so there's no drift margin.
- It also bundles many unrelated, unflown changes: a watchdog, GPS baud detection, GPS soft-start, a data logger and dormant sleep.

This fork uses the same basic approach but adds only the geofence.

### 2. Fix: stack buffer overflow in the grid string

`WSPRbeaconTxScheduler()` and `WSPRbeaconGetLastQTHLocator()` both declared `char ten_char_grid[10]` and then called `snprintf(ten_char_grid, 11, ...)`. Ten grid characters plus the terminating zero is 11 bytes, so each call wrote one byte past the end of the buffer on the stack. The scheduler does this once per transmit cycle. `WSPRbeaconGetLastQTHLocator()` isn't called at the moment, because its caller in `main.c` is commented out, but it had the same bug.

On the RP2040 this usually overwrites padding and goes unnoticed. What it overwrites depends on how the compiler lays out the stack, so a different compiler version or optimization level could corrupt a live variable. The upstream code and PR #17 both have this bug. AddressSanitizer flags it in the host tests. Both buffers are now `[11]`.

### 3. Geofence shown on the setup screen

- The banner shows `+ geofence v1`, so you can tell at a glance which firmware is on a board.
- The settings list shows the fenced countries and square count.
- A small helper, `geofence_square_count()`, was added for this.

Nothing about configuration or NVRAM changed. A board flashed with this firmware keeps its existing settings.

### 4. Host-side tests (`tests/host/`)

```
cd tests/host && ./run_tests.sh
```

These run on a PC with only `gcc`; no Pico SDK is needed. The script copies the real `WSPRbeaconTxScheduler()` from `WSPRbeacon.c`, and the Maidenhead and geofence functions from `utilities.c`, unmodified into a test harness. It then builds them with AddressSanitizer and UBSan and checks:

- **Geofence spot checks (19 places):**
  - Must be fenced: London, Belfast, Shetland, Scilly, Sana'a, Socotra, Pyongyang, North Korea's northern tip and Korea Bay.
  - Must not be fenced: Paris, Brussels, Cork, Riyadh, Tokyo, Beijing and Kansas.
  - Known over-blocking, fenced as documented: Seoul, Dublin and Calais.
- **Scheduler simulation.** Each run covers 60 minutes from power-up with config `72-`, the first GPS fix 45 s after boot, and the GPS taking 0, 2 or 30 s to regain a fix after each transmit cycle.
  - Pyongyang, Sana'a, London and Belfast must send **0 packets**. This includes the first cycle after power-up.
  - Kansas and Paris must send the normal **24 packets** (6 cycles × 4).

Before committing, I confirmed that the tests catch both problems they target:
- With upstream's scheduler, the Pyongyang runs send 24 packets and fail.
- With the old 10-byte buffer, AddressSanitizer stops the run with a stack-buffer-overflow error.

### 5. Geofence tool (`tools/geofence/`)

```
pip install shapely pyproj
cd tools/geofence
python3 geofence_tool.py generate                 # C table for GBR YEM PRK (default)
python3 geofence_tool.py generate GBR YEM PRK LBY # any Natural Earth ADM0_A3 codes
python3 geofence_tool.py verify ../../utilities.c # Monte-Carlo check of the table in the source
```

On first use the tool downloads the Natural Earth 1:10m country file, about 13 MB; it's git-ignored. `verify` samples 3,000 random points in each country's land, in its 12 nm sea and in the 25 km margin ring, then reports how many fall in fenced squares. For the table shipped here, all three are 100% for all three countries. `generate` reproduces the shipped table exactly. The territorial sea (22.224 km) and margin (`MARGIN_KM`) are constants at the top of the script.

---

## Bench check before launch

1. Flash `build/JAWBONE.uf2`, connect a serial terminal at 115200 baud, and press a key during the boot countdown. Check that the banner says `+ geofence v1` and that the settings list includes the geofence line.
2. Set every option as the wiki says, including callsign, channel, band and telemetry config. Set verbosity to 1 for this test.
3. Test outside the fence: with a GPS fix, the tracker should transmit normally, which you can confirm on wsprtv.com or a local receiver.
4. Test inside the fence. There's no simulated-position option in the firmware. To test, temporarily add your own square to `forbidden_grids[]` (for example `"FN20"`), rebuild, and check that a `TX cycle suppressed by geofence` message appears at the cycle start and nothing is received. Then reflash the release build.
5. Set verbosity back to 0 for flight.

---

## Corrections to the upstream wiki

I found these while reviewing the upstream source (July 2026). They apply equally to upstream and to this fork.

**Extended telemetry encoding changed in 2026.** Between February and May 2026 the firmware moved to U4B "Custom Telemetry" (CT) encoding, which the menu calls "GET". The wiki's wsprtv examples (`et_dec=et0:0,...`) and its Traquito JSON were written for the older ET0 format. That format carried a header in bits where the current firmware puts data, so those decoders mostly reject or misread current transmissions. Use `ct_dec` definitions like the one below.

**For the high-precision grid, use type 7, not type 5.** Both carry grid characters 7–10:
- Type 7 packs them as longitude and latitude pairs that wsprtv maps natively (`t100`/`t101`), so all 10 characters are used on the map. It also sends minutes since boot (mod 1440) and a transmit counter (mod 420).
- With type 5, wsprtv can only map 8 characters.

Put type 7 in the first extended-telemetry slot.

**Dallas / DS18B20 sensor numbering.** In `process_TELEN_data()` (`main.c`):
- Type **2** sends the **first** sensor found (`onewire_values[0]`).
- Type **3** sends the **second and third** (`[1]`, `[2]`).
- Type **4** sends the **fourth and fifth** (`[3]`, `[4]`).

With a single sensor, use type 2. Type 3 would send 0 for the whole flight.

**Temperatures are °F.** `onewire_read()` converts to Fahrenheit (`32 + C×1.8`). The size is sent as 0–120 with a separate sign bit, and values above 120 °F wrap around, which can only happen on the ground.

**Type 2 bus voltage is in hundredths of a volt, not tenths** (0–9.00 V). It is ADC3 × 3 for the on-board divider.

**Wiring.** The one-wire data line is the ADC1 pad (GPIO 27). The firmware turns on the RP2040's internal pull-up. A 4.7 kΩ resistor from the data line to 3.3 V is the datasheet standard and cheap insurance. Parasite power isn't supported, so connect the sensor's VDD to 3.3 V. Sensors are detected only at boot; the boot log prints `Found N one-wire (dallas) temp sensors`.

**wsprtv.com definition for config `72-`** (one DS18B20; signed temperature in a single column):

```
https://wsprtv.com/?cs=YOURCALL&ch=CHAN&band=20m&start_date=YYYY-MM-DD&ct_dec=ct,s:2_240:t100,240:t101,1440:0:1,420:0:1~ct,s:3,545105:2:0_5:901:0:0.01,121:0:1,1090210:61:0:1~ct,s:3,545105:2:1_5:1:t142:2,5:901:0:0.01,1:t142:3,121:0:-1,1:t142:4,1090210:61:0:1&ct_labels=MinSinceBoot,TxCount,VBus,TempF,Sats,VBus,TempF,Sats&ct_units=,,V,%C2%B0F,,V,%C2%B0F,
```

- **Slot numbers:** the tracker's extended-telemetry slots 1–3 are wsprtv slots 2–4.
- **Signed temperature:** the two `s:3` decoders pick the positive or negative version of the temperature using its sign bit. The `t142` entries merge the negative version into the same columns.
- **Wizard preview:** the CT wizard preview lists the merged values separately, and that's expected.
- **Celsius:** change `121:0:1` to `121:-17.8:0.556` and `121:0:-1` to `121:-17.8:-0.556`.

---

## Building

Built and tested with:
- Pico SDK 2.3.1 (commit `079c6f3`)
- pico-extras (commit `52fd7a7`)
- arm-none-eabi-gcc 13.2.1
- CMake with Ninja

```
export PICO_SDK_PATH=~/pico-sdk PICO_EXTRAS_PATH=~/pico-extras
cmake -S . -B build-out -G Ninja
ninja -C build-out            # -> build-out/JAWBONE.uf2
cp build-out/JAWBONE.uf2 build/JAWBONE.uf2
```

Upstream's `build.sh` also still works if you follow the wiki's setup steps. The shipped `build/JAWBONE.uf2` has SHA-256 `5a2fd62092f6ea835273195afe578c2e10ebd1b19dfbe6b46e5e9fe3648b5a23`.

To pull future upstream changes: `git fetch upstream && git merge upstream/main`. The fork touches only small, clearly marked regions of `WSPRbeacon.c`, `utilities.c`, `defines.h` and `main.c`.

---

## Upstream description

Custom PCB and software for a very light RP2040 based WSPR Beacon intended for tracking high altitude superpressure balloons (aka Pico Balloons).

This is an evolution of EngineerGuy314's [pico-WSPRer](https://github.com/EngineerGuy314/pico-WSPRer) project. It is very similar except JAWBONE uses the MS5351 clock generator chip instead of abusing the RP2040's internal PLL oscillator. It is only intended to be used with the custom PCB. EasyEDA project, gerbers, BOM and pick-and-place files are in the `/PCB` folder.

![jawbone2_sm](https://github.com/user-attachments/assets/06095d34-4753-4ac4-a2d6-6d9f3f5e12ee)

A fully assembled tracker weighs only 2.2 g.

## License and credits

MIT License, unchanged from upstream (see `LICENSE`, Copyright (c) 2025 EngineerGuy314). JAWBONE is by KC3LBR (EngineerGuy314) and builds on work by Roman Piksaykin (R2BDY), Kazu AG6NS and Hans Summers (G0UPL); see the upstream wiki's acknowledgements. Country borders for the geofence come from [Natural Earth](https://www.naturalearthdata.com/) (public domain).

You need an amateur radio licence to transmit. The geofence reduces the risk of transmitting where you aren't permitted to, but it doesn't guarantee legal compliance. Its accuracy is limited by GPS, the grid resolution and the drift margin. Check the rules for your own licence.
