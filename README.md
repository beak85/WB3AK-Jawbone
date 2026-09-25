# JAWBONE

**JAWBONE = Just Another WSPR Beacon Of Noisy Electronics**

Custom PCB and software for a very light RP2040-based WSPR beacon, intended for tracking high-altitude superpressure balloons (pico balloons).

JAWBONE is an evolution of KC3LBR's [pico-WSPRer](https://github.com/EngineerGuy314/pico-WSPRer) project. It's very similar, except that JAWBONE uses the MS5351 clock generator chip to generate RF instead of abusing the RP2040's internal PLL oscillator. It's only intended to be used with the custom PCB. You probably could still assemble one from a Raspberry Pi Pico and external components, but that isn't tested or documented.

**See [docs/JAWBONE-Balloon-Tracker.md](docs/JAWBONE-Balloon-Tracker.md) for all the info:** quick start, the configuration menu, channels, extended telemetry, temperature sensors, wsprtv.com setup, power, schematics, ordering PCBs and more.

The pre-compiled firmware is in the [`/build`](build/JAWBONE.uf2) folder. The EasyEDA project files, Gerbers, BOM and pick-and-place files for each board revision are in the [`/PCB`](PCB) folder.

![jawbone2_sm](https://github.com/user-attachments/assets/06095d34-4753-4ac4-a2d6-6d9f3f5e12ee)

A fully assembled tracker weighs only 2.2 grams. The picture shows an early revision without a USB connector. Current revisions (v3 and v4) have a break-away USB-C connector for configuration and programming.

## What this version adds

This version is based on the original JAWBONE code at commit `38deb1e` (2026-07-30). It adds:

- **Geofencing:** the tracker won't transmit over the United Kingdom, Yemen or North Korea.
- **A bug fix:** a stack buffer overflow in the 10-character grid string.
- **A geofence line on the setup screen**, so you can tell which firmware a board has.
- **Tests** for the transmit scheduler, the geofence and the wsprtv.com decoder definitions.
- **A tool** for regenerating and checking the geofence list against real country borders.
- **Documentation corrections:** extended telemetry, sensor numbering, units, and wsprtv.com decoding now match how the current firmware actually works (see [Documentation fixes](#documentation-fixes)).

The hardware, telemetry types, configuration menu and NVRAM layout are unchanged. A board that's already configured keeps its settings when flashed with this firmware.

> **Status: not flight-tested.** The firmware builds cleanly and passes the host-side simulation and geofence tests described below. It has not flown and has not been bench-tested on a real board. Check it on the bench before launch; see [Bench check](#bench-check-before-launch).

**Quick start:** hold BOOT (or use a new board), plug in USB, and drag `build/JAWBONE.uf2` onto the drive that appears. Then configure it over a serial terminal at 115200 baud, as described in the [Quick Start instructions](docs/JAWBONE-Balloon-Tracker.md#quick-start-instructions).

---

## Changes to the original JAWBONE code

| # | Change | Type | Files |
|---|---|---|---|
| 1 | No transmitting over the UK, Yemen or North Korea | New feature | `WSPRbeacon.c`, `utilities.c`, `defines.h` |
| 2 | Fixed a stack buffer overflow in the 10-character grid string (two places) | Bug fix | `WSPRbeacon.c` |
| 3 | Boot banner and setup screen show the geofence | Improvement | `main.c`, `utilities.c`, `defines.h` |
| 4 | Host-side tests for the scheduler and geofence | Tooling | `tests/host/` |
| 5 | Tool to regenerate and check the geofence list from real borders | Tooling | `tools/geofence/` |
| 6 | Documentation rewritten to match the current firmware | Docs | `docs/JAWBONE-Balloon-Tracker.md`, `README.md` |
| 7 | Check of the wsprtv.com decoder definitions | Tooling | `tests/wsprtv/` |

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

**Changing the fence.** Regenerate the table with `tools/geofence/geofence_tool.py` (see [Geofence tool](#5-geofence-tool-toolsgeofence)) and paste it over `forbidden_grids[]` in `utilities.c`. The code doesn't depend on the list's length.

### 2. Fix: stack buffer overflow in the grid string

`WSPRbeaconTxScheduler()` and `WSPRbeaconGetLastQTHLocator()` both declared `char ten_char_grid[10]` and then called `snprintf(ten_char_grid, 11, ...)`. Ten grid characters plus the terminating zero is 11 bytes, so each call wrote one byte past the end of the buffer on the stack. The scheduler does this once per transmit cycle. `WSPRbeaconGetLastQTHLocator()` isn't called at the moment, because its caller in `main.c` is commented out, but it had the same bug.

On the RP2040 this usually overwrites padding and goes unnoticed. What it overwrites depends on how the compiler lays out the stack, so a different compiler version or optimization level could corrupt a live variable. The bug is present in the original JAWBONE code. AddressSanitizer flags it in the host tests. Both buffers are now `[11]`.

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
- With the original scheduler, the Pyongyang runs send 24 packets and fail.
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

### 6. Documentation

The full project documentation is [docs/JAWBONE-Balloon-Tracker.md](docs/JAWBONE-Balloon-Tracker.md), updated for this firmware. The corrections are listed under [Documentation fixes](#documentation-fixes).

### 7. wsprtv.com decoder check (`tests/wsprtv/`)

```
git clone --depth 1 https://github.com/wsprtv/wsprtv.github.io.git /tmp/wsprtv
node tests/wsprtv/verify_decoders.js /tmp/wsprtv/wsprtv.js
```

This checks every wsprtv `ct_dec` definition in the documentation: the extractor string for each ET type (0, 1, 3, 4, 5, 6, 7 and 8), the signed type 2 decoder, and the complete `78-` and `72-` URLs. It encodes random values with a copy of the firmware's packing code and decodes them with wsprtv's own parser. It also checks that a message received in the wrong slot isn't decoded.

---

## Bench check before launch

1. Flash `build/JAWBONE.uf2`, connect a serial terminal at 115200 baud, and press a key during the boot countdown. Check that the banner says `+ geofence v1` and that the settings list includes the geofence line.
2. Set every option as described in the [documentation](docs/JAWBONE-Balloon-Tracker.md#configuration-menu-reference), including callsign, channel, band and telemetry config. Set verbosity to 1 for this test.
3. Test outside the fence: with a GPS fix, the tracker should transmit normally, which you can confirm on wsprtv.com or a local receiver.
4. Test inside the fence. There's no simulated-position option in the firmware. To test, temporarily add your own square to `forbidden_grids[]` (for example `"FN20"`), rebuild, and check that a `TX cycle suppressed by geofence` message appears at the cycle start and nothing is received. Then reflash the release build.
5. Set verbosity back to 0 for flight.

---

## Documentation fixes

While reviewing the source (July to September 2026), I found several places where the original JAWBONE documentation no longer matched the firmware. They're corrected in [docs/JAWBONE-Balloon-Tracker.md](docs/JAWBONE-Balloon-Tracker.md):

- **Extended telemetry format.** Between February and May 2026 the firmware moved from the ET0 format to header-less U4B "Custom Telemetry" (CT), which the menu calls "GET". Decoder definitions written for ET0 (`et_dec=et0:0,...` on wsprtv, or Traquito JSON with the ET0 header) mostly reject or misread current transmissions. The docs now explain CT and give verified `ct_dec` definitions. See [Extended Telemetry overview](docs/JAWBONE-Balloon-Tracker.md#extended-telemetry-overview).
- **ET type table.** The table now matches `process_TELEN_data()`:
  - Every field is listed with its exact range and units.
  - Type 0's second field is GPS fix *seconds*, not minutes since the fix.
  - Types 6, 7 and 8 have their current contents; types 7 and 8 were redefined in 2026.
  - Values outside a field's range wrap around.
  - Each type has a wsprtv extractor string, verified by round-trip encoding and decoding.

  See [Extended Telemetry specifics](docs/JAWBONE-Balloon-Tracker.md#extended-telemetry-specifics).
- **High-precision grid.** Type 7 is recommended over type 5, because wsprtv uses all 10 grid characters on the map only with type 7.
- **Temperature sensor numbering.** Type 2 carries sensor #1, type 3 carries sensors #2 and #3, and type 4 carries #4 and #5. With a single DS18B20, type 3 would send 0 for the whole flight. See [Temperature sensors](docs/JAWBONE-Balloon-Tracker.md#temperature-sensors-ds18b20).
- **Units.**
  - Temperatures are sent in °F: a 0–120 size plus a sign bit.
  - Type 2 bus voltage is in hundredths of a volt (0–9.00 V), not tenths.
  - Type 1 ADC values are in tenths.
- **Temperature sensor wiring.** The data line is the ADC1 pad (GPIO 27), with the internal pull-up turned on. A 4.7 kΩ external pull-up is recommended. Parasite power isn't supported. Sensors are detected only at boot. Because ADC1 is the sensor bus, type 1's ADC1 value reads the bus.
- **wsprtv.com setup.** There are complete, verified URLs for the default `78-` config and for `72-` with a signed temperature column. A Celsius variant and an explanation of the slot numbering are included. See [Viewing telemetry on wsprtv.com](docs/JAWBONE-Balloon-Tracker.md#viewing-telemetry-on-wsprtvcom).
- **Other tracking sites.**
  - It isn't confirmed whether Traquito decodes the CT format.
  - TWITS lists extended-telemetry output as temporarily removed.
- **Configuration menu.** There's a full key reference with the band base frequencies and lane offsets.
  - Verbosity levels and Optional Debug bits are described as the code uses them now. Bits 1 and 3 currently do nothing.
  - The menu reboots the tracker after 60 s with no keypress.
  - The boot countdown lasts about 8 s.
- **Board revisions.** The PCB ordering section describes the v2, v3 and v4 folders and the diode board. The v3 and v4 BOMs are identical, and v3 is the first revision with USB-C. The PCB ordering screenshots in `/PCB` are linked from the docs.
- **Build instructions.** These are updated for the Pico SDK 2.x toolchain used to build the shipped firmware.

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

The older `build.sh` script also works; see [Compiling it yourself](docs/JAWBONE-Balloon-Tracker.md#compiling-it-yourself) for toolchain setup. The shipped `build/JAWBONE.uf2` has SHA-256 `5a2fd62092f6ea835273195afe578c2e10ebd1b19dfbe6b46e5e9fe3648b5a23`.

To pull in future changes from the original JAWBONE repository (the `upstream` remote), run `git fetch upstream && git merge upstream/main`. This version only touches small, clearly marked regions of `WSPRbeacon.c`, `utilities.c`, `defines.h` and `main.c`.

---

## License and credits

MIT License (see `LICENSE`, Copyright (c) 2025 EngineerGuy314). JAWBONE was designed and written by KC3LBR ([EngineerGuy314](https://github.com/EngineerGuy314)). It builds on work by Roman Piksaykin (R2BDY), Kazu AG6NS and Hans Summers (G0UPL); see [Acknowledgements](docs/JAWBONE-Balloon-Tracker.md#acknowledgements). Country borders for the geofence come from [Natural Earth](https://www.naturalearthdata.com/) (public domain).

You need an amateur radio licence to transmit. The geofence reduces the risk of transmitting where you aren't permitted to, but it doesn't guarantee legal compliance. Its accuracy is limited by GPS, the grid resolution and the drift margin. Check the rules for your own licence.
