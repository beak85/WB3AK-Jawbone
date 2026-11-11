# Configuration

### Installing Firmware
- Download he pre-compiled firmware from build/JAWBONE.uf2 in this repository.
- The first time the tracker is connected to a computer over USB, the RP2040 shows up as a USB thumb drive. Drag and drop JAWBONE.uf2 onto it.
- The tracker will reboot and show up as a USB device.
  - Open Device Manager in Windows to see which COM port the tracker is using. You will need it in the next step.
<img width="507" height="232" alt="devmanager" src="https://github.com/user-attachments/assets/0ffb2dbe-310d-4223-81df-91322b50c878" />

### Configure PuTTY
- Unplug the tracker.
- Set up PuTTY
  - Connection type should be 'Serial'
  - Use the COM port you noted above in the Serial Line box.
  - Set the speed to 115200 baud.
<img width="448" height="438" alt="image" src="https://github.com/user-attachments/assets/9f387008-f234-40dd-8dc2-643076b7ddf8" />


- Be ready to do these next steps quickly!
  - Plug in the tracker
  - Click connect in PuTTY immediately
  - Start tapping the space bar to interrupt the boot process. 
  - This should bring up the configuration menu:

- Go through each of the settings, even if they appear to be set already
  - Callsign: ?????? (Set to your valid callsign for the band you are using)
  - U4B Channel: ### (Reserve your channel at https://traquito.github.io/channelmap/)
  - Band: H (20M)
  - Verbocity: 0 
  - Optional debug: 0
  - Telemetry config: Use 72- (for Detailed tracking and one sensor)
<img width="671" height="355" alt="image" src="https://github.com/user-attachments/assets/26830313-3237-4183-94c1-f86505c14bdd" />


### Assembling and Soldering  the Ttracker

#### If using PowerFilm Solar:

PowerFilm (amorphous silicon) panels are high voltage, but low current. When the GPS switches on, or the booster draws a burst, 
the board briefly wants more current than the panels can deliver. With only the panels feeding it, the input voltage will collapse 
and the board will reset. A 22 µF capacitor supplies the burst for those microseconds to milliseconds, then the panels refill it.
Use a tantalum capacitor - they do well with the extremely cold temperatures they will face.

Solder in the 22 µF tantalum capacitor of at least 10V rating across the 5v and ground terminals. If you aren't using a supercap (below)
with voltage regulators, then you want to use a 1W 5.6V Zener Diode across those terminals as well to prevent an overvoltage which
can wreck the board.


- capacitor and zener diode
- 
- temp sensor
- stubs for antenna
- gps antenna

# soldering solar cells

- tabbing wire

# cutting antennas and support lines
  - weigh tubes
  - 17ft
  
# assemble payload

# weighing and calculating payload

  - weigh everything
  - add ~7 grams of free lift

# fill balloon
