## NovaStar COEX

Control and monitor NovaStar COEX LED processors (MX6000 Pro, MX2000 Pro, MX40 Pro, MX30, MX20, KU20, KC40, CX40 Pro) over the COEX HTTP API (firmware 1.4 and later).

### Getting started

1. Enter the controller's IP address. The API port is **8001** unless it was changed.
2. The connection turns green once the controller answers. If it shows **Locked by VMP**, NovaStar VMP is connected to the controller: close VMP (or run Companion on the PC that runs VMP) to control it from Companion.
3. Open the **Presets** panel: there are ready-made buttons for each screen, input, preset, colour setting, test pattern and the controller's health, built from what the controller reports.

### Settings

- **Poll interval:** how often state is read (default 500 ms).
- **Poll hardware / cabinet monitoring:** temperatures, fans, voltages and cabinets, about every 5 s.
- **Instant updates:** the controller pushes changes (blackout, inputs, presets, monitoring) so buttons update immediately. Polling continues as a fallback.
- **Backup controller IP (optional):** for a primary/backup pair. If the primary stops answering, control switches to the backup within a couple of seconds and the connection shows a warning ("On the backup controller"). Once the primary has answered steadily for about 30 seconds, control goes back to it. Buttons made on either controller work on both: the two controllers number their screens differently, so screens are matched by position.
- **Offline programming mode:** see below.

### Offline programming mode

Build and test a whole page of buttons without a controller, for example before the show when the hardware is not on site yet.

- Choose how many virtual screens, inputs and presets the simulated controller has.
- Buttons work against the simulation: Blackout lights red, brightness and colour temperature move, presets light when recalled, inputs land on layers, test patterns show as on. Variables and feedbacks behave as they do on a real controller, so the page can be checked before the show.
- The health readouts show a healthy controller and wall (four cabinets per screen), and every third input has no signal, so both states of every button can be seen.
- Nothing is sent to the network while it is on.
- Turn it off to connect. Buttons built for "Screen 1" offline control the controller's first screen.

### Per screen

For every screen there are presets for:
- **Blackout and Freeze toggles** that show the screen's real state (read from the controller, also when changed from VMP or the front panel).
- **Brightness ring:** a gauge with the current level.
- **Brightness + / -:** one step per press, or hold to ramp. Quick presses add up correctly, and the readout does not snap back while the controller catches up.
- **Brightness levels** 100 % to 0 % in 10 % steps, lit when the screen is at that level.

In the **Colour** section, for every screen:
- A readout of colour temperature and gamma, tinted like the white point.
- **Warmer / Cooler** in 100 K steps, and colour temperature presets (3200, 4300, 5600, 6500, 7500, 9300 K) lit at the current value.
- **Gamma + / -** in 0.1 steps, and gamma presets (2.2, 2.4, 2.6, 2.8) lit at the current value.

Values are kept inside NovaStar's documented ranges (1700 to 15000 K, gamma 1 to 4): the controller answers "Success" to values outside them, but ignores some of them and stores others.

In the **Status** section: display state, controller health, cabinets, connection, slowest fan, inputs with signal, the primary/backup state, controller model and firmware, and uptime.

All screens: **Blackout ALL** fires only after the button is held for 1 second, so it cannot be hit by accident. **Normal ALL** returns every screen to normal.

### Actions

**Original actions (unchanged ids, so existing buttons keep working):** Change Input Source, Brightness, Gamma, Display Mode, Color Temperature, Preset (first screen), Test Pattern, 3D LUT Status, Toggle Blackout/Normal, Toggle Freeze/Normal, Working Mode.

**Display / screen:** Display mode per screen, Blackout / Freeze toggle per screen, brightness per screen, brightness step, brightness ramp up / down / stop, preset per screen, color temperature and color temperature step, gamma and gamma step, brightness limit (on/off, nits or %), color gamut, 3D LUT on/off and strength, color correction on/off, brightness schedule on/off, multi-mode, output bit depth, output sync source, 3D and 3D emitter, primary/backup verify.

**Layers / inputs:** Layer source (All-in-One mode, per screen and layer), input saturation, contrast, black level, hue, RGB shadow and highlight per color, color reset, EDID, HDR mode, internal source format, sending-card test pattern off.

**Device:** Audio (SPDIF) output, controller identify (LCD color), controller mapping, set controller time to Companion time, automatic time/NTP, time zone, controller name, SNMP, refresh all data.

