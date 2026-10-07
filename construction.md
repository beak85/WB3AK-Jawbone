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


# soldering tracker

- capacitor and zener diode
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
