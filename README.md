# civ7-fs-kaihen

Boots kaiHEN 0.0.4 on a Switch 2 through Civilization VII.

kaiHEN is [kurumuz](https://github.com/kurumuz)'s homebrew enabler (HEN) for Switch 2: once it runs, holding
R while opening a game starts hbmenu, the homebrew menu, instead. kaiHEN
normally starts from the game SmileBASIC. This repository starts it from
Civilization VII instead, using the Civ7 file-system exploit from
[civ7-fs](https://github.com/HerXayah/civ7-fs) and Gezine's
[CivSwitch](https://github.com/Gezine/CivSwitch) as the way in.

This runs exploits against system services. Use it at your own risk.

## What you need

- A Switch 2 on firmware 23.0.1 with the exFAT update. That is the only
  firmware this has been tested on.
- Civilization VII on internal storage and CivSwitch set up,
  so that the game shows `Awaiting payload at <console-ip>:9026` when started.
- An SD card in the console. kaiHEN's files and hbmenu are copied to it.
- A computer on the same network, preferably running Linux or macOS
  (Windows is less reliable), with a recent Node.js (tested with 24).
  No `npm install` is needed.
- The kaiHEN 0.0.4 release, unpacked. kaiHEN is not publicly released yet,
  so this repository does not include it or link to it. The launcher uses its
  `ns2jb/testship/` folder, which holds the kaiHEN binaries, `hbmenu.nro` and
  a `programs/` folder of homebrew to copy to the SD card.

## Booting kaiHEN

1. Restart the console and wait on the Home screen for 45 seconds to a
   minute. Then start Civilization VII and let CivSwitch reach
   `Awaiting payload`.
2. From this repository's folder, run the launcher with your console's IP
   address:

   ```sh
   node engine/hen.cjs 192.168.2.118 --ship /path/to/kaiHEN/0.0.4/ns2jb/testship
   ```

   You can set the `KAIHEN_TESTSHIP` environment variable instead of passing
   `--ship`. With neither, the launcher looks for
   `kaiHEN/0.0.4/ns2jb/testship` in the folder that contains this repository.

3. Wait, usually a few minutes. The run goes through four phases:

   1. checking the console
   2. acquiring FS memory
   3. starting the native helper
   4. connecting to the RO frontend (kaiHEN's replacement for the console's
      RO service)

   It then copies hbmenu, the game loader, the programs and HEN to the SD
   card and starts kaiHEN's bootstrap. A successful run ends like this:

   ```
   RO frontend verified. ...
   Staging HEN
   Starting native bootstrap
   HEN PID 210; startup record: .../switch2/ro/hen-startup.json
   HEN is running. Close Civilization VII normally; hold R while opening a native game.
   ```

4. Close Civilization VII normally. The launcher exits once the game closes.
   HEN keeps running on the console, and the computer is no longer needed.
5. Hold R while opening a game (not SmileBASIC). The first time, HEN only records
   the game's signing policy and the game starts as usual. The next R-held
   launch opens hbmenu.
6. HEN lasts until the console restarts. Restarting also puts the console's
   own RO service back. To use homebrew again after a restart, run the
   launcher again.

Launcher options:

| Option | Effect |
|---|---|
| `--ship DIR` | the kaiHEN testship folder |
| `--restore-save DIR` | restore the CivSwitch save before starting (see below); `DIR` is the `save-tools` folder of [civswitch-kit](https://gitee.com/mza1010/civswitch-kit) |
| `--no-hbmenu` | do not copy `hbmenu.nro` |
| `--no-programs` | do not copy `programs/` to `/switch/` on the SD card |

The computer listens on port 39380 for the console to connect. If something
else uses that port, set `NS2_PC_PORT` to another one; the launcher sends the
same port to the console.

## When it fails

Most failed runs stop in phase 2 with `Positive canary verification failed`,
or in phase 3 at `find-metadata` or `install-retained`. Getting FS memory is a
race and often takes several tries. kaiHEN has not run at that point.

After a failed run:

1. While the game still shows `Awaiting payload`, restore the CivSwitch save
   with civswitch-kit's `save-tools/restore_save.py`. A failed run tends to
   leave the save in a state that makes the next try less likely to work.
   You can also restore it at the start of the next try with
   `--restore-save`.
2. Restart the console. Make one attempt per console boot.
3. Start again from step 1 of *Booting kaiHEN*.

Every run writes a folder under `runs/`. `run.log` has the full output. After
a HEN attempt, `switch2/ro/hen-startup.json` has the bootstrap's result:
`operation` 10 with `result` 0 means HEN started, and any other value names
the step that failed.

A wired network helps. To stop a run, press Ctrl-C, which releases the
console side cleanly. Do not close the game during a run.

## FS only

`node engine/run.cjs <console-ip>` runs civ7-fs's own FS test without kaiHEN
and keeps the connection open for debugging tools. `--help` lists the options.

## Porting notes

You only need this if you are porting kaiHEN to another game.

kaiHEN's bootstrap gets three thread functions from the computer side:
`pthread_create`, a try-wait, and `pthread_join`. In SmileBASIC a thread
handle is the `nn::os::ThreadType` pointer itself. Civilization VII returns
the pointer with its low three bits set (`ThreadType | 7`): `pthread_join`
requires that tag and `TryWaitThread` needs it removed. So `engine/` waits on
the untagged pointer, joins the tagged one, and places a 24-byte try-wait
adapter after kaiHEN's unmodified `bootstrap.bin`.
`targets/civ7/app/thread-code.json` has the disassembly references.

## Credits

- [Gezine](https://github.com/Gezine/CivSwitch) for CivSwitch, the Civ7
  entrypoint.
- [civswitch-kit](https://gitee.com/mza1010/civswitch-kit), the original Civ7
  FS kit.
- [civ7-fs](https://github.com/HerXayah/civ7-fs), the Civ7 FS port this
  repository builds on.
- [kurumuz](https://github.com/kurumuz) for kaiHEN and its ns2jb engine.
- [Rastapasta](https://github.com/rastapasta) for the research, and for
  putting up with the rants.
