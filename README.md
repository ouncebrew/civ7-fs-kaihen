# civ7-fs-kaihen

Boots kaiHEN 20261113 on a Switch 2 through Civilization VII.

[kaiHEN](https://github.com/ouncebrew/kaihen) is a homebrew enabler (HEN)
for Switch 2: once it runs, holding R while opening a game starts
homebrew menu instead. kaiHEN normally starts from the game SmileBASIC.
This repository starts it from Civilization VII instead, using the fs
exploit from [civ7-fs](https://github.com/HerXayah/civ7-fs) and Gezine's
[CivSwitch](https://github.com/Gezine/CivSwitch) as the way in.

## What you need

- A Switch 2 <= 23.0.1. Only tested on firmware 23.0.1, does not work on any lower
  right now. It's much slower without the exFAT update as that's what wave
  timing is tuned for, but [it'll work given enough tries](https://theonion.com/study-83-of-gamblers-quit-right-before-they-would-hav-1819575092/).
- Civilization VII on cartridge and CivSwitch set up,
  so that the game shows `Awaiting payload at <console-ip>:9026` when started.
- An SD card in the console. A non-express microSD card will work too, press
  home when you get the micronag (telling you this card isn't supported).
- A computer on the same network, preferably running Linux or macOS, with a
  recent Node.js (tested with 24). No `npm install` is needed.
- The [kaiHEN](https://github.com/ouncebrew/kaihen) 20261113 release, unpacked.

## Booting kaiHEN

0. Set up your save file with CivSwitch. You may need to go to Data Management
   to delete your save file and reinstall it occasionally. [This esp32 LDN
   approach](https://github.com/SeanHeuc/CivSwitch/tree/main/esp32-ldn-civ7)
   is highly recommended. Insert your microSD card before you start.
1. Set up a wired connection that won't get you Nintendo server access.
   Be very careful with this. If you don't know how to do this right,
   DO NOT USE THIS YET. It's not worth the risk of getting the blacklist
   update that'll lock you out of Civ 7 without a reboot. If you will set up
   90DNS, follow the [instructions on Gitlab](https://a.gitlab.io/90dns/)
   precisely, do not skip any steps.
2. Boot into CivSwitch console by going to Civ 7 -> Load Game.
   Wait for `Awaiting payload`.
3. From this repository's folder, run the launcher with your console's IP
   address:

   ```sh
   node engine/hen.cjs 192.168.2.118 --dir /path/to/ns2jb/testship
   ```

   You can set the `KAIHEN_TESTSHIP` environment variable instead of passing
   `--dir`. With neither, the launcher looks for
   `ns2jb/testship` in the folder that contains this repository.

4. Wait, usually a few minutes. The run goes through four phases:

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

5. Close Civilization VII normally. The launcher exits once the game closes.
   HEN keeps running on the console, and the computer is no longer needed until you restart.
6. Hold R while opening a different game. The first time, HEN only records
   the game's signing policy and the game starts as usual. The next R-held
   launch opens hbmenu.
7. HEN lasts until the console restarts. Restarting also puts the console's
   own RO service back. To use homebrew again after a restart, run the
   launcher again.

Launcher options:

| Option | Effect |
|---|---|
| `--dir DIR` | the kaiHEN testship folder |
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

Phase 2 tries up to 30 waves (race attempts) before it gives up. No test run on
my console has succeeded after wave 10, so `NS2_WAVE_ATTEMPTS=10` may be the better
setting to save time and fail early.

After a failed run:

1. Restart the console. Make one attempt per console boot.
2. Start again from step 1 of *Booting kaiHEN*.
3. If failing too long, you may want to re-do your save file.

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

## Standing on the shoulders of giants

- [Gezine](https://github.com/Gezine/CivSwitch) for CivSwitch, the Civ7
  entrypoint.
- [civswitch-kit](https://gitee.com/mza1010/civswitch-kit), the original Civ7
  FS kit, based on slapah/Hokage's work, which is itself based on ns2jb.
- [civ7-fs](https://github.com/HerXayah/civ7-fs), the Civ7 FS port this
  repository builds on.
- [kurumuz](https://github.com/kurumuz) for kaiHEN and his ns2jb fork.
- [pepsipu](https://gitlab.com/pepsipu/ns2jb) for discovering nsj2b vuln, and the ns2jb codebase.
- LLMs were involved in the development of this. Please don't use it if you don't trust it.