**Cabinets / receiving cards** (IDs comma separated, empty = all): test pattern, cabinet mapping (numbers on screen), brightness (% or nits), RGB brightness, RGBW component, color temperature, behaviour without signal (black / last frame), thermal compensation on/off, strength and mode, multi-mode.

### Feedbacks

Display mode, display mode per screen, preset active, preset active per screen, brightness compare, color temperature is, gamma is, color temperature color, input has signal, any input signal, input on screen/layer, input HDR mode, output bit depth, 3D on, color gamut, multi-mode, schedule on, device health (alarm/fault anywhere), cabinet problem (any / link / fault), fewer cabinets than expected, temperature above (mainboard / chips / cabinets), fan slower than, cabinet humidity above, receiving card voltage below, port / output / card not OK, primary/backup problem (either / primary / backup failed), backup configured, audio on, SNMP on, test pattern on, multifunction card connected, controller connected.

The health feedbacks work well in **triggers**, for example to flash a warning button or send an email when a cabinet drops off the chain or a temperature passes a limit.

### Variables

- **Display:** `display_state`, `blackout_active`, `freeze_active`, `canvas_N_state`, `current_preset_name`, `connected`, `connection_status`
- **Screens:** `screen_N_name`, `_display_mode`, `_brightness`, `_brightness_num`, `_colortemp`, `_colortemp_num`, `_gamma`, `_preset`, `_working_mode`, `_frame_rate`, `_active_input`, `_layer_M_input`, `_bitdepth`, `_bitdepth_current`, `_output_framerate`, `_3d`, `_low_latency`, `_gamut`, `_multimode`, `_schedule`
- **Inputs:** `input_N_name`, `_id`, `_type`, `_signal`, `_resolution`, `_bitdepth`, `_range`, `_edid`, `_hdr_mode`, `_hdr_current`, `_contrast`, `_saturation`, `_hue`, `inputs_with_signal`, `test_pattern`
- **Controller health:** `device_health`, `device_health_detail`, `mainboard_temp`, `mainboard_voltage`, `fan_min_speed`, `fan_N_speed`, `temp_N`, `port_N_status`, `output_N_status`, `card_N_status`, `device_runtime`, `device_total_runtime`
- **Cabinets:** `cabinet_count`, `cabinet_count_configured`, `rvcard_count`, `cabinet_errors`, `cabinet_error_list`, `cabinet_link_errors`, `cabinet_max_temp`, `cabinet_max_humidity`, `cabinet_min_voltage`
- **Device:** `device_model`, `device_custom_name`, `device_sn`, `device_firmware`, `device_sw_version`, `device_ip`, `device_mac`, `device_mode`, `device_update_state`, `device_memory_used`
- **Backup / audio / SNMP / sensors:** `backup_master_name`, `backup_backup_name`, `backup_configured`, `backup_status` (e.g. "Primary in use, backup standby"), `backup_status_code`, `audio_output`, `audio_source`, `snmp`, `mfcard_N_link`, `mfcard_N_light`, `mfcard_N_temp`, `mfcard_N_humidity`, `mfcard_N_power`

Variables only appear when the controller reports the data. Functions the firmware does not support are detected and skipped.

### Upgrading

- **From 1.0.x:** Blackout, Normal and Freeze buttons are converted to Display Mode automatically. Working Mode is back.
- **From 2.0.x:** existing buttons keep working. Test Pattern now works (it never did in 2.0.x), Brightness 1 % is no longer sent as 100 %, and the 3D LUT action accepts several comma-separated screen IDs.
- This version needs **Companion 5.0** or later.
- Controller errors are logged with NovaStar's description of the error code.

### Not included

3D LUT file upload/delete, custom gamma tables, custom gamut coordinates, detailed color correction data, canvas mapping and moving cabinets, preset editing and log export. These need files or large data sets and are better done in VMP.

### Testing

Tested against the COEX controller server that ships with NovaStar VMP 1.5.1 (the same server software the controllers run), on an MX40 Pro configuration, and backup failover with two of them. Please report anything that behaves differently on your hardware.

Submit issues on [GitHub](https://github.com/bitfocus/companion-module-novastar-coex/issues).

Thanks to Kris Dahl (original module), FaintGhost (firmware 1.4 rewrite) and Hirte666 (full API coverage) whose work this version builds on.
